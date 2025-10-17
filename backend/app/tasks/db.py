from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings


settings = get_settings()

engine = create_engine(settings.sync_database_url, future=True)
SessionLocal = sessionmaker(engine, class_=Session, expire_on_commit=False)

