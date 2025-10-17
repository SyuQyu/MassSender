from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from typing import Any

import httpx
from loguru import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import SessionStatus, User, WhatsAppSession


WORKER_STATUS_MAP = {
    "initializing": SessionStatus.WAITING,
    "disconnected": SessionStatus.EXPIRED,
    "auth_failure": SessionStatus.ERROR,
    "qr": SessionStatus.WAITING,
    "waiting": SessionStatus.WAITING,
    "linked": SessionStatus.LINKED,
}


async def get_or_create_session(db: AsyncSession, user: User) -> WhatsAppSession:
    worker_data = await _fetch_worker_status()
    status_value = worker_data.get("status", "error")
    mapped_status = WORKER_STATUS_MAP.get(status_value, SessionStatus.ERROR)
    qr_b64 = worker_data.get("qr")
    last_seen = worker_data.get("lastSeen")

    result = await db.execute(
        select(WhatsAppSession)
        .where(WhatsAppSession.user_id == user.id)
        .order_by(WhatsAppSession.created_at.desc())
        .limit(1)
    )
    session = result.scalar_one_or_none()

    qr_bytes = _normalize_qr(qr_b64) if qr_b64 else None
    now = datetime.now(timezone.utc)

    if session is None:
        session = WhatsAppSession(user_id=user.id)
        db.add(session)

    session.status = mapped_status
    session.qr_png = qr_bytes
    session.last_seen_at = _parse_datetime(last_seen)
    if mapped_status == SessionStatus.WAITING:
        session.expires_at = now + timedelta(minutes=2)
    elif mapped_status == SessionStatus.LINKED:
        session.expires_at = now + timedelta(days=7)

    await db.commit()
    await db.refresh(session)
    return session


async def mark_session_linked(db: AsyncSession, session: WhatsAppSession) -> WhatsAppSession:
    session.status = SessionStatus.LINKED
    session.qr_png = None
    session.last_seen_at = datetime.now(timezone.utc)
    session.expires_at = session.last_seen_at + timedelta(days=7)
    await db.commit()
    await db.refresh(session)
    return session


async def expire_idle_sessions(db: AsyncSession, user: User) -> None:
    await get_or_create_session(db, user)


async def _fetch_worker_status() -> dict[str, Any]:
    settings = get_settings()
    url = settings.whatsapp_worker_url.unicode_string().rstrip("/") + "/status"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            response.raise_for_status()
            return response.json()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to fetch WhatsApp worker status: %s", exc)
        return {"status": "error"}


def _normalize_qr(data_url: str) -> bytes | None:
    if not data_url:
        return None
    if "," in data_url:
        _, encoded = data_url.split(",", 1)
    else:
        encoded = data_url
    try:
        encoded = encoded.strip()
        padding = len(encoded) % 4
        if padding:
            encoded += "=" * (4 - padding)
        return encoded.encode("ascii")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to decode QR payload: %s", exc)
        return None


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None
