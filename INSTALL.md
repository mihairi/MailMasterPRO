# MailMaster PRO — Installation Guide

Self-hosted setup for **Ubuntu/Debian Linux** and **Windows 10/11**.

The app has just three runtime dependencies — **no separate database server**.

| Component | Why |
|---|---|
| **Python 3.11+** | FastAPI backend (`/app/backend`) |
| **Node.js 20+ & Yarn** | React frontend (`/app/frontend`) |
| **LibreOffice (headless)** | Renders Word `.docx` → PDF for attachments |
| _Storage_ | **SQLite + SQLCipher** — single AES-256-encrypted file (`backend/data/mailmaster.db`). No DB server to install, configure, or back up separately. |

The backend listens on `:8001`, the frontend on `:3000`.

---

## Quick start

### Linux (Ubuntu 22.04 / 24.04 or Debian 12)

```bash
git clone <your-repo-url> mailmaster
cd mailmaster
chmod +x scripts/*.sh
sudo bash scripts/install_ubuntu.sh
# edit backend/.env to add your SMTP settings, then:
bash scripts/start.sh
```

### Windows 10 / 11

Open **PowerShell as Administrator**, then:

```powershell
git clone <your-repo-url> mailmaster
cd mailmaster
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\scripts\install_windows.ps1
# edit backend\.env to add your SMTP settings, then:
.\scripts\start_windows.ps1
```

Open `http://localhost:3000`. Default admin: **`admin@example.com` / `admin123`** — change it immediately in `backend/.env` then restart the backend.

---

## What's encrypted, and how

| Layer | Tech | Notes |
|---|---|---|
| **DB at rest** | SQLCipher (AES-256-CBC + HMAC-SHA512, PBKDF2 key derivation) | `DB_ENCRYPTION_KEY` in `backend/.env`; the `.db` file is unreadable without it |
| **Passwords (users)** | bcrypt (cost 12) | Never stored in plain text |
| **API keys** | bcrypt | Raw key shown only once at creation |
| **JWT** | HS256 + `JWT_SECRET` | httpOnly cookies + Bearer fallback |
| **PDF attachments** | pikepdf AES-256 | Per-recipient password from Excel column 2 |
| **In-transit** | TLS — terminate at nginx / IIS in production | See deployment section |

### ⚠️ Key management

Two secrets in `backend/.env` must be safe-guarded:

- `JWT_SECRET` — random 64-hex; rotating it logs everyone out (harmless).
- `DB_ENCRYPTION_KEY` — **losing it makes the DB file permanently unreadable**. Back up `backend/.env` together with `backend/data/`.

The installers generate strong random values for both on first run.

---

## What the installers do

### `scripts/install_ubuntu.sh`
1. `apt install` Python 3, Node.js 20, LibreOffice (writer), Git, build tools
2. `npm install -g yarn`
3. `python -m venv backend/.venv` + `pip install -r backend/requirements-app.txt`
   - Pulls `sqlcipher3-wheels` (manylinux **aarch64 + x86_64** wheels included — no compile)
4. Generates `backend/.env` with random `JWT_SECRET` and `DB_ENCRYPTION_KEY` (48-byte URL-safe)
5. Sets `backend/.env` to mode `600` and `backend/data/` to `700`
6. Generates `frontend/.env` pointing to `http://localhost:8001`
7. `yarn install` in `frontend/`

### `scripts/install_windows.ps1`
Uses **winget** to install:
- `Python.Python.3.12`
- `OpenJS.NodeJS.LTS`
- `TheDocumentFoundation.LibreOffice`
- `Git.Git`

Then adds LibreOffice (`soffice.exe`) to PATH, creates `backend\.venv`, installs Python deps (including `sqlcipher3-wheels` Windows wheel), generates `.env` files, runs `yarn install`.

---

## Manual installation (no scripts)

### Ubuntu / Debian

