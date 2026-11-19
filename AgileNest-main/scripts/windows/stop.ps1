param(
    [switch]$NoPause,
    [switch]$All,
    [switch]$StopDb,
    [switch]$OnlyDb,
    [ValidateRange(1024, 65535)][int]$WebPort = 3000
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$stopExitCode = 1
try {
    # Windows PowerShell 5.1 otherwise reads UTF-8 without BOM using the system ANSI encoding.
    $stopSource = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'stop-local.ps1'), [Text.Encoding]::UTF8)
    & ([scriptblock]::Create($stopSource)) -ProjectRoot $projectRoot -WebPort $WebPort -All:$All -StopDb:$StopDb -OnlyDb:$OnlyDb
    $stopExitCode = $LASTEXITCODE
} catch {
    Write-Host ('[ERROR] ' + $_.Exception.Message) -ForegroundColor Red
}
if ($stopExitCode -ne 0 -and !$NoPause) { [void](Read-Host 'Press Enter to close this window') }
exit $stopExitCode
