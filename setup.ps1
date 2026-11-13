<#
.SYNOPSIS
  One-time setup for the TrafficVision AI demo on a Windows machine.

.DESCRIPTION
  Safe to run again. It:
    1. checks Node.js, Python and PostgreSQL
    2. creates the "trafficvision" database and its tables
    3. writes backend\.env (only if it does not exist yet)
    4. installs backend + frontend packages
    5. loads the road graph, six weeks of simulated traffic and the demo users/incidents
    6. creates the ML virtualenv, installs packages and trains the models (first run only)

  Afterwards start everything with .\start.ps1

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File .\setup.ps1
.EXAMPLE
  .\setup.ps1 -PgPassword "mypassword"
#>
[CmdletBinding()]
param(
  [string]$PgPassword,
  [string]$PgUser = "postgres",
  [string]$PgHost = "localhost",
  [int]$PgPort = 5432,
  [string]$DbName = "trafficvision",
  [switch]$ReloadTraffic,   # force re-loading data\traffic.csv even if the table already has rows
  [switch]$SkipTraining,    # skip ML model training (backend falls back to a baseline)
  [switch]$KeepIncidents    # do not wipe incidents when re-seeding the demo data
)

# "Continue": native tools (npm, psql, pip) write progress to stderr, which Windows PowerShell 5.1
# would otherwise turn into terminating errors. Every native call is checked with Assert-LastExit.
$ErrorActionPreference = "Continue"
$Root = $PSScriptRoot
$Backend = Join-Path $Root "backend"
$Frontend = Join-Path $Root "Frontend"
$Ml = Join-Path $Root "ml-service"

function Write-Step($text) { Write-Host ""; Write-Host "==> $text" -ForegroundColor Cyan }
function Write-Ok($text) { Write-Host "    $text" -ForegroundColor Green }
function Write-Note($text) { Write-Host "    $text" -ForegroundColor Yellow }
function Fail($text) {
  Write-Host ""
  Write-Host "SETUP FAILED: $text" -ForegroundColor Red
  exit 1
}
function Assert-LastExit($what) {
  if ($LASTEXITCODE -ne 0) { Fail "$what (exit code $LASTEXITCODE)" }
}

# ---------------------------------------------------------------------------
Write-Step "Checking prerequisites"

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail "Node.js not found. Install Node 18+ from https://nodejs.org and reopen PowerShell." }
$nodeVer = (& node --version).TrimStart("v")
if ([int]($nodeVer.Split(".")[0]) -lt 18) { Fail "Node.js $nodeVer is too old. Install Node 18 or newer." }
Write-Ok "Node.js $nodeVer"

# Python: prefer "py -3" (official installer), fall back to "python". Skip the Microsoft Store stub.
$PyCmd = $null
if (Get-Command py -ErrorAction SilentlyContinue) {
  & py -3 --version *> $null
  if ($LASTEXITCODE -eq 0) { $PyCmd = @("py", "-3") }
}
if (-not $PyCmd -and (Get-Command python -ErrorAction SilentlyContinue)) {
  & python --version *> $null
  if ($LASTEXITCODE -eq 0) { $PyCmd = @("python") }
}
if (-not $PyCmd) { Fail "Python 3.10+ not found. Install it from https://www.python.org (tick 'Add to PATH')." }
$pyVer = (& $PyCmd[0] $PyCmd[1..9] -c "import sys; print('%d.%d' % sys.version_info[:2])").Trim()
if ([version]$pyVer -lt [version]"3.10") { Fail "Python $pyVer is too old. Install Python 3.10 or newer." }
Write-Ok "Python $pyVer"
if ([version]$pyVer -ge [version]"3.14") {
  Write-Note "Python $pyVer is very new; if installing the ML packages fails, install Python 3.12 or 3.13 and re-run."
}

$Psql = (Get-Command psql -ErrorAction SilentlyContinue).Source
if (-not $Psql) {
  $Psql = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
    Sort-Object { [int]($_.Directory.Parent.Name -replace '\D', '') } -Descending |
    Select-Object -First 1 -ExpandProperty FullName
}
if (-not $Psql) { Fail "psql.exe not found. Install PostgreSQL (https://www.postgresql.org/download/windows/) or add its bin folder to PATH." }
Write-Ok "psql: $Psql"

