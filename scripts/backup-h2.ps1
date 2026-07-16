param(
    [string]$DbDir = "$PSScriptRoot\..\aoe4-api\data",
    [string]$BackupDir = "$PSScriptRoot\..\backups"
)

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$dest = Join-Path $BackupDir "aoe4db-$timestamp"

New-Item -ItemType Directory -Force -Path $dest | Out-Null

if (Test-Path "$DbDir\aoe4db.mv.db") {
    Copy-Item "$DbDir\aoe4db.mv.db" $dest
}
if (Test-Path "$DbDir\aoe4db.trace.db") {
    Copy-Item "$DbDir\aoe4db.trace.db" $dest
}

Write-Host "H2 backup saved to $dest"