```bash
# System packages
sudo apt update
sudo apt install -y python3 python3-venv python3-pip build-essential \
  curl git libreoffice-core libreoffice-writer fonts-dejavu

# Node.js 20 + Yarn
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g yarn

# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-app.txt
deactivate
cd ..

# Frontend
cd frontend
yarn install
cd ..
```

Then create `backend/.env` (see template below) and `frontend/.env`.

### Windows (manual, no winget)

Download and install:
- **Python 3.12** — https://www.python.org/downloads/ (check *Add Python to PATH*)
- **Node.js 20 LTS** — https://nodejs.org/
- **LibreOffice** — https://www.libreoffice.org/download/download/ (then add `C:\Program Files\LibreOffice\program` to PATH)
- **Git** — https://git-scm.com/download/win

Then:

```powershell
npm install -g yarn

cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements-app.txt
deactivate
cd ..\frontend
yarn install
cd ..
```

> **Note**: no MongoDB, no separate DB service. The encrypted SQLite file is created automatically on first backend start at `backend\data\mailmaster.db`.

---

## Environment files

### `backend/.env`
```dotenv
CORS_ORIGINS="http://localhost:3000"

# --- Auth ---
JWT_SECRET="<64-char-random-hex>"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="changeme"

# --- Storage (encrypted SQLite via SQLCipher) ---
DB_PATH="data/mailmaster.db"
DB_ENCRYPTION_KEY="<48-byte-random-url-safe-string>"

# --- SMTP ---
SMTP_HOST="smtp.your-provider.com"
SMTP_PORT="587"
SMTP_USER="you@your-domain.com"
SMTP_PASS="your-smtp-password-or-app-password"
SMTP_FROM="you@your-domain.com"
SMTP_FROM_NAME="MailMaster PRO"
SMTP_USE_TLS="true"
SMTP_REPLY_TO=""                # optional Reply-To header
SMTP_LIST_UNSUBSCRIBE=""        # optional List-Unsubscribe (e.g. <mailto:unsub@you.com>)

# --- Anti-blocking throttle (defaults; per-campaign overridable from UI) ---
MAX_PER_MINUTE="20"             # global rate cap
MAX_PER_HOUR="300"
MAX_PER_DAY="2000"              # persistent daily quota (UTC)
MAX_PER_DOMAIN_PER_MIN="5"      # same-domain throttle (Gmail/Outlook friendly)
DELAY_MIN_MS="800"              # random jitter between sends
DELAY_MAX_MS="2500"
RETRY_ATTEMPTS="3"              # transient SMTP retries
RETRY_BACKOFF_SECONDS="5"       # exponential backoff base
```

> **Double-quote every value**. Special characters like `$`, `#`, `!` won't get shell-expanded.
> Generate a JWT secret: `python -c "import secrets; print(secrets.token_hex(32))"`
> Generate an encryption key: `python -c "import secrets; print(secrets.token_urlsafe(48))"`

### `frontend/.env`
```dotenv
REACT_APP_BACKEND_URL=http://localhost:8001
WDS_SOCKET_PORT=3000
```

For production, set `REACT_APP_BACKEND_URL` to your public backend URL **before** running `yarn build`.

---

## SMTP provider snippets

| Provider | HOST | PORT | TLS | USER | PASS |
|---|---|---|---|---|---|
| Gmail | `smtp.gmail.com` | 587 | true | your full address | Google **App Password** (not regular password) |
| Outlook / 365 | `smtp.office365.com` | 587 | true | your full address | account password (basic SMTP must be enabled by admin) |
| SendGrid | `smtp.sendgrid.net` | 587 | true | `apikey` (literal) | your SendGrid API key |
| Mailgun | `smtp.mailgun.org` | 587 | true | `postmaster@<domain>` | mailgun smtp password |
| Amazon SES | `email-smtp.<region>.amazonaws.com` | 587 | true | SES SMTP username | SES SMTP password |
| Local Postfix | `localhost` | 25 | false | (empty) | (empty) |

Port `465` → set `SMTP_USE_TLS="false"` (SSL, not STARTTLS).

