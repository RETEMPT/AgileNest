@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ====================================================
echo   AgileNest · 服务状态自检 [Windows]
echo ====================================================

rem 检查数据库
if exist "%~dp0.tools\pgsql\pgsql\bin\pg_isready.exe" (
  "%~dp0.tools\pgsql\pgsql\bin\pg_isready.exe" -h 127.0.0.1 -p 5432 >nul 2>nul
  if not errorlevel 1 (
    echo [数据库 5432] 正常在线 - 接收连接正常
    goto :check_web
  ) else (
    echo [数据库 5432] 服务离线 - 未启动或拒绝连接
    goto :check_web
  )
)

netstat -ano | findstr /R /C:":5432 .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo [数据库 5432] 正在监听
) else (
  echo [数据库 5432] 未检测到监听
)

:check_web
rem 检查 Web 服务
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo [Web 服务 3000] 正在运行 - http://localhost:3000
) else (
  echo [Web 服务 3000] 服务离线 - 端口未监听
)

echo ====================================================
