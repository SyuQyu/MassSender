from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict

from app.models.wallet import WalletTxnType


class WalletSummary(BaseModel):
    balance: int
    plan_expires_at: datetime | None
    points_per_recipient: int
    max_daily_recipients: int
    max_campaign_recipients: int
    expiring_points: int
    next_expiry_at: datetime | None


class WalletTopupRequest(BaseModel):
    points: int | None = Field(default=None, ge=1)
    plan_type: str | None = None


class WalletCoinPurchase(BaseModel):
    points: int = Field(ge=1)


class WalletTransactionRead(BaseModel):
    id: UUID
    txn_type: WalletTxnType
    points: int
    balance_after: int
    reference: str | None
    expires_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
