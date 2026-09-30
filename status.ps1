$ErrorActionPreference = "Continue"
Set-Location -Path $PSScriptRoot

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  AgileNest · 服务状态自检 (PowerShell)" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

$pgIsReady = Join-Path $PSScriptRoot ".tools\pgsql\pgsql\bin\pg_isready.exe"
$dbOk = $false

if (Test-Path $pgIsReady) {
  & $pgIsReady -h 127.0.0.1 -p 5432 | Out-Null
  if ($LASTEXITCODE -eq 0) { $dbOk = $true }
} else {
  $conn = Get-NetTCPConnection -LocalPort 5432 -State Listen -ErrorAction SilentlyContinue
  if ($conn) { $dbOk = $true }
}

if ($dbOk) {
  Write-Host "[Postgres 5432]   正常在线 (Online)" -ForegroundColor Green
} else {
  Write-Host "[Postgres 5432]   服务离线 (Offline)" -ForegroundColor Red
}

$webConn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($webConn) {
  Write-Host "[Next.js 3000]    正在运行 (http://localhost:3000)" -ForegroundColor Green
  try {
    $res = Invoke-RestMethod -Uri "http://localhost:3000/api/health" -TimeoutSec 3 -ErrorAction SilentlyContinue
    if ($res.status -eq "ok") {
      Write-Host "                  健康检查端点通过 (DB Latency: $($res.db.latencyMs)ms)" -ForegroundColor Green
    }
  } catch {}
} else {
  Write-Host "[Next.js 3000]    服务离线 (Offline)" -ForegroundColor Yellow
}

Write-Host "====================================================" -ForegroundColor Cyan
