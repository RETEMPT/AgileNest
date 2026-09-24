param(
  [switch]$InitEnvOnly
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "=== AgileCampus setup (PowerShell) ==="

if ($InitEnvOnly) {
  if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
    # 生成 32 字节 base64 作为 AUTH_SECRET
    $secret = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    (Get-Content .env) -replace 'AUTH_SECRET=.*', "AUTH_SECRET=$secret" | Set-Content .env
    Write-Host "  已生成 .env 并写入随机 AUTH_SECRET"
  }
  exit 0
}

if (Get-Command docker -ErrorAction SilentlyContinue) {
  Write-Host "[1/5] 启动 Postgres ..."
  docker compose up -d
  Start-Sleep -Seconds 5
} else {
  Write-Host "[1/5] 未检测到 Docker，请确认本机 Postgres 已启动" -ForegroundColor Yellow
}

if (-not (Test-Path .env)) {
  Write-Host "[2/5] 生成 .env ..."
  & $PSCommandPath -InitEnvOnly
} else {
  Write-Host "[2/5] .env 已存在，跳过"
}

Write-Host "[3/5] 安装依赖 ..."
npm install
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "[4/5] 推送 schema ..."
npm run db:push
if ($LASTEXITCODE -ne 0) { exit 1 }
npm run db:push:test
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "[5/5] 种子数据 ..."
npm run db:seed

Write-Host ""
Write-Host "=== setup 完成，运行 .\start.ps1 启动 ===" -ForegroundColor Green
