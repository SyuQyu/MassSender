# WhatsApp Bulk Sender v2 — Product Requirements Document (PRD)

> **Academic prototype only.** WhatsApp’s ToS forbids spam and unofficial automation. This PRD is strictly for coursework and controlled demos. Use **opt‑in** contacts only, add strict send caps, and prefer the **official WhatsApp Business Platform (Cloud API)** for any real deployment.

---

## 1) Summary

A web app where a third‑party user can link their WhatsApp by scanning a QR on the site and then:

- Send **bulk messages** using an **Excel/CSV** list of phone numbers
- **Read group members** (from WhatsApp Web) and send one‑by‑one
- Configure **auto‑responses** (webhook‑style behavior)
- Define **active hours** (schedule when the bot is on/off)
- Use a **points/subscription** system (e.g., recharge every 15 or 30 days; 2 points per message/recipient)
- Send **media** (images/files)

**Frontend:** Next.js (App Router). **Backend:** Python (FastAPI) + Redis + PostgreSQL; Playwright worker for WhatsApp Web automation.

---

## 2) Goals & Non‑Goals

### Goals

- QR link flow (WhatsApp Web‑style) and session persistence.
- Bulk send from Excel/CSV and from group member extraction.
- Auto‑response rules (keyword → reply), exposed via webhook‑like events.
- Active hour schedules (timezone aware) to enable/disable bot.
- Points/subscription billing: recharge cycles (15/30 days), per‑send deduction (2 points/recipient), low‑balance guardrails.
- Media (image/file) sending.
- Real‑time campaign progress and exports.

### Non‑Goals

- No unrestricted mass messaging; apply strict caps (e.g., 200 msgs/campaign, 500/day/session for demo).
- No advanced NLP/AI bot logic beyond optional copy helper (future).
- No full CRM; only basic lists, campaigns, and logs.

---

## 3) Users & Use Cases

- **Student/demo user**: proves bulk sending & automation in a safe, controlled way.
- **Use cases**

  1. Link phone → upload Excel of classmates → send media + personalized text.
  2. Pull members of a specific WhatsApp group → send reminders one by one.
  3. Set auto‑reply for “schedule?” with a canned message, but **only during active hours**.
  4. Top up points monthly; each send consumes points; pause if balance low.

---

## 4) Compliance, Ethics, and Safety

- Opt‑in contacts only; explicit **consent check** in UI.
- Hard caps, throttling (2–5s jitter), daily & campaign limits.
- Clear ToS modal and warning labels.
- Avoid storing messages longer than 14 days by default.
- “Official Mode” (WhatsApp Cloud API) behind a feature flag for compliant production paths.

> **Risk note:** Group member scraping and WhatsApp Web automation are fragile and may violate ToS. Keep it demo‑only with tiny cohorts.

---

## 5) High‑Level Architecture

- **Next.js** frontend: auth, QR link page, contacts upload, campaigns, automation rules, billing/points, schedules.
- **FastAPI** backend: REST + WebSocket; business logic.
- **Redis** queue + **worker** (Celery/RQ) for throttled sending.
- **Playwright** automation service for WhatsApp Web (QR, send, read statuses, group member list).
- **PostgreSQL** for persistence; **MinIO/S3** for media & exports.
- Optional: “Official Mode” using WhatsApp Cloud API (webhooks for inbound events).

```mermaid
flowchart LR
  FE[Next.js Frontend] -- REST/WS --> API[FastAPI]
  API -- enqueue --> Q[(Redis)]
  Q --> W[WA Web Worker (Playwright)]
  W -- status/inbound --> API
  API -- ORM --> DB[(PostgreSQL)]
  API -- files --> S3[(MinIO/S3)]
  API <--webhooks--> WA[(WhatsApp Cloud API) Optional]
```

---

## 6) Key Features & Requirements

### 6.1 Session Linking (QR)

- **FR‑QR‑1**: Create WA session, stream **QR PNG** to FE, refresh until linked.
- **FR‑QR‑2**: Persist encrypted session; auto‑reconnect; expire after 7 days idle.
- **FR‑QR‑3**: Show link status (waiting/linked/expired).

### 6.2 Contacts & Groups

- **FR‑C‑1**: Upload Excel (`.xlsx`) or CSV with headers: `name, phone_e164, consent`.
- **FR‑C‑2**: Validate E.164 via `phonenumbers`; dedupe; reject non‑consented.
- **FR‑C‑3**: **Group import (experimental)**: given a group name/link, read members (display name + number if available) from WA Web and build a list. If phone numbers are not visible, allow message via chat context only.

### 6.3 Campaigns & Sending

