# Start MailMaster PRO on Windows.
# Opens two PowerShell windows: one for backend, one for frontend.

$ErrorActionPreference = "Stop"
$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")

# Ensure MongoDB is running
$svc = Get-Service -Name MongoDB -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -ne "Running") { Start-Service MongoDB }

# Backend
Start-Process powershell -ArgumentList @(
  "-NoExit","-Command",
  "Set-Location '$RootDir\backend'; .\.venv\Scripts\Activate.ps1; uvicorn server:app --host 0.0.0.0 --port 8001 --reload"
)

# Wait a beat, then frontend
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList @(
  "-NoExit","-Command",
  "Set-Location '$RootDir\frontend'; yarn start"
)

Write-Host ""
Write-Host "Backend  : http://localhost:8001/api/" -ForegroundColor Cyan
Write-Host "Frontend : http://localhost:3000"      -ForegroundColor Cyan
Write-Host "Admin    : admin@example.com / admin123" -ForegroundColor Yellow
