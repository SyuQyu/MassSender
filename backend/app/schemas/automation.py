from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict

from app.models.automation import TriggerType
from app.schemas.common import TimeWindow


class AutoResponseRuleBase(BaseModel):
    name: str
    trigger_type: TriggerType
    trigger_value: str = Field(max_length=255)
    response_text: str | None = None
    response_media_url: str | None = None
    cooldown_seconds: int = Field(default=0, ge=0)
    active: bool = True
    active_windows: list[TimeWindow] = Field(default_factory=list)


class AutoResponseRuleCreate(AutoResponseRuleBase):
    pass


class AutoResponseRuleUpdate(AutoResponseRuleBase):
    pass


class AutoResponseRuleRead(AutoResponseRuleBase):
    id: UUID
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


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
    model_config = ConfigDict(from_attributes=True)


class InboundMessage(BaseModel):
    contact_phone: str
    message: str
    timestamp: datetime
    session_id: UUID | None = None


class AutoResponseResult(BaseModel):
    rule_id: UUID
    response_text: str | None
    response_media_url: str | None
