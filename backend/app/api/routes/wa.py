from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, status
from loguru import logger
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_current_active_user_optional, get_db
from app.core.config import get_settings
from app.models import User, WhatsAppSession
from app.schemas.automation import AutoResponseResult, InboundMessage
from app.schemas.session import (
    GroupMemberMessageRequest,
    GroupMessageRequest,
    SessionCreate,
    SessionRead,
    SessionStatusResponse,
    SessionUpdate,
    WhatsAppGroup,
    WhatsAppGroupMember,
)
from app.services import automation as automation_service
from app.services import session as session_service


router = APIRouter()


def _serialize_session(session: WhatsAppSession) -> SessionRead:
    return SessionRead(
        id=session.id,
        status=session.status,
        label=session.label,
        device_name=session.device_name,
        avatar_color=session.avatar_color,
        priority=session.priority,
        linked_devices=session.linked_devices,
        qr_png=session.qr_png,
        metadata=session.meta,
        expires_at=session.expires_at,
        last_seen_at=session.last_seen_at,
        last_qr_at=session.last_qr_at,
        last_error_message=session.last_error_message,
        created_at=session.created_at,
    )


@router.get("/sessions", response_model=list[SessionRead])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> list[SessionRead]:
    sessions = await session_service.list_sessions(db, current_user)
    return [_serialize_session(session) for session in sessions]


@router.post("/sessions", response_model=SessionRead, status_code=status.HTTP_201_CREATED)
async def create_session(
    payload: SessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> SessionRead:
    session = await session_service.create_session(
        db,
        current_user,
        label=payload.label,
        avatar_color=payload.avatar_color,
        priority=payload.priority,
    )
    return _serialize_session(session)


@router.get("/sessions/{session_id}", response_model=SessionRead)
async def get_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> SessionRead:
    session = await session_service.get_session(db, current_user, session_id)
    return _serialize_session(session)


@router.patch("/sessions/{session_id}", response_model=SessionRead)
async def update_session(
    session_id: UUID,
    payload: SessionUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> SessionRead:
    session = await session_service.update_session(
        db,
        current_user,
        session_id,
        label=payload.label,
        avatar_color=payload.avatar_color,
        priority=payload.priority,
    )
    return _serialize_session(session)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> None:
    await session_service.delete_session(db, current_user, session_id)


@router.post("/sessions/{session_id}/refresh", response_model=SessionRead)
async def refresh_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> SessionRead:
    session = await session_service.refresh_session(db, current_user, session_id)
    return _serialize_session(session)


@router.get("/sessions/{session_id}/status", response_model=SessionStatusResponse)
async def session_status(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> SessionStatusResponse:
    session = await session_service.ensure_session_synced(db, current_user, session_id)
    return SessionStatusResponse(
        status=session.status,
        expires_at=session.expires_at,
        last_seen_at=session.last_seen_at,
        last_qr_at=session.last_qr_at,
        last_error_message=session.last_error_message,
        linked_devices=session.linked_devices,
    )


@router.post("/sessions/{session_id}/mock-link", response_model=SessionRead, tags=["development"])
async def mock_link_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> SessionRead:
    session = await session_service.ensure_session_synced(db, current_user, session_id)
    return _serialize_session(session)


@router.get("/sessions/{session_id}/groups", response_model=list[WhatsAppGroup])
async def list_groups(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> list[WhatsAppGroup]:
    session = await session_service.ensure_linked_session(db, current_user, session_id)
    groups = await session_service.fetch_groups(session)
    return [WhatsAppGroup.model_validate(group) for group in groups]


@router.get("/sessions/{session_id}/groups/{group_id}/members", response_model=list[WhatsAppGroupMember])
async def list_group_members(
    session_id: UUID,
    group_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> list[WhatsAppGroupMember]:
    session = await session_service.ensure_linked_session(db, current_user, session_id)
    members = await session_service.fetch_group_members(session, group_id)
    return [WhatsAppGroupMember.model_validate(member) for member in members]


@router.post("/sessions/{session_id}/groups/{group_id}/send", status_code=status.HTTP_202_ACCEPTED)
async def send_group_message(
    session_id: UUID,
    group_id: str,
    payload: GroupMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, str]:
    session = await session_service.ensure_linked_session(db, current_user, session_id)
    await session_service.send_group_message(session, group_id, payload.body or "", payload.media_url, payload.document_url)
    return {"status": "queued"}


@router.post("/sessions/{session_id}/groups/{group_id}/members/send", status_code=status.HTTP_202_ACCEPTED)
async def send_group_member_message(
    session_id: UUID,
    group_id: str,  # kept for parity/logging though not used directly
    payload: GroupMemberMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, str]:
    session = await session_service.ensure_linked_session(db, current_user, session_id)
    await session_service.send_group_member_message(
        session,
        payload.phone_e164,
        payload.body or "",
        payload.media_url,
        payload.document_url,
    )
    return {"status": "queued"}


@router.post("/inbound", response_model=list[AutoResponseResult])
async def inbound_message(
    payload: InboundMessage,
    worker_key: str | None = Header(default=None, alias="X-Worker-Key"),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_current_active_user_optional),
) -> list[AutoResponseResult]:
    settings = get_settings()
    session: WhatsAppSession | None = None

    if worker_key:
        if worker_key != settings.session_key:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid worker key")
        if payload.session_id is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="session_id required")
        session = await session_service.get_session_by_id(db, payload.session_id)
        if session is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
        user = session.user
        if user is None:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Session missing user")
    else:
        if current_user is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
        user = current_user
        if payload.session_id:
            session = await session_service.ensure_linked_session(db, current_user, payload.session_id)
        else:
            session = await session_service.get_default_session(db, current_user)

    responses = await automation_service.handle_inbound(db, user, payload)

    if session is not None:
        for item in responses:
            body = item.response_text or ""
            if not body and not item.response_media_url:
                continue
            try:
                await session_service.send_group_member_message(
                    session,
                    payload.contact_phone,
                    body,
                    item.response_media_url,
                    None,
                )
            except HTTPException:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to send auto-response via session %s: %s", session.id, exc)

    return responses
