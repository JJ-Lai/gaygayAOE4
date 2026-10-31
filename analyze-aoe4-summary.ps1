param(
    [string]$InputPath = (Join-Path $PSScriptRoot 'aoe4-summary-242171403.json'),
    [int]$ProfileId = 10861747
)

function Format-Minutes([int]$seconds) {
    if ($seconds -lt 0) { return '0:00' }
    $m = [math]::Floor($seconds / 60)
    $s = $seconds % 60
    return '{0}:{1:D2}' -f $m, $s
}

function Get-SampleAt([int[]]$timestamps, [double[]]$values, [int]$targetSecond) {
    if (-not $timestamps -or -not $values -or $timestamps.Count -eq 0) { return $null }
    $idx = 0
    for ($i = 0; $i -lt $timestamps.Count; $i++) {
        if ($timestamps[$i] -le $targetSecond) { $idx = $i } else { break }
    }
    return [pscustomobject]@{
        Second = $timestamps[$idx]
        Value  = $values[$idx]
    }
}

if (-not (Test-Path $InputPath)) {
    Write-Error "找不到檔案: $InputPath"
    exit 1
}

$raw = Get-Content -Path $InputPath -Raw -Encoding UTF8
if ($raw.Trim() -eq 'Not Found') {
    Write-Error '檔案內容是 Not Found。請從 Chrome DevTools 重新 Copy response 後覆蓋此檔案。'
    exit 1
}

$summary = $raw | ConvertFrom-Json
$players = @($summary.players)
if ($players.Count -eq 0) { Write-Error 'JSON 裡沒有 players 欄位'; exit 1 }

$me = $players | Where-Object { $_.profileId -eq $ProfileId -or $_.profile_id -eq $ProfileId } | Select-Object -First 1
if (-not $me) { $me = $players | Select-Object -First 1 }

$name = if ($me.name) { $me.name } else { "profile $ProfileId" }
$civ = if ($me.civilization) { $me.civilization } else { $me.civ }
$result = if ($me.result) { $me.result } else { 'unknown' }

Write-Output ''
Write-Output '=== 對戰摘要 ==='
Write-Output ("玩家: {0} ({1}) 結果: {2}" -f $name, $civ, $result)
if ($summary.map) { Write-Output ("地圖: {0}" -f $summary.map) }
if ($summary.kind) { Write-Output ("類型: {0}" -f $summary.kind) }
if ($summary.duration) { Write-Output ("時長: {0}" -f (Format-Minutes([int]$summary.duration))) }

if ($me.scores) {
    Write-Output ''
    Write-Output '=== 最終分數 ==='
    Write-Output ("總分: {0}" -f $me.scores.total)
    Write-Output ("軍事: {0}" -f $me.scores.military)
    Write-Output ("經濟: {0}" -f $me.scores.economy)
    Write-Output ("科技: {0}" -f $me.scores.technology)
    Write-Output ("社會: {0}" -f $me.scores.society)
}

$res = $me.resources
if (-not $res) { Write-Error '此玩家沒有 resources 時間序列'; exit 1 }

$duration = if ($summary.duration) { [int]$summary.duration } else { $res.timestamps[-1] }
$checkpoints = @(300, 600, 900, 1200, 1500, 1800, 2100, 2400) | Where-Object { $_ -le $duration }

Write-Output ''
Write-Output '=== 資源累積 / 軍事 / 人口（每 5 分鐘取樣）==='
Write-Output '時間    食物   木材   黃金   石頭   軍事值  人口'
foreach ($t in $checkpoints) {
    $food = Get-SampleAt $res.timestamps $res.food $t
    $wood = Get-SampleAt $res.timestamps $res.wood $t
    $gold = Get-SampleAt $res.timestamps $res.gold $t
    $stone = Get-SampleAt $res.timestamps $res.stone $t
    $mil = Get-SampleAt $res.timestamps $res.military $t
    $pop = if ($res.population) { Get-SampleAt $res.timestamps $res.population $t } else { $null }
    $popText = if ($pop) { [string]$pop.Value } else { '-' }
    Write-Output ('{0,-7} {1,5} {2,5} {3,5} {4,5} {5,6} {6,5}' -f (Format-Minutes $t), $food.Value, $wood.Value, $gold.Value, $stone.Value, $mil.Value, $popText)
}

$lastIdx = $res.timestamps.Count - 1
Write-Output ''
Write-Output '=== 終局數值 ==='
Write-Output ("食物: {0}" -f $res.food[$lastIdx])
Write-Output ("木材: {0}" -f $res.wood[$lastIdx])
Write-Output ("黃金: {0}" -f $res.gold[$lastIdx])
Write-Output ("石頭: {0}" -f $res.stone[$lastIdx])
Write-Output ("軍事值: {0}" -f $res.military[$lastIdx])
if ($res.population) { Write-Output ("人口: {0}" -f $res.population[$lastIdx]) }

if ($res.foodPerMin) {
    $peakFood = ($res.foodPerMin | Measure-Object -Maximum).Maximum
    $peakWood = ($res.woodPerMin | Measure-Object -Maximum).Maximum
    $peakGold = ($res.goldPerMin | Measure-Object -Maximum).Maximum
    $peakStone = ($res.stonePerMin | Measure-Object -Maximum).Maximum
    Write-Output ''
    Write-Output '=== 峰值採集速率 (/min) ==='
    Write-Output ("食物: {0}" -f $peakFood)
    Write-Output ("木材: {0}" -f $peakWood)
    Write-Output ("黃金: {0}" -f $peakGold)
    Write-Output ("石頭: {0}" -f $peakStone)
}

if ($me.buildOrder) {
    Write-Output ''
    Write-Output ("=== 建造/訓練事件數: {0} ===" -f @($me.buildOrder).Count)
}

Write-Output ''
Write-Output "分析完成。來源檔案: $InputPath"
