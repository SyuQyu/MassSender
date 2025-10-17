from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field
from pydantic import ConfigDict

from app.models.contacts import ContactSource


class ContactBase(BaseModel):
    name: str | None = None
    phone_e164: str = Field(pattern=r"^\+\d{8,15}$")
    consent: bool = True


class ContactRead(ContactBase):
    id: UUID
    metadata: dict[str, Any] | None = Field(alias="meta")
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class ContactListBase(BaseModel):
    name: str


class ContactListCreate(ContactListBase):
    source: ContactSource
    metadata: dict[str, Any] | None = None


class ContactListRead(ContactListBase):
    id: UUID
    source: ContactSource
    total_contacts: int
    metadata: dict[str, Any] | None = Field(alias="meta")
    created_at: datetime

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class GroupImportRequest(BaseModel):
    group_name: str


class GroupImportPreview(BaseModel):
    name: str | None = None
    phone_e164: str | None = None
