from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db, get_points_admin
from app.models import User
from app.schemas.user import UserRead, UserSearchResult


router = APIRouter()


@router.get("/me", response_model=UserRead)
async def read_me(current_user: User = Depends(get_current_active_user)) -> UserRead:
    return UserRead.model_validate(current_user)


@router.get("/search", response_model=list[UserSearchResult])
async def search_users(
    q: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_points_admin),
) -> list[UserSearchResult]:
    query = q.strip()
    if len(query) < 2:
        return []

    pattern = f"%{query}%"
    stmt = (
        select(User)
        .where(
            User.is_active.is_(True),
            or_(User.email.ilike(pattern), User.full_name.ilike(pattern)),
        )
        .order_by(User.email.asc())
        .limit(20)
    )
    result = await db.execute(stmt)
    users = result.scalars().all()
    return [UserSearchResult.model_validate(user) for user in users]
