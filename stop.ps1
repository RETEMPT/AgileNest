$ErrorActionPreference = "Continue"
Set-Location -Path $PSScriptRoot

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  AgileNest · 停止本地服务进程 (PowerShell)" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

# 1. 停止占用 3000 端口的进程
Write-Host "[1/3] 检查端口 3000 (Next.js) 进程..." -ForegroundColor Yellow
$conn = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
  foreach ($c in $conn) {
    Write-Host "      终止 PID: $($c.OwningProcess)"
    Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
  }
} else {
  Write-Host "      端口 3000 未被占用。"
}

# 2. 停止内置 Postgres
$pgCtl = Join-Path $PSScriptRoot ".tools\pgsql\pgsql\bin\pg_ctl.exe"
$pgData = Join-Path $PSScriptRoot ".tools\pgdata"

if (Test-Path $pgCtl) {
  Write-Host "[2/3] 检查内置 Postgres 状态..." -ForegroundColor Yellow
  & $pgCtl status -D $pgData | Out-Null
  if ($LASTEXITCODE -eq 0) {
    & $pgCtl stop -D $pgData -m fast
    Write-Host "      内置 Postgres 已安全停止。" -ForegroundColor Green
  } else {
    Write-Host "      内置 Postgres 未在运行。"
  }
}

# 3. 停止 Docker 容器（如果有）
if (Get-Command docker -ErrorAction SilentlyContinue) {
  Write-Host "[3/3] 停止 Docker 容器..." -ForegroundColor Yellow
  docker compose stop | Out-Null
}

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  服务已全部安全停止，端口 3000 / 5432 已释放。" -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Cyan
