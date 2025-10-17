from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class TriggerType(enum.StrEnum):
    KEYWORD = "keyword"
    CONTAINS = "contains"
    REGEX = "regex"


class AutoResponseRule(Base):
    __tablename__ = "auto_response_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    trigger_type: Mapped[TriggerType] = mapped_column(Enum(TriggerType, name="trigger_type"), nullable=False)
    trigger_value: Mapped[str] = mapped_column(String(255), nullable=False)
    response_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_media_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    cooldown_seconds: Mapped[int] = mapped_column(Integer, default=3600)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    active_windows: Mapped[list[dict] | None] = mapped_column(JSONB, default=list)
    meta: Mapped[dict | None] = mapped_column("metadata", JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="rules")


class ActiveSchedule(Base):
    __tablename__ = "active_schedules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False, default="UTC")
    windows: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="schedules")


class AutoResponseLog(Base):
    __tablename__ = "auto_response_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    rule_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("auto_response_rules.id", ondelete="CASCADE"))
    contact_phone: Mapped[str] = mapped_column(String(32), nullable=False)
    last_triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    rule: Mapped[AutoResponseRule] = relationship()
