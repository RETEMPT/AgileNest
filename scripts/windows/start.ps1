param(
    [switch]$NoPause,
    [switch]$Setup,
    [switch]$ConfigOnly,
    [switch]$NoBrowser,
    [ValidateRange(1024, 65535)][int]$WebPort = 3000
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$startupExitCode = 1
$websiteLock = $null
try {
    New-Item -ItemType Directory -Path (Join-Path $projectRoot '.tools') -Force | Out-Null
    try { $websiteLock = [IO.File]::Open((Join-Path $projectRoot '.tools/website.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw 'Another launcher is running. Close its window before starting again.' }
    $needsSetup = !(Test-Path -LiteralPath (Join-Path $projectRoot '.env')) -or
        !(Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules/next/dist/bin/next'))
    if ($Setup -or $ConfigOnly -or $needsSetup) {
        & (Join-Path $PSScriptRoot 'setup.ps1') -ProjectRoot $projectRoot -InitEnvOnly:$ConfigOnly
        if ($LASTEXITCODE -ne 0) { throw 'Setup failed. Check the messages above and docs/WINDOWS.md.' }
    }
    if ($ConfigOnly) { exit 0 }
    # Windows PowerShell 5.1 otherwise reads UTF-8 without BOM using the system ANSI encoding.
    $startupSource = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'start-local.ps1'), [Text.Encoding]::UTF8)
    & ([scriptblock]::Create($startupSource)) -ProjectRoot $projectRoot -WebPort $WebPort -NoBrowser:$NoBrowser
    $startupExitCode = $LASTEXITCODE
} catch {
    Write-Host ('[ERROR] ' + $_.Exception.Message) -ForegroundColor Red
} finally {
    if ($websiteLock) { $websiteLock.Dispose() }
}
if ($startupExitCode -ne 0 -and !$NoPause) { [void](Read-Host 'Press Enter to close this window') }
exit $startupExitCode
