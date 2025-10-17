from __future__ import annotations

from datetime import datetime, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select

from app.db.session import async_session
from app.models import User


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


def start_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler and _scheduler.running:
        return _scheduler

    scheduler = AsyncIOScheduler()
    scheduler.add_job(_deactivate_expired_plans, "interval", hours=6, id="plan-expiry-check")
    scheduler.start()
    _scheduler = scheduler
    return scheduler


def shutdown_scheduler() -> None:
    if _scheduler and _scheduler.running:
        _scheduler.shutdown(wait=False)
