@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" -NoPause
set "AGILENEST_EXIT_CODE=%ERRORLEVEL%"
if /I not "%~1"=="-NoPause" (
  echo.
  pause
)
exit /b %AGILENEST_EXIT_CODE%
