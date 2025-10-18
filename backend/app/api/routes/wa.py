from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db
from app.models import SessionStatus, User, WhatsAppSession
from app.schemas.automation import AutoResponseResult, InboundMessage
from app.schemas.session import (
    GroupMemberMessageRequest,
    GroupMessageRequest,
    SessionRead,
    SessionStatusResponse,
    WhatsAppGroup,
    WhatsAppGroupMember,
)
from app.services import automation as automation_service
from app.services import session as session_service


router = APIRouter()


@router.get("/session", response_model=SessionRead)
async def get_session(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> SessionRead:
    wa_session = await session_service.get_or_create_session(db, current_user, create_if_missing=False)
    if wa_session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No connection available")
    return SessionRead.model_validate(wa_session)


@router.get("/sessions", response_model=list[SessionRead])
async def list_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> list[SessionRead]:
    sessions = await session_service.list_sessions(db, current_user)
    return [SessionRead.model_validate(session) for session in sessions]


@router.post("/sessions", response_model=SessionRead, status_code=status.HTTP_201_CREATED)
async def create_connection(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> SessionRead:
    session = await session_service.create_session(db, current_user)
    return SessionRead.model_validate(session)


@router.post("/sessions/{session_id}/refresh", response_model=SessionRead)
async def refresh_connection(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> SessionRead:
    session = await session_service.refresh_session(db, current_user, session_id)
    return SessionRead.model_validate(session)


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> None:
    await session_service.delete_session(db, current_user, session_id)


@router.post("/session/mock-link", response_model=SessionRead, tags=["development"])
async def mock_link_session(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> SessionRead:
    """Development helper to refresh the worker status without forcing a mock link."""

    await session_service.expire_idle_sessions(db, current_user)
    wa_session = await session_service.get_or_create_session(db, current_user)
    return SessionRead.model_validate(wa_session)


@router.get("/session/status", response_model=SessionStatusResponse)
async def session_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> SessionStatusResponse:
    await session_service.expire_idle_sessions(db, current_user)
    wa_session = await session_service.get_or_create_session(db, current_user, create_if_missing=False)
    if wa_session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No connection available")
    return SessionStatusResponse(status=wa_session.status, expires_at=wa_session.expires_at, last_seen_at=wa_session.last_seen_at)


@router.get("/groups", response_model=list[WhatsAppGroup])
async def list_groups(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> list[WhatsAppGroup]:
    await session_service.expire_idle_sessions(db, current_user)
    groups = await session_service.fetch_groups()
    return [WhatsAppGroup.model_validate(group) for group in groups]


@router.get("/groups/{group_id}/members", response_model=list[WhatsAppGroupMember])
async def list_group_members(
    group_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> list[WhatsAppGroupMember]:
    await session_service.expire_idle_sessions(db, current_user)
    members = await session_service.fetch_group_members(group_id)
    return [WhatsAppGroupMember.model_validate(member) for member in members]


@router.post("/groups/{group_id}/send", status_code=status.HTTP_202_ACCEPTED)
async def send_group_message(
    group_id: str,
    payload: GroupMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, str]:
    await session_service.expire_idle_sessions(db, current_user)
    await session_service.send_group_message(group_id, payload.body or "", payload.media_url, payload.document_url)
    return {"status": "queued"}


@router.post("/groups/{group_id}/members/send", status_code=status.HTTP_202_ACCEPTED)
async def send_group_member_message(
    group_id: str,  # kept for parity/logging though not used directly
    payload: GroupMemberMessageRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, str]:
    await session_service.expire_idle_sessions(db, current_user)
    await session_service.send_group_member_message(
        payload.phone_e164,
        payload.body or "",
        payload.media_url,
        payload.document_url,
    )
    return {"status": "queued"}


@router.post("/inbound", response_model=list[AutoResponseResult])
async def inbound_message(
    payload: InboundMessage,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> list[AutoResponseResult]:
    return await automation_service.handle_inbound(db, current_user, payload)
