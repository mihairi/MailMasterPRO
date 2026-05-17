# =====================================================================
# MailMaster PRO — installer for Windows 10/11
# Installs (via winget): Python 3.12, Node.js 20 LTS, LibreOffice, Git
# Storage: SQLite + SQLCipher (encrypted file, no DB server)
#
# Usage (PowerShell as Administrator):
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
#   .\scripts\install_windows.ps1
# =====================================================================

$ErrorActionPreference = "Stop"
function Log($msg) { Write-Host "[INSTALL] $msg" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red; exit 1 }

$isAdmin = ([Security.Principal.WindowsPrincipal] `
  [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole( `
  [Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Fail "Please run this script in an *Administrator* PowerShell." }

$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $RootDir
Log "Repo root: $RootDir"

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
  Fail "winget not found. Install 'App Installer' from Microsoft Store, then re-run."
}

function Ensure-WingetPkg($id, $check) {
  if (& $check) { Log "$id already installed"; return }
  Log "Installing $id ..."
  winget install --id $id --silent --accept-package-agreements --accept-source-agreements --scope machine
}

Ensure-WingetPkg "Python.Python.3.12"                { Get-Command python -ErrorAction SilentlyContinue }
Ensure-WingetPkg "OpenJS.NodeJS.LTS"                 { Get-Command node   -ErrorAction SilentlyContinue }
Ensure-WingetPkg "TheDocumentFoundation.LibreOffice" { Test-Path "${env:ProgramFiles}\LibreOffice\program\soffice.exe" }
Ensure-WingetPkg "Git.Git"                           { Get-Command git    -ErrorAction SilentlyContinue }

$env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path","User")

if (-not (Get-Command yarn -ErrorAction SilentlyContinue)) {
  Log "Installing Yarn"
  npm install -g yarn | Out-Null
}

$soffice = "${env:ProgramFiles}\LibreOffice\program"
if ((Test-Path $soffice) -and ($env:Path -notlike "*$soffice*")) {
  Log "Adding LibreOffice to PATH"
  [Environment]::SetEnvironmentVariable("Path", $env:Path + ";$soffice", "Machine")
  $env:Path += ";$soffice"
}

# --- Python venv + deps (sqlcipher3-wheels ships a Windows wheel) ---
$venvPath = Join-Path $RootDir "backend\.venv"
if (-not (Test-Path $venvPath)) {
  Log "Creating Python venv at backend\.venv"
  python -m venv $venvPath
}
& "$venvPath\Scripts\python.exe" -m pip install --upgrade pip wheel
& "$venvPath\Scripts\python.exe" -m pip install -r "backend\requirements-app.txt"

# --- backend\.env ---
$envBackend = Join-Path $RootDir "backend\.env"
if (-not (Test-Path $envBackend)) {
  Log "Creating backend\.env"
  $jwtSecret = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
  $dbBytes   = New-Object byte[] 48
  [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($dbBytes)
  $dbKey     = [Convert]::ToBase64String($dbBytes).TrimEnd('=').Replace('+','-').Replace('/','_')
  @"
CORS_ORIGINS="http://localhost:3000"

# --- Auth ---
JWT_SECRET="$jwtSecret"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="admin123"

# --- Storage (encrypted SQLite via SQLCipher) ---
DB_PATH="data/mailmaster.db"
DB_ENCRYPTION_KEY="$dbKey"

# --- SMTP (fill in to enable sending) ---
SMTP_HOST=""
SMTP_PORT="587"
SMTP_USER=""
SMTP_PASS=""
SMTP_FROM=""
SMTP_FROM_NAME="MailMaster PRO"
SMTP_USE_TLS="true"
"@ | Out-File -FilePath $envBackend -Encoding ascii
}
New-Item -ItemType Directory -Force -Path (Join-Path $RootDir "backend\data") | Out-Null

# --- frontend\.env ---
$envFrontend = Join-Path $RootDir "frontend\.env"
if (-not (Test-Path $envFrontend)) {
  Log "Creating frontend\.env"
  @"
REACT_APP_BACKEND_URL=http://localhost:8001
WDS_SOCKET_PORT=3000
"@ | Out-File -FilePath $envFrontend -Encoding ascii
}

Log "Installing frontend dependencies (yarn install)"
Push-Location (Join-Path $RootDir "frontend")
yarn install
Pop-Location

Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  MailMaster PRO is installed." -ForegroundColor Green
Write-Host ""
Write-Host "  Storage    : SQLite + SQLCipher (AES-256 encrypted)"
Write-Host "               -> backend\data\mailmaster.db"
Write-Host "  Encryption : random key auto-generated in backend\.env"
Write-Host "               (DB_ENCRYPTION_KEY)"
Write-Host ""
Write-Host "  Next steps:"
Write-Host "    1) Edit backend\.env and set your SMTP credentials."
Write-Host "    2) Back up backend\.env and backend\data\ together"
Write-Host "       — losing DB_ENCRYPTION_KEY makes the DB unrecoverable."
Write-Host "    3) Start the app: .\scripts\start_windows.ps1"
Write-Host "    4) Open: http://localhost:3000"
Write-Host "       Default admin: admin@example.com / admin123"
Write-Host "============================================================" -ForegroundColor Green
