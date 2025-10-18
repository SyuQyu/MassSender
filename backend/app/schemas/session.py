from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Base64Bytes, BaseModel, Field
from pydantic import ConfigDict

from app.models.session import SessionStatus


class SessionCreate(BaseModel):
    label: str
    avatar_color: str | None = Field(default=None, pattern=r"^#?[0-9a-fA-F]{3,6}$")
    priority: int | None = Field(default=None, ge=0)


class SessionUpdate(BaseModel):
    label: str | None = None
    avatar_color: str | None = Field(default=None, pattern=r"^#?[0-9a-fA-F]{3,6}$")
    priority: int | None = Field(default=None, ge=0)


class SessionRead(BaseModel):
    id: UUID
    status: SessionStatus
    label: str
    device_name: str | None
    avatar_color: str | None
    priority: int
    linked_devices: list[str] = Field(default_factory=list)
    qr_png: Base64Bytes | None
    metadata: dict[str, Any] | None = Field(alias="meta")
    expires_at: datetime | None
    last_seen_at: datetime | None
    last_qr_at: datetime | None
    last_error_message: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class SessionStatusResponse(BaseModel):
    status: SessionStatus
    expires_at: datetime | None
    last_seen_at: datetime | None
    last_qr_at: datetime | None
    last_error_message: str | None
    linked_devices: list[str] = Field(default_factory=list)


class WhatsAppGroup(BaseModel):
    id: str
    name: str | None = None
    participant_count: int


class WhatsAppGroupMember(BaseModel):
    phone_e164: str
    name: str | None = None


class GroupMessageRequest(BaseModel):
    body: str | None = None
    media_url: str | None = None
    document_url: str | None = None


class GroupMemberMessageRequest(GroupMessageRequest):
    phone_e164: str
