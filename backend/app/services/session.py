from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import httpx
from fastapi import HTTPException, status
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


def _worker_base_url() -> str:
    settings = get_settings()
    return settings.whatsapp_worker_url.unicode_string().rstrip("/")


async def _request_worker(method: str, path: str, *, json: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{_worker_base_url()}{path}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        response = await client.request(method, url, json=json)
        if response.status_code >= 400:
            response.raise_for_status()
        if response.content:
            return response.json()
        return {}


def _apply_worker_payload(session: WhatsAppSession, payload: dict[str, Any]) -> None:
    status_value = payload.get("status", "error")
    mapped_status = WORKER_STATUS_MAP.get(status_value, SessionStatus.ERROR)
    qr_b64 = payload.get("qr")
    last_seen = payload.get("lastSeen")

    session.status = mapped_status
    session.qr_png = _normalize_qr(qr_b64) if qr_b64 else None
    session.last_seen_at = _parse_datetime(last_seen)

    now = datetime.now(timezone.utc)
    if mapped_status == SessionStatus.WAITING:
        session.expires_at = now + timedelta(minutes=2)
    elif mapped_status == SessionStatus.LINKED:
        session.expires_at = now + timedelta(days=7)
    else:
        session.expires_at = None


async def get_or_create_session(
    db: AsyncSession,
    user: User,
    *,
    create_if_missing: bool = True,
) -> WhatsAppSession | None:
    result = await db.execute(
        select(WhatsAppSession)
        .where(WhatsAppSession.user_id == user.id)
        .order_by(WhatsAppSession.created_at.desc())
        .limit(1)
    )
    session = result.scalar_one_or_none()

    if session is None:
        if not create_if_missing:
            return None
        session = WhatsAppSession(user_id=user.id, status=SessionStatus.WAITING)
        db.add(session)
        await db.flush()

    try:
        worker_data = await _fetch_worker_status()
        _apply_worker_payload(session, worker_data)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to sync worker status: %s", exc)
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
    session = await get_or_create_session(db, user, create_if_missing=False)
    if session is None:
        return
    try:
        worker_data = await _fetch_worker_status()
        _apply_worker_payload(session, worker_data)
        await db.commit()
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to refresh worker status during expire check: %s", exc)
        await db.commit()


async def _fetch_worker_status() -> dict[str, Any]:
    try:
        return await _request_worker("GET", "/status")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to fetch WhatsApp worker status: %s", exc)
        return {"status": "error"}


async def list_sessions(db: AsyncSession, user: User) -> list[WhatsAppSession]:
    result = await db.execute(
        select(WhatsAppSession).where(WhatsAppSession.user_id == user.id).order_by(WhatsAppSession.created_at.desc())
    )
    sessions = list(result.scalars().all())
    if sessions:
        try:
            worker_data = await _fetch_worker_status()
            _apply_worker_payload(sessions[0], worker_data)
            await db.commit()
            await db.refresh(sessions[0])
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to refresh session list status: %s", exc)
            await db.commit()
    return sessions


async def create_session(db: AsyncSession, user: User) -> WhatsAppSession:
    try:
        await _request_worker("POST", "/logout")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to reset worker before creating session: %s", exc)
    session = await get_or_create_session(db, user, create_if_missing=True)
    if session is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Unable to create session")
    return session


async def refresh_session(db: AsyncSession, user: User, session_id: UUID) -> WhatsAppSession:
    session = await _get_session(db, user, session_id)
    try:
        worker_data = await _fetch_worker_status()
        _apply_worker_payload(session, worker_data)
        await db.commit()
        await db.refresh(session)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to refresh session %s: %s", session_id, exc)
        await db.commit()
    return session


async def delete_session(db: AsyncSession, user: User, session_id) -> None:
    session = await _get_session(db, user, session_id)
    try:
        await _request_worker("POST", "/logout")
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to logout worker: %s", exc)
    await db.delete(session)
    await db.commit()


async def fetch_groups() -> list[dict[str, Any]]:
    try:
        payload = await _request_worker("GET", "/groups")
        groups = payload.get("groups", [])
        if not isinstance(groups, list):
            return []
        normalized = []
        for group in groups:
            normalized.append(
                {
                    "id": group.get("id"),
                    "name": group.get("name"),
                    "participant_count": group.get("participant_count", 0),
                }
            )
        return normalized
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == status.HTTP_409_CONFLICT:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="WhatsApp session not linked") from exc
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="WhatsApp worker unavailable") from exc
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to fetch groups: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="WhatsApp worker unavailable") from exc


async def fetch_group_members(group_id: str) -> list[dict[str, Any]]:
    try:
        payload = await _request_worker("POST", "/group-members", json={"groupName": group_id})
        members = payload.get("members", [])
        if not isinstance(members, list):
            return []
        normalized = []
        for member in members:
            normalized.append(
                {
                    "phone_e164": member.get("phone_e164"),
                    "name": member.get("name"),
                }
            )
        return normalized
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == status.HTTP_409_CONFLICT:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="WhatsApp session not linked") from exc
        if exc.response.status_code == status.HTTP_404_NOT_FOUND:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found") from exc
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="WhatsApp worker unavailable") from exc
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to fetch group members: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="WhatsApp worker unavailable") from exc


async def send_group_message(group_id: str, body: str, media_url: str | None, document_url: str | None) -> None:
    if not body and not media_url and not document_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message body or media required")
    try:
        await _request_worker(
            "POST",
            "/groups/send",
            json={"groupId": group_id, "body": body, "mediaUrl": media_url, "documentUrl": document_url},
        )
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == status.HTTP_409_CONFLICT:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="WhatsApp session not linked") from exc
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="WhatsApp worker unavailable") from exc
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to send group message: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="WhatsApp worker unavailable") from exc


async def send_group_member_message(
    phone_e164: str,
    body: str,
    media_url: str | None,
    document_url: str | None,
) -> None:
    if not phone_e164:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Member phone is required")
    if not body and not media_url and not document_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message body or media required")
    try:
        await _request_worker(
            "POST",
            "/send",
            json={"to": phone_e164, "body": body, "mediaUrl": media_url, "documentUrl": document_url},
        )
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == status.HTTP_409_CONFLICT:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="WhatsApp session not linked") from exc
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="WhatsApp worker unavailable") from exc
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to send member message: %s", exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="WhatsApp worker unavailable") from exc


async def _get_session(db: AsyncSession, user: User, session_id: UUID) -> WhatsAppSession:
    result = await db.execute(
        select(WhatsAppSession).where(WhatsAppSession.user_id == user.id, WhatsAppSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


def _normalize_qr(data_url: str) -> bytes | None:
    if not data_url:
        return None
    if "," in data_url:
        _, encoded = data_url.split(",", 1)
    else:
        encoded = data_url
    encoded = encoded.strip()
    padding = len(encoded) % 4
    if padding:
        encoded += "=" * (4 - padding)
    return encoded.encode("ascii")


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None
