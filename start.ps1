$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

Write-Host "=== AgileCampus start (PowerShell) ==="

if (Get-Command docker -ErrorAction SilentlyContinue) {
  docker compose up -d
  Start-Sleep -Seconds 3
}

Write-Host "启动 dev server: http://localhost:3000"
npm run dev
