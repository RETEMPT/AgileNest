@echo off
chcp 65001 >nul
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0launcher\start-release.ps1" -Stop
if errorlevel 1 pause
