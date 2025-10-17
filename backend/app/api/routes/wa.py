from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db
from app.models import SessionStatus, User, WhatsAppSession
from app.schemas.automation import AutoResponseResult, InboundMessage
from app.schemas.session import SessionRead, SessionStatusResponse
from app.services import automation as automation_service
from app.services import session as session_service


router = APIRouter()


@router.get("/session", response_model=SessionRead)
async def get_session(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> SessionRead:
    await session_service.expire_idle_sessions(db, current_user)
    wa_session = await session_service.get_or_create_session(db, current_user)
    return SessionRead.model_validate(wa_session)


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
    wa_session = await session_service.get_or_create_session(db, current_user)
    return SessionStatusResponse(status=wa_session.status, expires_at=wa_session.expires_at, last_seen_at=wa_session.last_seen_at)


@router.post("/inbound", response_model=list[AutoResponseResult])
async def inbound_message(
    payload: InboundMessage,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> list[AutoResponseResult]:
    return await automation_service.handle_inbound(db, current_user, payload)
