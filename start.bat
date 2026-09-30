@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo ====================================================
echo   AgileNest · 高校轻量敏捷项目管理服务启动
echo ====================================================

rem 1. 检查数据库是否已经在运行
if exist "%~dp0.tools\pgsql\pgsql\bin\pg_isready.exe" (
  "%~dp0.tools\pgsql\pgsql\bin\pg_isready.exe" -h 127.0.0.1 -p 5432 >nul 2>nul
  if not errorlevel 1 (
    echo [1/3] 数据库已在运行 [127.0.0.1:5432]，就绪。
    goto :check_web
  )
)

rem 2. 优先启动内置便携式 Postgres
if not exist "%~dp0.tools\pgsql\pgsql\bin\pg_ctl.exe" goto :try_docker
echo [1/3] 检测到内置便携式 Postgres，正在启动 ...
"%~dp0.tools\pgsql\pgsql\bin\pg_ctl.exe" start -D "%~dp0.tools\pgdata" -l "%~dp0.tools\pg.log"
echo       等待数据库完全就绪 ...

set TRIES=0
:wait_pg
timeout /t 1 /nobreak >nul
"%~dp0.tools\pgsql\pgsql\bin\pg_isready.exe" -h 127.0.0.1 -p 5432 >nul 2>nul
if not errorlevel 1 (
  echo [1/3] 内置 Postgres 启动成功且已接受连接。
  goto :check_web
)
set /a TRIES+=1
if %TRIES% lss 10 goto :wait_pg
echo [WARN] Postgres 启动耗时较长，请检查 .tools\pg.log
goto :check_web

:try_docker
rem 3. 降级尝试 Docker
where docker >nul 2>nul
if errorlevel 1 (
  echo [WARN] 未检测到 Docker 或内置数据库，请确保本地已有 Postgres 监听 127.0.0.1:5432
  goto :check_web
)
echo [1/3] 启动 Docker Postgres 容器 ...
docker compose up -d
timeout /t 3 /nobreak >nul

:check_web
rem 4. 检查 3000 端口是否已被旧进程占用
netstat -ano | findstr /R /C:":3000 .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo [2/3] [提示] 发现 3000 端口已被占用，若需重启请先运行 stop.bat
) else (
  echo [2/3] 端口 3000 空闲就绪。
)

echo [3/3] 启动 Next.js 开发服务器: http://localhost:3000
echo       按 Ctrl+C 可停止前端；停止全部服务请运行 stop.bat
echo ====================================================
call npm run dev
