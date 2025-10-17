from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field

from app.models.automation import TriggerType
from app.schemas.common import TimeWindow


class AutoResponseRuleBase(BaseModel):
    name: str
    trigger_type: TriggerType
    trigger_value: str = Field(max_length=255)
    response_text: str | None = None
    response_media_url: str | None = None
    cooldown_seconds: int = Field(default=3600, ge=60)
    active: bool = True
    active_windows: list[TimeWindow] = []


class AutoResponseRuleCreate(AutoResponseRuleBase):
    pass


class AutoResponseRuleUpdate(AutoResponseRuleBase):
    pass


class AutoResponseRuleRead(AutoResponseRuleBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class ActiveScheduleBase(BaseModel):
    name: str
    timezone: str
    windows: list[TimeWindow]
    is_active: bool = True


class ActiveScheduleCreate(ActiveScheduleBase):
    pass


class ActiveScheduleRead(ActiveScheduleBase):
    id: UUID
    created_at: datetime
    updated_at: datetime


class InboundMessage(BaseModel):
    contact_phone: str
    message: str
    timestamp: datetime


class AutoResponseResult(BaseModel):
    rule_id: UUID
    response_text: str | None
    response_media_url: str | None
