from datetime import datetime, time
from typing import Any, Literal, Sequence
from uuid import UUID

from pydantic import BaseModel, Field, validator


class Message(BaseModel):
    message: str


class TimeWindow(BaseModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: str
    end_time: str

    @validator("start_time", "end_time")
    def validate_time_format(cls, value: str) -> str:  # noqa: D417
        time.fromisoformat(value)
        return value


class Pagination(BaseModel):
    total: int
    items: Sequence[Any]


class IDResponse(BaseModel):
    id: UUID

