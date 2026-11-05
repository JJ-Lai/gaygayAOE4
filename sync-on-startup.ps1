# 登入 Windows 後執行一次：讀本機對局，有新資料才推上 GitHub。
# 由「啟動」資料夾的捷徑呼叫。移除方式：Win+R 輸入 shell:startup，刪除「AOE4 本機對局同步」。
$ErrorActionPreference = 'Continue'
$env:GIT_TERMINAL_PROMPT = '0'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$log = Join-Path $root 'sync-on-startup.log'
Set-Location -LiteralPath $root

function Write-Log([string]$text) {
  $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $text
  Add-Content -LiteralPath $log -Value $line -Encoding UTF8
}

function Test-Github {
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $wait = $client.BeginConnect('github.com', 443, $null, $null)
    $ok = $wait.AsyncWaitHandle.WaitOne(5000, $false)
    if ($ok) { $client.EndConnect($wait) }
    $client.Close()
    return $ok
  } catch {
    return $false
  }
}

if (Test-Path -LiteralPath $log) {
  $size = (Get-Item -LiteralPath $log).Length
  if ($size -gt 400KB) {
    $tail = Get-Content -LiteralPath $log -Tail 80 -ErrorAction SilentlyContinue
    Set-Content -LiteralPath $log -Value $tail -Encoding UTF8
  }
}

Write-Log '開始同步'
$node = $null
$cmd = Get-Command node -ErrorAction SilentlyContinue
if ($cmd) { $node = $cmd.Source }
if (-not $node -and (Test-Path 'C:\Program Files\nodejs\node.exe')) { $node = 'C:\Program Files\nodejs\node.exe' }
if (-not $node) {
  Write-Log '找不到 node，這次沒有執行。'
  exit 1
}

$online = $false
for ($i = 0; $i -lt 12; $i++) {
  if (Test-Github) { $online = $true; break }
  Write-Log '還沒連上 GitHub，15 秒後再試。'
  Start-Sleep -Seconds 15
}
if (-not $online) { Write-Log '網路還沒就緒，仍會先更新本機檔案。' }

& $node (Join-Path $root 'sync-local-matches.js') 2>&1 | ForEach-Object { Write-Log ([string]$_) }
Write-Log ('結束，exit=' + $LASTEXITCODE)
exit $LASTEXITCODE
