from fastapi import APIRouter
from redis import Redis
from sqlalchemy import text

from app.db.session import async_session
from app.services.queue import get_redis_connection

router = APIRouter()


@router.get("/healthz", tags=["health"])
async def healthz() -> dict[str, str]:
    db_status = "ok"
    redis_status = "ok"

    try:
        async with async_session() as session:
            await session.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        db_status = "error"

    try:
        redis: Redis = get_redis_connection()
        redis.ping()
    except Exception:  # noqa: BLE001
        redis_status = "error"

    status = "ok" if db_status == redis_status == "ok" else "degraded"
    return {"status": status, "database": db_status, "redis": redis_status}


@router.get("/readiness", tags=["health"])
async def readiness() -> dict[str, str]:
    return {"status": "ready"}
