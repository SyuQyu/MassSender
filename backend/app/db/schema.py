from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncEngine


_WALLET_ALTERS = (
    "ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ",
    "ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS expire_processed BOOLEAN DEFAULT FALSE",
    "ALTER TABLE wallet_transactions ALTER COLUMN expire_processed SET DEFAULT FALSE",
    "UPDATE wallet_transactions SET expire_processed = FALSE WHERE expire_processed IS NULL",
    "ALTER TABLE wallet_transactions ALTER COLUMN expire_processed SET NOT NULL",
)

_WALLET_ENUM_ALTERS = (
    "ALTER TYPE wallet_txn_type ADD VALUE IF NOT EXISTS 'coin_purchase'",
    "ALTER TYPE wallet_txn_type ADD VALUE IF NOT EXISTS 'expire'",
)

_USER_ALTERS = (
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_access_ends_at TIMESTAMPTZ",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_plan_name VARCHAR(64)",
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_trial_started_at TIMESTAMPTZ",
)

_SESSION_ALTERS = (
    "ALTER TABLE wa_sessions ADD COLUMN IF NOT EXISTS label VARCHAR(255)",
    "UPDATE wa_sessions SET label = COALESCE(label, 'Primary')",
    "ALTER TABLE wa_sessions ALTER COLUMN label SET DEFAULT 'Primary'",
    "ALTER TABLE wa_sessions ALTER COLUMN label SET NOT NULL",
    "ALTER TABLE wa_sessions ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(7)",
    "ALTER TABLE wa_sessions ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 100",
    "ALTER TABLE wa_sessions ALTER COLUMN priority SET DEFAULT 100",
    "UPDATE wa_sessions SET priority = 100 WHERE priority IS NULL",
    "ALTER TABLE wa_sessions ALTER COLUMN priority SET NOT NULL",
    "ALTER TABLE wa_sessions ADD COLUMN IF NOT EXISTS linked_devices JSONB DEFAULT '[]'::jsonb",
    "ALTER TABLE wa_sessions ALTER COLUMN linked_devices SET DEFAULT '[]'::jsonb",
    "UPDATE wa_sessions SET linked_devices = '[]'::jsonb WHERE linked_devices IS NULL",
    "ALTER TABLE wa_sessions ALTER COLUMN linked_devices SET NOT NULL",
    "ALTER TABLE wa_sessions ADD COLUMN IF NOT EXISTS last_qr_at TIMESTAMPTZ",
    "ALTER TABLE wa_sessions ADD COLUMN IF NOT EXISTS last_error_message TEXT",
)

_SESSION_INDEXES = (
    "CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_sessions_user_label ON wa_sessions (user_id, label)",
)

_CAMPAIGN_ALTERS = (
    "ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS session_id UUID",
)

_CAMPAIGN_FK = (
    """
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_campaigns_session'
    ) THEN
        ALTER TABLE campaigns
            ADD CONSTRAINT fk_campaigns_session
            FOREIGN KEY (session_id)
            REFERENCES wa_sessions(id)
            ON DELETE SET NULL;
    END IF;
END;
$$;
""",
)

_CAMPAIGN_INDEXES = (
    "CREATE INDEX IF NOT EXISTS idx_campaigns_session_id ON campaigns (session_id)",
)

_CAMPAIGN_BACKFILL = (
    """
WITH latest_sessions AS (
    SELECT DISTINCT ON (user_id) user_id, id
    FROM wa_sessions
    ORDER BY user_id, created_at DESC
)
UPDATE campaigns c
SET session_id = ls.id
FROM latest_sessions ls
WHERE c.session_id IS NULL
  AND c.user_id = ls.user_id;
""",
)


async def ensure_wallet_schema(async_engine: AsyncEngine) -> None:
    async with async_engine.begin() as conn:
        await _ensure_wallet_async(conn)
        await _ensure_users_async(conn)
        await _ensure_sessions_async(conn)
        await _ensure_campaigns_async(conn)


def ensure_wallet_schema_sync(sync_engine: Engine) -> None:
    with sync_engine.begin() as conn:
        _ensure_wallet_sync(conn)
        _ensure_users_sync(conn)
        _ensure_sessions_sync(conn)
        _ensure_campaigns_sync(conn)


async def _ensure_wallet_async(conn) -> None:
    if not await _table_exists_async(conn, "wallet_transactions"):
        return
    for statement in _WALLET_ALTERS:
        await conn.execute(text(statement))
    for statement in _WALLET_ENUM_ALTERS:
        await conn.execute(text(statement))


def _ensure_wallet_sync(conn) -> None:
    if not _table_exists_sync(conn, "wallet_transactions"):
        return
    for statement in _WALLET_ALTERS:
        conn.execute(text(statement))
    for statement in _WALLET_ENUM_ALTERS:
        conn.execute(text(statement))


async def _ensure_users_async(conn) -> None:
    if not await _table_exists_async(conn, "users"):
        return
    for statement in _USER_ALTERS:
        await conn.execute(text(statement))


def _ensure_users_sync(conn) -> None:
    if not _table_exists_sync(conn, "users"):
        return
    for statement in _USER_ALTERS:
        conn.execute(text(statement))


async def _ensure_sessions_async(conn) -> None:
    if not await _table_exists_async(conn, "wa_sessions"):
        return
    for statement in _SESSION_ALTERS:
        await conn.execute(text(statement))
    for statement in _SESSION_INDEXES:
        await conn.execute(text(statement))


def _ensure_sessions_sync(conn) -> None:
    if not _table_exists_sync(conn, "wa_sessions"):
        return
    for statement in _SESSION_ALTERS:
        conn.execute(text(statement))
    for statement in _SESSION_INDEXES:
        conn.execute(text(statement))


async def _ensure_campaigns_async(conn) -> None:
    if not await _table_exists_async(conn, "campaigns"):
        return
    sessions_exist = await _table_exists_async(conn, "wa_sessions")
    for statement in _CAMPAIGN_ALTERS:
        await conn.execute(text(statement))
    if not sessions_exist:
        return
    for statement in _CAMPAIGN_FK:
        await conn.execute(text(statement))
    for statement in _CAMPAIGN_INDEXES:
        await conn.execute(text(statement))
    for statement in _CAMPAIGN_BACKFILL:
        await conn.execute(text(statement))


def _ensure_campaigns_sync(conn) -> None:
    if not _table_exists_sync(conn, "campaigns"):
        return
    sessions_exist = _table_exists_sync(conn, "wa_sessions")
    for statement in _CAMPAIGN_ALTERS:
        conn.execute(text(statement))
    if not sessions_exist:
        return
    for statement in _CAMPAIGN_FK:
        conn.execute(text(statement))
    for statement in _CAMPAIGN_INDEXES:
        conn.execute(text(statement))
    for statement in _CAMPAIGN_BACKFILL:
        conn.execute(text(statement))


async def _table_exists_async(conn, table_name: str) -> bool:
    result = await conn.execute(text(f"SELECT to_regclass('{table_name}')"))
    return result.scalar() is not None


def _table_exists_sync(conn, table_name: str) -> bool:
    result = conn.execute(text(f"SELECT to_regclass('{table_name}')"))
    return result.scalar() is not None
