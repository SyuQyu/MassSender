from __future__ import annotations

import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActiveSchedule, AutoResponseLog, AutoResponseRule, TriggerType, User
from app.schemas.automation import (
    ActiveScheduleCreate,
    AutoResponseResult,
    AutoResponseRuleCreate,
    AutoResponseRuleUpdate,
    InboundMessage,
)


async def list_rules(db: AsyncSession, user: User) -> list[AutoResponseRule]:
    result = await db.execute(
        select(AutoResponseRule).where(AutoResponseRule.user_id == user.id).order_by(AutoResponseRule.created_at.desc())
    )
    return list(result.scalars().all())


async def get_rule(db: AsyncSession, user: User, rule_id):
    result = await db.execute(
        select(AutoResponseRule).where(AutoResponseRule.id == rule_id, AutoResponseRule.user_id == user.id)
    )
    rule = result.scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    return rule


async def create_rule(db: AsyncSession, user: User, payload: AutoResponseRuleCreate) -> AutoResponseRule:
    rule = AutoResponseRule(
        user_id=user.id,
        name=payload.name,
        trigger_type=payload.trigger_type,
        trigger_value=payload.trigger_value,
        response_text=payload.response_text,
        response_media_url=payload.response_media_url,
        cooldown_seconds=payload.cooldown_seconds,
        active=payload.active,
        active_windows=[window.model_dump() for window in payload.active_windows],
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


async def update_rule(db: AsyncSession, user: User, rule_id, payload: AutoResponseRuleUpdate) -> AutoResponseRule:
    rule = await get_rule(db, user, rule_id)
    rule.name = payload.name
    rule.trigger_type = payload.trigger_type
    rule.trigger_value = payload.trigger_value
    rule.response_text = payload.response_text
    rule.response_media_url = payload.response_media_url
    rule.cooldown_seconds = payload.cooldown_seconds
    rule.active = payload.active
    rule.active_windows = [window.model_dump() for window in payload.active_windows]
    await db.commit()
    await db.refresh(rule)
    return rule


async def delete_rule(db: AsyncSession, user: User, rule_id) -> None:
    rule = await get_rule(db, user, rule_id)
    await db.delete(rule)
    await db.commit()


async def set_active_schedule(db: AsyncSession, user: User, payload: ActiveScheduleCreate) -> ActiveSchedule:
    result = await db.execute(
        select(ActiveSchedule).where(ActiveSchedule.user_id == user.id).limit(1)
    )
    schedule = result.scalar_one_or_none()
    windows = [window.model_dump() for window in payload.windows]
    if schedule is None:
        schedule = ActiveSchedule(
            user_id=user.id,
            name=payload.name,
            timezone=payload.timezone,
            windows=windows,
            is_active=payload.is_active,
        )
        db.add(schedule)
    else:
        schedule.name = payload.name
        schedule.timezone = payload.timezone
        schedule.windows = windows
        schedule.is_active = payload.is_active
    await db.commit()
    await db.refresh(schedule)
    return schedule


async def get_active_schedule(db: AsyncSession, user: User) -> ActiveSchedule | None:
    result = await db.execute(
        select(ActiveSchedule).where(ActiveSchedule.user_id == user.id).limit(1)
    )
    return result.scalar_one_or_none()


def _within_windows(windows: list[dict], timezone: str, timestamp: datetime) -> bool:
    tz = ZoneInfo(timezone)
    local_ts = timestamp.astimezone(tz)
    for window in windows:
        if window["day_of_week"] != local_ts.weekday():
            continue
        start = datetime.strptime(window["start_time"], "%H:%M").time()
        end = datetime.strptime(window["end_time"], "%H:%M").time()
        if start <= local_ts.time() <= end:
            return True
    return False


def _matches_rule(rule: AutoResponseRule, message: str) -> bool:
    normalized = message.lower()
    if rule.trigger_type == TriggerType.KEYWORD:
        return normalized == rule.trigger_value.lower()
    if rule.trigger_type == TriggerType.CONTAINS:
        return rule.trigger_value.lower() in normalized
    if rule.trigger_type == TriggerType.REGEX:
        return re.search(rule.trigger_value, message) is not None
    return False


async def handle_inbound(db: AsyncSession, user: User, payload: InboundMessage) -> list[AutoResponseResult]:
    if user.plan_expires_at and user.plan_expires_at < datetime.now(timezone.utc):
        return []

    schedule = await get_active_schedule(db, user)
    if schedule and not schedule.is_active:
        return []

    timestamp = payload.timestamp
    if schedule and schedule.windows:
        if not _within_windows(schedule.windows, schedule.timezone, timestamp):
            return []

    rules = await list_rules(db, user)
    results: list[AutoResponseResult] = []
    for rule in rules:
        if not rule.active:
            continue
        rule_windows = rule.active_windows or []
        if rule_windows and not _within_windows(rule_windows, schedule.timezone if schedule else user.timezone, timestamp):
            continue
        if not _matches_rule(rule, payload.message):
            continue

        log_result = await db.execute(
            select(AutoResponseLog).where(
                AutoResponseLog.rule_id == rule.id,
                AutoResponseLog.contact_phone == payload.contact_phone,
            )
        )
        log = log_result.scalar_one_or_none()
        if log:
            cooldown = rule.cooldown_seconds or 0
            if cooldown > 0:
                delta = (timestamp - log.last_triggered_at).total_seconds()
                if delta < cooldown:
                    continue
            log.last_triggered_at = timestamp
        else:
            log = AutoResponseLog(rule_id=rule.id, contact_phone=payload.contact_phone, last_triggered_at=timestamp)
            db.add(log)

        results.append(
            AutoResponseResult(
                rule_id=rule.id,
                response_text=rule.response_text,
                response_media_url=rule.response_media_url,
            )
        )

    await db.commit()
    return results
