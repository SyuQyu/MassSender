from __future__ import annotations

import io
import uuid
from urllib.parse import urlparse

from minio import Minio
from minio.error import S3Error

from app.core.config import get_settings


def _get_minio_client() -> Minio:
    settings = get_settings()
    parsed = urlparse(settings.minio_endpoint)
    secure = parsed.scheme == "https"
    return Minio(
        parsed.netloc,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=secure,
    )


def _ensure_bucket(client: Minio, bucket: str) -> None:
    found = client.bucket_exists(bucket)
    if not found:
        client.make_bucket(bucket)


def upload_bytes(data: bytes, filename: str, content_type: str | None = None) -> str:
    settings = get_settings()
    client = _get_minio_client()
    _ensure_bucket(client, settings.minio_bucket)

    object_name = f"uploads/{uuid.uuid4()}/{filename}"
    length = len(data)
    stream = io.BytesIO(data)
    stream.seek(0)
    client.put_object(settings.minio_bucket, object_name, stream, length=length, content_type=content_type)
    return f"{settings.minio_endpoint}/{settings.minio_bucket}/{object_name}"
