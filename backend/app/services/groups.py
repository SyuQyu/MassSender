from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ContactSource, User, WhatsAppSession
from app.schemas.contacts import ContactListCreate, ContactListRead, GroupImportRequest
from app.services import session as session_service
from app.services.contacts import create_contact_list


async def import_group_contacts(
    db: AsyncSession, user: User, session: WhatsAppSession, payload: GroupImportRequest
) -> ContactListRead:
    if session.status != session.status.LINKED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session not linked")

    members = await session_service.fetch_group_members(session, payload.group_name)
    contact_list = await create_contact_list(
        db,
        user,
        ContactListCreate(name=payload.group_name, source=ContactSource.GROUP, metadata={"group_name": payload.group_name}),
        members,
    )
    return ContactListRead.model_validate(contact_list)
