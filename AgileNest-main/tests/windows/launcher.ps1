$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$fixtureName = ([string][char]0x542f + [char]0x52a8) + ' launcher-test-' + [guid]::NewGuid().ToString('N')
$fixtureRoot = Join-Path $projectRoot ('.tools/' + $fixtureName)
$nodePath = (Get-Command node.exe).Source
$utf8 = New-Object Text.UTF8Encoding($false)
$owners = @()
$unrelated = $null

function Wait-Record([string]$Path) {
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if (Test-Path -LiteralPath $Path) { return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json }
        Start-Sleep -Milliseconds 100
    }
    throw "Fixture did not become ready: $Path"
}
function Test-Port([int]$Port) {
    $client = New-Object Net.Sockets.TcpClient
    try { $client.Connect('127.0.0.1', $Port); return $true }
    catch { return $false }
    finally { $client.Dispose() }
}
try {
    New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
    $serverPath = Join-Path $fixtureRoot 'server.cjs'
    [IO.File]::WriteAllText($serverPath, @'
const http = require('node:http');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const [record, childRecord] = process.argv.slice(2);
if (childRecord) {
  spawn(process.execPath, [__filename, childRecord], { detached: true, stdio: 'ignore' }).unref();
}
const server = http.createServer((req, res) => res.end('ready'));
server.listen(0, '127.0.0.1', () => {
  fs.writeFileSync(record, JSON.stringify({ pid: process.pid, port: server.address().port }));
  console.log('fixture ready');
});
'@, $utf8)
    $ownerPath = Join-Path $fixtureRoot 'owner.ps1'
    [IO.File]::WriteAllText($ownerPath, @'
param($Helper, $Node, $Server, $Record, $ChildRecord, $Output, $ErrorLog)
$ErrorActionPreference = 'Stop'
Add-Type -Path $Helper
$job = New-Object AgileNestWebJob
try {
    if (!$Output) { $Output = $null; $ErrorLog = $null }
    $process = $job.Start($Node, ('"' + $Server + '" "' + $Record + '" "' + $ChildRecord + '"'), (Split-Path $Server), $Output, $ErrorLog)
    while (!$process.WaitForExit(250)) {}
} finally { $job.Dispose() }
'@, $utf8)
    $unrelatedRecord = Join-Path $fixtureRoot 'unrelated.json'
    $unrelated = Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverPath + '" "' + $unrelatedRecord + '"') -WindowStyle Hidden -PassThru
    $other = Wait-Record $unrelatedRecord
    foreach ($redirected in @($false, $true)) {
        $recordPath = Join-Path $fixtureRoot "parent-$redirected.json"
        $childPath = Join-Path $fixtureRoot "child-$redirected.json"
        $arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File "' + $ownerPath + '" -Helper "' + (Join-Path $projectRoot 'scripts/windows/web-process.cs') + '" -Node "' + $nodePath + '" -Server "' + $serverPath + '" -Record "' + $recordPath + '" -ChildRecord "' + $childPath + '"'
        if ($redirected) { $arguments += ' -Output "' + (Join-Path $fixtureRoot 'web.log') + '" -ErrorLog "' + (Join-Path $fixtureRoot 'web-error.log') + '"' }
        $owner = Start-Process powershell.exe -ArgumentList $arguments -WindowStyle Hidden -RedirectStandardOutput (Join-Path $fixtureRoot "owner-$redirected.log") -RedirectStandardError (Join-Path $fixtureRoot "owner-$redirected-error.log") -PassThru
        $owners += $owner
        $parent = Wait-Record $recordPath
        $child = Wait-Record $childPath
        if (!(Test-Port $parent.port) -or !(Test-Port $child.port)) { throw 'Managed servers did not listen.' }
        Stop-Process -Id $owner.Id -Force
        for ($attempt = 0; $attempt -lt 60; $attempt++) {
            if (!(Test-Port $parent.port) -and !(Test-Port $child.port)) { break }
            Start-Sleep -Milliseconds 100
        }
        if ((Test-Port $parent.port) -or (Test-Port $child.port)) { throw 'Closing the launcher left a managed server running.' }
        if (!(Test-Port $other.port)) { throw 'An unrelated server was stopped.' }
        if ($redirected -and !(Select-String -LiteralPath (Join-Path $fixtureRoot 'web.log') -SimpleMatch 'fixture ready')) { throw 'Web log was not captured.' }
        Write-Host "PASS: closing launcher stops website and detached worker; unrelated server survives (redirected=$redirected)."
    }
    Add-Type -Path (Join-Path $projectRoot 'scripts/windows/web-process.cs')
    $job = New-Object AgileNestWebJob
    try {
        $failed = $false
        try { $job.Start((Join-Path $fixtureRoot 'missing.exe'), '', $fixtureRoot, $null, $null) | Out-Null }
        catch { $failed = $true }
        if (!$failed) { throw 'Missing executable did not fail.' }
    } finally { $job.Dispose() }
    if (!(Test-Port $other.port)) { throw 'Failed startup stopped an unrelated server.' }
    Write-Host 'PASS: failed startup preserves unrelated processes.'
    $configRoot = Join-Path $fixtureRoot 'configuration'
    $configScripts = Join-Path $configRoot 'scripts/windows'
    New-Item -ItemType Directory -Path $configScripts -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot 'start.bat'), (Join-Path $projectRoot '.env.example'), (Join-Path $projectRoot '.env.test.example') -Destination $configRoot
    Copy-Item -LiteralPath (Join-Path $projectRoot 'scripts/windows/start.ps1'), (Join-Path $projectRoot 'scripts/windows/setup.ps1') -Destination $configScripts
    & (Join-Path $configRoot 'start.bat') -ConfigOnly -NoPause
    if ($LASTEXITCODE -ne 0) { throw 'Configuration creation failed.' }
    $environmentPath = Join-Path $configRoot '.env'
    $testEnvironmentPath = Join-Path $configRoot '.env.test'
    $beforeEnvironment = (Get-FileHash -LiteralPath $environmentPath).Hash
    $beforeTestEnvironment = (Get-FileHash -LiteralPath $testEnvironmentPath).Hash
    $secretLine = Select-String -LiteralPath $environmentPath -Pattern '^AUTH_SECRET=.'
    if (!$secretLine -or (Select-String -LiteralPath (Join-Path $configRoot '.env.example') -SimpleMatch $secretLine.Line)) { throw 'Configuration did not generate a fresh secret.' }
    & (Join-Path $configRoot 'start.bat') -ConfigOnly -NoPause
    if ($LASTEXITCODE -ne 0 -or (Get-FileHash -LiteralPath $environmentPath).Hash -ne $beforeEnvironment -or (Get-FileHash -LiteralPath $testEnvironmentPath).Hash -ne $beforeTestEnvironment) { throw 'Existing configuration was overwritten.' }
    Write-Host 'PASS: public launcher creates configuration once and preserves existing files in a Unicode path.'
    & (Join-Path $PSScriptRoot 'database.ps1')
} catch {
    Get-ChildItem -LiteralPath $fixtureRoot -Filter '*error.log' | ForEach-Object { Get-Content -LiteralPath $_.FullName | Write-Host }
    throw
} finally {
    foreach ($owner in $owners) { if (!$owner.HasExited) { Stop-Process -Id $owner.Id -Force -ErrorAction SilentlyContinue } }
    if ($unrelated -and !$unrelated.HasExited) { Stop-Process -Id $unrelated.Id -Force }
    $resolved = [IO.Path]::GetFullPath($fixtureRoot)
    $allowedRoot = [IO.Path]::GetFullPath((Join-Path $projectRoot '.tools')) + [IO.Path]::DirectorySeparatorChar
    if (!$resolved.StartsWith($allowedRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Fixture cleanup is outside .tools.' }
    if (Test-Path -LiteralPath $resolved) { Remove-Item -LiteralPath $resolved -Recurse -Force }
}
