param(
    [string]$H2DbPath = "$PSScriptRoot\..\aoe4-api\data\aoe4db",
    [string]$ExportDir = "$PSScriptRoot\..\backups\migration",
    [switch]$SchemaOnly
)

$ErrorActionPreference = "Stop"

Write-Host "=== AOE4 H2 -> PostgreSQL Migration Helper ===" -ForegroundColor Cyan

# 1. Backup H2 files
& "$PSScriptRoot\backup-h2.ps1"
Write-Host ""

# 2. Locate H2 JAR from local Maven cache
$h2Jar = Get-ChildItem "$env:USERPROFILE\.m2\repository\com\h2database\h2\*\h2-*.jar" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending |
    Select-Object -First 1

if (-not $h2Jar) {
    Write-Host "H2 JAR not found. Run 'mvn -pl aoe4-api dependency:resolve' first." -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Force -Path $ExportDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$exportFile = Join-Path $ExportDir "h2-export-$timestamp.sql"

$h2Url = "jdbc:h2:file:$((Resolve-Path (Split-Path $H2DbPath -Parent)).Path)/$(Split-Path $H2DbPath -Leaf)"

Write-Host "Exporting H2 database..."
Write-Host "  URL: $h2Url"
Write-Host "  Output: $exportFile"

$scriptArgs = @(
    "-cp", $h2Jar.FullName,
    "org.h2.tools.Script",
    "-url", $h2Url,
    "-user", "sa",
    "-password", "",
    "-script", $exportFile
)

if ($SchemaOnly) {
    $scriptArgs += "-options", "simple"
}

& java @scriptArgs
if ($LASTEXITCODE -ne 0) {
    Write-Host "H2 export failed." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Export complete: $exportFile" -ForegroundColor Green
Write-Host ""
Write-Host "=== Next steps ===" -ForegroundColor Cyan
Write-Host @"
1. Start PostgreSQL:
     docker compose -f docker-compose.postgres.yml up -d postgres

2. Start app with postgres profile (Flyway creates schema):
     cd aoe4-api
     mvn spring-boot:run -Dspring-boot.run.profiles=postgres

3. Import data (may need manual SQL fixes for H2/PostgreSQL dialect differences):
     psql -h localhost -U aoe4 -d aoe4 -f "$exportFile"

   Recommended for small datasets: skip import and re-sync players via Ops batch sync.

4. Verify:
     curl http://localhost:8080/actuator/health
     Open http://localhost:8080/ops

See docs/POSTGRES-MIGRATION.md for details.
"@
