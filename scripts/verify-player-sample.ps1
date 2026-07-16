param(
    [string]$BaseUrl = "http://localhost:8080",
    [long]$ProfileId = 1224481,
    [int]$GameLimit = 5
)

$ErrorActionPreference = "Stop"

Write-Host "AOE4 sample player verification (profile $ProfileId)" -ForegroundColor Yellow

$overview = Invoke-RestMethod -Uri "$BaseUrl/api/v1/analytics/overview?profileId=$ProfileId"
Write-Host "Overview: totalGames=$($overview.totalGames) gamesWithSummary=$($overview.gamesWithSummary)" -ForegroundColor Cyan

$games = Invoke-RestMethod -Uri "$BaseUrl/api/v1/games?profileId=$ProfileId&page=0&size=$GameLimit"
if ($games.games.Count -eq 0) {
    Write-Warning "No games found for profile $ProfileId. Sync games first."
    exit 1
}

$checked = 0
$withOpponent = 0
$withBuildEvents = 0

foreach ($game in $games.games) {
    $gameId = $game.gameId
    try {
        $timeline = Invoke-RestMethod -Uri "$BaseUrl/api/v1/games/$gameId/timeline?profileId=$ProfileId"
        $checked++
        $hasOpponent = $null -ne $timeline.opponent
        $oppBuildCount = if ($timeline.opponent) { @($timeline.opponent.buildEvents).Count } else { 0 }
        $hasBuild = (@($timeline.buildEvents).Count -gt 0) -or ($oppBuildCount -gt 0)
        if ($hasOpponent) { $withOpponent++ }
        if ($hasBuild) { $withBuildEvents++ }
        Write-Host "  game $gameId : opponent=$hasOpponent buildEvents=$hasBuild map=$($game.mapName)" -ForegroundColor DarkGray
    } catch {
        Write-Host "  game $gameId : timeline unavailable ($($_.Exception.Message))" -ForegroundColor DarkYellow
    }
}

Write-Host ""
Write-Host "Checked $checked games | with opponent timeline: $withOpponent | with build events: $withBuildEvents" -ForegroundColor Green

if ($withOpponent -eq 0) {
    Write-Warning "No opponent timeline found. Ensure both players have SUCCESS summaries (try Ops reparse-summaries)."
    exit 2
}

Write-Host "Sample verification passed." -ForegroundColor Green
