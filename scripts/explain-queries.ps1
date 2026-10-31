param(
    [long]$ProfileId = 10861747,
    [string]$BaseUrl = "http://localhost:8080"
)

$ErrorActionPreference = "Stop"

$url = "$BaseUrl/api/v1/ops/query-plans?profileId=$ProfileId"
Write-Host "GET $url" -ForegroundColor Cyan

$response = Invoke-RestMethod -Uri $url -Method Get
Write-Host "Database: $($response.databaseProduct)" -ForegroundColor Green
Write-Host ""

foreach ($plan in $response.plans) {
    Write-Host "=== $($plan.queryKey) ($($plan.executionMs) ms) ===" -ForegroundColor Yellow
    Write-Host $plan.description
    foreach ($line in $plan.planLines) {
        Write-Host "  $line"
    }
    Write-Host ""
}
