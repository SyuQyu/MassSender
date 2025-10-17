from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.core.security import decode_token
from app.schemas.user import AuthResponse, LoginRequest, TokenPair, TokenRefreshRequest, UserCreate, UserRead
from app.services.auth import authenticate_user, create_user, issue_tokens


router = APIRouter()


@router.post("/register", response_model=AuthResponse)
async def register_user(payload: UserCreate, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    user = await create_user(db, payload)
    access, refresh = issue_tokens(user.id)
    return AuthResponse(tokens=TokenPair(access_token=access, refresh_token=refresh), user=UserRead.model_validate(user))


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)) -> AuthResponse:
    user = await authenticate_user(db, payload)
    access, refresh = issue_tokens(user.id)
    return AuthResponse(tokens=TokenPair(access_token=access, refresh_token=refresh), user=UserRead.model_validate(user))


@router.post("/refresh", response_model=TokenPair)
async def refresh(payload: TokenRefreshRequest) -> TokenPair:
    try:
        decoded = decode_token(payload.refresh_token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token") from exc
    if decoded.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
    subject = decoded.get("sub")
    if subject is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")
    access, refresh_token = issue_tokens(subject)
    return TokenPair(access_token=access, refresh_token=refresh_token)
