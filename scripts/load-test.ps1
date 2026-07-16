# Simple load test for analytics API (PowerShell)
param(
    [string]$BaseUrl = "http://localhost:8080",
    [long]$ProfileId = 10861747,
    [int]$Requests = 50,
    [int]$Concurrency = 5
)

$endpoints = @(
    "/api/v1/analytics/overview?profileId=$ProfileId",
    "/api/v1/analytics/matchup-matrix?profileId=$ProfileId",
    "/api/v1/analytics/map-stats?profileId=$ProfileId",
    "/api/v1/ops/sync-overview"
)

$jobs = @()
$sw = [System.Diagnostics.Stopwatch]::StartNew()

for ($i = 0; $i -lt $Requests; $i++) {
    while ((Get-Job -State Running).Count -ge $Concurrency) {
        Start-Sleep -Milliseconds 100
        Get-Job -State Completed | Receive-Job | Out-Null
        Get-Job -State Completed | Remove-Job
    }

    $path = $endpoints[$i % $endpoints.Length]
    $url = "$BaseUrl$path"
    $jobs += Start-Job -ScriptBlock {
        param($u)
        try {
            $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 30
            [PSCustomObject]@{ Ok = $true; Status = $r.StatusCode; Ms = 0 }
        } catch {
            [PSCustomObject]@{ Ok = $false; Status = $_.Exception.Message; Ms = 0 }
        }
    } -ArgumentList $url
}

Wait-Job $jobs | Out-Null
$results = $jobs | Receive-Job
$sw.Stop()

$ok = ($results | Where-Object { $_.Ok }).Count
$fail = $results.Count - $ok
$rps = [math]::Round($results.Count / $sw.Elapsed.TotalSeconds, 2)

Write-Host "Requests: $($results.Count) | OK: $ok | Failed: $fail | Duration: $($sw.Elapsed.TotalSeconds)s | ~$rps req/s"
$jobs | Remove-Job

if ($fail -gt 0) { exit 1 }
