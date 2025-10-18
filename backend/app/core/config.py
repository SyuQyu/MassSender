from functools import lru_cache
from typing import List

from pydantic import AnyHttpUrl, Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    env: str = Field(default="development", alias="ENV")
    api_origin: AnyHttpUrl | None = Field(default=None, alias="API_ORIGIN")
    frontend_origin: AnyHttpUrl | None = Field(default=None, alias="FRONTEND_ORIGIN")

    database_url: str = Field(alias="DATABASE_URL")
    sync_database_url: str = Field(alias="SYNC_DATABASE_URL")
    redis_url: str = Field(alias="REDIS_URL")

    minio_endpoint: AnyHttpUrl = Field(alias="MINIO_ENDPOINT")
    minio_access_key: str = Field(alias="MINIO_ACCESS_KEY")
    minio_secret_key: str = Field(alias="MINIO_SECRET_KEY")
    minio_bucket: str = Field(alias="MINIO_BUCKET")

    jwt_secret: str = Field(alias="JWT_SECRET")
    jwt_alg: str = Field(default="HS256", alias="JWT_ALG")
    access_token_expire_minutes: int = Field(default=60, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    refresh_token_expire_minutes: int = Field(default=60 * 24 * 30, alias="REFRESH_TOKEN_EXPIRE_MINUTES")
    password_salt_rounds: int = Field(default=12, alias="PASSWORD_SALT_ROUNDS")

    session_key: str = Field(alias="SESSION_KEY")
    default_tz: str = Field(default="UTC", alias="DEFAULT_TZ")

    max_campaign_recipients: int = Field(default=10_000, alias="MAX_CAMPAIGN_RECIPIENTS")
    max_daily_recipients: int = Field(default=30_000, alias="MAX_DAILY_RECIPIENTS")
    points_per_recipient: int = Field(default=2, alias="POINTS_PER_RECIPIENT")
    max_user_sessions: int = Field(default=5, alias="MAX_WHATSAPP_SESSIONS")
    max_active_campaigns: int = Field(default=5, alias="MAX_ACTIVE_CAMPAIGNS")

    campaign_failure_backoff: str = Field(default="30,60,120", alias="CAMPAIGN_FAILURE_BACKOFF")
    auto_response_cooldown_seconds: int = Field(default=3600, alias="AUTO_RESPONSE_COOLDOWN_SECONDS")

    official_mode: bool = Field(default=False, alias="OFFICIAL_MODE")
    playwright_headless: bool = Field(default=True, alias="PLAYWRIGHT_HEADLESS")
    whatsapp_api_base_url: AnyHttpUrl = Field(
        default="https://graph.facebook.com/v19.0",
        alias="WHATSAPP_API_BASE_URL",
    )
    whatsapp_api_token: str | None = Field(default=None, alias="WHATSAPP_API_TOKEN")
    whatsapp_phone_number_id: str | None = Field(default=None, alias="WHATSAPP_PHONE_NUMBER_ID")
    whatsapp_worker_url: AnyHttpUrl = Field(default="http://localhost:5005", alias="WHATSAPP_WORKER_URL")
    support_whatsapp_number: str = Field(default="6282137138687", alias="SUPPORT_WHATSAPP_NUMBER")
    default_signup_points: int = Field(default=0, alias="DEFAULT_SIGNUP_POINTS")
    points_admin_emails_raw: str | list[str] | None = Field(default=None, alias="POINTS_ADMIN_EMAILS")
    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    openai_model: str = Field(default="gpt-4o-mini", alias="OPENAI_MODEL")
    openai_system_prompt: str = Field(
        default="You write concise, friendly WhatsApp messages in Indonesian unless instructed otherwise.",
        alias="OPENAI_SYSTEM_PROMPT",
    )
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    gemini_model: str = Field(default="models/gemini-2.5-flash-lite", alias="GEMINI_MODEL")

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @computed_field  # type: ignore[misc]
    @property
    def campaign_failure_backoff_schedule(self) -> List[int]:
        return [int(value.strip()) for value in self.campaign_failure_backoff.split(",") if value.strip()]

    @computed_field  # type: ignore[misc]
    @property
    def points_admin_emails(self) -> list[str]:
        value = self.points_admin_emails_raw
        if value is None or value == "":
            return []
        if isinstance(value, list):
            return [item.strip() for item in value if item and item.strip()]
        return [item.strip() for item in str(value).split(",") if item and item.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
