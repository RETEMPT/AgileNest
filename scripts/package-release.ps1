param(
    [string]$PostgresRoot,
    [string]$NodeRoot,
    [switch]$SkipBuild
)
$ErrorActionPreference = 'Stop'
$workspaceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $workspaceRoot
$version = (Get-Content -LiteralPath 'package.json' -Raw | ConvertFrom-Json).version
$outputRoot = Join-Path $workspaceRoot '.tools/releases'
$bundleName = "AgileNest-$version-windows-x64"
$bundleRoot = Join-Path $outputRoot $bundleName
$zipPath = Join-Path $outputRoot "$bundleName.zip"
$runtimeCache = Join-Path $workspaceRoot '.tools/release-runtime'
New-Item -ItemType Directory -Path $runtimeCache, $outputRoot -Force | Out-Null
if (!$SkipBuild) { & npm.cmd run build; if ($LASTEXITCODE -ne 0) { throw 'Build failed.' } }
if (!(Test-Path -LiteralPath '.next/standalone/server.js')) { throw 'Run npm run build first.' }
if (Test-Path -LiteralPath $bundleRoot) { throw "Output exists: $bundleRoot. Archive the old bundle or use a new version." }
if (!$NodeRoot) { $NodeRoot = Join-Path $runtimeCache 'node-v22.23.3-win-x64' }
if (!$PostgresRoot) { $PostgresRoot = Join-Path $runtimeCache 'postgresql-17.11/pgsql' }
$runtimeSources = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'release/runtime-sources.json') -Raw | ConvertFrom-Json
foreach ($archive in @(@{ name = 'node-v22.23.3-win-x64.zip'; hash = $runtimeSources.node.sha256 }, @{ name = 'postgresql-17.11-windows-x64.zip'; hash = $runtimeSources.postgres.sha256 })) {
    $archivePath = Join-Path $runtimeCache $archive.name
    if (!(Test-Path -LiteralPath $archivePath) -or (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant() -ne $archive.hash) { throw "Runtime archive missing or SHA256 mismatch: $($archive.name)" }
}
if (!(Test-Path -LiteralPath (Join-Path $NodeRoot 'node.exe'))) { throw 'Prepare official Node.js 22.23.3 with SHA256 verification. See docs/RELEASE.md.' }
if (!(Test-Path -LiteralPath (Join-Path $PostgresRoot 'bin/postgres.exe'))) { throw 'Prepare official EDB PostgreSQL 17.11. See docs/RELEASE.md.' }
$nodeVersion = (& (Join-Path $NodeRoot 'node.exe') --version).Trim()
$postgresVersion = (& (Join-Path $PostgresRoot 'bin/postgres.exe') --version).Trim()
if ($nodeVersion -ne 'v22.23.3' -or $postgresVersion -ne 'postgres (PostgreSQL) 17.11') { throw 'Runtime versions differ from release requirements.' }
$appRoot = Join-Path $bundleRoot 'app'
New-Item -ItemType Directory -Path $appRoot -Force | Out-Null
# standalone may contain local .env files; exclude and audit them before packaging.
& robocopy.exe (Join-Path $workspaceRoot '.next/standalone') $appRoot /E /NFL /NDL /NJH /NJS /NP /XF '.env' '.env.*' '*.log' /XD 'cache' | Out-Null
if ($LASTEXITCODE -gt 7) { throw 'Standalone copy failed.' }
Copy-Item -LiteralPath '.next/static' -Destination (Join-Path $appRoot '.next/static') -Recurse
if (Test-Path -LiteralPath 'public') { Copy-Item -LiteralPath 'public' -Destination (Join-Path $appRoot 'public') -Recurse }
foreach ($module in @('postgres', 'bcryptjs')) { Copy-Item -LiteralPath (Join-Path $workspaceRoot "node_modules/$module") -Destination (Join-Path $appRoot "node_modules/$module") -Recurse -Force }
$nodeDestination = Join-Path $bundleRoot 'runtime/node'
$pgDestination = Join-Path $bundleRoot 'runtime/pgsql'
$licenses = Join-Path $bundleRoot 'licenses'
New-Item -ItemType Directory -Path $nodeDestination, $pgDestination, $licenses -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $NodeRoot 'node.exe') -Destination $nodeDestination
Copy-Item -LiteralPath (Join-Path $NodeRoot 'LICENSE') -Destination (Join-Path $licenses 'NODE-LICENSE.txt')
foreach ($directory in @('bin', 'lib', 'share')) { Copy-Item -LiteralPath (Join-Path $PostgresRoot $directory) -Destination $pgDestination -Recurse }
# Preserve the EDB bundled runtime redistribution notices.
$pythonRoot = Join-Path $PostgresRoot 'pgAdmin 4/python'
foreach ($dll in @('vcruntime140.dll', 'vcruntime140_1.dll')) {
    Copy-Item -LiteralPath (Join-Path $pythonRoot $dll) -Destination (Join-Path $pgDestination 'bin')
}
Copy-Item -LiteralPath (Join-Path $pythonRoot 'LICENSE.txt') -Destination (Join-Path $licenses 'PYTHON-AND-MICROSOFT-RUNTIME.txt')
$pgCopyright = Join-Path $PostgresRoot 'doc/postgresql/COPYRIGHT'
if (!(Test-Path -LiteralPath $pgCopyright)) { $pgCopyright = Join-Path $workspaceRoot 'scripts/release/POSTGRESQL-LICENSE.txt' }
Copy-Item -LiteralPath $pgCopyright -Destination (Join-Path $licenses 'POSTGRESQL-LICENSE.txt')
Copy-Item -LiteralPath 'scripts/release/start.bat' -Destination $bundleRoot
$launcherPath = Join-Path $bundleRoot 'launcher'
New-Item -ItemType Directory -Path $launcherPath -Force | Out-Null
Copy-Item -LiteralPath 'scripts/release/start-release.ps1', 'scripts/release/bootstrap.mjs', 'scripts/release/validate-runtime.mjs', 'scripts/windows/web-process.cs' -Destination $launcherPath
Copy-Item -LiteralPath 'docs/RELEASE.md' -Destination (Join-Path $bundleRoot 'RELEASE.md')
Copy-Item -LiteralPath 'CHANGELOG.md' -Destination $bundleRoot
$dbFiles = Join-Path $bundleRoot 'release-db'
New-Item -ItemType Directory -Path $dbFiles -Force | Out-Null
Copy-Item -LiteralPath 'drizzle/0000_init.sql' -Destination $dbFiles
Get-ChildItem -LiteralPath 'src/db/migrations' -Filter '*.sql' | Copy-Item -Destination $dbFiles
$commit = (& git rev-parse HEAD).Trim()
@{ version = $version; commit = $commit; node = $nodeVersion; postgres = $postgresVersion; builtAt = (Get-Date).ToUniversalTime().ToString('o'); sources = @('https://nodejs.org/dist/v22.23.3/', 'https://sbp.enterprisedb.com/getfile.jsp?fileid=1260616') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $bundleRoot 'release.json') -Encoding UTF8
$excluded = Get-ChildItem -LiteralPath $bundleRoot -Recurse -Force -File | Where-Object { $_.Name -like '.env*' -or $_.Name -in @('postmaster.pid', 'config.json', 'server.json') }
if ($excluded) { throw 'Local configuration or runtime data found in bundle.' }
& (Join-Path $NodeRoot 'node.exe') (Join-Path $bundleRoot 'launcher/validate-runtime.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Database bootstrap dependencies are missing.' }
& (Join-Path $NodeRoot 'node.exe') (Join-Path $PSScriptRoot 'release/copy-licenses.mjs') $workspaceRoot $bundleRoot
if ($LASTEXITCODE -ne 0) { throw 'License collection failed.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($bundleRoot, $zipPath, 'Optimal', $true)
$hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $bundleName.zip" | Set-Content -LiteralPath (Join-Path $outputRoot "$bundleName.sha256.txt") -Encoding ASCII
Write-Host "Release package: $zipPath"
Write-Host "SHA256: $hash"
