from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, EmailStr


class AISuggestionRequest(BaseModel):
    topic: Literal["campaign_message", "automation_response"]
    prompt: str = Field(..., max_length=2000)
    context: dict | None = None
    temperature: float | None = Field(default=0.7, ge=0.0, le=1.0)


class AISuggestionResponse(BaseModel):
    text: str
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class AISubscriptionStatus(BaseModel):
    active: bool
    expires_at: datetime | None
    plan_name: str | None
    trial_available: bool


class AISubscriptionGrantRequest(BaseModel):
    user_email: EmailStr
    plan: Literal["5d", "15d", "30d"]
