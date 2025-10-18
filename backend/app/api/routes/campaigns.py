import asyncio
import csv
import io
from uuid import UUID

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db
from app.core.security import decode_token
from app.db.session import async_session
from app.models import Campaign, CampaignStatus, User
from app.schemas.campaigns import (
    CampaignActionResponse,
    CampaignCreate,
    CampaignProgress,
    CampaignRead,
    CampaignRecipientRead,
)
from app.services import campaigns as campaigns_service


router = APIRouter()


def _serialize_campaign(campaign: Campaign) -> CampaignRead:
    return CampaignRead(
        id=campaign.id,
        name=campaign.name,
        status=campaign.status,
        list_id=campaign.list_id,
        user_id=campaign.user_id,
        template_body=campaign.template_body,
        template_variables=campaign.template_variables,
        media_url=campaign.media_url,
        document_url=campaign.document_url,
        throttle_min_seconds=campaign.throttle_min_seconds,
        throttle_max_seconds=campaign.throttle_max_seconds,
        scheduled_at=campaign.scheduled_at,
        started_at=campaign.started_at,
        completed_at=campaign.completed_at,
        created_at=campaign.created_at,
        metadata=campaign.meta,
    )


def _serialize_recipient(recipient) -> CampaignRecipientRead:
    return CampaignRecipientRead(
        id=recipient.id,
        name=recipient.name,
        phone_e164=recipient.phone_e164,
        status=recipient.status,
        attempts=recipient.attempts,
        sent_at=recipient.sent_at,
        read_at=recipient.read_at,
        last_error=recipient.last_error,
        created_at=recipient.created_at,
        updated_at=recipient.updated_at,
    )


@router.get("/", response_model=list[CampaignRead])
async def list_campaigns(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> list[CampaignRead]:
    campaigns = await campaigns_service.list_campaigns(db, current_user)
    return [_serialize_campaign(c) for c in campaigns]


@router.post("/", response_model=CampaignRead, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    payload: CampaignCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> CampaignRead:
    campaign = await campaigns_service.create_campaign(db, current_user, payload)
    return _serialize_campaign(campaign)


@router.get("/{campaign_id}", response_model=CampaignRead)
async def get_campaign(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> CampaignRead:
    campaign = await campaigns_service.get_campaign(db, current_user, campaign_id)
    return _serialize_campaign(campaign)


@router.get("/{campaign_id}/recipients", response_model=list[CampaignRecipientRead])
async def get_recipients(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> list[CampaignRecipientRead]:
    campaign = await campaigns_service.get_campaign(db, current_user, campaign_id)
    recipients = await campaigns_service.get_campaign_recipients(db, campaign)
    return [_serialize_recipient(r) for r in recipients]


@router.post("/{campaign_id}/start", response_model=CampaignActionResponse)
async def start(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> CampaignActionResponse:
    campaign = await campaigns_service.get_campaign(db, current_user, campaign_id)
    campaign = await campaigns_service.start_campaign(db, current_user, campaign)
    return CampaignActionResponse(id=campaign.id, status=campaign.status, detail="Campaign started")


@router.post("/{campaign_id}/pause", response_model=CampaignActionResponse)
async def pause(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> CampaignActionResponse:
    campaign = await campaigns_service.get_campaign(db, current_user, campaign_id)
    campaign = await campaigns_service.pause_campaign(db, campaign)
    return CampaignActionResponse(id=campaign.id, status=campaign.status, detail="Campaign paused")


@router.post("/{campaign_id}/resume", response_model=CampaignActionResponse)
async def resume(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> CampaignActionResponse:
    campaign = await campaigns_service.get_campaign(db, current_user, campaign_id)
    campaign = await campaigns_service.resume_campaign(db, campaign)
    return CampaignActionResponse(id=campaign.id, status=campaign.status, detail="Campaign resumed")


@router.post("/{campaign_id}/cancel", response_model=CampaignActionResponse)
async def cancel(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> CampaignActionResponse:
    campaign = await campaigns_service.get_campaign(db, current_user, campaign_id)
    campaign = await campaigns_service.cancel_campaign(db, campaign)
    return CampaignActionResponse(id=campaign.id, status=campaign.status, detail="Campaign cancelled")


@router.get("/{campaign_id}/progress", response_model=CampaignProgress)
async def progress(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> CampaignProgress:
    campaign = await campaigns_service.get_campaign(db, current_user, campaign_id)
    await db.refresh(campaign)
    progress_data = await campaigns_service.compute_campaign_progress(db, campaign)
    return CampaignProgress(status=campaign.status, **progress_data)


@router.get("/{campaign_id}/export")
async def export_recipients(
    campaign_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> StreamingResponse:
    campaign = await campaigns_service.get_campaign(db, current_user, campaign_id)
    recipients = await campaigns_service.get_campaign_recipients(db, campaign)

    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["name", "phone", "status", "sent_at", "read_at", "last_error"])
    for rec in recipients:
        writer.writerow([
            rec.name or "",
            rec.phone_e164,
            rec.status.value,
            rec.sent_at.isoformat() if rec.sent_at else "",
            rec.read_at.isoformat() if rec.read_at else "",
            rec.last_error or "",
        ])

    buffer.seek(0)
    headers = {"Content-Disposition": f"attachment; filename=campaign-{campaign.id}.csv"}
    return StreamingResponse(iter([buffer.getvalue()]), media_type="text/csv", headers=headers)


@router.websocket("/ws/{campaign_id}")
async def campaign_progress_ws(websocket: WebSocket, campaign_id: str) -> None:
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=1008, reason="Missing token")
        return
    try:
        decoded = decode_token(token)
    except ValueError:
        await websocket.close(code=1008, reason="Invalid token")
        return
    user_id = decoded.get("sub")
    if user_id is None:
        await websocket.close(code=1008, reason="Invalid token payload")
        return

    try:
        campaign_uuid = UUID(campaign_id)
    except ValueError:
        await websocket.close(code=1008, reason="Invalid campaign id")
        return

    await websocket.accept()

    try:
        while True:
            async with async_session() as session:
                result = await session.execute(select(Campaign).where(Campaign.id == campaign_uuid))
                campaign = result.scalar_one_or_none()
                if campaign is None or str(campaign.user_id) != user_id:
                    await websocket.close(code=1008, reason="Campaign not found")
                    return
                await session.refresh(campaign)
                progress_data = await campaigns_service.compute_campaign_progress(session, campaign)
                payload = {**progress_data, "status": campaign.status.value}
                await websocket.send_json(payload)
                if campaign.status in {CampaignStatus.COMPLETED, CampaignStatus.FAILED, CampaignStatus.CANCELLED}:
                    await websocket.close()
                    return
            await asyncio.sleep(2)
    except WebSocketDisconnect:
        return
