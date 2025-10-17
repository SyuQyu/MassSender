from redis import Redis
from rq import Queue, Worker

from app.core.config import get_settings


def main() -> None:
    settings = get_settings()
    redis = Redis.from_url(settings.redis_url)

    queues = [Queue(name, connection=redis) for name in ("campaigns", "automation")]

    worker = Worker(queues)
    worker.work(with_scheduler=True)


if __name__ == "__main__":
    main()
