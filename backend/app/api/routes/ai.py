from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_current_active_user, get_db, get_points_admin
from app.models import User
from app.schemas.ai import (
    AISubscriptionGrantRequest,
    AISubscriptionStatus,
    AISuggestionRequest,
    AISuggestionResponse,
)
from app.services.ai import AIServiceUnavailable, generate_completion
from app.services.ai_subscription import ensure_ai_access, get_ai_status, grant_ai_plan


router = APIRouter()


async def _ensure_points_available(db: AsyncSession, user: User) -> None:
    await db.refresh(user, attribute_names=["points_balance"])
    if user.points_balance <= 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient points balance. Top up before using AI assistance.",
        )


@router.post("/suggest", response_model=AISuggestionResponse)
async def ai_suggest(
    payload: AISuggestionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> AISuggestionResponse:
    await ensure_ai_access(db, current_user)
    await _ensure_points_available(db, current_user)
    try:
        context_str = None
        if payload.context is not None:
            try:
                import json

                context_str = json.dumps(payload.context, ensure_ascii=False)
            except Exception:  # noqa: BLE001
                context_str = str(payload.context)

        suggestion = await generate_completion(
            prompt=payload.prompt,
            context=context_str,
            temperature=payload.temperature or 0.7,
        )
    except AIServiceUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is not configured. Contact support.",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc) or "Failed to generate AI suggestion",
        ) from exc

    return AISuggestionResponse(text=suggestion)


@router.get("/status", response_model=AISubscriptionStatus)
async def ai_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> AISubscriptionStatus:
    status_data = await get_ai_status(db, current_user)
    return AISubscriptionStatus(**status_data)


@router.post("/subscription/grant", response_model=AISubscriptionStatus)
async def grant_subscription(
    payload: AISubscriptionGrantRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(get_points_admin),
) -> AISubscriptionStatus:
    result = await db.execute(select(User).where(User.email == payload.user_email.lower()))
    target = result.scalar_one_or_none()
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found")
    status_data = await grant_ai_plan(db, target, payload.plan)
    return AISubscriptionStatus(**status_data)
