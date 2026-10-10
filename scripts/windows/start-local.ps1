param(
  [Parameter(Mandatory = $true)][string]$ProjectRoot,
  [ValidateRange(1024, 65535)][int]$WebPort = 3000,
  [switch]$NoBrowser
)

Set-Location -LiteralPath $ProjectRoot
. (Join-Path $ProjectRoot 'scripts/windows/database-process.ps1')
$webUrl = "http://localhost:$WebPort"

function Get-PortOwnerIds([int]$Port) {
  $pattern = '^\s*TCP\s+\S+:' + $Port + '\s+\S+\s+LISTENING\s+(\d+)\s*$'
  & netstat.exe -ano -p tcp | ForEach-Object {
    if ($_ -match $pattern) { [int]$Matches[1] }
  } | Sort-Object -Unique
}

function Test-LocalDatabase {
  if (Test-Path -LiteralPath $pgIsReady) {
    & $pgIsReady -h 127.0.0.1 -p 5432 -t 2 2>$null | Out-Null
    return $LASTEXITCODE -eq 0
  }
  return @(Get-PortOwnerIds 5432).Count -gt 0
}

function Invoke-LocalStart {
  Write-Host "====================================================" -ForegroundColor Cyan
  Write-Host "  AgileNest · 本地服务启动" -ForegroundColor Cyan
  Write-Host "====================================================" -ForegroundColor Cyan

  if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    throw "未找到 Node.js，请安装 Node.js 22 LTS 后重新打开窗口。"
  }
  $npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npmCommand) {
    throw "未找到 npm，请检查 Node.js 安装和 PATH。"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot ".env"))) {
    throw "缺少 .env，请先按 docs/WINDOWS.md 完成初始化。"
  }
  if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot "node_modules\next\dist\bin\next"))) {
    throw "项目依赖未安装，请先在项目目录运行 npm install。"
  }

  $webOwners = @(Get-PortOwnerIds $WebPort)
  if ($webOwners.Count -gt 0) {
    throw "$WebPort 端口已被占用（PID：$($webOwners -join '、')），请关闭原启动窗口或使用 -WebPort 选择其他端口。"
  }

  if (-not (Test-LocalDatabase)) {
    if (Test-Path -LiteralPath $pgCtl) {
      Write-Host "[1/2] 启动内置 Postgres..." -ForegroundColor Yellow
      Start-BundledPostgres -PgCtl $pgCtl -DataDirectory $pgData -LogFile $pgLog
    } elseif (Get-Command docker.exe -ErrorAction SilentlyContinue) {
      Write-Host "[1/2] 启动 Docker Postgres..." -ForegroundColor Yellow
      & docker.exe compose up -d db | Out-Host
      if ($LASTEXITCODE -ne 0) {
        throw "Docker 数据库启动失败，请确认 Docker Desktop 已运行。"
      }
    } else {
      throw "数据库未运行。请先启动本机 Postgres，或按 docs/WINDOWS.md 初始化数据库。"
    }
    $dbReady = $false
    for ($attempt = 0; $attempt -lt 15; $attempt++) {
      if (Test-LocalDatabase) {
        $dbReady = $true
        break
      }
      Start-Sleep -Seconds 1
    }
    if (-not $dbReady) {
      throw "数据库等待超时，请检查 .tools/pg.log 或 Docker 数据库状态。"
    }
  }
  Write-Host "[1/2] 数据库端口已就绪。" -ForegroundColor Green
  Write-Host "[2/2] 启动开发服务器：$webUrl" -ForegroundColor Cyan
  Write-Host "关闭此启动窗口或按 Ctrl+C 即停止网站，已有数据会保留。"
  Add-Type -Path (Join-Path $ProjectRoot 'scripts/windows/web-process.cs')
  $webJob = New-Object AgileNestWebJob
  try {
    $nextCli = Join-Path $ProjectRoot 'node_modules/next/dist/bin/next'
    $webProcess = $webJob.Start((Get-Command node.exe).Source, ('"' + $nextCli + '" dev --port ' + $WebPort), $ProjectRoot, $null, $null)
    $webReady = $false
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
      if ($webProcess.HasExited) { break }
      if (@(Get-PortOwnerIds $WebPort).Count -gt 0) { $webReady = $true; break }
      Start-Sleep -Milliseconds 250
    }
    if (!$webReady -and !$webProcess.HasExited) { throw '网站启动等待超时，请查看上方错误提示。' }
    if ($webReady -and !$NoBrowser) { Start-Process $webUrl }
    while (!$webProcess.WaitForExit(250)) {}
    $webExitCode = $webProcess.ExitCode
  } finally { $webJob.Dispose() }
  if ($webExitCode -ne 0) {
    Write-Host "[ERROR] 开发服务器已退出（代码：$webExitCode），请查看上方错误。" -ForegroundColor Red
  }
  return $webExitCode
}

$pgCtl = Join-Path $ProjectRoot ".tools\pgsql\pgsql\bin\pg_ctl.exe"
$pgIsReady = Join-Path $ProjectRoot ".tools\pgsql\pgsql\bin\pg_isready.exe"
$pgData = Join-Path $ProjectRoot ".tools\pgdata"
$pgLog = Join-Path $ProjectRoot ".tools\pg.log"
$global:LASTEXITCODE = Invoke-LocalStart
