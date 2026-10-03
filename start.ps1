param([switch]$NoPause)

$ErrorActionPreference = "Stop"
$startupExitCode = 1
try {
  # Windows PowerShell 5.1 reads BOM-less scripts as ANSI; load the shared UTF-8 source explicitly.
  $startupPath = Join-Path $PSScriptRoot "scripts\start-local.ps1"
  $startupSource = [System.IO.File]::ReadAllText($startupPath, [System.Text.Encoding]::UTF8)
  & ([scriptblock]::Create($startupSource)) -ProjectRoot $PSScriptRoot
  $startupExitCode = $LASTEXITCODE
} catch {
  Write-Host ("[ERROR] " + $_.Exception.Message) -ForegroundColor Red
}

if (-not $NoPause) {
  [void](Read-Host "Press Enter to close this window")
}
exit $startupExitCode
