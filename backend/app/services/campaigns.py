from __future__ import annotations

import asyncio
import random
from datetime import UTC, datetime, timedelta
from typing import Iterable
from uuid import UUID

from fastapi import HTTPException, status
from redis import Redis
from rq import Queue
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import (
    Campaign,
    CampaignRecipient,
    CampaignStatus,
    Contact,
    ContactList,
    DeliveryStatus,
    User,
)
from app.schemas.campaigns import CampaignCreate
from app.services.contacts import get_contact_list, list_contacts
from app.services.queue import get_queue


def _enqueue_recipient(recipient: CampaignRecipient) -> None:
    queue = get_queue("campaigns")
    queue.enqueue(
        "app.tasks.campaigns.process_campaign_recipient",
        str(recipient.id),
        job_timeout=600,
    )


async def create_campaign(db: AsyncSession, user: User, payload: CampaignCreate) -> Campaign:
    contact_list = await get_contact_list(db, user, payload.list_id)
    contacts = await list_contacts(db, contact_list)

    settings = get_settings()
    if len(contacts) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Contact list has no contacts")
    if len(contacts) > settings.max_campaign_recipients:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Campaign recipient cap exceeded")

    campaign = Campaign(
        user_id=user.id,
        list_id=contact_list.id,
        name=payload.name,
        template_body=payload.template_body,
        template_variables=payload.template_variables,
        media_url=payload.media_url,
        document_url=payload.document_url,
        throttle_min_seconds=payload.throttle_min_seconds,
        throttle_max_seconds=payload.throttle_max_seconds,
        scheduled_at=payload.scheduled_at,
        meta=payload.metadata or {},
    )
    db.add(campaign)
    await db.flush()

    recipients = [
        CampaignRecipient(
            campaign_id=campaign.id,
            contact_id=contact.id,
            name=contact.name,
            phone_e164=contact.phone_e164,
        )
        for contact in contacts
    ]
    db.add_all(recipients)

    await db.commit()
    await db.refresh(campaign, attribute_names=["recipients"])
    return campaign


async def get_campaign(db: AsyncSession, user: User, campaign_id: UUID) -> Campaign:
    result = await db.execute(
        select(Campaign).where(Campaign.id == campaign_id, Campaign.user_id == user.id)
    )
    campaign = result.scalar_one_or_none()
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return campaign


async def list_campaigns(db: AsyncSession, user: User) -> list[Campaign]:
    result = await db.execute(
        select(Campaign).where(Campaign.user_id == user.id).order_by(Campaign.created_at.desc())
    )
    return list(result.scalars().all())


async def start_campaign(db: AsyncSession, user: User, campaign: Campaign) -> Campaign:
    now = datetime.now(UTC)
    if user.plan_expires_at and user.plan_expires_at < now:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Subscription expired")

    await db.refresh(campaign, attribute_names=["recipients"])

    if campaign.status not in {CampaignStatus.DRAFT, CampaignStatus.PAUSED}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Campaign already in progress")

    settings = get_settings()

    total_recipients = len(campaign.recipients)
    if total_recipients == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No recipients to send")

    required_points = total_recipients * settings.points_per_recipient
    if user.points_balance < required_points:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Insufficient points balance")

    today = datetime.now(UTC).date()
    result = await db.execute(
        select(CampaignRecipient)
        .join(Campaign)
        .where(
            Campaign.user_id == user.id,
            CampaignRecipient.sent_at.is_not(None),
            CampaignRecipient.status == DeliveryStatus.SENT,
            CampaignRecipient.sent_at >= datetime.combine(today, datetime.min.time(), tzinfo=UTC),
        )
    )
    sent_today = len(result.scalars().all())
    if sent_today + total_recipients > settings.max_daily_recipients:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Daily limit exceeded")

    campaign.status = CampaignStatus.QUEUED
    campaign.started_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(campaign, attribute_names=["recipients"])

    for recipient in campaign.recipients:
        _enqueue_recipient(recipient)

    return campaign


async def update_campaign_status(db: AsyncSession, campaign: Campaign, status: CampaignStatus) -> Campaign:
    campaign.status = status
    if status == CampaignStatus.CANCELLED:
        for recipient in campaign.recipients:
            if recipient.status in {DeliveryStatus.QUEUED, DeliveryStatus.SENDING}:
                recipient.status = DeliveryStatus.FAILED
                recipient.last_error = "Cancelled"
    await db.commit()
    await db.refresh(campaign)
    return campaign


async def pause_campaign(db: AsyncSession, campaign: Campaign) -> Campaign:
    if campaign.status not in {CampaignStatus.QUEUED, CampaignStatus.SENDING}:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Campaign cannot be paused")
    campaign.status = CampaignStatus.PAUSED
    await db.commit()
    await db.refresh(campaign, attribute_names=["recipients"])
    return campaign


async def resume_campaign(db: AsyncSession, campaign: Campaign) -> Campaign:
    if campaign.status != CampaignStatus.PAUSED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Campaign is not paused")
    campaign.status = CampaignStatus.QUEUED
    meta = dict(campaign.meta or {})
    meta["consecutive_failures"] = 0
    campaign.meta = meta
    await db.commit()
    await db.refresh(campaign, attribute_names=["recipients"])
    for recipient in campaign.recipients:
        if recipient.status == DeliveryStatus.QUEUED:
            _enqueue_recipient(recipient)
    return campaign


async def cancel_campaign(db: AsyncSession, campaign: Campaign) -> Campaign:
    await db.refresh(campaign, attribute_names=["recipients"])
    campaign.status = CampaignStatus.CANCELLED
    for recipient in campaign.recipients:
        if recipient.status in {DeliveryStatus.QUEUED, DeliveryStatus.SENDING}:
            recipient.status = DeliveryStatus.FAILED
            recipient.last_error = "Campaign cancelled"
    await db.commit()
    await db.refresh(campaign)
    return campaign


async def get_campaign_recipients(db: AsyncSession, campaign: Campaign) -> list[CampaignRecipient]:
    result = await db.execute(select(CampaignRecipient).where(CampaignRecipient.campaign_id == campaign.id))
    return list(result.scalars().all())


async def compute_campaign_progress(db: AsyncSession, campaign: Campaign) -> dict[str, int]:
    recipients = await get_campaign_recipients(db, campaign)
    progress = {
        "total": len(recipients),
        "queued": 0,
        "sending": 0,
        "sent": 0,
        "failed": 0,
        "read": 0,
    }
    for rec in recipients:
        progress[rec.status.value] += 1
    return progress
