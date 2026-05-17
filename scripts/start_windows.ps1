# Start MailMaster PRO on Windows.
# Opens two PowerShell windows: backend + frontend.

$ErrorActionPreference = "Stop"
$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..")

Start-Process powershell -ArgumentList @(
  "-NoExit","-Command",
  "Set-Location '$RootDir\backend'; .\.venv\Scripts\Activate.ps1; uvicorn server:app --host 0.0.0.0 --port 8001 --reload"
)
Start-Sleep -Seconds 2
Start-Process powershell -ArgumentList @(
  "-NoExit","-Command",
  "Set-Location '$RootDir\frontend'; yarn start"
)

Write-Host ""
Write-Host "Backend  : http://localhost:8001/api/" -ForegroundColor Cyan
Write-Host "Frontend : http://localhost:3000"      -ForegroundColor Cyan
Write-Host "Admin    : admin@example.com / admin123" -ForegroundColor Yellow
