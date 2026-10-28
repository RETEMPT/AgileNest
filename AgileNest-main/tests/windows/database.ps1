$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$fixtureRoot = Join-Path $projectRoot ('.tools/database-test-' + [guid]::NewGuid().ToString('N') + ' with spaces')
$owners = @()
try {
    New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
    $executable = Join-Path $fixtureRoot 'pg_ctl.exe'
    Add-Type -OutputAssembly $executable -OutputType ConsoleApplication -TypeDefinition @'
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
public static class DatabaseFixture {
    public static void Main(string[] args) {
        if (args[0] == "worker") { Thread.Sleep(60000); return; }
        string directory = args[Array.IndexOf(args, "-D") + 1];
        if (directory.EndsWith("failure")) { Console.Error.WriteLine("fixture failure"); Environment.Exit(1); }
        if (directory.EndsWith("timeout")) { Thread.Sleep(60000); return; }
        var child = Process.Start(new ProcessStartInfo {
            FileName = typeof(DatabaseFixture).Assembly.Location, Arguments = "worker", UseShellExecute = false, CreateNoWindow = true
        });
        File.WriteAllText(Path.Combine(directory, "worker.pid"), child.Id.ToString());
        Console.WriteLine("server started");
    }
}
'@
    $runnerPath = Join-Path $fixtureRoot 'runner.ps1'
    [IO.File]::WriteAllText($runnerPath, @'
param($Helper, $PgCtl, $Data, $Log, $Result)
$ErrorActionPreference = 'Stop'
. $Helper
try {
    Start-BundledPostgres -PgCtl $PgCtl -DataDirectory $Data -LogFile $Log -TimeoutSeconds 1
    [IO.File]::WriteAllText($Result, 'ready')
} catch {
    [IO.File]::WriteAllText($Result, $_.Exception.Message)
    exit 1
}
'@)
    foreach ($scenario in @('success', 'failure', 'timeout')) {
        $directory = Join-Path $fixtureRoot $scenario
        New-Item -ItemType Directory -Path $directory | Out-Null
        $resultPath = Join-Path $directory 'result.txt'
        $log = Join-Path $directory 'postgres.log'
        $arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $runnerPath + '" -Helper "' + (Join-Path $projectRoot 'scripts/windows/database-process.ps1') + '" -PgCtl "' + $executable + '" -Data "' + $directory + '" -Log "' + $log + '" -Result "' + $resultPath + '"'
        $owner = Start-Process powershell.exe -ArgumentList $arguments -WindowStyle Hidden -RedirectStandardOutput (Join-Path $directory 'runner.log') -RedirectStandardError (Join-Path $directory 'runner-error.log') -PassThru
        $owners += $owner
        $null = $owner.Handle
        if (!$owner.WaitForExit(15000)) { throw "Database startup stalled: $scenario" }
        $result = Get-Content -LiteralPath $resultPath -Raw
        if ($scenario -eq 'success') {
            $workerId = [int](Get-Content -LiteralPath (Join-Path $directory 'worker.pid'))
            $worker = Get-Process -Id $workerId -ErrorAction Stop
            if ($owner.ExitCode -ne 0 -or $result -ne 'ready' -or $worker.HasExited) { throw "Startup did not continue while the database worker survived (exit=$($owner.ExitCode), result=$result, workerExited=$($worker.HasExited))." }
        } else {
            $expected = if ($scenario -eq 'failure') { 'startup failed' } else { 'startup timed out' }
            if ($owner.ExitCode -ne 1 -or !$result.Contains($expected)) { throw "Startup did not report $scenario : $result" }
            if ($scenario -eq 'failure' -and !(Select-String -LiteralPath ($log + '.startup-error.log') -SimpleMatch 'fixture failure')) { throw 'Startup error log was lost.' }
        }
        Write-Host "PASS: database startup $scenario (bounded wait, inherited output handles, paths with spaces)."
    }
} finally {
    foreach ($owner in $owners) { if (!$owner.HasExited) { Stop-Process -Id $owner.Id -Force } }
    foreach ($pidFile in @(Get-ChildItem -LiteralPath $fixtureRoot -Filter worker.pid -Recurse -ErrorAction SilentlyContinue)) {
        $workerId = [int](Get-Content -LiteralPath $pidFile.FullName)
        $worker = Get-Process -Id $workerId -ErrorAction SilentlyContinue
        if ($worker -and $worker.Path -eq $executable) { Stop-Process -Id $worker.Id -Force }
    }
    $resolved = [IO.Path]::GetFullPath($fixtureRoot)
    $allowedRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '.tools')) + [IO.Path]::DirectorySeparatorChar
    if (!$resolved.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Fixture cleanup is outside .tools.' }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
