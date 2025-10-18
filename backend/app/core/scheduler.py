from __future__ import annotations

from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import async_session
from app.models import User, WalletTransaction, WalletTxnType
from app.services.auth import create_wallet_transaction


_scheduler: AsyncIOScheduler | None = None


async def _deactivate_expired_plans() -> None:
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.plan_expires_at.is_not(None), User.plan_expires_at < datetime.now(timezone.utc))
        )
        users = result.scalars().all()
        for user in users:
            user.plan_expires_at = None
        await session.commit()


async def _expire_wallet_coins() -> None:
    now = datetime.now(timezone.utc)
    async with async_session() as session:
        result = await session.execute(
            select(WalletTransaction)
            .options(selectinload(WalletTransaction.user))
            .where(
                WalletTransaction.expires_at.is_not(None),
                WalletTransaction.expires_at < now,
                WalletTransaction.expire_processed.is_(False),
                WalletTransaction.points > 0,
            )
            .order_by(WalletTransaction.expires_at.asc())
        )
        transactions = list(result.scalars().all())
        for txn in transactions:
            user = txn.user
            if user is None:
                txn.expire_processed = True
                continue
            if user.points_balance <= 0:
                txn.expire_processed = True
                continue
            deduct_amount = min(txn.points, max(user.points_balance, 0))
            if deduct_amount <= 0:
                txn.expire_processed = True
                continue
            await create_wallet_transaction(
                session,
                user,
                WalletTxnType.EXPIRE,
                -deduct_amount,
                reference=f"expire:{txn.id}",
            )
            txn.expire_processed = True
        await session.commit()


def start_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler and _scheduler.running:
        return _scheduler

    scheduler = AsyncIOScheduler()
    scheduler.add_job(_deactivate_expired_plans, "interval", hours=6, id="plan-expiry-check")
    scheduler.add_job(_expire_wallet_coins, "interval", hours=6, id="coin-expiry-check")
    scheduler.start()
    _scheduler = scheduler
    return scheduler


def shutdown_scheduler() -> None:
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
