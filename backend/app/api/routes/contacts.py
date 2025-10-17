from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_active_user, get_db
from app.models import ContactSource, SessionStatus, User
from app.schemas.contacts import ContactListCreate, ContactListRead, ContactRead, GroupImportRequest
from app.services import contacts as contacts_service
from app.services import groups as groups_service
from app.services import session as session_service


router = APIRouter()


@router.get("/lists", response_model=list[ContactListRead])
async def list_lists(
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_active_user)
) -> list[ContactListRead]:
    lists = await contacts_service.list_contact_lists(db, current_user)
    return [ContactListRead.model_validate(item) for item in lists]


@router.get("/lists/{list_id}", response_model=list[ContactRead])
async def read_list_contacts(
    list_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> list[ContactRead]:
    contact_list = await contacts_service.get_contact_list(db, current_user, list_id)
    contacts = await contacts_service.list_contacts(db, contact_list)
    return [ContactRead.model_validate(contact) for contact in contacts]


@router.post("/upload", response_model=ContactListRead)
async def upload_contacts(
    file: UploadFile = File(...),
    name: str = Form(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> ContactListRead:
    file_bytes = await file.read()
    records = contacts_service.parse_contacts_file(file_bytes, file.filename or "")
    contact_list = await contacts_service.create_contact_list(
        db,
        current_user,
        ContactListCreate(name=name, source=ContactSource.UPLOAD, metadata={"filename": file.filename}),
        records,
    )
    return ContactListRead.model_validate(contact_list)


@router.post("/group", response_model=ContactListRead)
async def import_group(
    payload: GroupImportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> ContactListRead:
    wa_session = await session_service.get_or_create_session(db, current_user)
    if wa_session.status != SessionStatus.LINKED:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Session not linked")
    contact_list = await groups_service.import_group_contacts(db, current_user, wa_session, payload)
    return contact_list
