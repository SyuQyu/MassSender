import asyncio

from app import models  # noqa: F401
from app.db.session import Base, engine


async def init_models() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


def init_db() -> None:
    asyncio.run(init_models())


if __name__ == "__main__":
    init_db()
