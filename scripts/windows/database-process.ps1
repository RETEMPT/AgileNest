function Start-BundledPostgres {
    param(
        [Parameter(Mandatory = $true)][string]$PgCtl,
        [Parameter(Mandatory = $true)][string]$DataDirectory,
        [Parameter(Mandatory = $true)][string]$LogFile,
        [string]$ServerOptions,
        [ValidateRange(1, 300)][int]$TimeoutSeconds = 30
    )
    $arguments = 'start -D "' + $DataDirectory + '" -l "' + $LogFile + '" -w -t ' + $TimeoutSeconds
    if ($ServerOptions) { $arguments += ' -o "' + $ServerOptions + '"' }
    # postgres inherits pipe handles on Windows; wait for pg_ctl, never for pipe EOF or its descendants.
    $process = Start-Process -FilePath $PgCtl -ArgumentList $arguments -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput ($LogFile + '.startup.log') -RedirectStandardError ($LogFile + '.startup-error.log')
    try {
        # PowerShell 5.1 needs a retained handle to read ExitCode after a short-lived process exits.
        $null = $process.Handle
        if (!$process.WaitForExit(($TimeoutSeconds + 5) * 1000)) {
            $process.Kill()
            throw "Postgres startup timed out. See $LogFile and $LogFile.startup-error.log."
        }
        if ($process.ExitCode -ne 0) {
            throw "Postgres startup failed (exit $($process.ExitCode)). See $LogFile and $LogFile.startup-error.log."
        }
    } finally { $process.Dispose() }
}

function Stop-BundledPostgres {
    param(
        [Parameter(Mandatory = $true)][string]$PgCtl,
        [Parameter(Mandatory = $true)][string]$DataDirectory,
        [ValidateRange(1, 300)][int]$TimeoutSeconds = 15
    )
    $pidFile = Join-Path $DataDirectory "postmaster.pid"
    if (!(Test-Path -LiteralPath $pidFile)) {
        return
    }
    try {
        $firstLine = (Get-Content -LiteralPath $pidFile -TotalCount 1).Trim()
        $pgPid = [int]$firstLine
        $proc = Get-Process -Id $pgPid -ErrorAction SilentlyContinue
        if (!$proc) {
            # Stale postmaster.pid from an earlier terminated instance
            Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue
            return
        }
    } catch {}
    $arguments = 'stop -D "' + $DataDirectory + '" -m fast -w -t ' + $TimeoutSeconds
    $process = Start-Process -FilePath $PgCtl -ArgumentList $arguments -WindowStyle Hidden -PassThru
    try {
        $null = $process.Handle
        if (!$process.WaitForExit(($TimeoutSeconds + 5) * 1000)) {
            $process.Kill()
            throw "Postgres stop timed out."
        }
    } finally { $process.Dispose() }
}
