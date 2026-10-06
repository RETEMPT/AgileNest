param(
  [switch]$InitEnvOnly
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "=== AgileCampus setup (PowerShell) ==="

if ($InitEnvOnly) {
  if (-not (Test-Path .env)) {
    $secretBytes = New-Object byte[] 32
    $randomGenerator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try {
      $randomGenerator.GetBytes($secretBytes)
    } finally {
      $randomGenerator.Dispose()
    }
    $secret = [Convert]::ToBase64String($secretBytes)
    $environmentTemplate = [IO.File]::ReadAllText((Join-Path $PSScriptRoot ".env.example"), [Text.Encoding]::UTF8)
    $environmentContent = $environmentTemplate -replace '(?m)^AUTH_SECRET=[^\r\n]*', "AUTH_SECRET=$secret"
    [IO.File]::WriteAllText((Join-Path $PSScriptRoot ".env"), $environmentContent, (New-Object Text.UTF8Encoding $false))
    Write-Host "  Created .env with a random AUTH_SECRET."
  }
  if (-not (Test-Path .env.test)) {
    Copy-Item -LiteralPath .env.test.example -Destination .env.test
    Write-Host "  Created .env.test from .env.test.example."
  }
  exit 0
}

& $PSCommandPath -InitEnvOnly
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$pgCtl = Join-Path $PSScriptRoot ".tools\pgsql\pgsql\bin\pg_ctl.exe"
$pgData = Join-Path $PSScriptRoot ".tools\pgdata"
$pgLog = Join-Path $PSScriptRoot ".tools\pg.log"

if (Test-Path $pgCtl) {
  Write-Host "[1/5] Starting bundled Postgres..."
  & $pgCtl status -D $pgData | Out-Null
  if ($LASTEXITCODE -ne 0) {
    & $pgCtl start -D $pgData -l $pgLog
    Start-Sleep -Seconds 3
  }
} elseif (Get-Command docker -ErrorAction SilentlyContinue) {
  Write-Host "[1/5] Starting Docker Postgres..."
  docker compose up -d
  Start-Sleep -Seconds 5
} else {
  Write-Host "[1/5] Docker unavailable; make sure your local Postgres is running." -ForegroundColor Yellow
}

Write-Host "[2/5] .env / .env.test are ready; existing settings were preserved."

Write-Host "[3/5] Installing dependencies..."
& npm.cmd install
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "[4/5] Applying schema..."
& npm.cmd run db:push
if ($LASTEXITCODE -ne 0) { exit 1 }
& npm.cmd run db:push:test
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "[5/5] Seeding demo data..."
& npm.cmd run db:seed
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "=== Setup complete. Run .\start.ps1 to start. ===" -ForegroundColor Green
