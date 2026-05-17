# Mass Mailer — PRD

## Original Problem Statement
Mass mailing application with mail merge: send personalized individual emails via SMTP configured in `.env`. Excel input (col1=email, col2=PDF password, rest=merge fields). Optional Word `.docx` template with `{placeholder}` syntax → rendered to PDF and (optionally) encrypted with the per-recipient password. Rich HTML email body with WYSIWYG editor (fonts, sizes, alignment, image-embedded signatures) and reusable email templates. JWT auth with admin who can add/remove users and view send logs. External API with `X-API-Key` to trigger campaigns from saved templates.

## User Personas
- **Admin / Ops**: Configures SMTP, manages users, audits all send activity, manages API keys.
- **Sender (user role)**: Composes/sends campaigns, manages own email templates, sees own send history.
- **External integrator**: Uses API key to programmatically trigger campaigns from saved templates.

## Architecture
- Backend: FastAPI + **SQLite/SQLCipher** (single AES-256 encrypted file at `backend/data/mailmaster.db`). No MongoDB or other DB server.
- Frontend: React (CRA) + Tailwind + Phosphor icons, custom WYSIWYG `RichTextEditor` with image-resize controls.
- PDF pipeline: `python-docx` placeholder replacement → LibreOffice headless (`soffice --convert-to pdf`) → `pikepdf` AES-256 encryption when password provided.
- Auth: JWT (httpOnly cookies + Authorization Bearer fallback), bcrypt password hashing.
- External API: bcrypt-hashed API keys (admin-only management); `X-API-Key` header.

## Implemented (May 13, 2026)
- ✅ JWT auth (login, me, refresh, logout) with admin seed
- ✅ Admin-only user management (create/list/delete)
- ✅ Email templates CRUD with rich HTML body
- ✅ Word template upload (.docx) / list / delete
- ✅ Excel parser endpoint (headers + rows)
- ✅ Campaign send: per-recipient placeholder replacement in subject/body, Word→PDF render, AES-256 encrypted PDF (when password provided), SMTP send, per-recipient logs
- ✅ Send history with role-scoped visibility (admins see all, users see own)
- ✅ API key generation/revocation, raw key shown once
- ✅ External `POST /api/external/send` with `X-API-Key`, validates key, runs same pipeline as UI
- ✅ Dashboard KPIs + recent activity
- ✅ Custom WYSIWYG editor (font family/size, bold/italic/underline, alignment, lists, color, images for signatures, link, merge tag chips)
- ✅ Backend tested by automated subagent — 17/17 pass

## P1 Backlog
- SMTP test endpoint (verify config without sending a campaign)
- Async / background queue for large campaigns (currently synchronous per-recipient)
- Per-recipient send progress (Server-Sent Events / WebSocket)
- Rate limiting / brute-force lockout on login (5 attempts / 15 min)
- O(1) API key lookup (deterministic hash prefix lookup, then bcrypt verify)
- Password reset flow

## P2 Backlog
- Schedule sends (cron-like) and recurring campaigns
- Tracking pixel (open rates) and link click tracking
- Multiple SMTP profiles selectable per campaign
- Per-user SMTP override
- HTML preview of personalized email per row before send
- Bulk delete in templates / history
- CSV / Google Sheets input besides .xlsx
- Webhook for delivery status from SMTP provider

## Test Credentials
See `/app/memory/test_credentials.md`.
