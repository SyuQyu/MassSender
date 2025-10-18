from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

import httpx
from fastapi import HTTPException, status
from loguru import logger
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import SessionStatus, User, WhatsAppSession


DEFAULT_SESSION_LABEL = "Primary"
DEFAULT_PRIORITY = 100

WORKER_STATUS_MAP = {
    "initializing": SessionStatus.WAITING,
    "disconnected": SessionStatus.EXPIRED,
    "auth_failure": SessionStatus.ERROR,
    "qr": SessionStatus.WAITING,
    "waiting": SessionStatus.WAITING,
    "linked": SessionStatus.LINKED,
}


class WorkerUnavailableError(RuntimeError):
    """Raised when the WhatsApp worker cannot be reached."""


def _worker_base_url() -> str:
    settings = get_settings()
    return settings.whatsapp_worker_url.unicode_string().rstrip("/")


async def _request_worker(method: str, path: str, *, json: dict[str, Any] | None = None) -> dict[str, Any]:
    url = f"{_worker_base_url()}{path}"
    async with httpx.AsyncClient(timeout=15.0) as client:
        try:
            response = await client.request(method, url, json=json)
            response.raise_for_status()
        except httpx.HTTPStatusError:
            raise
        except httpx.RequestError as exc:
            raise WorkerUnavailableError(str(exc)) from exc
        if response.content:
            try:
                return response.json()
            except ValueError:
                logger.warning("Worker returned non-JSON payload for %s %s", method, path)
        return {}


def _normalize_label(label: str) -> str:
    normalized = (label or "").strip()
    if not normalized:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Label is required")
    return normalized[:255]


def _normalize_color(color: str | None) -> str | None:
    if not color:
        return None
    value = color.strip()
    if not value:
        return None
    if not value.startswith("#"):
        value = f"#{value}"
    return value[:7]


def _apply_worker_payload(session: WhatsAppSession, payload: dict[str, Any]) -> None:
    status_value = payload.get("status", "error")
    mapped_status = WORKER_STATUS_MAP.get(status_value, SessionStatus.ERROR)
    session.status = mapped_status

    qr_data = payload.get("qr")
    if qr_data:
        session.qr_png = _normalize_qr(qr_data)
        session.last_qr_at = _parse_datetime(payload.get("lastQrAt")) or datetime.now(timezone.utc)
    else:
        session.qr_png = None
        if "lastQrAt" in payload:
            session.last_qr_at = _parse_datetime(payload.get("lastQrAt"))

    session.device_name = payload.get("deviceName") or session.device_name
    session.last_seen_at = _parse_datetime(payload.get("lastSeen"))
    linked_devices = payload.get("linkedDevices") or []
    if isinstance(linked_devices, list):
        session.linked_devices = [str(device) for device in linked_devices]
    else:
        session.linked_devices = []
    last_error = payload.get("lastError") or payload.get("message")
    session.last_error_message = str(last_error) if last_error else None

    metadata = payload.get("meta")
    if isinstance(metadata, dict):
        session.meta = metadata

    expires_at_raw = payload.get("expiresAt")
    if expires_at_raw:
        session.expires_at = _parse_datetime(expires_at_raw)
    else:
        now = datetime.now(timezone.utc)
        if mapped_status == SessionStatus.WAITING:
            session.expires_at = now + timedelta(minutes=2)
        elif mapped_status == SessionStatus.LINKED:
            session.expires_at = now + timedelta(days=7)
        else:
            session.expires_at = None


async def list_sessions(db: AsyncSession, user: User) -> list[WhatsAppSession]:
    result = await db.execute(
        select(WhatsAppSession)
        .where(WhatsAppSession.user_id == user.id)
        .order_by(WhatsAppSession.priority.asc(), WhatsAppSession.created_at.asc())
    )
    return list(result.scalars().all())


