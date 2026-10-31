# Loads .env.local into the current process and verifies AoE4 World access with AOE4_SUMMARY_API_KEY.
param(
    [long]$ProfileId = 10861747,
    [string]$EnvFile = (Join-Path $PSScriptRoot "..\.env.local")
)

$ErrorActionPreference = "Stop"
$ua = "AOE4-Analytics/1.0 (dev-test; contact: local)"

function Import-DotEnv([string]$Path) {
    if (-not (Test-Path $Path)) {
        throw "Env file not found: $Path"
    }
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith("#")) { return }
        $idx = $line.IndexOf("=")
        if ($idx -lt 1) { return }
        $name = $line.Substring(0, $idx).Trim()
        $value = $line.Substring($idx + 1).Trim().Trim('"').Trim("'")
        Set-Item -Path "Env:$name" -Value $value
    }
}

Import-DotEnv $EnvFile

$key = $env:AOE4_SUMMARY_API_KEY
if ([string]::IsNullOrWhiteSpace($key)) {
    throw "AOE4_SUMMARY_API_KEY is empty after loading $EnvFile"
}

$masked = if ($key.Length -ge 4) { ("*" * ([Math]::Max(0, $key.Length - 4))) + $key.Substring($key.Length - 4) } else { "****" }
Write-Host "Loaded AOE4_SUMMARY_API_KEY=$masked from $EnvFile"
Write-Host "Testing profile $ProfileId ..."

$gamesNoKeyUrl = "https://aoe4world.com/api/v0/players/$ProfileId/games?limit=5"
$gamesWithKeyUrl = "https://aoe4world.com/api/v0/players/$ProfileId/games?limit=50&api_key=$key"

curl.exe -sS -H "Accept: application/json" -H "User-Agent: $ua" $gamesNoKeyUrl -o "$env:TEMP\aoe4-games-nokey.json"
curl.exe -sS -H "Accept: application/json" -H "User-Agent: $ua" $gamesWithKeyUrl -o "$env:TEMP\aoe4-games-key.json"

$noKey = Get-Content "$env:TEMP\aoe4-games-nokey.json" -Raw | ConvertFrom-Json
$withKey = Get-Content "$env:TEMP\aoe4-games-key.json" -Raw | ConvertFrom-Json

Write-Host ("Games WITHOUT api_key: total={0}" -f $noKey.total_count)
Write-Host ("Games WITH    api_key: total={0}" -f $withKey.total_count)

$kinds = $withKey.games | Group-Object kind | ForEach-Object { "{0}={1}" -f $_.Name, $_.Count }
Write-Host ("Sample page kinds: {0}" -f ($kinds -join ", "))

$hits = 0
$checked = 0
foreach ($g in $withKey.games) {
    $gid = $g.game_id
    $checked++
    $summaryUrl = "https://aoe4world.com/players/$ProfileId/games/$gid/summary?camelize=true&api_key=$key"
    $code = curl.exe -sS -o "$env:TEMP\aoe4-summary-one.json" -w "%{http_code}" -H "Accept: application/json" -H "User-Agent: $ua" $summaryUrl
    $len = (Get-Item "$env:TEMP\aoe4-summary-one.json").Length
    if ($code -eq "200" -and $len -gt 100) {
        Write-Host ("SUMMARY HIT game={0} kind={1} size={2}" -f $gid, $g.kind, $len)
        $hits++
        if ($hits -ge 3) { break }
    }
}

Write-Host ("Summary scan: checked={0} hits={1}" -f $checked, $hits)

if ($withKey.total_count -le $noKey.total_count) {
    Write-Host "RESULT: api_key did NOT expand the games list (unexpected)."
    exit 2
}

if ($hits -eq 0) {
    Write-Host "RESULT: api_key works for private/custom GAME LIST, but no Summary JSON was available for the sampled games (HTTP 404)."
    Write-Host "Hint: enable Match History Public (Share History) in-game, then wait for new games; or open a match on aoe4world.com while logged in and copy a signed summary URL."
    exit 0
}

Write-Host "RESULT: api_key works for games list AND at least one Summary was fetched."
exit 0
