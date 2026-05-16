#!/usr/bin/env bash
# =====================================================================
# MailMaster PRO — installer for Ubuntu / Debian / WSL2
# Installs: Python 3.11+, Node 20, Yarn, MongoDB, LibreOffice
# Sets up backend (venv + deps) and frontend (yarn install)
# =====================================================================
set -euo pipefail

# ---- helpers ----
log()  { echo -e "\033[1;36m[INSTALL]\033[0m $*"; }
fail() { echo -e "\033[1;31m[ERROR]\033[0m $*" >&2; exit 1; }

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# ---- 0. Check sudo ----
if [ "$EUID" -ne 0 ]; then
  log "Re-running with sudo..."
  exec sudo -E bash "$0" "$@"
fi
TARGET_USER="${SUDO_USER:-$USER}"

# ---- 1. System packages ----
log "Updating apt and installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-install-recommends \
  curl ca-certificates gnupg lsb-release \
  build-essential \
  python3 python3-venv python3-pip python3-dev \
  libreoffice-core libreoffice-writer \
  fonts-dejavu fonts-liberation \
  git

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

# ---- 3. MongoDB Community Edition ----
if ! command -v mongod >/dev/null 2>&1; then
  log "Installing MongoDB 7.0"
  curl -fsSL https://pgp.mongodb.com/server-7.0.asc | gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor --yes
  CODENAME="$(lsb_release -cs || echo bookworm)"
  # Debian 12 (bookworm) is supported. For Ubuntu 22.04 use 'jammy', 24.04 use 'noble'.
  case "$CODENAME" in
    bookworm|bullseye)
      echo "deb [signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/debian $CODENAME/mongodb-org/7.0 main" > /etc/apt/sources.list.d/mongodb-org-7.0.list ;;
    jammy|focal|noble)
      echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/ubuntu $CODENAME/mongodb-org/7.0 multiverse" > /etc/apt/sources.list.d/mongodb-org-7.0.list ;;
    *)
      log "Unrecognised distro codename '$CODENAME' — falling back to Debian bookworm repo"
      echo "deb [signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg] https://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" > /etc/apt/sources.list.d/mongodb-org-7.0.list ;;
  esac
  apt-get update -y
  apt-get install -y mongodb-org
  systemctl enable mongod || true
  systemctl start mongod || true
fi

# ---- 4. Python virtualenv + deps ----
log "Creating Python venv at backend/.venv"
sudo -u "$TARGET_USER" python3 -m venv backend/.venv
sudo -u "$TARGET_USER" backend/.venv/bin/pip install --upgrade pip wheel
sudo -u "$TARGET_USER" backend/.venv/bin/pip install -r backend/requirements-app.txt

# ---- 5. Backend .env ----
if [ ! -f backend/.env ]; then
  log "Creating backend/.env from template"
  RANDOM_SECRET="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  cat > backend/.env <<EOF
MONGO_URL="mongodb://localhost:27017"
DB_NAME="mailmaster"
CORS_ORIGINS="http://localhost:3000"
JWT_SECRET="$RANDOM_SECRET"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="admin123"
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""
SMTP_FROM_NAME="MailMaster PRO"
SMTP_USE_TLS="true"
EOF
  chown "$TARGET_USER":"$TARGET_USER" backend/.env
fi

# ---- 6. Frontend deps + .env ----
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

# ---- 7. Done ----
chown -R "$TARGET_USER":"$TARGET_USER" backend/.venv frontend/node_modules 2>/dev/null || true

cat <<'EOM'

============================================================
  MailMaster PRO is installed.

  1) Edit backend/.env and set your real SMTP credentials.
  2) Start the app:    bash scripts/start.sh
  3) Open:             http://localhost:3000
     Default admin:    admin@example.com / admin123
============================================================
EOM
