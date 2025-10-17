from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class ContactSource(enum.StrEnum):
    UPLOAD = "upload"
    GROUP = "group"


class ContactList(Base):
    __tablename__ = "contact_lists"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    source: Mapped[ContactSource] = mapped_column(Enum(ContactSource, name="contact_source"), nullable=False)
    total_contacts: Mapped[int] = mapped_column(Integer, default=0)
    meta: Mapped[dict | None] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user: Mapped["User"] = relationship(back_populates="contact_lists")
    contacts: Mapped[list["Contact"]] = relationship(back_populates="contact_list", cascade="all, delete-orphan")
    campaigns: Mapped[list["Campaign"]] = relationship(back_populates="contact_list")


class Contact(Base):
    __tablename__ = "contacts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    list_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contact_lists.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str | None] = mapped_column(String(255))
    phone_e164: Mapped[str] = mapped_column(String(32), index=True, nullable=False)
    consent: Mapped[bool] = mapped_column(Boolean, default=False)
    meta: Mapped[dict | None] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    contact_list: Mapped["ContactList"] = relationship(back_populates="contacts")
    campaign_recipients: Mapped[list["CampaignRecipient"]] = relationship(back_populates="contact")
