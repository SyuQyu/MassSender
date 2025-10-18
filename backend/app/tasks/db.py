from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.db.schema import ensure_wallet_schema_sync


settings = get_settings()

engine = create_engine(settings.sync_database_url, future=True)
ensure_wallet_schema_sync(engine)
SessionLocal = sessionmaker(engine, class_=Session, expire_on_commit=False)
