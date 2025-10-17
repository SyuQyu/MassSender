from __future__ import annotations

import random
import re
import time
from datetime import datetime, timedelta, timezone
from uuid import UUID

from loguru import logger
from redis import Redis
from rq import Queue
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import (
    Campaign,
    CampaignRecipient,
    CampaignStatus,
    DeliveryStatus,
    WalletTransaction,
    WalletTxnType,
)
from app.services.messaging import MessagingError, MessagingRetryableError, send_campaign_message
from app.tasks.db import SessionLocal


settings = get_settings()


def _requeue(recipient_id, delay: int) -> None:
    queue = Queue("campaigns", connection=Redis.from_url(settings.redis_url))
    queue.enqueue_in(
        timedelta(seconds=delay),
        "app.tasks.campaigns.process_campaign_recipient",
        str(recipient_id),
    )


def process_campaign_recipient(recipient_id: str) -> None:
    recipient_uuid = UUID(recipient_id)

    with SessionLocal() as session:
        recipient = session.get(CampaignRecipient, recipient_uuid)
        if recipient is None:
            return
        if recipient.status not in {DeliveryStatus.QUEUED, DeliveryStatus.SENDING}:
            return

        campaign = recipient.campaign
        if campaign.status == CampaignStatus.CANCELLED:
            recipient.status = DeliveryStatus.FAILED
            recipient.last_error = "Campaign cancelled"
            session.commit()
            return

        if campaign.status == CampaignStatus.PAUSED:
            session.commit()
            _requeue(recipient.id, delay=15)
            return

        recipient.status = DeliveryStatus.SENDING
        recipient.attempts += 1
        session.commit()

        message_body = _render_message(campaign, recipient)
        media_url = campaign.media_url
        document_url = campaign.document_url
        phone = recipient.phone_e164
        throttle_delay = random.uniform(campaign.throttle_min_seconds, campaign.throttle_max_seconds)

    time.sleep(throttle_delay)

    try:
        send_campaign_message(phone=phone, body=message_body, media_url=media_url, document_url=document_url)
    except MessagingRetryableError as exc:
        logger.warning("Retryable messaging failure for %s: %s", phone, exc)
        _handle_failure(recipient_uuid, transient=True, error_message=str(exc))
        return
    except MessagingError as exc:
        logger.error("Permanent messaging failure for %s: %s", phone, exc)
        _handle_failure(recipient_uuid, transient=False, error_message=str(exc))
        return

    _handle_success(recipient_uuid)


def _handle_failure(recipient_id: UUID, transient: bool, error_message: str | None = None) -> None:
    with SessionLocal() as session:
        recipient = session.get(CampaignRecipient, recipient_id)
        if recipient is None:
            return
        campaign = recipient.campaign

        meta = dict(campaign.meta or {})
        meta["consecutive_failures"] = meta.get("consecutive_failures", 0) + 1
        campaign.meta = meta

        if transient and recipient.attempts < len(settings.campaign_failure_backoff_schedule):
            backoff_seconds = settings.campaign_failure_backoff_schedule[recipient.attempts - 1]
            recipient.status = DeliveryStatus.QUEUED
            recipient.last_error = error_message or "Transient failure; retry scheduled"
            session.commit()

            _requeue(recipient.id, backoff_seconds)
            return

        if campaign.status == CampaignStatus.QUEUED:
            campaign.status = CampaignStatus.SENDING
        if meta["consecutive_failures"] >= 3:
            campaign.status = CampaignStatus.PAUSED

        recipient.status = DeliveryStatus.FAILED
        recipient.last_error = error_message or "Failed after retries"
        session.commit()
        _update_campaign_completion(session, campaign)


def _handle_success(recipient_id: UUID) -> None:
    now = datetime.now(timezone.utc)
    with SessionLocal() as session:
        recipient = session.get(CampaignRecipient, recipient_id)
        if recipient is None:
            return

        campaign = recipient.campaign
        user = campaign.user

        if campaign.status == CampaignStatus.QUEUED:
            campaign.status = CampaignStatus.SENDING

        if user.points_balance < settings.points_per_recipient:
            recipient.status = DeliveryStatus.FAILED
            recipient.last_error = "Insufficient points"
            session.commit()
            _update_campaign_completion(session, campaign)
            return

        meta = dict(campaign.meta or {})
        meta["consecutive_failures"] = 0
        campaign.meta = meta

        user.points_balance -= settings.points_per_recipient
        session.add(
            WalletTransaction(
                user_id=user.id,
                txn_type=WalletTxnType.DEDUCT,
                points=-settings.points_per_recipient,
                balance_after=user.points_balance,
                reference=f"campaign:{campaign.id}",
            )
        )

        recipient.status = DeliveryStatus.SENT
        recipient.sent_at = now
        recipient.last_error = None
        session.commit()
        _update_campaign_completion(session, campaign)


def _update_campaign_completion(session: Session, campaign: Campaign) -> None:
    session.refresh(campaign, attribute_names=["recipients"])
    statuses = {recipient.status for recipient in campaign.recipients}
    if campaign.status in {CampaignStatus.PAUSED, CampaignStatus.CANCELLED}:
        session.commit()
        return
    if any(status in {DeliveryStatus.QUEUED, DeliveryStatus.SENDING} for status in statuses):
        return

    campaign.completed_at = datetime.now(timezone.utc)
    if any(status == DeliveryStatus.FAILED for status in statuses):
        campaign.status = CampaignStatus.FAILED
    else:
        campaign.status = CampaignStatus.COMPLETED
    session.commit()


TEMPLATE_PATTERN = re.compile(r"{{\s*(\w+)\s*}}")


def _render_message(campaign: Campaign, recipient: CampaignRecipient) -> str:
    contact = recipient.contact  # lazy load if necessary
    context = {
        "name": (recipient.name or (contact.name if contact else "")) or "",
        "phone": recipient.phone_e164,
    }

    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        return str(context.get(key, ""))

    return TEMPLATE_PATTERN.sub(replace, campaign.template_body or "")
