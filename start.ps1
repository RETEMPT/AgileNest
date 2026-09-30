$ErrorActionPreference = "Continue"
Set-Location -Path $PSScriptRoot

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host "  AgileNest · 高校轻量敏捷项目管理服务启动 (PowerShell)" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan

$pgCtl = Join-Path $PSScriptRoot ".tools\pgsql\pgsql\bin\pg_ctl.exe"
$pgIsReady = Join-Path $PSScriptRoot ".tools\pgsql\pgsql\bin\pg_isready.exe"
$pgData = Join-Path $PSScriptRoot ".tools\pgdata"
$pgLog = Join-Path $PSScriptRoot ".tools\pg.log"

$dbReady = $false
if (Test-Path $pgIsReady) {
  & $pgIsReady -h 127.0.0.1 -p 5432 | Out-Null
  if ($LASTEXITCODE -eq 0) {
    $dbReady = $true
  }
}

if ($dbReady) {
  Write-Host "[1/3] 数据库已在运行 (127.0.0.1:5432)，就绪。" -ForegroundColor Green
} elseif (Test-Path $pgCtl) {
  Write-Host "[1/3] 正在启动内置便携式 Postgres..." -ForegroundColor Yellow
  & $pgCtl start -D $pgData -l $pgLog | Out-Null
  Write-Host "      等待数据库完全就绪..."
  for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $pgIsReady) {
      & $pgIsReady -h 127.0.0.1 -p 5432 | Out-Null
      if ($LASTEXITCODE -eq 0) {
        $dbReady = $true
        break
      }
    }
  }
  if ($dbReady) {
    Write-Host "[1/3] 内置 Postgres 启动成功且已接受连接。" -ForegroundColor Green
  } else {
    Write-Host "[WARN] Postgres 启动等待超时，请检查 .tools\pg.log" -ForegroundColor Yellow
  }
} elseif (Get-Command docker -ErrorAction SilentlyContinue) {
  Write-Host "[1/3] 启动 Docker Postgres 容器..." -ForegroundColor Yellow
  docker compose up -d
  Start-Sleep -Seconds 3
} else {
  Write-Host "[WARN] 未检测到 Docker 或内置数据库，请确认本地 Postgres (5432) 已启动" -ForegroundColor Yellow
}

# 检查 3000 端口
$port3000 = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($port3000) {
  Write-Host "[2/3] [提示] 发现端口 3000 已被占用，若需重启旧进程请先运行 .\stop.ps1" -ForegroundColor Yellow
} else {
  Write-Host "[2/3] 端口 3000 空闲就绪。" -ForegroundColor Green
}

Write-Host "[3/3] 启动 Next.js 开发服务器: http://localhost:3000" -ForegroundColor Cyan
Write-Host "      按 Ctrl+C 可停止前端；停止全部服务请运行 .\stop.ps1"
Write-Host "====================================================" -ForegroundColor Cyan
npm run dev