- **FR‑S‑1**: Create campaign: choose list (Excel or group), set template (variables `{{name}}`), attach media (image/file), choose throttle.
- **FR‑S‑2**: **Points deduction**: 2 points per recipient; validate balance before enqueue; hold if insufficient.
- **FR‑S‑3**: Throttled per‑recipient jobs (2–5s jitter); exponential backoff on transient errors.
- **FR‑S‑4**: Real‑time progress via WebSocket; statuses: `queued/sending/sent/failed/read` (best‑effort on “read” in WA Web mode).
- **FR‑S‑5**: Pause/resume/cancel; export CSV of results.

### 6.4 Auto‑Responses (Webhook‑like)

- **FR‑AR‑1**: Rule builder: trigger type (keyword match / contains / regex), active hours, response text/media.
- **FR‑AR‑2**: In WA Web mode, emulate webhooks by **polling** or listening to DOM events for incoming messages; in Cloud API mode, use real webhooks.
- **FR‑AR‑3**: Per‑rule rate‑limits; avoid loops (don’t respond to own messages; min cooldown per contact).

### 6.5 Active Hours / Scheduling

- **FR‑H‑1**: Define one or more **active windows** per day (timezone aware; default Asia/Jakarta). Outside the windows, sending and auto‑replies are paused.
- **FR‑H‑2**: Calendar UI, quick presets (Weekdays 09:00–18:00, etc.).
- **FR‑H‑3**: Manual override: “Pause all” / “Activate now”.

### 6.6 Points & Subscriptions

- **FR‑P‑1**: Plans: **15‑day** and **30‑day** subscriptions. Auto‑renew (optional). Points allocated at plan start; top‑ups allowed.
- **FR‑P‑2**: **2 points** per sent message/recipient; media counts same.
- **FR‑P‑3**: Low‑balance warnings; block campaign start when insufficient.
- **FR‑P‑4**: Billing history, invoices/receipts (demo PDFs).

### 6.7 Media Support

- **FR‑M‑1**: Send image (PNG/JPG), file (PDF/Doc) with **size cap** (e.g., 10MB).
- **FR‑M‑2**: Virus scan stub (optional) before upload; store in S3/MinIO.

---

## 7) Non‑Functional Requirements

- **Security**: AES‑GCM encrypt WA session blob; Argon2 for passwords; HTTPS.
- **Performance**: 50 msgs < 5 min at default throttle; UI responsive.
- **Reliability**: Reconnect WA Web; resume partial campaigns.
- **Observability**: Structured logs; metrics; Sentry‑style error capture.

---

## 8) Data Model (Relational)

- **users**(id, email, password_hash, tz, created_at)
- **wa_sessions**(id, user_id FK, mode ['qr','official'], status, session_blob_enc, last_seen_at)
- **contact_lists**(id, user_id, name, source['upload','group'], total, created_at)
- **contacts**(id, contact_list_id FK, name, phone_e164, consent_bool)
- **campaigns**(id, user_id, contact_list_id, name, template_text, media_url, rate_cfg_json, status, created_at)
- **messages**(id, campaign_id, contact_id, resolved_text, status, error_code, sent_at, read_at, cost_points)
- **auto_rules**(id, user_id, name, trigger_type, trigger_value, response_text, media_url, active_windows_json, enabled)
- **schedules**(id, user_id, tz, windows_json, paused_bool)
- **wallets**(id, user_id, points_balance, plan_type['15d','30d'], plan_started_at, plan_expires_at, auto_renew_bool)
- **wallet_txns**(id, wallet_id, type['allocation','topup','deduct'], points, ref_id, created_at)
- **audit_logs**(id, user_id, action, meta_json, created_at)

---

## 9) API Design (FastAPI)

**Auth**

- `POST /api/auth/register` {email,password}
- `POST /api/auth/login` → JWT

**WA Session**

- `POST /api/wa/session` → {id, mode}
- `GET /api/wa/session/{id}/qr` → PNG stream
- `GET /api/wa/session/{id}` → {status, last_seen_at}

**Contacts**

- `POST /api/contacts/upload` (xlsx/csv) → {list_id, total}
- `POST /api/contacts/group-import` {group_identifier} → {list_id, total}
- `GET /api/contacts/lists`

**Campaigns**

- `POST /api/campaigns` {contact_list_id, template_text, media_url?, rate_cfg}
- `POST /api/campaigns/{id}/start`
- `POST /api/campaigns/{id}/pause|resume|cancel`
- `GET /api/campaigns/{id}` (summary)
- `GET /api/campaigns/{id}/messages?cursor=` (paginated)
- `GET /api/campaigns/{id}/export` → CSV
- `WS /ws/campaigns/{id}` → progress events

**Auto‑Responses**

- `POST /api/auto-rules` {trigger_type, trigger_value, response_text, media_url?, active_windows}
- `GET /api/auto-rules`
- `PATCH /api/auto-rules/{id}` enable/disable

**Schedules**

- `GET/POST /api/schedules` → set global active windows
- `POST /api/schedules/override` {paused: bool}

**Wallet/Points**