---

## Anti-blocking & deliverability

To minimise risk of getting your sending address rate-limited or blocked, MailMaster PRO ships with multiple defences (all configurable in `backend/.env`, overridable per campaign from the Compose UI's **Delivery pacing** panel).

| Mechanism | Default | What it does |
|---|---|---|
| `MAX_PER_MINUTE` | 20 | Hard cap of emails per rolling 60 s window |
| `MAX_PER_HOUR` | 300 | Cap per rolling 60 min window |
| `MAX_PER_DAY` | 2000 | Persistent UTC-day quota stored in DB (survives restarts) |
| `MAX_PER_DOMAIN_PER_MIN` | 5 | Cap per recipient domain — critical for Gmail/Outlook |
| `DELAY_MIN_MS` / `DELAY_MAX_MS` | 800–2500 | Random jitter between sends (not a fixed cadence) |
| `RETRY_ATTEMPTS` / `RETRY_BACKOFF_SECONDS` | 3 / 5 | Exponential backoff for 4xx transient SMTP errors |
| SMTP connection reuse | always on | One TLS handshake per campaign — many providers throttle reconnects |
| `Message-ID`, `Date`, `Reply-To`, `List-Unsubscribe`, `X-Mailer` | always | Standards-compliant headers improve inbox placement |

### Recommended starting values per provider

| Provider | per_minute | per_domain_per_min | Daily cap | Notes |
|---|---|---|---|---|
| **Gmail (free)** | 8 | 3 | ~500 | Personal Gmail caps you at ~500/day total. SMTP often graylists bursts. |
| **Google Workspace** | 15 | 5 | 2000 | Workspace per-user daily limit. |
| **Outlook / 365** | 10 | 3 | ~10000 | Microsoft will silently throttle if you exceed ~30/min. |
| **SendGrid free** | 20 | 10 | ~100 | Free tier limit; paid tiers much higher. |
| **Amazon SES (sandbox)** | 1 | 1 | 200 | Sandbox is intentionally tiny. Request production access. |
| **Self-hosted Postfix** | 60+ | 20+ | unlimited | Limited only by your IP reputation. |

> Per-domain throttling matters most. Sending 100 emails to 100 different domains in 60 s is usually fine; sending 100 emails to `*@gmail.com` in 60 s is almost guaranteed to trigger blocks.

### Daily quota behaviour

When `MAX_PER_DAY` is reached the throttler sleeps until the next UTC midnight and resumes automatically. This counter is stored in the `daily_quota` table inside the encrypted DB — it survives restarts.

### `Reply-To` / `List-Unsubscribe`

For transactional emails leave both blank.
For marketing/bulk mail, set:
```dotenv
SMTP_REPLY_TO="you@your-domain.com"
SMTP_LIST_UNSUBSCRIBE="<mailto:unsubscribe@your-domain.com>, <https://your-domain.com/unsubscribe>"
```
This is required by Google/Yahoo bulk-sender rules (2024+) and meaningfully improves deliverability.

---

## Running

### Linux
```bash
bash scripts/start.sh
```
- Backend → `http://localhost:8001/api/`
- Frontend → `http://localhost:3000`
- `Ctrl+C` once stops both.

### Windows
```powershell
.\scripts\start_windows.ps1
```
Opens two PowerShell windows; close each to stop.

---

## Backup & restore

Because the entire database is **one file**, backups are trivial:

```bash
# Linux — daily cron
sqlite3 backend/data/mailmaster.db ".backup '/backups/mm-$(date +%F).db'"
# Or just stop the backend and: cp backend/data/mailmaster.db /backups/mm-$(date +%F).db
```

**Restore**: copy the `.db` file back into `backend/data/` and ensure the **same `DB_ENCRYPTION_KEY`** is set in `backend/.env`. Restart the backend.

> Important: word-template `.docx` files live in `backend/storage/word_templates/` (not in the DB). Back up `backend/` as a whole, plus `backend/.env`.

---

## Inspecting the database manually

For debugging, you can open the DB with the `sqlcipher` CLI:

```bash
# Linux
sudo apt install sqlcipher
sqlcipher backend/data/mailmaster.db
sqlite> PRAGMA key = '<paste DB_ENCRYPTION_KEY value>';
sqlite> .tables
sqlite> SELECT email, role FROM users;
```

Without the correct key, `.tables` returns `Error: file is not a database`.

---

## Production deployment (Linux)

### `/etc/systemd/system/mailmaster-backend.service`

```ini
[Unit]
Description=MailMaster PRO backend (FastAPI)
After=network.target

[Service]
Type=simple
User=mailmaster
WorkingDirectory=/opt/mailmaster/backend
EnvironmentFile=/opt/mailmaster/backend/.env
ExecStart=/opt/mailmaster/backend/.venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001 --workers 2
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

> **Workers**: SQLite with WAL mode handles 2–4 uvicorn workers fine for this workload (mostly read-heavy with bursts on send). Don't go above 4 unless you've measured.

### Frontend production build

```bash
cd frontend
REACT_APP_BACKEND_URL=https://your-domain.example yarn build
```

### nginx example

```nginx
server {
    listen 80;
    server_name your-domain.example;

    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        root /opt/mailmaster/frontend/build;
        try_files $uri /index.html;
    }

    client_max_body_size 50m;
}
```

`sudo certbot --nginx -d your-domain.example` for TLS.

---

## Production deployment (Windows)

Use **NSSM** (Non-Sucking Service Manager):

```powershell
C:\nssm\nssm.exe install MailMasterBackend `
  "C:\path\to\mailmaster\backend\.venv\Scripts\uvicorn.exe" `
  "server:app --host 127.0.0.1 --port 8001"
