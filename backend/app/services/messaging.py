from __future__ import annotations

from typing import Literal

import httpx
from loguru import logger

from app.core.config import get_settings


class MessagingError(Exception):
    """Base error for outbound messaging."""


class MessagingRetryableError(MessagingError):
    """Temporary failure — caller should retry with backoff."""


class MessagingPermanentError(MessagingError):
    """Non-recoverable failure that should mark the job as failed."""


def _ensure_official_mode() -> None:
    settings = get_settings()
    if not settings.official_mode:
        raise MessagingPermanentError("OFFICIAL_MODE is disabled; WhatsApp Cloud API not active.")
    if not settings.whatsapp_api_token or not settings.whatsapp_phone_number_id:
        raise MessagingPermanentError("WhatsApp Cloud API credentials are missing.")


def _post_payload(payload: dict, context: str) -> None:
    settings = get_settings()
    base_url = settings.whatsapp_api_base_url.rstrip("/")
    url = f"{base_url}/{settings.whatsapp_phone_number_id}/messages"
    headers = {
        "Authorization": f"Bearer {settings.whatsapp_api_token}",
        "Content-Type": "application/json",
    }

    try:
        response = httpx.post(url, json=payload, headers=headers, timeout=30.0)
    except httpx.RequestError as exc:  # network errors should be retried
        logger.warning("WhatsApp API request error during %s: %s", context, exc)
        raise MessagingRetryableError(f"Network error while {context}") from exc

    if response.status_code in {429, 500, 502, 503, 504}:
        logger.warning(
            "WhatsApp API transient failure (%s) during %s: %s",
            response.status_code,
            context,
            response.text,
        )
        raise MessagingRetryableError(f"Transient API failure while {context}")

    if response.status_code >= 400:
        logger.error(
            "WhatsApp API permanent failure (%s) during %s: %s",
            response.status_code,
            context,
            response.text,
        )
        raise MessagingPermanentError(f"API rejected message while {context}: {response.text}")


def _send_text(phone: str, body: str) -> None:
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone,
        "type": "text",
        "text": {"preview_url": False, "body": body},
    }
    _post_payload(payload, context="sending text")


def _send_media(phone: str, link: str, media_type: Literal["image", "video", "document"]) -> None:
    payload: dict = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": phone,
        "type": media_type,
        media_type: {"link": link},
    }
    if media_type == "document":
        payload[media_type]["filename"] = link.split("/")[-1][:50]
    _post_payload(payload, context=f"sending {media_type}")


def send_campaign_message(*, phone: str, body: str, media_url: str | None, document_url: str | None) -> None:
    """Send a campaign message via WhatsApp."""

    settings = get_settings()
    if settings.official_mode:
        _ensure_official_mode()

        message_body = body.strip() or ""
        if not message_body and not media_url and not document_url:
            raise MessagingPermanentError("Message body and media are empty; nothing to send.")

        if message_body:
            _send_text(phone, message_body)

        if media_url:
            media_type: Literal["image", "video", "document"] = "image"
            lowered = media_url.lower()
            if lowered.endswith((".mp4", ".mov", ".avi")):
                media_type = "video"
            _send_media(phone, media_url, media_type)

        if document_url:
            _send_media(phone, document_url, "document")
        return

    _send_via_worker(phone=phone, body=body, media_url=media_url, document_url=document_url)


def _send_via_worker(*, phone: str, body: str, media_url: str | None, document_url: str | None) -> None:
    settings = get_settings()
    base_url = settings.whatsapp_worker_url.unicode_string().rstrip("/")
    url = f"{base_url}/send"
    payload = {
        "to": phone,
        "body": body,
        "mediaUrl": media_url,
        "documentUrl": document_url,
    }

    try:
        response = httpx.post(url, json=payload, timeout=60.0)
    except httpx.RequestError as exc:
        logger.warning("WhatsApp worker network error while sending to %s: %s", phone, exc)
        raise MessagingRetryableError("Worker unreachable") from exc

    if response.status_code in {429, 500, 502, 503, 504}:
        logger.warning(
            "WhatsApp worker transient failure (%s) for %s: %s",
            response.status_code,
            phone,
            response.text,
        )
        raise MessagingRetryableError("Worker transient failure")

    if response.status_code >= 400:
        logger.error(
            "WhatsApp worker permanent failure (%s) for %s: %s",
            response.status_code,
            phone,
            response.text,
        )
        raise MessagingPermanentError(response.text)
