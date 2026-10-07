param(
  [string]$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..')),
  [switch]$InitEnvOnly
)

$ErrorActionPreference = "Stop"
Set-Location -LiteralPath $ProjectRoot

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
    $environmentTemplate = [IO.File]::ReadAllText((Join-Path $ProjectRoot ".env.example"), [Text.Encoding]::UTF8)
    $environmentContent = $environmentTemplate -replace '(?m)^AUTH_SECRET=[^\r\n]*', "AUTH_SECRET=$secret"
    [IO.File]::WriteAllText((Join-Path $ProjectRoot ".env"), $environmentContent, (New-Object Text.UTF8Encoding $false))
    Write-Host "  Created .env with a random AUTH_SECRET."
  }
  if (-not (Test-Path .env.test)) {
    Copy-Item -LiteralPath .env.test.example -Destination .env.test
    Write-Host "  Created .env.test from .env.test.example."
  }
  exit 0
}

& $PSCommandPath -ProjectRoot $ProjectRoot -InitEnvOnly
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$pgCtl = Join-Path $ProjectRoot ".tools\pgsql\pgsql\bin\pg_ctl.exe"
$pgData = Join-Path $ProjectRoot ".tools\pgdata"
$pgLog = Join-Path $ProjectRoot ".tools\pg.log"

if (Test-Path $pgCtl) {
  Write-Host "[1/5] Starting bundled Postgres..."
  & $pgCtl status -D $pgData | Out-Null
  if ($LASTEXITCODE -ne 0) {
    & $pgCtl start -D $pgData -l $pgLog
    if ($LASTEXITCODE -ne 0) { throw 'Postgres start failed. See .tools/pg.log.' }
  }
} elseif (Get-Command docker -ErrorAction SilentlyContinue) {
  Write-Host "[1/5] Starting Docker Postgres..."
  & docker.exe compose up -d db
  if ($LASTEXITCODE -ne 0) { throw 'Docker database start failed.' }
  Start-Sleep -Seconds 5
} else {
  Write-Host "[1/5] Docker unavailable; make sure your local Postgres is running." -ForegroundColor Yellow
}

Write-Host "[2/5] .env / .env.test are ready; existing settings were preserved."

Write-Host "[3/5] Installing dependencies..."
& npm.cmd ci
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "[4/5] Applying schema..."
& npm.cmd run db:push
if ($LASTEXITCODE -ne 0) { exit 1 }
& npm.cmd run db:push:test
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "[5/5] Creating demo data only for an empty database..."
& node.exe (Join-Path $PSScriptRoot 'seed-if-empty.mjs')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "=== Setup complete. Starting with start.bat. ===" -ForegroundColor Green
