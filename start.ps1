<#
.SYNOPSIS
  Starts the TrafficVision AI demo: ML service (:8000), backend API (:5000) and website (:5173).

.DESCRIPTION
  Each service opens in its own PowerShell window (close a window to stop that service).
  Run .\setup.ps1 once before the first start.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\start.ps1
#>
[CmdletBinding()]
param(
  [switch]$NoBrowser
)

$ErrorActionPreference = "Continue"
$Root = $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "Frontend"
$Ml = Join-Path $Root "ml-service"
$VenvPy = Join-Path $Ml "venv\Scripts\python.exe"

function Fail($text) { Write-Host "START FAILED: $text" -ForegroundColor Red; exit 1 }

if (-not (Test-Path (Join-Path $Backend ".env"))) { Fail "backend\.env is missing. Run .\setup.ps1 first." }
if (-not (Test-Path (Join-Path $Backend "node_modules"))) { Fail "Backend packages are missing. Run .\setup.ps1 first." }
if (-not (Test-Path (Join-Path $Frontend "node_modules"))) { Fail "Frontend packages are missing. Run .\setup.ps1 first." }
if (-not (Test-Path $VenvPy)) { Fail "ml-service\venv is missing. Run .\setup.ps1 first." }

function Test-PortInUse([int]$port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Start-ServiceWindow([string]$title, [string]$dir, [string]$command, [int]$port) {
  if (Test-PortInUse $port) {
    Write-Host "  $title : port $port is already in use. Assuming it is already running." -ForegroundColor Yellow
    return
  }
  $script = "`$Host.UI.RawUI.WindowTitle = '$title'; Set-Location -LiteralPath '$dir'; $command"
  Start-Process powershell -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $script) | Out-Null
  Write-Host "  $title : starting on port $port" -ForegroundColor Green
}

Write-Host "Starting TrafficVision AI..." -ForegroundColor Cyan

# Map tiles, fonts and the map stylesheet load from the internet.
try {
  Invoke-WebRequest -Uri "https://server.arcgisonline.com" -Method Head -TimeoutSec 5 -UseBasicParsing | Out-Null
} catch {
  if (-not $_.Exception.Response) {
    Write-Host "  Warning: no internet connection detected. The site works, but map tiles and fonts need internet." -ForegroundColor Yellow
  }
}

$models = (Test-Path (Join-Path $Ml "models\rf_15.joblib")) -and (Test-Path (Join-Path $Ml "models\rf_30.joblib"))
if ($models) {
  Start-ServiceWindow "TrafficVision ML (8000)" $Ml "& '$VenvPy' -m uvicorn app.main:app --port 8000" 8000
} else {
  Write-Host "  ML service : models not trained, skipping (predictions use the baseline; run .\setup.ps1 to train)." -ForegroundColor Yellow
}
Start-ServiceWindow "TrafficVision API (5000)" $Backend "npm start" 5000
Start-ServiceWindow "TrafficVision Web (5173)" $Frontend "npm run dev" 5173

# Wait for the backend to answer.
Write-Host ""
Write-Host "Waiting for the backend..." -NoNewline
$health = $null
for ($i = 0; $i -lt 60; $i++) {
  try {
    $health = Invoke-RestMethod -Uri "http://localhost:5000/api/health" -TimeoutSec 3
    break
  } catch {
    Start-Sleep -Seconds 2
    Write-Host "." -NoNewline
  }
}
Write-Host ""
if (-not $health) {
  Write-Host "The backend did not answer on http://localhost:5000/api/health. Check the 'TrafficVision API' window." -ForegroundColor Red
} else {
  Write-Host ("Backend: database {0}, ML service {1}" -f $health.data.database, $health.data.ml_service.status) -ForegroundColor Green
  if ($health.data.ml_service.status -ne "up" -and $models) {
    Write-Host "  (The ML service needs ~30-60 s to load its models; it is picked up automatically once ready.)" -ForegroundColor Yellow
  }
}

if (-not $NoBrowser) {
  # Give Vite a moment to start
  for ($i = 0; $i -lt 20 -and -not (Test-PortInUse 5173); $i++) { Start-Sleep -Seconds 1 }
  Start-Process "http://localhost:5173"
}

Write-Host ""
Write-Host "Website:  http://localhost:5173" -ForegroundColor Cyan
Write-Host "Logins (password demo123): admin@demo.test, ems@demo.test, user@demo.test"
Write-Host "Stop:     close the three TrafficVision windows."
