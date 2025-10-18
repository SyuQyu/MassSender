from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, ConfigDict

from app.models.campaigns import CampaignStatus, DeliveryStatus


class CampaignBase(BaseModel):
    name: str
    template_body: str
    template_variables: list[str] = []
    media_url: str | None = None
    document_url: str | None = None
    throttle_min_seconds: int = Field(default=2, ge=1)
    throttle_max_seconds: int = Field(default=5, ge=1)
    scheduled_at: datetime | None = None

    @field_validator("throttle_max_seconds")
    @classmethod
    def validate_throttle(cls, value: int, info) -> int:  # noqa: D417
        min_value = 1
        if hasattr(info, "data") and info.data is not None:
            min_value = info.data.get("throttle_min_seconds", min_value)
        if value < min_value:
            raise ValueError("throttle_max_seconds cannot be less than min value")
        return value


class CampaignCreate(CampaignBase):
    list_id: UUID
    metadata: dict[str, Any] | None = None
    session_id: UUID | None = None


class CampaignRead(CampaignBase):
    id: UUID
    user_id: UUID
    list_id: UUID
    status: CampaignStatus
    session_id: UUID | None
    session_label: str | None = None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    metadata: dict[str, Any] | None = Field(alias="meta")

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class CampaignRecipientRead(BaseModel):
    id: UUID
    name: str | None
    phone_e164: str
    status: DeliveryStatus
    last_error: str | None
    attempts: int
    sent_at: datetime | None
    read_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CampaignProgress(BaseModel):
    total: int
    queued: int
    sending: int
    sent: int
    failed: int
    read: int
    status: CampaignStatus


class CampaignActionResponse(BaseModel):
    id: UUID
    status: CampaignStatus
    detail: str


class ActiveCampaignSummary(BaseModel):
    id: UUID
    name: str
    status: CampaignStatus
    session_id: UUID | None
    session_label: str | None = None
    progress: CampaignProgress