async def get_session(db: AsyncSession, user: User, session_id: UUID) -> WhatsAppSession:
    result = await db.execute(
        select(WhatsAppSession).where(WhatsAppSession.user_id == user.id, WhatsAppSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


async def ensure_session_synced(db: AsyncSession, user: User, session_id: UUID) -> WhatsAppSession:
    session = await get_session(db, user, session_id)
    try:
        worker_data = await _fetch_worker_status(session.id)
        _apply_worker_payload(session, worker_data)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to sync session %s: %s", session_id, exc)
        session.last_error_message = str(exc)
    await db.commit()
    await db.refresh(session)
    return session


async def get_session_by_id(db: AsyncSession, session_id: UUID) -> WhatsAppSession | None:
    result = await db.execute(
        select(WhatsAppSession)
        .options(selectinload(WhatsAppSession.user))
        .where(WhatsAppSession.id == session_id)
    )
    return result.scalar_one_or_none()


async def create_session(
    db: AsyncSession,
    user: User,
    *,
    label: str,
    avatar_color: str | None = None,
    priority: int | None = None,
) -> WhatsAppSession:
    settings = get_settings()

    count = await db.scalar(select(func.count()).where(WhatsAppSession.user_id == user.id))
    if count is not None and count >= settings.max_user_sessions:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Session limit reached ({settings.max_user_sessions}). Delete an existing session first.",
        )

    normalized_label = _normalize_label(label)
    normalized_color = _normalize_color(avatar_color)
    priority_value = max(0, priority) if priority is not None else DEFAULT_PRIORITY

    session = WhatsAppSession(
        user_id=user.id,
        label=normalized_label,
        avatar_color=normalized_color,
        priority=priority_value,
        status=SessionStatus.WAITING,
    )
    db.add(session)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session label already exists") from exc

    try:
        worker_payload = await _request_worker(
            "POST",
            f"/sessions/{session.id}/init",
            json={"label": normalized_label},
        )
        _apply_worker_payload(session, worker_payload)
    except httpx.HTTPStatusError as exc:
        await db.rollback()
        if exc.response.status_code == status.HTTP_409_CONFLICT:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Worker session limit reached") from exc
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Worker rejected session init") from exc
    except WorkerUnavailableError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="WhatsApp worker unavailable. Restart the worker service and try again.",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        await db.rollback()
        logger.error("Failed to initialize worker session %s: %s", session.id, exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Unable to initialize worker session") from exc

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        try:
            await _request_worker("POST", f"/sessions/{session.id}/logout")
        except Exception:  # noqa: BLE001
            logger.warning("Failed to rollback worker session %s after DB integrity error", session.id)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session label already exists") from exc

    await db.refresh(session)
    return session


async def update_session(
    db: AsyncSession,
    user: User,
    session_id: UUID,
    *,
    label: str | None = None,
    avatar_color: str | None = None,
    priority: int | None = None,
) -> WhatsAppSession:
    session = await get_session(db, user, session_id)
    if label is not None:
        session.label = _normalize_label(label)
    if avatar_color is not None:
        session.avatar_color = _normalize_color(avatar_color)
    if priority is not None:
        session.priority = max(0, priority)

    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session label already exists") from exc

    await db.refresh(session)
    return session


async def delete_session(db: AsyncSession, user: User, session_id: UUID) -> None:
    session = await get_session(db, user, session_id)
    try:
        await _request_worker("POST", f"/sessions/{session.id}/logout")
    except WorkerUnavailableError as exc:
        logger.warning("Worker unavailable during session delete %s: %s", session_id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="WhatsApp worker unavailable. Restart the worker service and try again.",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to logout worker session %s: %s", session_id, exc)
    await db.delete(session)
    await db.commit()


async def refresh_session(db: AsyncSession, user: User, session_id: UUID) -> WhatsAppSession:
    return await ensure_session_synced(db, user, session_id)


async def ensure_linked_session(db: AsyncSession, user: User, session_id: UUID) -> WhatsAppSession:
    session = await ensure_session_synced(db, user, session_id)
    if session.status != SessionStatus.LINKED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="WhatsApp session not linked")
    return session


async def get_default_session(db: AsyncSession, user: User) -> WhatsAppSession | None:
    sessions = await list_sessions(db, user)
    return sessions[0] if sessions else None


async def fetch_groups(session: WhatsAppSession) -> list[dict[str, Any]]:
    try:
        payload = await _request_worker("GET", f"/sessions/{session.id}/groups")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == status.HTTP_409_CONFLICT:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="WhatsApp session not linked") from exc
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="WhatsApp worker unavailable") from exc
    except WorkerUnavailableError as exc:
        logger.warning("Failed to fetch groups for session %s: %s", session.id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="WhatsApp worker unavailable. Restart the worker service and try again.",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to fetch groups for session %s: %s", session.id, exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="WhatsApp worker unavailable") from exc

    groups = payload.get("groups", [])
    if not isinstance(groups, list):
        return []
    return [
        {
            "id": group.get("id"),
            "name": group.get("name"),
            "participant_count": group.get("participant_count", 0),
        }
        for group in groups
    ]


async def fetch_group_members(session: WhatsAppSession, group_id: str) -> list[dict[str, Any]]:
    try:
        payload = await _request_worker(
            "POST", f"/sessions/{session.id}/groups/members", json={"groupName": group_id}
        )
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == status.HTTP_409_CONFLICT:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="WhatsApp session not linked") from exc
        if exc.response.status_code == status.HTTP_404_NOT_FOUND:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found") from exc
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="WhatsApp worker unavailable") from exc
    except WorkerUnavailableError as exc:
        logger.warning("Failed to fetch group members for session %s: %s", session.id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="WhatsApp worker unavailable. Restart the worker service and try again.",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to fetch group members for session %s: %s", session.id, exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="WhatsApp worker unavailable") from exc

    members = payload.get("members", [])
    if not isinstance(members, list):
        return []
    return [
        {
            "phone_e164": member.get("phone_e164"),
            "name": member.get("name"),
        }
        for member in members
    ]


async def send_group_message(
    session: WhatsAppSession, group_id: str, body: str, media_url: str | None, document_url: str | None
) -> None:
    if not body and not media_url and not document_url:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message body or media required")
    try:
        await _request_worker(
            "POST",
            f"/sessions/{session.id}/groups/send",
            json={"groupId": group_id, "body": body, "mediaUrl": media_url, "documentUrl": document_url},
        )
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == status.HTTP_409_CONFLICT:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="WhatsApp session not linked") from exc
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="WhatsApp worker unavailable") from exc
    except WorkerUnavailableError as exc:
        logger.warning("Failed to send group message via session %s: %s", session.id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="WhatsApp worker unavailable. Restart the worker service and try again.",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to send group message via session %s: %s", session.id, exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="WhatsApp worker unavailable") from exc


async def send_group_member_message(
    session: WhatsAppSession,
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
            f"/sessions/{session.id}/send",
            json={"to": phone_e164, "body": body, "mediaUrl": media_url, "documentUrl": document_url},
        )
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == status.HTTP_409_CONFLICT:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="WhatsApp session not linked") from exc
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="WhatsApp worker unavailable") from exc
    except WorkerUnavailableError as exc:
        logger.warning("Failed to send member message via session %s: %s", session.id, exc)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="WhatsApp worker unavailable. Restart the worker service and try again.",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to send member message via session %s: %s", session.id, exc)
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="WhatsApp worker unavailable") from exc


async def _fetch_worker_status(session_id: UUID) -> dict[str, Any]:
    try:
        return await _request_worker("GET", f"/sessions/{session_id}/status")
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == status.HTTP_404_NOT_FOUND:
            logger.warning("Worker reports session %s missing", session_id)
            return {"status": "disconnected", "lastError": "Session not initialized on worker"}
        raise
    except WorkerUnavailableError as exc:
        logger.warning("Worker unavailable while fetching status for session %s: %s", session_id, exc)
        return {"status": "error", "lastError": str(exc)}
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to fetch worker status for session %s: %s", session_id, exc)
        return {"status": "error", "lastError": str(exc)}


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
    try:
        base64.b64decode(encoded, validate=True)
    except Exception:  # noqa: BLE001
        logger.warning("Received invalid QR payload")
    return encoded.encode("ascii")


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None
