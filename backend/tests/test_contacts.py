from app.services.contacts import parse_contacts_file


def test_parse_contacts_valid_csv() -> None:
    csv_content = "name,phone_e164,consent\nAyu,+6281234567890,yes\nBimo,081234567891,true\n".encode()
    records = parse_contacts_file(csv_content, "contacts.csv")

    assert len(records) == 2
    assert records[0]["phone_e164"] == "+6281234567890"
    assert records[1]["phone_e164"].startswith("+")
