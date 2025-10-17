# MassSender Prototype

WhatsApp Bulk Sender v2 academic prototype implementing the scope described in `prd.md`. Consists of a FastAPI backend with Redis/RQ worker and a Next.js dashboard frontend.

## Features

- Link WhatsApp Web sessions via QR with mock linking helper for demos.
- Contacts from Excel/CSV and experimental group import.
- Campaign creator with media support, throttling, pause/resume/cancel, CSV export, and real-time websocket progress board.
- Points wallet with subscription plans (15/30 day) and per-recipient deductions.
- Automation rules (keyword/contains/regex), active-hour schedule editor, and inbound webhook simulator.
- Safety caps (200 recipients/campaign, 500 per day) and automatic pause after repeated failures.

## Getting Started

### Prerequisites

- Python 3.11+
- Node 20+
- Redis, PostgreSQL, and MinIO (or run with the provided `docker-compose.yml`).

### Backend

```bash
cd backend
python3 -m pip install -r requirements.txt
python3 -m app.db.init_db  # create tables (ensure DATABASE_URL env)
uvicorn app.main:app --reload
```

Environment variables are defined in `.env.example`. Key values:

- `DATABASE_URL` / `SYNC_DATABASE_URL`
- `REDIS_URL`
- `MINIO_*`
- `JWT_SECRET`
- Safety knobs: `POINTS_PER_RECIPIENT`, `MAX_CAMPAIGN_RECIPIENTS`, `MAX_DAILY_RECIPIENTS`
- WhatsApp Web worker (default): set `WHATSAPP_WORKER_URL` (default `http://localhost:5005`).
- Optional WhatsApp Cloud API mode: set `OFFICIAL_MODE=true` and provide `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_API_TOKEN`, and optionally override `WHATSAPP_API_BASE_URL`.

Run the Python queue worker in a separate terminal:

```bash
cd backend
python3 -m app.worker
```

### WhatsApp Web worker

The automation layer uses [`whatsapp-web.js`](https://wwebjs.dev/) to keep a WhatsApp Web session alive, stream QR codes, read group members, and send messages. Start it with:

```bash
cd worker
npm install
npm run start
```

On first boot, visit `/link` in the frontend and scan the QR to link your phone. Session credentials are persisted under `.wwebjs_auth/`.

Environment knobs:

- `WWEBJS_HEADLESS` (default `true`) — set to `false` for debugging.
- `CHROMIUM_PATH` (default `/usr/bin/chromium-browser`) — path to the Chromium binary inside the container/host.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_URL=http://localhost:8000/api` in a `.env.local` file if the backend runs elsewhere.

### Tests

A minimal pytest suite is started under `backend/tests`. Install dev extras (`pip install pytest pandas phonenumbers`) and run:

```bash
python3 -m pytest backend/tests
```

## Architecture Notes

- Redis-backed RQ queue dispatches campaign jobs. Worker enforces throttle jitter (2–5s), calls the WhatsApp Web worker by default (or WhatsApp Cloud API when `OFFICIAL_MODE=true`), retries with exponential backoff (30/60/120s), deducts points on success, and auto-pauses after three consecutive failures.
- WhatsApp Web worker exposes `/status`, `/send`, and `/group-members` endpoints which the backend consumes for QR polling, message sending, and group extraction.
- Websocket endpoint streams campaign progress; the frontend consumes it via `ProgressBoard`.
- Scheduler (APScheduler) clears expired subscription plans every 6 hours.
- Storage uploads use MinIO/S3 compatible endpoints (`/api/media/upload`).

## Safety Checklist

- Hard caps (& configurable): 200 recipients per campaign, 500 per day per session.
- Throttling jitter between 2–5s by default, enforced per campaign settings.
- Auto pause after sustained failures, manual resume once issues are fixed.
- Auto-responses disabled when subscription expired or outside defined active hours.
- UI reminders and consent checkbox on registration.

## Development Utilities

- `POST /api/dev/reset` wipes data (blocked in production env).
- Mock linking endpoint `/api/wa/session/mock-link` for demos with no real WhatsApp session.
- WhatsApp Web worker runs on `WHATSAPP_WORKER_URL` (default `http://localhost:5005`). Flip `OFFICIAL_MODE=true` with `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_API_TOKEN` to use the Cloud API instead.

Refer to `prd.md` for full product requirements.