- `GET /api/wallet` → balance, plan
- `POST /api/wallet/topup` {plan_type or points}
- `GET /api/wallet/txns`

**Admin/Dev**

- `POST /api/dev/reset`

**Errors**: 400 validation, 401 auth, 409 session busy, 422 insufficient points, 429 rate limit, 500 generic.

---

## 10) Frontend (Next.js) Scope

**Routes**

- `/login`, `/register`
- `/link` (QR panel)
- `/contacts/upload`, `/contacts/group`
- `/campaigns/new`, `/campaigns/:id`
- `/automation/rules`
- `/settings/schedule`
- `/billing/wallet`

**Key Components**

- `QRCodePanel` (auto‑refresh)
- `ExcelUploader` (xlsx/csv parse, preview, dedupe)
- `GroupPicker` (search group, preview members)
- `TemplateEditor` (variables with live preview)
- `ProgressBoard` (WS live)
- `RuleBuilder` (keyword/contains/regex, windows)
- `ScheduleEditor` (calendar/time ranges)
- `WalletCard` (balance, plan, auto‑renew)

**State & Utils**: React Query, Zod, dayjs (TZ), FilePond for uploads, shadcn/ui.

---

## 11) Backend (Python) Scope

- FastAPI app (routers: auth, wa, contacts, campaigns, rules, schedules, wallet)
- **Playwright worker**: QR generation, login, send text/media, read statuses, poll inbound messages, group member scrape.
- **Queue** (Celery/RQ) for throttled send tasks; Redis broker.
- **DB**: SQLAlchemy + Alembic.
- **Scheduler**: APScheduler for active‑hours enforcement & subscription expiry checks.

---

## 12) Points Accounting Logic

- On campaign start: compute required points (recipients × 2). If `balance < required`, block start.
- On each successful send attempt (status `sent`), deduct 2 points (txn `deduct`).
- On failure after retries, do not deduct.
- On subscription start/top‑up: create txn `allocation/topup` and update balance.
- On expiry: set `plan_expires_at`; disable auto‑responses/sending until renewed.

---

## 13) Rate Limiting & Safety

- Default 2–5s random delay; cap 200 recipients/campaign; 500/day/session.
- Auto‑pause after 3 consecutive failures (backoff 30/60/120s).
- Per‑rule reply cooldown (e.g., 1 reply per contact per hour).

---

## 14) Observability & Admin

- `/healthz`, `/readiness`
- Metrics: `messages_sent_total`, `messages_failed_total`, `queue_depth`, `wallet_points_deducted_total`
- Admin panel (dev only): view sessions, clear queues, reset DB.

---

## 15) Risks & Mitigations

- **WA Web DOM changes** → defensive selectors; fallback flows; feature flag to disable.
- **ToS violations** → loud warnings; caps; academic use; offer “Official Mode”.
- **Invisible numbers in groups** → best‑effort: send via group chat context or require manual number import.
- **Session bans/limits** → detect and stop; inform user.

---

## 16) Milestones (4 Weeks)

- **W1**: Repo scaffolding (Next.js + FastAPI + Docker), Auth, Wallet basics, QR mock → real QR.
- **W2**: Excel/CSV import, group import (basic), Campaign creation, Queue wiring, Points checks.
- **W3**: End‑to‑end send (text+media), WebSocket progress, Auto‑responses (keyword), Active hours, Exports.
- **W4**: Polish UI, receipts PDF, subscription renewals/alerts, optional “Official Mode” stubs.

---

## 17) Acceptance Criteria

- Link session via QR; status shows `linked`.
- Import Excel with ≥10 valid opt‑in numbers.
- Create a campaign with media; start → progress updates → statuses visible; CSV export works.
- Auto‑response rule triggers during active hours only.
- Points deduct as messages send; low‑balance prevents new campaigns.

---

## 18) Future Enhancements

- AI copy helper (tone, rewrite, A/B suggestions).
- Template library and variables inspector.
- Contact segmentation, tags, and simple analytics.
- Official Mode full support (Cloud API webhooks, templates, verified number).

---

## 19) Dev Ops & Env

**docker-compose** services: `frontend`, `api`, `worker`, `redis`, `postgres`, `minio`.
**ENV** (samples):

- `DATABASE_URL=postgresql+psycopg://user:pass@postgres:5432/wbs`
- `REDIS_URL=redis://redis:6379/0`
- `SESSION_KEY=base64:aesgcmkey...`
- `JWT_SECRET=...`
- `PLAYWRIGHT_HEADLESS=true`
- `DEFAULT_TZ=Asia/Jakarta`
- `OFFICIAL_MODE=false`

**Libraries**

- Python: FastAPI, SQLAlchemy, Alembic, Playwright, Celery/RQ, phonenumbers, pydantic, APScheduler
- FE: Next.js, React Query, Zod, Tailwind, shadcn/ui
