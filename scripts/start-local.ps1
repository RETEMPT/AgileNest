param([Parameter(Mandatory = $true)][string]$ProjectRoot)

Set-Location -LiteralPath $ProjectRoot
$webUrl = "http://localhost:3000"

function Get-PortOwnerIds([int]$Port) {
  $pattern = '^\s*TCP\s+\S+:' + $Port + '\s+\S+\s+LISTENING\s+(\d+)\s*$'
  & netstat.exe -ano -p tcp | ForEach-Object {
    if ($_ -match $pattern) { [int]$Matches[1] }
  } | Sort-Object -Unique
}

function Test-LocalDatabase {
  if (Test-Path -LiteralPath $pgIsReady) {
    & $pgIsReady -h 127.0.0.1 -p 5432 2>$null | Out-Null
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

  $nextServerPath = Join-Path $ProjectRoot "node_modules\next\dist\server\lib\start-server.js"
  $oldServers = @(Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine.IndexOf($nextServerPath, [StringComparison]::OrdinalIgnoreCase) -ge 0
  })
  $webOwners = @(Get-PortOwnerIds 3000)
  foreach ($webOwner in $webOwners) {
    if ($oldServers.ProcessId -notcontains $webOwner) {
      throw "3000 端口被其他程序占用（PID：$webOwner），请释放端口后重试。"
    }
  }
  foreach ($oldServer in $oldServers) {
    $currentServer = Get-CimInstance Win32_Process -Filter "ProcessId = $($oldServer.ProcessId)"
    if (-not $currentServer) { continue }
    if ($currentServer.CreationDate -ne $oldServer.CreationDate -or
        -not $currentServer.CommandLine -or
        $currentServer.CommandLine.IndexOf($nextServerPath, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
      throw "启动期间进程发生变化，请重新运行 start.bat。"
    }
    Write-Host "[重启] 结束当前项目的旧开发服务（PID：$($oldServer.ProcessId)）。" -ForegroundColor Yellow
    Stop-Process -Id $oldServer.ProcessId -Force
  }
  for ($attempt = 0; $attempt -lt 10; $attempt++) {
    if (@(Get-PortOwnerIds 3000).Count -eq 0) { break }
    Start-Sleep -Milliseconds 500
  }
  if (@(Get-PortOwnerIds 3000).Count -gt 0) {
    throw "3000 端口仍未释放，请检查上方进程信息后重试。"
  }

  if (-not (Test-LocalDatabase)) {
    if (Test-Path -LiteralPath $pgCtl) {
      Write-Host "[1/2] 启动内置 Postgres..." -ForegroundColor Yellow
      & $pgCtl start -D $pgData -l $pgLog | Out-Host
      if ($LASTEXITCODE -ne 0) {
        throw "Postgres 启动失败，请检查 .tools/pg.log。"
      }
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
  Write-Host "按 Ctrl+C 停止前端；此窗口会保留启动错误信息。"
  & $npmCommand.Source run dev -- --port 3000 | Out-Host
  $webExitCode = $LASTEXITCODE
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
