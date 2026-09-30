@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
cd /d "%~dp0"

echo ====================================================
echo   AgileNest · 停止本地服务进程 (Windows)
echo ====================================================

rem 1. 停止监听 3000 端口的前端 Node 进程
echo [1/3] 检查并停止端口 3000 (Next.js) 进程 ...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr /R /C:":3000 .*LISTENING"') do (
  echo       终止 PID: %%a
  taskkill /F /PID %%a >nul 2>nul
)

rem 2. 停止内置 Postgres 服务
if exist "%~dp0.tools\pgsql\pgsql\bin\pg_ctl.exe" (
  echo [2/3] 检查并停止内置 Postgres ...
  "%~dp0.tools\pgsql\pgsql\bin\pg_ctl.exe" status -D "%~dp0.tools\pgdata" >nul 2>nul
  if not errorlevel 1 (
    "%~dp0.tools\pgsql\pgsql\bin\pg_ctl.exe" stop -D "%~dp0.tools\pgdata" -m fast
    echo       内置 Postgres 已安全停止。
  ) else (
    echo       内置 Postgres 未在运行。
  )
)

rem 3. 停止 Docker 容器（如果存在）
where docker >nul 2>nul
if not errorlevel 1 (
  echo [3/3] 检查并停止 Docker 容器 ...
  docker compose stop >nul 2>nul
)

echo ====================================================
echo   服务已全部安全停止，端口 3000 / 5432 已释放。
echo ====================================================
