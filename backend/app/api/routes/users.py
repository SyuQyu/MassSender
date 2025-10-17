from fastapi import APIRouter, Depends

from app.api.deps import get_current_active_user
from app.models import User
from app.schemas.user import UserRead


router = APIRouter()


@router.get("/me", response_model=UserRead)
async def read_me(current_user: User = Depends(get_current_active_user)) -> UserRead:
    return UserRead.model_validate(current_user)
