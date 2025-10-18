from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncEngine


_ALTERS = (
    "ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ",
    "ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS expire_processed BOOLEAN DEFAULT FALSE",
    "ALTER TABLE wallet_transactions ALTER COLUMN expire_processed SET DEFAULT FALSE",
    "UPDATE wallet_transactions SET expire_processed = FALSE WHERE expire_processed IS NULL",
    "ALTER TABLE wallet_transactions ALTER COLUMN expire_processed SET NOT NULL",
)

_ENUM_ALTERS = (
    "ALTER TYPE wallet_txn_type ADD VALUE IF NOT EXISTS 'coin_purchase'",
    "ALTER TYPE wallet_txn_type ADD VALUE IF NOT EXISTS 'expire'",
)


async def ensure_wallet_schema(async_engine: AsyncEngine) -> None:
    async with async_engine.begin() as conn:
        result = await conn.execute(text("SELECT to_regclass('wallet_transactions')"))
        if result.scalar() is None:
            return
        for statement in _ALTERS:
            await conn.execute(text(statement))
        for statement in _ENUM_ALTERS:
            await conn.execute(text(statement))


def ensure_wallet_schema_sync(sync_engine: Engine) -> None:
    with sync_engine.begin() as conn:
        result = conn.execute(text("SELECT to_regclass('wallet_transactions')")).scalar()
        if result is None:
            return
        for statement in _ALTERS:
            conn.execute(text(statement))
        for statement in _ENUM_ALTERS:
            conn.execute(text(statement))