# ---------------------------------------------------------------------------
Write-Step "Connecting to PostgreSQL ($PgUser@${PgHost}:$PgPort)"

$EnvFile = Join-Path $Backend ".env"
if (-not $PgPassword -and (Test-Path $EnvFile)) {
  # Re-use the password already stored in backend\.env
  $line = Get-Content $EnvFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
  if ($line -match '^DATABASE_URL=postgres(?:ql)?://[^:]+:([^@]*)@') {
    $PgPassword = [uri]::UnescapeDataString($Matches[1])
    Write-Ok "Using the password from backend\.env"
  }
}
if (-not $PgPassword) {
  $secure = Read-Host "Password for PostgreSQL user '$PgUser'" -AsSecureString
  $PgPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
}
$env:PGPASSWORD = $PgPassword

function Invoke-Psql([string]$db, [string[]]$extra) {
  & $Psql -h $PgHost -p $PgPort -U $PgUser -d $db -v ON_ERROR_STOP=1 -X -q @extra
}

$null = Invoke-Psql "postgres" @("-tAc", "SELECT 1")
if ($LASTEXITCODE -ne 0) {
  $svc = Get-Service -Name "postgresql*" -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($svc -and $svc.Status -ne "Running") {
    Fail "PostgreSQL service '$($svc.Name)' is $($svc.Status). Start it (admin PowerShell: Start-Service $($svc.Name)) and run setup again."
  }
  Fail "Could not connect to PostgreSQL. Check the password and that the server is running on port $PgPort."
}
Write-Ok "Connected"

