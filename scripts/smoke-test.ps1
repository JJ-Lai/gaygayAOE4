param(
    [string]$BaseUrl = "http://localhost:8080",
    [long]$ProfileId = 10861747
)

$ErrorActionPreference = "Stop"

function Test-Endpoint {
    param([string]$Name, [string]$Url)
    Write-Host "→ $Name" -ForegroundColor Cyan
    $response = Invoke-RestMethod -Uri $Url -Method Get
    Write-Host "  OK" -ForegroundColor Green
    return $response
}

Write-Host "AOE4 smoke test ($BaseUrl)" -ForegroundColor Yellow

$health = Test-Endpoint "Health" "$BaseUrl/actuator/health"
if ($health.status -ne "UP") {
    throw "Health check failed: $($health.status)"
}

Test-Endpoint "Sync overview" "$BaseUrl/api/v1/ops/sync-overview" | Out-Null
Test-Endpoint "Meta filters" "$BaseUrl/api/v1/meta/filters" | Out-Null

try {
    $overview = Test-Endpoint "Player overview" "$BaseUrl/api/v1/analytics/overview?profileId=$ProfileId"
    Write-Host "  totalGames=$($overview.totalGames)" -ForegroundColor DarkGray
} catch {
    Write-Warning "Player $ProfileId not in database (expected on fresh install)"
}

Write-Host "`nAll smoke checks passed." -ForegroundColor Green
