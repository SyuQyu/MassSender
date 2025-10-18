from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class SessionStatus(enum.StrEnum):
    WAITING = "waiting"
    LINKED = "linked"
    EXPIRED = "expired"
    ERROR = "error"


class WhatsAppSession(Base):
    __tablename__ = "wa_sessions"
    __table_args__ = (UniqueConstraint("user_id", "label", name="uq_wa_sessions_user_label"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[SessionStatus] = mapped_column(Enum(SessionStatus, name="session_status"), default=SessionStatus.WAITING)
    label: Mapped[str] = mapped_column(String(255), nullable=False, default="Primary")
    device_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_color: Mapped[str | None] = mapped_column(String(7), nullable=True)
    priority: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    qr_png: Mapped[bytes | None] = mapped_column(nullable=True)
    meta: Mapped[dict | None] = mapped_column("metadata", JSONB, default=dict)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    linked_devices: Mapped[list[str]] = mapped_column(JSONB, default=list, nullable=False)
    last_qr_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship(back_populates="sessions")
    campaigns: Mapped[list["Campaign"]] = relationship(back_populates="session")
