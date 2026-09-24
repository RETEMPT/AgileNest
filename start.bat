@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo === AgileCampus start (Windows) ===

where docker >nul 2>nul
if errorlevel 1 (
  echo [WARN] 未检测到 Docker，跳过起库。请确认 Postgres 已在跑。
) else (
  docker compose up -d
  timeout /t 3 /nobreak >nul
)

echo 启动 dev server: http://localhost:3000
call npm run dev
