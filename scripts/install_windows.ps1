# =====================================================================
# MailMaster PRO — installer for Windows 10/11
# Installs (via winget): Python 3.12, Node.js 20 LTS, MongoDB 7, LibreOffice, Git
# Sets up backend (venv + deps) and frontend (yarn install)
#
# Usage (open PowerShell as Administrator):
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
#   .\scripts\install_windows.ps1
# =====================================================================

$ErrorActionPreference = "Stop"
function Log($msg) { Write-Host "[INSTALL] $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red; exit 1 }

# --- Admin check ---
$isAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole( `
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Fail "Please run this script in an *Administrator* PowerShell." }

# --- Locate repo root ---
$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RootDir
Log "Repo root: $RootDir"

# --- 1. winget present? ---
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Fail "winget not found. Install 'App Installer' from Microsoft Store, then re-run."
}

function Ensure-WingetPkg($id, $check) {
  if (& $check) { Log "$id already installed"; return }
  Log "Installing $id ..."
  winget install --id $id --silent --accept-package-agreements --accept-source-agreements --scope machine
}

Ensure-WingetPkg "Python.Python.3.12"          { Get-Command python -ErrorAction SilentlyContinue }
Ensure-WingetPkg "OpenJS.NodeJS.LTS"           { Get-Command node   -ErrorAction SilentlyContinue }
Ensure-WingetPkg "MongoDB.Server"              { Get-Command mongod -ErrorAction SilentlyContinue }
Ensure-WingetPkg "TheDocumentFoundation.LibreOffice" { Test-Path "${env:ProgramFiles}\LibreOffice\program\soffice.exe" }
Ensure-WingetPkg "Git.Git"                     { Get-Command git    -ErrorAction SilentlyContinue }

# Reload PATH after fresh installs
$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path","User")

# --- 2. Yarn (classic, via npm) ---
if (-not (Get-Command yarn -ErrorAction SilentlyContinue)) {
  Log "Installing Yarn (classic) via npm"
  npm install -g yarn | Out-Null
}

# --- 3. Add LibreOffice to PATH (current session + machine) ---
$soffice = "${env:ProgramFiles}\LibreOffice\program"
if ((Test-Path $soffice) -and ($env:Path -notlike "*$soffice*")) {
  Log "Adding LibreOffice to PATH"
  [Environment]::SetEnvironmentVariable("Path", $env:Path + ";$soffice", "Machine")
  $env:Path += ";$soffice"
}

# --- 4. Make sure MongoDB service is running ---
$svc = Get-Service -Name MongoDB -ErrorAction SilentlyContinue
if ($svc) {
  if ($svc.Status -ne "Running") { Start-Service MongoDB }
  Set-Service MongoDB -StartupType Automatic
  Log "MongoDB service: Running"
} else {
  Log "WARNING: MongoDB service not found. Open MongoDB Compass / installer to verify install."
}

# --- 5. Python venv + deps ---
$venvPath = Join-Path $RootDir "backend\.venv"
if (-not (Test-Path $venvPath)) {
  Log "Creating Python venv at backend\.venv"
  python -m venv $venvPath
}
& "$venvPath\Scripts\python.exe" -m pip install --upgrade pip wheel
& "$venvPath\Scripts\python.exe" -m pip install -r "backend\requirements-app.txt"

# --- 6. backend\.env ---
$envBackend = Join-Path $RootDir "backend\.env"
if (-not (Test-Path $envBackend)) {
  Log "Creating backend\.env"
  $secret = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
  @"
MONGO_URL="mongodb://localhost:27017"
DB_NAME="mailmaster"
CORS_ORIGINS="http://localhost:3000"
JWT_SECRET="$secret"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="admin123"
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""
SMTP_FROM_NAME="MailMaster PRO"
SMTP_USE_TLS="true"
"@ | Out-File -FilePath $envBackend -Encoding ascii
}

# --- 7. frontend\.env ---
$envFrontend = Join-Path $RootDir "frontend\.env"
if (-not (Test-Path $envFrontend)) {
  Log "Creating frontend\.env"
  @"
REACT_APP_BACKEND_URL=http://localhost:8001
WDS_SOCKET_PORT=3000
"@ | Out-File -FilePath $envFrontend -Encoding ascii
}

# --- 8. yarn install ---
Log "Installing frontend dependencies (yarn install)"
Push-Location (Join-Path $RootDir "frontend")
yarn install
Pop-Location

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  MailMaster PRO is installed." -ForegroundColor Green
Write-Host ""
Write-Host "  1) Edit backend\.env and set your real SMTP credentials."
Write-Host "  2) Start the app:    .\scripts\start_windows.ps1"
Write-Host "  3) Open:             http://localhost:3000"
Write-Host "     Default admin:    admin@example.com / admin123"
Write-Host "============================================================" -ForegroundColor Green
