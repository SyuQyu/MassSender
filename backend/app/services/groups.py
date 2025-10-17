from __future__ import annotations

import httpx
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import ContactSource, User, WhatsAppSession
from app.schemas.contacts import ContactListCreate, ContactListRead, GroupImportRequest
from app.services.contacts import create_contact_list


async def fetch_group_members(session: WhatsAppSession, group_name: str) -> list[dict]:
    settings = get_settings()
    url = settings.whatsapp_worker_url.rstrip("/") + "/group-members"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json={"groupName": group_name})
    except httpx.RequestError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Worker unavailable") from exc

    if response.status_code == 404:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Group not found")
    if response.status_code >= 400:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=response.text)

    return response.json().get("members", [])


async def import_group_contacts(
    db: AsyncSession, user: User, session: WhatsAppSession, payload: GroupImportRequest
) -> ContactListRead:
    if session.status != session.status.LINKED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session not linked")

    members = await fetch_group_members(session, payload.group_name)
    contact_list = await create_contact_list(
        db,
        user,
        ContactListCreate(name=payload.group_name, source=ContactSource.GROUP, metadata={"group_name": payload.group_name}),
        members,
    )
    return ContactListRead.model_validate(contact_list)
