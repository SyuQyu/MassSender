from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    verify_password,
)
from app.models import User, WalletTransaction, WalletTxnType
from app.schemas.user import LoginRequest, UserCreate


async def create_user(db: AsyncSession, data: UserCreate) -> User:
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    settings = get_settings()
    now = datetime.now(timezone.utc)

    user = User(
        email=data.email,
        hashed_password=get_password_hash(data.password),
        full_name=data.full_name,
        timezone=data.timezone,
        consent_acceptance_at=now if data.consent else None,
    )

    db.add(user)
    await db.flush()

    await create_wallet_transaction(
        db,
        user,
        WalletTxnType.ALLOCATION,
        settings.default_signup_points,
        "signup_allocation",
        expires_at=now + timedelta(days=15),
    )

    await db.commit()
    await db.refresh(user)
    return user


async def authenticate_user(db: AsyncSession, payload: LoginRequest) -> User:
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if user is None or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User inactive")
    return user


async def create_wallet_transaction(
    db: AsyncSession,
    user: User,
    txn_type: WalletTxnType,
    points: int,
    reference: str | None = None,
    *,
    expires_at: datetime | None = None,
) -> WalletTransaction:
    user.points_balance += points
    txn = WalletTransaction(
        user_id=user.id,
        txn_type=txn_type,
        points=points,
        balance_after=user.points_balance,
        reference=reference,
        expires_at=expires_at,
        expire_processed=expires_at is None,
    )
    db.add(txn)
    await db.flush()
    return txn


def issue_tokens(user_id: UUID | str) -> tuple[str, str]:
    user_id_str = str(user_id)
    return create_access_token(user_id_str), create_refresh_token(user_id_str)
