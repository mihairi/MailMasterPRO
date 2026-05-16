# MailMaster PRO — Installation Guide

Self-hosted setup for **Ubuntu/Debian Linux** and **Windows 10/11**.

The app has three runtime dependencies:

| Component | Why |
|---|---|
| **Python 3.11+** | FastAPI backend (`/app/backend`) |
| **Node.js 20+ & Yarn** | React frontend (`/app/frontend`) |
| **MongoDB 7** | Stores users, templates, send logs, API keys |
| **LibreOffice (headless)** | Renders Word `.docx` → PDF for attachments |

The backend listens on `:8001`, the frontend on `:3000`, and MongoDB on `:27017`.

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

Open `http://localhost:3000`. Default admin: **`admin@example.com` / `admin123`** — change this immediately in `backend/.env` then restart the backend.

---

## What the installers do

### `scripts/install_ubuntu.sh`
1. `apt install` Python 3, Node.js 20, MongoDB 7 (official repo), LibreOffice writer, Git
2. `npm install -g yarn`
3. `python -m venv backend/.venv` + `pip install -r backend/requirements-app.txt`
4. Generates `backend/.env` (random JWT secret, empty SMTP — you fill in)
5. Generates `frontend/.env` pointing to `http://localhost:8001`
6. `yarn install` in `frontend/`
7. Enables & starts `mongod` via systemd

### `scripts/install_windows.ps1`
Uses **winget** to install:
- `Python.Python.3.12`
- `OpenJS.NodeJS.LTS`
- `MongoDB.Server` (runs as a Windows service)
- `TheDocumentFoundation.LibreOffice`
- `Git.Git`

Then it adds LibreOffice (`soffice.exe`) to PATH, creates `backend\.venv`, installs Python deps, generates `.env` files, runs `yarn install`.

---

## Manual installation (no scripts)

If you prefer step-by-step, here are the equivalent commands.

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

# MongoDB 7 (Ubuntu 22.04 example — see official docs for other distros)
curl -fsSL https://pgp.mongodb.com/server-7.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] \
  https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | \
  sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl enable --now mongod

# Backend
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-app.txt
cp .env.example .env   # or create per the template below
deactivate
cd ..

# Frontend
cd frontend
yarn install
cd ..
```

### Windows (manual, no winget)

Download and install:
- **Python 3.12** — https://www.python.org/downloads/ (check *Add Python to PATH*)
- **Node.js 20 LTS** — https://nodejs.org/
- **MongoDB Community 7** — https://www.mongodb.com/try/download/community (install as a Service)
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

---

## Environment files

### `backend/.env`
```dotenv
MONGO_URL="mongodb://localhost:27017"
DB_NAME="mailmaster"
CORS_ORIGINS="http://localhost:3000"

JWT_SECRET="<64-char-random-hex>"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="changeme"

# --- SMTP (required for sending emails) ---
SMTP_HOST="smtp.your-provider.com"
SMTP_PORT="587"
SMTP_USER="you@your-domain.com"
SMTP_PASS="your-smtp-password-or-app-password"
SMTP_FROM="you@your-domain.com"
SMTP_FROM_NAME="MailMaster PRO"
SMTP_USE_TLS="true"
```

> **Double-quote every value**. Special characters like `$`, `#`, `!` won't get shell-expanded.
> Generate a JWT secret: `python -c "import secrets; print(secrets.token_hex(32))"`

### `frontend/.env`
```dotenv
REACT_APP_BACKEND_URL=http://localhost:8001
WDS_SOCKET_PORT=3000
```

For production (different host), set `REACT_APP_BACKEND_URL` to your public backend URL **before** running `yarn build`.

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

Use port `465` only if your provider explicitly requires SSL — and set `SMTP_USE_TLS="false"` in that case.

---

## Running

### Linux
```bash
bash scripts/start.sh
```
- Backend → `http://localhost:8001/api/`
- Frontend → `http://localhost:3000`
- Press `Ctrl+C` once; the script kills the backend too.

### Windows
```powershell
.\scripts\start_windows.ps1
```
Opens two PowerShell windows (one per process). Close each to stop.

---

## Production deployment (Linux)

Use **systemd** + **nginx**.

### `/etc/systemd/system/mailmaster-backend.service`

```ini
[Unit]
Description=MailMaster PRO backend (FastAPI)
After=network.target mongod.service

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

### Frontend production build

```bash
cd frontend
REACT_APP_BACKEND_URL=https://your-domain.example yarn build
# Serve the resulting build/ directory with nginx
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

    client_max_body_size 50m;   # excel + docx + base64 images
}
```

Run with TLS (Let's Encrypt) — `sudo certbot --nginx -d your-domain.example`.

---

## Production deployment (Windows)

Use **NSSM** (Non-Sucking Service Manager) to install the backend as a Windows service:

```powershell
# Download NSSM from https://nssm.cc/ and extract to C:\nssm
C:\nssm\nssm.exe install MailMasterBackend `
  "C:\path\to\mailmaster\backend\.venv\Scripts\uvicorn.exe" `
  "server:app --host 127.0.0.1 --port 8001"
C:\nssm\nssm.exe set MailMasterBackend AppDirectory "C:\path\to\mailmaster\backend"
C:\nssm\nssm.exe start MailMasterBackend
```

Build the frontend (`yarn build`) and serve `build\` via IIS or any static file server. Proxy `/api/*` to `http://localhost:8001`.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `mongo: command not found` / connection refused | `sudo systemctl start mongod` (Linux) or start MongoDB service (Windows) |
| `soffice: command not found` | Re-run installer or add `C:\Program Files\LibreOffice\program` to PATH (Windows) |
| PDF conversion hangs once | Pre-warm LibreOffice: `soffice --headless --terminate_after_init` |
| `Authentication failed` on SMTP | For Gmail/Outlook use an **app password**; for SendGrid the user is literally `apikey` |
| 401 on `/api/auth/me` after login | Backend `CORS_ORIGINS` must include the exact frontend URL when using cookies |
| Port already in use | Change frontend port: `PORT=3001 yarn start`; backend: edit `start.sh` or pass `--port 8002` |
| White screen / blank UI | Hard refresh (Ctrl+Shift+R) — service worker / cached old build |

### Logs
- Backend: stdout of `uvicorn` (script foreground) or `journalctl -u mailmaster-backend -f` (systemd) / Windows service stdout via NSSM
- MongoDB: `journalctl -u mongod -f` (Linux), Event Viewer (Windows)
- LibreOffice: any conversion error shows up in the FastAPI response

---

## Upgrading

```bash
git pull
# Linux
source backend/.venv/bin/activate && pip install -r backend/requirements-app.txt && deactivate
cd frontend && yarn install && cd ..
sudo systemctl restart mailmaster-backend     # production
# OR re-run scripts/start.sh for dev
```

On Windows: `.\backend\.venv\Scripts\Activate.ps1`, then `pip install -r backend\requirements-app.txt`, then `yarn install` in `frontend\`.

---

## Default credentials

`admin@example.com` / `admin123` — change in `backend/.env` (`ADMIN_PASSWORD`) and restart the backend. The admin record is updated automatically on startup.
