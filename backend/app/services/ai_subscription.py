from __future__ import annotations

from datetime import timedelta, timezone, datetime
from typing import Literal

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


AI_PLAN_DURATIONS: dict[str, int] = {
    "trial-1d": 1,
    "plan-5d": 5,
    "plan-15d": 15,
    "plan-30d": 30,
}


async def _refresh_user(db: AsyncSession, user: User, attrs: tuple[str, ...] = ("ai_access_ends_at", "ai_trial_started_at", "ai_plan_name")) -> None:
    await db.refresh(user, attribute_names=list(attrs))


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def ensure_ai_access(db: AsyncSession, user: User) -> None:
    await _refresh_user(db, user)
    now = _now()
    if user.ai_access_ends_at and user.ai_access_ends_at > now:
        return
    if user.ai_trial_started_at is None:
        user.ai_trial_started_at = now
        user.ai_plan_name = "trial-1d"
        user.ai_access_ends_at = now + timedelta(days=AI_PLAN_DURATIONS[user.ai_plan_name])
        await db.commit()
        await db.refresh(user)
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="AI assistant inactive. Contact support.")


async def get_ai_status(db: AsyncSession, user: User) -> dict:
    await _refresh_user(db, user)
    now = _now()
    active = bool(user.ai_access_ends_at and user.ai_access_ends_at > now)
    trial_available = user.ai_trial_started_at is None
    return {
        "active": active,
        "expires_at": user.ai_access_ends_at,
        "plan_name": user.ai_plan_name,
        "trial_available": trial_available,
    }


async def grant_ai_plan(db: AsyncSession, target: User, plan: Literal["5d", "15d", "30d"]) -> dict:
    await _refresh_user(db, target)
    days_map = {"5d": 5, "15d": 15, "30d": 30}
    now = _now()
    current = target.ai_access_ends_at if target.ai_access_ends_at and target.ai_access_ends_at > now else now
    target.ai_access_ends_at = current + timedelta(days=days_map[plan])
    target.ai_plan_name = f"plan-{plan}"
    await db.commit()
    await db.refresh(target)
    return await get_ai_status(db, target)
