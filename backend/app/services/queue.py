from functools import lru_cache

from redis import Redis
from rq import Queue

from app.core.config import get_settings


@lru_cache(maxsize=1)
def _get_redis() -> Redis:
    settings = get_settings()
    return Redis.from_url(settings.redis_url)


def get_queue(name: str) -> Queue:
    return Queue(name, connection=_get_redis())


def get_redis_connection() -> Redis:
    return _get_redis()
