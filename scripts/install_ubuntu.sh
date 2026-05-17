#!/usr/bin/env bash
# =====================================================================
# MailMaster PRO — installer for Ubuntu / Debian / WSL2
# Installs: Python 3.11+, Node 20, Yarn, LibreOffice
# Storage: SQLite + SQLCipher (single encrypted file, no DB server)
# =====================================================================
set -euo pipefail

log()  { echo -e "\033[1;36m[INSTALL]\033[0m $*"; }
fail() { echo -e "\033[1;31m[ERROR]\033[0m $*" >&2; exit 1; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ "$EUID" -ne 0 ]; then
  log "Re-running with sudo..."
  exec sudo -E bash "$0" "$@"
fi
TARGET_USER="${SUDO_USER:-$USER}"

# ---- 1. System packages ----
log "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
  curl ca-certificates gnupg lsb-release git \
  build-essential \
  python3 python3-venv python3-pip python3-dev \
  libreoffice-core libreoffice-writer \
  fonts-dejavu fonts-liberation

# ---- 2. Node.js 20 + Yarn ----
if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 20 ]]; then
  log "Installing Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
if ! command -v yarn >/dev/null 2>&1; then
  log "Installing Yarn (classic)"
  npm install -g yarn
fi

# ---- 3. Python virtualenv + deps (includes sqlcipher3-wheels) ----
log "Creating Python venv at backend/.venv"
sudo -u "$TARGET_USER" python3 -m venv backend/.venv
sudo -u "$TARGET_USER" backend/.venv/bin/pip install --upgrade pip wheel
sudo -u "$TARGET_USER" backend/.venv/bin/pip install -r backend/requirements-app.txt

# ---- 4. backend/.env ----
if [ ! -f backend/.env ]; then
  log "Creating backend/.env"
  RANDOM_JWT="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  RANDOM_DBKEY="$(python3 -c 'import secrets; print(secrets.token_urlsafe(48))')"
  cat > backend/.env <<EOF
CORS_ORIGINS="http://localhost:3000"

# --- Auth ---
JWT_SECRET="$RANDOM_JWT"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="admin123"

# --- Storage (encrypted SQLite via SQLCipher) ---
DB_PATH="data/mailmaster.db"
DB_ENCRYPTION_KEY="$RANDOM_DBKEY"

# --- SMTP (fill in to enable sending) ---
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""
SMTP_FROM_NAME="MailMaster PRO"
SMTP_USE_TLS="true"
EOF
  chown "$TARGET_USER":"$TARGET_USER" backend/.env
  chmod 600 backend/.env
fi
mkdir -p backend/data
chown "$TARGET_USER":"$TARGET_USER" backend/data
chmod 700 backend/data

# ---- 5. Frontend ----
if [ ! -f frontend/.env ]; then
  log "Creating frontend/.env"
  cat > frontend/.env <<'EOF'
REACT_APP_BACKEND_URL=http://localhost:8001
WDS_SOCKET_PORT=3000
EOF
  chown "$TARGET_USER":"$TARGET_USER" frontend/.env
fi

log "Installing frontend dependencies (yarn install)"
sudo -u "$TARGET_USER" -H bash -lc "cd '$ROOT_DIR/frontend' && yarn install"

chown -R "$TARGET_USER":"$TARGET_USER" backend/.venv frontend/node_modules 2>/dev/null || true

cat <<'EOM'

============================================================
  MailMaster PRO is installed.

  Storage    : SQLite + SQLCipher (AES-256 encrypted)
               -> backend/data/mailmaster.db
  Encryption : random 48-byte key auto-generated in backend/.env
               (DB_ENCRYPTION_KEY)

  Next steps:
    1) Edit backend/.env and set your SMTP credentials.
    2) Back up backend/.env and backend/data/ together — losing
       DB_ENCRYPTION_KEY makes the database unrecoverable.
    3) Start the app:    bash scripts/start.sh
    4) Open:             http://localhost:3000
       Default admin:    admin@example.com / admin123
============================================================
EOM
