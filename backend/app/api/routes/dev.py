from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.config import get_settings
from app.models import (
    ActiveSchedule,
    AutoResponseRule,
    Campaign,
    CampaignRecipient,
    Contact,
    ContactList,
    User,
    WalletTransaction,
    WhatsAppSession,
)


router = APIRouter()


@router.post("/reset", status_code=status.HTTP_202_ACCEPTED)
async def reset_environment(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    settings = get_settings()
    if settings.env.lower() == "production":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Reset disabled in production")

    for model in [CampaignRecipient, Campaign, Contact, ContactList, AutoResponseRule, ActiveSchedule, WalletTransaction, WhatsAppSession, User]:
        await db.execute(delete(model))
    await db.commit()
    return {"status": "reset"}
