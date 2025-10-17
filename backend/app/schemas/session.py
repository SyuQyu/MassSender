from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import Base64Bytes, BaseModel, Field
from pydantic import ConfigDict

from app.models.session import SessionStatus


class SessionRead(BaseModel):
    id: UUID
    status: SessionStatus
    label: str | None
    device_name: str | None
    qr_png: Base64Bytes | None
    metadata: dict[str, Any] | None = Field(alias="meta")
    expires_at: datetime | None
    last_seen_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class SessionStatusResponse(BaseModel):
    status: SessionStatus
    expires_at: datetime | None
    last_seen_at: datetime | None
