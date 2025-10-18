from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import User, WalletTransaction, WalletTxnType
from app.schemas.wallet import WalletGrantRequest, WalletGrantResult, WalletSummary, WalletTopupRequest
from app.services.auth import create_wallet_transaction


PLAN_TYPES = {
    "15d": {"days": 15, "points": 1000},
    "30d": {"days": 30, "points": 2000},
}
EXPIRY_OPTIONS = {5, 15, 30}
DEFAULT_EXPIRY_DAYS = 30


def _resolve_expiry_days(raw_value: int | None) -> int:
    value = raw_value if raw_value is not None else DEFAULT_EXPIRY_DAYS
    if value not in EXPIRY_OPTIONS:
        allowed = ", ".join(str(option) for option in sorted(EXPIRY_OPTIONS))
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Expiry must be one of {allowed} days",
        )
    return value


async def get_wallet_summary(db: AsyncSession, user: User) -> WalletSummary:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    admin_emails = {email.lower() for email in settings.points_admin_emails}

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
        support_whatsapp_number=settings.support_whatsapp_number,
        can_allocate_points=user.email.lower() in admin_emails if admin_emails else False,
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
            db,
            user,
            WalletTxnType.ALLOCATION,
            points,
            reference=f"plan:{payload.plan_type}",
            expires_at=expires_at,
        )
    else:
        points = payload.points or 0
        expiry_days = _resolve_expiry_days(payload.expires_in_days)
        expires_at = now + timedelta(days=expiry_days)
        await create_wallet_transaction(
            db,
            user,
            WalletTxnType.TOPUP,
            points,
            reference=f"manual_topup:{expiry_days}d",
            expires_at=expires_at,
        )

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


async def grant_points(db: AsyncSession, admin: User, payload: WalletGrantRequest) -> WalletGrantResult:
    target_result = await db.execute(select(User).where(User.email == payload.user_email))
    target = target_result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found")

    expiry_days = _resolve_expiry_days(payload.expires_in_days)
    expires_at = datetime.now(timezone.utc) + timedelta(days=expiry_days)

    txn = await create_wallet_transaction(
        db,
        target,
        WalletTxnType.ALLOCATION,
        payload.points,
        reference=f"admin_grant:{expiry_days}d",
        expires_at=expires_at,
    )
    meta = dict(txn.meta or {})
    meta.update({"granted_by": str(admin.id), "granted_by_email": admin.email})
    txn.meta = meta

    await db.commit()
    await db.refresh(target)
    return WalletGrantResult(
        transaction_id=txn.id,
        target_email=payload.user_email,
        granted_points=payload.points,
        new_balance=target.points_balance,
        expires_at=expires_at,
    )
