$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$testPort = 0
$unrelatedPort = 0
$utf8 = New-Object Text.UTF8Encoding($false)
$fixtureName = 'stop-test-' + [guid]::NewGuid().ToString('N')
$fixtureRoot = Join-Path $projectRoot ('.tools/' + $fixtureName)
$unrelatedRoot = $fixtureRoot + '.unrelated'
$nodePath = (Get-Command node.exe).Source
$testServer = $null
$unrelatedServer = $null

function Get-PortOwnerIds([int]$Port) {
    $pattern = '^\s*TCP\s+\S+:' + $Port + '\s+\S+\s+LISTENING\s+(\d+)\s*$'
    & netstat.exe -ano -p tcp | ForEach-Object {
        if ($_ -match $pattern) { [int]$Matches[1] }
    } | Sort-Object -Unique
}

function Wait-Record([string]$Path) {
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        if (Test-Path -LiteralPath $Path) { return Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json }
        Start-Sleep -Milliseconds 100
    }
    throw "Fixture did not become ready: $Path"
}

function Wait-PortReleased([int]$Port, [int]$TimeoutSeconds = 10) {
    for ($attempt = 0; $attempt -lt ($TimeoutSeconds * 10); $attempt++) {
        if (@(Get-PortOwnerIds $Port).Count -eq 0) { return $true }
        Start-Sleep -Milliseconds 100
    }
    return @(Get-PortOwnerIds $Port).Count -eq 0
}

try {
    New-Item -ItemType Directory -Path $fixtureRoot, $unrelatedRoot -Force | Out-Null
    $fixtureScripts = Join-Path $fixtureRoot 'scripts/windows'
    $fixturePg = Join-Path $fixtureRoot '.tools/pgsql/pgsql/bin'
    New-Item -ItemType Directory -Path $fixtureScripts, $fixturePg -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $projectRoot 'stop.bat') -Destination $fixtureRoot
    foreach ($file in @('stop.ps1', 'stop-local.ps1', 'database-process.ps1')) { Copy-Item -LiteralPath (Join-Path $projectRoot ('scripts/windows/' + $file)) -Destination $fixtureScripts }
    [IO.File]::WriteAllText((Join-Path $fixturePg 'pg_ctl.exe'), 'unused fixture marker')
    $serverScript = Join-Path $fixtureRoot 'server.cjs'
    [IO.File]::WriteAllText($serverScript, @'
const http = require('node:http');
const fs = require('node:fs');
const [portArg, record] = process.argv.slice(2);
const port = parseInt(portArg, 10);
const server = http.createServer((req, res) => res.end('ok'));
server.listen(port, '127.0.0.1', () => {
    fs.writeFileSync(record, JSON.stringify({ pid: process.pid, port: server.address().port }));
});
'@, $utf8)

    # 1. Start target test server and unrelated server
    $testRecord = Join-Path $fixtureRoot 'test-record.json'
    $unrelatedRecord = Join-Path $fixtureRoot 'unrelated-record.json'
    $unrelatedScript = Join-Path $unrelatedRoot 'server.cjs'
    Copy-Item -LiteralPath $serverScript -Destination $unrelatedScript
    $testServer = Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverScript + '" ' + $testPort + ' "' + $testRecord + '"') -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $fixtureRoot 'test-err.log')
    $unrelatedServer = Start-Process -FilePath $nodePath -ArgumentList ('"' + $unrelatedScript + '" ' + $unrelatedPort + ' "' + $unrelatedRecord + '"') -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $fixtureRoot 'unrelated-err.log')

    $testInfo = Wait-Record $testRecord
    $unrelatedInfo = Wait-Record $unrelatedRecord
    $testPort = [int]$testInfo.port
    $unrelatedPort = [int]$unrelatedInfo.port
    Write-Host "PASS: Test server listening on $testPort (PID $($testInfo.pid)), unrelated server on $unrelatedPort (PID $($unrelatedInfo.pid))"
    & (Join-Path $fixtureRoot 'stop.bat') -WebPort $unrelatedPort -NoPause
    if ($LASTEXITCODE -eq 0 -or @(Get-PortOwnerIds $unrelatedPort).Count -eq 0) { throw 'stop.bat failed to reject an unrelated port owner' }
    Write-Host 'PASS: unrelated project port owner is rejected and preserved'

    # 2. Invoke stop.bat on target test port
    & (Join-Path $fixtureRoot 'stop.bat') -WebPort $testPort -NoPause
    if ($LASTEXITCODE -ne 0) { throw "stop.bat failed with exit code $LASTEXITCODE" }

    # 3. Verify target port is released, unrelated port survives
    if (!(Wait-PortReleased $testPort)) { throw "stop.bat did not release target port $testPort" }
    if (@(Get-PortOwnerIds $unrelatedPort).Count -eq 0) { throw "stop.bat killed unrelated port $unrelatedPort" }
    Write-Host "PASS: stop.bat stopped target server on $testPort and preserved unrelated server on $unrelatedPort"

    # 4. Idempotency test: invoke stop.bat when nothing is running on test port
    & (Join-Path $fixtureRoot 'stop.bat') -WebPort $testPort -NoPause
    if ($LASTEXITCODE -ne 0) { throw "stop.bat idempotent call failed with exit code $LASTEXITCODE" }
    Write-Host "PASS: stop.bat is idempotent when server is not running"

    # 5. Test stop.bat -All with -NoPause
    & (Join-Path $fixtureRoot 'stop.bat') -All -WebPort $testPort -NoPause
    if ($LASTEXITCODE -ne 0) { throw "stop.bat -All failed with exit code $LASTEXITCODE" }
    if (@(Get-PortOwnerIds $unrelatedPort).Count -eq 0) { throw 'stop.bat -All affected an unrelated server' }
    Write-Host "PASS: stop.bat -All is isolated to its own fixture"

} finally {
    if ($testServer -and !$testServer.HasExited) { Stop-Process -Id $testServer.Id -Force -ErrorAction SilentlyContinue }
    if ($unrelatedServer -and !$unrelatedServer.HasExited) { Stop-Process -Id $unrelatedServer.Id -Force -ErrorAction SilentlyContinue }
    $allowedPrefix = [IO.Path]::GetFullPath((Join-Path $projectRoot '.tools')) + [IO.Path]::DirectorySeparatorChar
    foreach ($ownDirectory in @($fixtureRoot, $unrelatedRoot)) {
      $resolvedFixture = [IO.Path]::GetFullPath($ownDirectory)
      if (!$resolvedFixture.StartsWith($allowedPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Fixture cleanup is outside .tools.' }
      if (Test-Path -LiteralPath $resolvedFixture) { Remove-Item -LiteralPath $resolvedFixture -Recurse -Force -ErrorAction SilentlyContinue }
    }
}
