from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, ConfigDict


class UserBase(BaseModel):
    email: EmailStr
    full_name: str | None = None
    timezone: str = Field(default="UTC")


class UserCreate(UserBase):
    password: str = Field(min_length=8)
    consent: bool


class UserRead(UserBase):
    id: UUID
    is_active: bool
    points_balance: int
    plan_expires_at: datetime | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefreshRequest(BaseModel):
    refresh_token: str


class AuthResponse(BaseModel):
    tokens: TokenPair
    user: UserRead
