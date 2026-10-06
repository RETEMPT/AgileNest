param(
    [switch]$Stop,
    [switch]$NoBrowser,
    [ValidateRange(1024, 65535)][int]$WebPort = 3000,
    [ValidateRange(1024, 65535)][int]$DbPort = 55432
)
$ErrorActionPreference = 'Stop'
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$dataPath = Join-Path $releaseRoot 'data'
$logPath = Join-Path $dataPath 'logs'
$configPath = Join-Path $dataPath 'config.json'
$statePath = Join-Path $dataPath 'server.json'
$nodePath = [IO.Path]::GetFullPath((Join-Path $releaseRoot 'runtime/node/node.exe'))
$pgBin = [IO.Path]::GetFullPath((Join-Path $releaseRoot 'runtime/pgsql/bin'))
$pgData = Join-Path $dataPath 'pgdata'
$pgCtl = Join-Path $pgBin 'pg_ctl.exe'
$serverFile = [IO.Path]::GetFullPath((Join-Path $releaseRoot 'app/server.js'))
$launcherLock = $null
$startedDatabase = $false
$webProcess = $null
$driveStatePath = Join-Path $dataPath 'runtime-drive.json'
$runtimeDrive = $null
$createdDrive = $false

Add-Type -TypeDefinition @'
using System.Runtime.InteropServices;
using System.Text;
public static class AgileNestDrive {
    [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
    public static extern uint QueryDosDevice(string name, StringBuilder target, int capacity);
}
'@
function Get-DriveTarget([string]$Drive) {
    $buffer = New-Object Text.StringBuilder 4096
    if ([AgileNestDrive]::QueryDosDevice($Drive, $buffer, $buffer.Capacity) -eq 0) { return $null }
    return $buffer.ToString()
}
function Remove-OwnedDrive {
    if ($runtimeDrive -and (Get-DriveTarget $runtimeDrive) -eq "\??\$releaseRoot") {
        & subst.exe $runtimeDrive /d
        if ($LASTEXITCODE -eq 0) { Remove-Item -LiteralPath $driveStatePath -ErrorAction SilentlyContinue }
    }
}
function Set-DatabasePaths {
    if ($releaseRoot -notmatch '[^\x00-\x7f]') { return }
    # PostgreSQL's Windows bootstrap needs ASCII executable and data paths.
    if (Test-Path -LiteralPath $driveStatePath) {
        $previousDrive = (Get-Content -LiteralPath $driveStatePath -Raw | ConvertFrom-Json).drive
        if ((Get-DriveTarget $previousDrive) -eq "\??\$releaseRoot") { $script:runtimeDrive = $previousDrive }
    }
    if (!$script:runtimeDrive -and !$Stop) {
        foreach ($letter in @('Z', 'Y', 'X', 'W', 'V', 'U', 'T', 'S', 'R')) {
            $candidateDrive = "$($letter):"
            if (Get-DriveTarget $candidateDrive) { continue }
            & subst.exe $candidateDrive $releaseRoot
            if ($LASTEXITCODE -ne 0) { continue }
            if ((Get-DriveTarget $candidateDrive) -ne "\??\$releaseRoot") { throw 'Temporary runtime drive does not match this package.' }
            $script:runtimeDrive = $candidateDrive
            $script:createdDrive = $true
            @{ drive = $candidateDrive } | ConvertTo-Json | Set-Content -LiteralPath $driveStatePath -Encoding UTF8
            break
        }
        if (!$script:runtimeDrive) { throw 'No temporary drive is available. Extract the package to an ASCII-only path.' }
    }
    if ($script:runtimeDrive) {
        $script:pgBin = "$($script:runtimeDrive)\runtime\pgsql\bin"
        $script:pgData = "$($script:runtimeDrive)\data\pgdata"
        $script:pgCtl = Join-Path $script:pgBin 'pg_ctl.exe'
    }
}

function New-Secret {
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}
function Test-Port([int]$Port) {
    $client = New-Object Net.Sockets.TcpClient
    try { $client.Connect('127.0.0.1', $Port); return $true }
    catch { return $false }
    finally { $client.Dispose() }
}
function Get-OwnedServer {
    if (!(Test-Path -LiteralPath $statePath)) { return $null }
    $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
    $process = Get-Process -Id $state.pid -ErrorAction SilentlyContinue
    if (!$process -or $process.Path -ne $nodePath -or $process.StartTime.ToUniversalTime().Ticks.ToString() -ne $state.startedAt) { return $null }
    $details = Get-CimInstance Win32_Process -Filter "ProcessId = $($state.pid)"
    if (!$details -or !$details.CommandLine.Replace('/', '\').Contains($serverFile)) { return $null }
    return @{ Process = $process; Url = $state.url }
}
function Test-OwnedDatabase {
    $pidFile = Join-Path $pgData 'postmaster.pid'
    if (!(Test-Path -LiteralPath $pidFile)) { return $false }
    $databasePid = 0
    if (![int]::TryParse((Get-Content -LiteralPath $pidFile -TotalCount 1), [ref]$databasePid)) { return $false }
    $process = Get-Process -Id $databasePid -ErrorAction SilentlyContinue
    if (!$process -or $process.Path -ne (Join-Path $pgBin 'postgres.exe')) { return $false }
    $details = Get-CimInstance Win32_Process -Filter "ProcessId = $databasePid"
    return $details -and $details.CommandLine.Replace('/', '\').Contains($pgData)
}
function Wait-Web([string]$Url) {
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        try { $response = Invoke-WebRequest -UseBasicParsing -Uri "$Url/login" -TimeoutSec 2; if ($response.StatusCode -eq 200) { return } } catch {}
        if ($webProcess -and $webProcess.HasExited) { throw 'Web server exited. See data\logs\web-error.log.' }
        Start-Sleep -Milliseconds 500
    }
    throw 'Web server timed out. See data\logs.'
}

try {
    if (![Environment]::Is64BitOperatingSystem) { throw 'Windows 10/11 x64 is required.' }
    New-Item -ItemType Directory -Path $logPath -Force | Out-Null
    try { $launcherLock = [IO.File]::Open((Join-Path $dataPath 'launcher.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw 'Another launcher is running. Please try again shortly.' }
    Set-DatabasePaths
    $owned = Get-OwnedServer
    if ($Stop) {
        if ($owned) { Stop-Process -Id $owned.Process.Id; $owned.Process.WaitForExit(10000) | Out-Null }
        if (Test-OwnedDatabase) {
            & $pgCtl -D $pgData -m fast -w stop
            if ($LASTEXITCODE -ne 0) { throw 'Database stop failed. See data\logs.' }
        }
        if (Test-Path -LiteralPath $statePath) { Remove-Item -LiteralPath $statePath }
        Remove-OwnedDrive
        Write-Host 'AgileNest stopped. Your records are preserved in data.'
        exit 0
    }
    if ($owned) {
        Wait-Web $owned.Url
        Write-Host "AgileNest is already running: $($owned.Url)"
        if (!$NoBrowser) { Start-Process "$($owned.Url)/login" }
        exit 0
    }
    if (!(Test-Path -LiteralPath $configPath)) {
        @{ dbPassword = New-Secret; authSecret = New-Secret; dbPort = $DbPort } | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
    }
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if (Test-Port $WebPort) { throw "Web port $WebPort is in use. Stop the old instance or choose another -WebPort. Other processes were not stopped." }
    if (!(Test-Path -LiteralPath (Join-Path $pgData 'PG_VERSION'))) {
        $passwordFile = Join-Path $dataPath 'init-password.tmp'
        [IO.File]::WriteAllText($passwordFile, $config.dbPassword, (New-Object Text.UTF8Encoding($false)))
        try {
            $runtimePasswordFile = if ($runtimeDrive) { "$runtimeDrive\data\init-password.tmp" } else { $passwordFile }
            $init = Start-Process -FilePath (Join-Path $pgBin 'initdb.exe') -ArgumentList @('-D', ('"' + $pgData + '"'), '-U', 'agilenest', '--encoding=UTF8', '--locale=C', '--auth=scram-sha-256', ('--pwfile="' + $runtimePasswordFile + '"')) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logPath 'initdb.log') -RedirectStandardError (Join-Path $logPath 'initdb-error.log') -Wait -PassThru
            if ($init.ExitCode -ne 0) { throw 'Database initialization failed. See data\logs\initdb-error.log.' }
        } finally { Remove-Item -LiteralPath $passwordFile -ErrorAction SilentlyContinue }
    }
    if (!(Test-OwnedDatabase)) {
        if (Test-Port $config.dbPort) { throw "Database port $($config.dbPort) is in use. Set dbPort in data\config.json to an available port." }
        Write-Host 'Starting local database...'
        & $pgCtl -D $pgData -l (Join-Path $logPath 'postgres.log') -o "-h 127.0.0.1 -p $($config.dbPort)" -w start
        if ($LASTEXITCODE -ne 0) { throw 'Database start failed. See data\logs\postgres.log.' }
        $startedDatabase = $true
    }
    # These variables apply only to child processes, never to machine settings.
    $env:DATABASE_URL = "postgres://agilenest:$($config.dbPassword)@127.0.0.1:$($config.dbPort)/agilenest"
    $env:AUTH_SECRET = $config.authSecret
    $env:AUTH_TRUST_HOST = 'true'
    $env:HOSTNAME = '127.0.0.1'
    $env:PORT = $WebPort.ToString()
    $env:NODE_ENV = 'production'
    $env:NEXT_TELEMETRY_DISABLED = '1'
    $env:AGILECAMPUS_URL = "http://localhost:$WebPort"
    $env:AUTH_URL = $env:AGILECAMPUS_URL
    Remove-Item Env:FEISHU_APP_ID, Env:FEISHU_APP_SECRET -ErrorAction SilentlyContinue
    $bootstrap = Start-Process -FilePath $nodePath -ArgumentList ('"' + (Join-Path $PSScriptRoot 'bootstrap.mjs') + '"') -WorkingDirectory $releaseRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logPath 'bootstrap.log') -RedirectStandardError (Join-Path $logPath 'bootstrap-error.log') -Wait -PassThru
    if ($bootstrap.ExitCode -ne 0) { throw 'Database upgrade failed. See data\logs\bootstrap-error.log. Existing records were preserved.' }
    $webProcess = Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverFile + '"') -WorkingDirectory (Join-Path $releaseRoot 'app') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logPath 'web.log') -RedirectStandardError (Join-Path $logPath 'web-error.log') -PassThru
    @{ pid = $webProcess.Id; startedAt = $webProcess.StartTime.ToUniversalTime().Ticks.ToString(); url = $env:AGILECAMPUS_URL } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
    Wait-Web $env:AGILECAMPUS_URL
    Write-Host "AgileNest is ready: $($env:AGILECAMPUS_URL)"
    Write-Host 'Demo: admin@agilecampus.local / password123 (see RELEASE.md for other accounts)'
    Write-Host 'Closing this window keeps the website running. Double-click stop.bat to stop.'
    if (!$NoBrowser) { Start-Process "$($env:AGILECAMPUS_URL)/login" }
} catch {
    if ($webProcess -and !$webProcess.HasExited) { Stop-Process -Id $webProcess.Id -ErrorAction SilentlyContinue }
    if ($startedDatabase) { & $pgCtl -D $pgData -m fast -w stop *> $null }
    if ($createdDrive -and !(Test-OwnedDatabase)) { Remove-OwnedDrive }
    Write-Host "Start/stop failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    if ($launcherLock) { $launcherLock.Dispose() }
}
