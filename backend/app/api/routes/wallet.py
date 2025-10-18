from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db, get_points_admin
from app.models import User
from app.schemas.wallet import (
    WalletCoinPurchase,
    WalletGrantRequest,
    WalletGrantResult,
    WalletSummary,
    WalletTopupRequest,
    WalletTransactionRead,
)
from app.services import wallet as wallet_service


router = APIRouter()


@router.get("/", response_model=WalletSummary)
async def wallet_summary(
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)
) -> WalletSummary:
    await db.refresh(current_user)
    return await wallet_service.get_wallet_summary(db, current_user)


@router.post("/topup", response_model=WalletSummary)
async def wallet_topup(
    payload: WalletTopupRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_points_admin),
) -> WalletSummary:
    return await wallet_service.wallet_topup(db, current_user, payload)


@router.post("/coins", response_model=WalletSummary)
async def purchase_coins(
    payload: WalletCoinPurchase,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_points_admin),
) -> WalletSummary:
    return await wallet_service.purchase_coins(db, current_user, payload.points)


@router.post("/grant", response_model=WalletGrantResult)
async def grant_points(
    payload: WalletGrantRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_points_admin),
) -> WalletGrantResult:
    return await wallet_service.grant_points(db, current_user, payload)


@router.get("/txns", response_model=list[WalletTransactionRead])
async def wallet_transactions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> list[WalletTransactionRead]:
    txns = await wallet_service.list_wallet_transactions(db, current_user)
    serialized: list[WalletTransactionRead] = []
    for txn in txns:
        serialized.append(
            WalletTransactionRead(
                id=txn.id,
                txn_type=txn.txn_type,
                points=txn.points,
                balance_after=txn.balance_after,
                reference=txn.reference,
                expires_at=txn.expires_at,
                created_at=txn.created_at,
            )
        )
    return serialized
