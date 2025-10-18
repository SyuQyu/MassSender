from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db
from app.models import ActiveSchedule, AutoResponseRule, User
from app.schemas.automation import (
    ActiveScheduleCreate,
    ActiveScheduleRead,
    AutoResponseRuleCreate,
    AutoResponseRuleRead,
    AutoResponseRuleUpdate,
)
from app.services import automation as automation_service


router = APIRouter()


async def _ensure_points_available(db: AsyncSession, user: User) -> None:
    await db.refresh(user, attribute_names=["points_balance"])
    if user.points_balance <= 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient points balance. Top up before modifying automation rules.",
        )


@router.get("/rules", response_model=list[AutoResponseRuleRead])
async def list_rules(
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)
) -> list[AutoResponseRuleRead]:
    rules = await automation_service.list_rules(db, current_user)
    return [AutoResponseRuleRead.model_validate(rule) for rule in rules]


@router.post("/rules", response_model=AutoResponseRuleRead, status_code=status.HTTP_201_CREATED)
async def create_rule(
    payload: AutoResponseRuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> AutoResponseRuleRead:
    await _ensure_points_available(db, current_user)
    rule = await automation_service.create_rule(db, current_user, payload)
    return AutoResponseRuleRead.model_validate(rule)


@router.put("/rules/{rule_id}", response_model=AutoResponseRuleRead)
async def update_rule(
    rule_id: UUID,
    payload: AutoResponseRuleUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> AutoResponseRuleRead:
    await _ensure_points_available(db, current_user)
    rule = await automation_service.update_rule(db, current_user, rule_id, payload)
    return AutoResponseRuleRead.model_validate(rule)


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> None:
    await _ensure_points_available(db, current_user)
    await automation_service.delete_rule(db, current_user, rule_id)


@router.get("/schedule", response_model=ActiveScheduleRead | None)
async def get_schedule(
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)
) -> ActiveScheduleRead | None:
    schedule = await automation_service.get_active_schedule(db, current_user)
    if schedule is None:
        return None
    return ActiveScheduleRead.model_validate(schedule)


@router.put("/schedule", response_model=ActiveScheduleRead)
async def set_schedule(
    payload: ActiveScheduleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> ActiveScheduleRead:
    await _ensure_points_available(db, current_user)
    schedule = await automation_service.set_active_schedule(db, current_user, payload)
    return ActiveScheduleRead.model_validate(schedule)
