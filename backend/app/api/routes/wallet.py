from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db
from app.models import User
from app.schemas.wallet import WalletCoinPurchase, WalletSummary, WalletTopupRequest, WalletTransactionRead
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
    current_user: User = Depends(get_current_active_user),
) -> WalletSummary:
    return await wallet_service.wallet_topup(db, current_user, payload)


@router.post("/coins", response_model=WalletSummary)
async def purchase_coins(
    payload: WalletCoinPurchase,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> WalletSummary:
    return await wallet_service.purchase_coins(db, current_user, payload.points)


@router.get("/txns", response_model=list[WalletTransactionRead])
async def wallet_transactions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> list[WalletTransactionRead]:
    txns = await wallet_service.list_wallet_transactions(db, current_user)
    return [WalletTransactionRead.model_validate(txn) for txn in txns]