$exists = (Invoke-Psql "postgres" @("-tAc", "SELECT 1 FROM pg_database WHERE datname = '$DbName'")) -join ""
if ($exists.Trim() -ne "1") {
  Invoke-Psql "postgres" @("-c", "CREATE DATABASE `"$DbName`"")
  Assert-LastExit "Creating database $DbName"
  Write-Ok "Created database '$DbName'"
} else {
  Write-Ok "Database '$DbName' already exists"
}

$hasTables = (Invoke-Psql $DbName @("-tAc", "SELECT to_regclass('public.users') IS NOT NULL")) -join ""
if ($hasTables.Trim() -ne "t") {
  Invoke-Psql $DbName @("-f", (Join-Path $Backend "migrations\001_init.sql"))
  Assert-LastExit "Running migrations\001_init.sql"
  Write-Ok "Tables created"
} else {
  Write-Ok "Tables already exist"
}
# Later migrations only add things and are safe to run every time
Invoke-Psql $DbName @("-f", (Join-Path $Backend "migrations\002_route_history.sql"))
Assert-LastExit "Running migrations\002_route_history.sql"
Write-Ok "Route search history columns ready"

# ---------------------------------------------------------------------------
Write-Step "Writing backend\.env"
if (Test-Path $EnvFile) {
  Write-Ok "backend\.env already exists (left unchanged)"
} else {
  $pwEnc = [uri]::EscapeDataString($PgPassword)
  $jwt = -join ((1..48) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
  $content = @(
    "PORT=5000",
    "DATABASE_URL=postgresql://${PgUser}:$pwEnc@${PgHost}:$PgPort/$DbName",
    "JWT_SECRET=$jwt",
    "ML_SERVICE_URL=http://localhost:8000",
    "SIM_START=2026-11-10T03:30:00Z",
    "GRAPH_PATH=../data/graph.json",
    "TRAFFIC_PATH=../data/traffic.csv"
  )
  [IO.File]::WriteAllLines($EnvFile, $content)
  Write-Ok "Created backend\.env"
}

# ---------------------------------------------------------------------------
function Install-NodePackages([string]$dir, [string]$name) {
  Write-Step "Installing $name packages"
  # npm writes node_modules\.package-lock.json after a successful install; skip if it is newer than the lockfile.
  $marker = Join-Path $dir "node_modules\.package-lock.json"
  $lock = Join-Path $dir "package-lock.json"
  if ((Test-Path $marker) -and ((Get-Item $marker).LastWriteTime -ge (Get-Item $lock).LastWriteTime)) {
    Write-Ok "Already up to date"
    return
  }
  Push-Location $dir
  try {
    if (Test-Path (Join-Path $dir "node_modules")) {
      # Update in place: "npm ci" would first delete node_modules, which fails while a dev server is running.
      & npm install --no-audit --no-fund
    } else {
      & npm ci --no-audit --no-fund
    }
    Assert-LastExit "Installing $name packages. Close any running TrafficVision windows and retry"
  } finally { Pop-Location }
}
Install-NodePackages $Backend "backend"
Install-NodePackages $Frontend "frontend"

# ---------------------------------------------------------------------------
Write-Step "Loading data into PostgreSQL"
Push-Location $Backend
try {
  & node scripts/load-graph.js
  Assert-LastExit "Loading the road graph"

  $rows = (Invoke-Psql $DbName @("-tAc", "SELECT count(*) FROM traffic_measurements")) -join ""
  if ($ReloadTraffic -or [int]$rows.Trim() -eq 0) {
    Write-Note "Loading data\traffic.csv (about 750,000 rows, takes a few minutes)..."
    & node scripts/load-traffic.js
    Assert-LastExit "Loading traffic data"
  } else {
    Write-Ok "Traffic already loaded ($($rows.Trim()) rows). Use -ReloadTraffic to load again."
  }

  if ($KeepIncidents) { & node scripts/seed-demo.js } else { & node scripts/seed-demo.js --reset }
  Assert-LastExit "Seeding demo users and incidents"

  & node scripts/check-db.js
  Assert-LastExit "Database check"
} finally { Pop-Location }

# ---------------------------------------------------------------------------
Write-Step "Setting up the ML service"
$VenvPy = Join-Path $Ml "venv\Scripts\python.exe"
if (-not (Test-Path $VenvPy)) {
  & $PyCmd[0] $PyCmd[1..9] -m venv (Join-Path $Ml "venv")
  Assert-LastExit "Creating ml-service\venv"
  Write-Ok "Created ml-service\venv"
}
# Only the packages the API needs (requirements.txt also lists data-generation tools like osmnx).
& $VenvPy -m pip install --disable-pip-version-check -q --upgrade pip
& $VenvPy -m pip install --disable-pip-version-check -q "pandas>=2.2" "numpy>=1.26" "scikit-learn>=1.5" "joblib>=1.3" "fastapi>=0.115" "uvicorn[standard]>=0.30"
Assert-LastExit "Installing ML packages"
Write-Ok "ML packages installed"

$Model15 = Join-Path $Ml "models\rf_15.joblib"
$Model30 = Join-Path $Ml "models\rf_30.joblib"
if ((Test-Path $Model15) -and (Test-Path $Model30)) {
  Write-Ok "Models already trained"
} elseif ($SkipTraining) {
  Write-Note "Skipped training (-SkipTraining). Predictions will use the baseline and signal simulation will not work."
} else {
  $freeGb = [math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1MB, 1)
  if ($freeGb -lt 4) {
    Write-Note "Only $freeGb GB of RAM is free. Close other apps (browsers, IDEs) before training to avoid running out of memory."
  }
  Write-Note ("Training the prediction models, started {0}. One time only; usually 5-15 minutes. Keep this window open." -f (Get-Date -Format "HH:mm"))
  $sw = [Diagnostics.Stopwatch]::StartNew()
  Push-Location $Ml
  try { & $VenvPy scripts\train_model.py; Assert-LastExit "Training the ML models" } finally { Pop-Location }
  Write-Ok ("Models trained in {0:N1} minutes" -f $sw.Elapsed.TotalMinutes)
}

# ---------------------------------------------------------------------------
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host "Start the demo with:  .\start.ps1"
Write-Host "Demo logins (password demo123): user@demo.test, admin@demo.test, ems@demo.test"
