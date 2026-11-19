param(
  [Parameter(Mandatory = $true)][string]$ProjectRoot,
  [ValidateRange(1024, 65535)][int]$WebPort = 3000,
  [switch]$All,
  [switch]$StopDb,
  [switch]$OnlyDb
)

Set-Location -LiteralPath $ProjectRoot
. (Join-Path $ProjectRoot 'scripts/windows/database-process.ps1')

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

function Get-OwnedNodeEntry($Process) {
  if (!$Process -or $Process.Name -ne 'node.exe' -or !$Process.CommandLine) { return $null }
  # A record/output argument can mention this workspace without owning the process.
  if ($Process.CommandLine -notmatch '^\s*(?:"[^"]*"|\S+)\s+(?:"([^"]+)"|(\S+))') { return $null }
  $entry = if ($Matches[1]) { $Matches[1] } else { $Matches[2] }
  if (![IO.Path]::IsPathRooted($entry)) { return $null }
  $entry = [IO.Path]::GetFullPath($entry.Replace('/', '\'))
  $prefix = [IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\') + '\'
  if (!$entry.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) { return $null }
  return $entry
}

function Invoke-LocalStop {
  Write-Host "====================================================" -ForegroundColor Cyan
  Write-Host "  AgileNest · 本地服务停止" -ForegroundColor Cyan
  Write-Host "====================================================" -ForegroundColor Cyan

  $shouldStopWeb = !$OnlyDb
  $shouldStopDb = $All -or $StopDb -or $OnlyDb
  $stepCount = if ($shouldStopWeb -and $shouldStopDb) { 2 } else { 1 }
  $currentStep = 1

  if ($shouldStopWeb) {
    Write-Host "[$currentStep/$stepCount] 停止开发服务器 (端口: $WebPort)..." -ForegroundColor Yellow
    $stoppedCount = 0

    $webOwners = @(Get-PortOwnerIds $WebPort)
    foreach ($ownerId in $webOwners) {
      $details = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerId"
      if (!$details) { continue }
      if (!(Get-OwnedNodeEntry $details)) {
        throw "端口 $WebPort 由其他程序占用，未停止该进程。"
      }
      $targetId = $ownerId
      # A Next child may exit before its CLI; stop only its verified ancestor chain.
      for ($level = 0; $level -lt 8; $level++) {
        $parent = Get-CimInstance Win32_Process -Filter "ProcessId = $($details.ParentProcessId)"
        $parentEntry = Get-OwnedNodeEntry $parent
        if (!$parentEntry -or $parentEntry -notmatch '[\\/]next[\\/]') { break }
        $targetId = $parent.ProcessId
        $details = $parent
      }
      Write-Host "  -> 停止本工程目标进程 (PID: $targetId)" -ForegroundColor DarkGray
      $stopper = Start-Process -FilePath taskkill.exe -ArgumentList ('/PID ' + $targetId + ' /T /F') -WindowStyle Hidden -PassThru
      try {
        $null = $stopper.Handle
        if (!$stopper.WaitForExit(10000)) { throw '目标进程停止等待超时。' }
        if ($stopper.ExitCode -ne 0 -and (Get-Process -Id $targetId -ErrorAction SilentlyContinue)) { throw '目标进程未能停止。' }
      } finally { $stopper.Dispose() }
      $stoppedCount++
    }

    # 等待端口释放
    $released = $false
    for ($attempt = 0; $attempt -lt 40; $attempt++) {
      if (@(Get-PortOwnerIds $WebPort).Count -eq 0) {
        $released = $true
        break
      }
      Start-Sleep -Milliseconds 250
    }

    if ($released) {
      if ($stoppedCount -gt 0) {
        Write-Host "[$currentStep/$stepCount] 开发服务器已停止，端口 $WebPort 已释放。" -ForegroundColor Green
      } else {
        Write-Host "[$currentStep/$stepCount] 端口 $WebPort 未运行开发服务器。" -ForegroundColor Gray
      }
    } else {
      throw "端口 $WebPort 仍未释放，未扩大停止范围。"
    }

    # 验证并尝试释放 .tools/website.lock
    $lockFile = Join-Path $ProjectRoot '.tools/website.lock'
    if (Test-Path -LiteralPath $lockFile) {
      try {
        $testLock = [IO.File]::Open($lockFile, 'OpenOrCreate', 'ReadWrite', 'None')
        $testLock.Dispose()
      } catch {
        Write-Host "  -> 提示: .tools/website.lock 仍被其他进程持有。" -ForegroundColor DarkGray
      }
    }

    $currentStep++
  }

  if ($shouldStopDb) {
    Write-Host "[$currentStep/$stepCount] 停止数据库服务..." -ForegroundColor Yellow
    $dbPortOwners = @(Get-PortOwnerIds 5432)

    if (Test-Path -LiteralPath $pgCtl) {
      $pidFile = Join-Path $pgData "postmaster.pid"
      if (Test-Path -LiteralPath $pidFile) {
        Write-Host "  -> 正在停止内置 Postgres 数据库..." -ForegroundColor DarkGray
        Stop-BundledPostgres -PgCtl $pgCtl -DataDirectory $pgData
        $stopped = $false
        for ($i = 0; $i -lt 15; $i++) {
          if (!(Test-Path -LiteralPath $pidFile)) { $stopped = $true; break }
          Start-Sleep -Seconds 1
        }
        if ($stopped) {
          Write-Host "[$currentStep/$stepCount] 内置 Postgres 数据库已停止。" -ForegroundColor Green
        } else {
          Write-Host "[$currentStep/$stepCount] 警告: 内置 Postgres 停止等待超时。" -ForegroundColor Yellow
        }
      } else {
        Write-Host "[$currentStep/$stepCount] 内置 Postgres 数据库未在运行。" -ForegroundColor Gray
      }
    } elseif ((Test-Path -LiteralPath (Join-Path $ProjectRoot 'docker-compose.yml')) -and (Get-Command docker.exe -ErrorAction SilentlyContinue)) {
      Write-Host "  -> 正在停止 Docker 数据库容器..." -ForegroundColor DarkGray
      & docker.exe compose stop db 2>$null | Out-Null
      Write-Host "[$currentStep/$stepCount] Docker 数据库容器已停止。" -ForegroundColor Green
    } else {
      if ($dbPortOwners.Count -gt 0) {
        Write-Host "[$currentStep/$stepCount] 检测到端口 5432 有外部数据库在运行，请手动管理本机服务。" -ForegroundColor Gray
      } else {
        Write-Host "[$currentStep/$stepCount] 数据库服务未在运行。" -ForegroundColor Gray
      }
    }
  } else {
    if (Test-LocalDatabase) {
      Write-Host "[提示] 数据库服务 (端口: 5432) 保持运行；若需停止数据库，可运行: .\stop.bat -All 或 .\stop.bat -StopDb" -ForegroundColor Cyan
    }
  }

  Write-Host "====================================================" -ForegroundColor Cyan
  Write-Host "  操作完成" -ForegroundColor Green
  Write-Host "====================================================" -ForegroundColor Cyan
  return 0
}

$pgCtl = Join-Path $ProjectRoot ".tools\pgsql\pgsql\bin\pg_ctl.exe"
$pgIsReady = Join-Path $ProjectRoot ".tools\pgsql\pgsql\bin\pg_isready.exe"
$pgData = Join-Path $ProjectRoot ".tools\pgdata"
$pgLog = Join-Path $ProjectRoot ".tools\pg.log"
$global:LASTEXITCODE = Invoke-LocalStop