C:\nssm\nssm.exe set MailMasterBackend AppDirectory "C:\path\to\mailmaster\backend"
C:\nssm\nssm.exe start MailMasterBackend
```

Build the frontend (`yarn build`) and serve `build\` via IIS, with `/api/*` reverse-proxied to `http://localhost:8001`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `sqlcipher3.dbapi2.DatabaseError: file is not a database` | Wrong `DB_ENCRYPTION_KEY`, or the DB was created by a different key. Either restore the right key or delete `backend/data/mailmaster.db` to start fresh. |
| `soffice: command not found` | Re-run installer; on Windows ensure `C:\Program Files\LibreOffice\program` is in PATH |
| First PDF conversion is slow | Pre-warm: `soffice --headless --terminate_after_init` |
| `Authentication failed` on SMTP | For Gmail/Outlook use an **app password**; for SendGrid the user is literally `apikey` |
| 401 on `/api/auth/me` after login | `CORS_ORIGINS` must include the exact frontend origin when sending cookies |
| Port in use | Frontend: `PORT=3001 yarn start`. Backend: edit `start.sh` (or pass `--port 8002`). |
| `database is locked` errors under load | Make sure WAL mode is on (it is by default); avoid running multiple `uvicorn --workers` higher than 4 with heavy concurrent writes |

### Logs
- Backend: stdout of `uvicorn` (script foreground) or `journalctl -u mailmaster-backend -f` (systemd) / NSSM stdout on Windows
- LibreOffice errors bubble up in the FastAPI response

---

## Upgrading

```bash
git pull
# Linux
source backend/.venv/bin/activate && pip install -r backend/requirements-app.txt && deactivate
cd frontend && yarn install && cd ..
sudo systemctl restart mailmaster-backend     # production
```

On Windows: `.\backend\.venv\Scripts\Activate.ps1`, then `pip install -r backend\requirements-app.txt`, then `yarn install` in `frontend\`. The encrypted DB file is preserved across upgrades — no migration needed (schema is idempotent at startup).

---

## Default credentials

`admin@example.com` / `admin123` — change in `backend/.env` (`ADMIN_PASSWORD`) and restart the backend. The admin record is updated automatically.
