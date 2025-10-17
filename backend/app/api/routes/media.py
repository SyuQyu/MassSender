from fastapi import APIRouter, Depends, File, UploadFile

from app.api.deps import get_current_active_user
from app.models import User
from app.services.storage import upload_bytes


router = APIRouter()


@router.post("/upload")
async def upload_media(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
) -> dict[str, str]:
    data = await file.read()
    url = upload_bytes(data, file.filename or "file", file.content_type)
    return {"url": url}
