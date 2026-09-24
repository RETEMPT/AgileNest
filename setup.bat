@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo === AgileCampus setup (Windows) ===

where docker >nul 2>nul
if errorlevel 1 (
  echo [WARN] 未检测到 Docker。请安装 Docker Desktop，或改用本机 Postgres 并填写 .env
) else (
  echo [1/5] 启动 Postgres ...
  docker compose up -d
  echo       等待数据库就绪 ...
  timeout /t 5 /nobreak >nul
)

if not exist .env (
  echo [2/5] 生成 .env ...
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" -InitEnvOnly
) else (
  echo [2/5] .env 已存在，跳过
)

echo [3/5] 安装依赖 ...
call npm install
if errorlevel 1 goto :fail

echo [4/5] 推送 schema 到 dev / test 库 ...
call npm run db:push
if errorlevel 1 goto :fail
call npm run db:push:test
if errorlevel 1 goto :fail

echo [5/5] 种子数据（可选）...
call npm run db:seed

echo.
echo === setup 完成，双击 start.bat 启动 ===
exit /b 0

:fail
echo.
echo [ERROR] setup 失败，请看上方报错。
exit /b 1
