from __future__ import annotations

import io
from collections import OrderedDict
from typing import Iterable

import pandas as pd
import phonenumbers
from fastapi import HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Contact, ContactList, ContactSource, User
from app.schemas.contacts import ContactListCreate


REQUIRED_HEADERS = {"name", "phone_e164", "consent"}


def parse_contacts_file(file_bytes: bytes, filename: str) -> list[dict]:
    if filename.lower().endswith(".csv"):
        df = pd.read_csv(io.BytesIO(file_bytes))
    elif filename.lower().endswith((".xlsx", ".xls")):
        df = pd.read_excel(io.BytesIO(file_bytes))
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported file type")

    missing = REQUIRED_HEADERS - set(df.columns.str.lower())
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Missing required headers: {', '.join(sorted(missing))}",
        )

    df.columns = [col.lower() for col in df.columns]
    df = df.dropna(subset=["phone_e164"])

    records: list[dict] = []
    seen_numbers: set[str] = set()

    for _, row in df.iterrows():
        raw_number = str(row["phone_e164"]).strip()
        if not raw_number.startswith("+"):
            raw_number = "+" + raw_number
        try:
            parsed = phonenumbers.parse(raw_number, None)
            if not phonenumbers.is_valid_number(parsed):
                raise ValueError
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid phone number: {raw_number}",
            ) from exc

        e164 = phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
        consent_value = row.get("consent")
        consent = bool(consent_value) and str(consent_value).strip().lower() in {"true", "1", "yes", "y"}
        if not consent:
            continue

        if e164 in seen_numbers:
            continue
        seen_numbers.add(e164)

        name = str(row.get("name") or "").strip() or None
        metadata = row.to_dict()
        records.append({"name": name, "phone_e164": e164, "consent": consent, "metadata": metadata})

    if not records:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid contacts found")
    return records


async def create_contact_list(
    db: AsyncSession, user: User, data: ContactListCreate, contacts: Iterable[dict]
) -> ContactList:
    contact_list = ContactList(
        user_id=user.id,
        name=data.name,
        source=data.source,
        meta=data.metadata or {},
    )
    db.add(contact_list)
    await db.flush()

    to_create = []
    for row in contacts:
        to_create.append(
            Contact(
                list_id=contact_list.id,
                name=row.get("name"),
                phone_e164=row["phone_e164"],
                consent=row.get("consent", True),
                meta=row.get("metadata") or {},
            )
        )
    db.add_all(to_create)
    contact_list.total_contacts = len(to_create)

    await db.commit()
    await db.refresh(contact_list)
    return contact_list


async def list_contact_lists(db: AsyncSession, user: User) -> list[ContactList]:
    result = await db.execute(
        select(ContactList).where(ContactList.user_id == user.id).order_by(ContactList.created_at.desc())
    )
    return list(result.scalars().all())


async def get_contact_list(db: AsyncSession, user: User, list_id) -> ContactList:
    result = await db.execute(select(ContactList).where(ContactList.id == list_id, ContactList.user_id == user.id))
    contact_list = result.scalar_one_or_none()
    if contact_list is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Contact list not found")
    return contact_list


async def list_contacts(db: AsyncSession, contact_list: ContactList) -> list[Contact]:
    result = await db.execute(select(Contact).where(Contact.list_id == contact_list.id))
    return list(result.scalars().all())
