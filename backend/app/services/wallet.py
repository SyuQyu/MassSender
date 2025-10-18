from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import User, WalletTransaction, WalletTxnType
from app.schemas.wallet import WalletSummary, WalletTopupRequest
from app.services.auth import create_wallet_transaction


PLAN_TYPES = {
    "15d": {"days": 15, "points": 1000},
    "30d": {"days": 30, "points": 2000},
}


async def get_wallet_summary(db: AsyncSession, user: User) -> WalletSummary:
    settings = get_settings()
    now = datetime.now(timezone.utc)

    result = await db.execute(
        select(WalletTransaction)
        .where(
            WalletTransaction.user_id == user.id,
            WalletTransaction.expires_at.is_not(None),
            WalletTransaction.expire_processed.is_(False),
            WalletTransaction.points > 0,
        )
        .order_by(WalletTransaction.expires_at.asc())
    )
    expiring_txns = list(result.scalars().all())
    expiring_points = sum(tx.points for tx in expiring_txns if tx.expires_at and tx.expires_at > now)
    next_expiry_at = None
    for tx in expiring_txns:
        if tx.expires_at and tx.expires_at > now:
            next_expiry_at = tx.expires_at
            break

    return WalletSummary(
        balance=user.points_balance,
        plan_expires_at=user.plan_expires_at,
        points_per_recipient=settings.points_per_recipient,
        max_daily_recipients=settings.max_daily_recipients,
        max_campaign_recipients=settings.max_campaign_recipients,
        expiring_points=expiring_points,
        next_expiry_at=next_expiry_at,
    )


async def wallet_topup(db: AsyncSession, user: User, payload: WalletTopupRequest) -> WalletSummary:
    if payload.points is None and payload.plan_type is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Provide points or plan_type")

    now = datetime.now(timezone.utc)

    if payload.plan_type:
        plan = PLAN_TYPES.get(payload.plan_type)
        if not plan:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown plan_type")
        points = plan["points"]
        expires_at = (user.plan_expires_at or now) + timedelta(days=plan["days"])
        user.plan_expires_at = expires_at
        await create_wallet_transaction(
            db, user, WalletTxnType.ALLOCATION, points, reference=f"plan:{payload.plan_type}"
        )
    else:
        points = payload.points or 0
        await create_wallet_transaction(db, user, WalletTxnType.TOPUP, points, reference="manual_topup")

    await db.commit()
    await db.refresh(user)
    return await get_wallet_summary(db, user)


async def list_wallet_transactions(db: AsyncSession, user: User) -> list[WalletTransaction]:
    result = await db.execute(
        select(WalletTransaction)
        .where(WalletTransaction.user_id == user.id)
        .order_by(WalletTransaction.created_at.desc())
    )
    return list(result.scalars().all())


async def purchase_coins(db: AsyncSession, user: User, points: int) -> WalletSummary:
    if points <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Points must be positive")

    expires_at = datetime.now(timezone.utc) + timedelta(days=30)
    await create_wallet_transaction(
        db,
        user,
        WalletTxnType.COIN_PURCHASE,
        points,
        reference="coins",
        expires_at=expires_at,
    )
    await db.commit()
    await db.refresh(user)
    return await get_wallet_summary(db, user)
