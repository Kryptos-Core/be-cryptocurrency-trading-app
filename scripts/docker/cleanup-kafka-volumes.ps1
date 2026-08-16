# cleanup-kafka-volumes.ps1
# Clean up the Kafka (KRaft) Docker volume and optionally restart the infrastructure stack.
#
# Use when Kafka crashes or needs a hard reset (stale __cluster_metadata log).
# This script stops the container, backs up the volume data to a timestamped
# archive, then removes the stale volume so Kafka can start fresh.
#
# Usage:
#   .\scripts\docker\cleanup-kafka-volumes.ps1       # Interactive (prompts for confirm)
#   .\scripts\docker\cleanup-kafka-volumes.ps1 -AutoConfirm   # Non-interactive

param(
    [switch]$AutoConfirm,
    [switch]$y
)
if ($y) { $AutoConfirm = $true }

$ErrorActionPreference = 'Stop'

# Auto-detect the Docker Compose project name from the running kafka container.
$KafkaContainer = if ($env:KAFKA_CONTAINER) { $env:KAFKA_CONTAINER } else { 'crypto-trading-dev-kafka' }
$DetectedProject = ''
try {
    $DetectedProject = docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' $KafkaContainer 2>$null
    if ($LASTEXITCODE -ne 0) { $DetectedProject = '' }
} catch { $DetectedProject = '' }

if ($DetectedProject) {
    $VolumePrefix = $DetectedProject
} elseif (docker volume ls -q | Select-String -SimpleMatch 'crypto-trading-dev_crypto-trading-dev-kafka-data') {
    $VolumePrefix = 'crypto-trading-dev'
} elseif (docker volume ls -q | Select-String -SimpleMatch 'crypto-trading-staging_crypto-trading-staging-kafka-data') {
    $VolumePrefix = 'crypto-trading-staging'
} elseif (docker volume ls -q | Select-String -SimpleMatch 'crypto-trading-prod_crypto-trading-prod-kafka-data') {
    $VolumePrefix = 'crypto-trading-prod'
} else {
    $VolumePrefix = 'be-cryptocurrency-trading-app'
}

$TargetVolumes = @(
    "${VolumePrefix}_crypto-trading-dev-kafka-data",
    "${VolumePrefix}_crypto-trading-staging-kafka-data",
    "${VolumePrefix}_crypto-trading-prod-kafka-data",
    "${VolumePrefix}_kafka_data"
)
# Filter to only volumes that actually exist.
$TargetVolumes = $TargetVolumes | Where-Object { docker volume ls -q | Select-String -SimpleMatch $_ }
$BackupDir = "kafka-volume-backup-$(Get-Date -Format 'yyyyMMddHHmmss')"

Write-Host ""
Write-Host "=== Kafka Volume Cleanup (KRaft) ===" -ForegroundColor Cyan
Write-Host "  Detected project: $VolumePrefix" -ForegroundColor Cyan
Write-Host ""

if ($TargetVolumes.Count -eq 0) {
    Write-Host "No kafka_data volumes found - nothing to clean." -ForegroundColor Yellow
    exit 0
}

if (-not $AutoConfirm) {
    Write-Host "The following volumes will be REMOVED:" -ForegroundColor Yellow
    foreach ($vol in $TargetVolumes) {
        Write-Host "  - $vol" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "A backup archive will be created at: $BackupDir" -ForegroundColor Cyan
    Write-Host ""
    $confirmation = Read-Host "Proceed? (y/N)"
    if ($confirmation -ne 'y' -and $confirmation -ne 'Y') {
        Write-Host "Aborted." -ForegroundColor Red
        exit 0
    }
}

# Step 1: Stop container first
Write-Host "[1/4] Stopping Kafka container..." -ForegroundColor Yellow
$prevErrorAction = $ErrorActionPreference
$ErrorActionPreference = 'SilentlyContinue'
docker stop $KafkaContainer -t 5 2>&1 | Out-Null
docker rm $KafkaContainer -f 2>&1 | Out-Null
$ErrorActionPreference = $prevErrorAction
Write-Host "      Container stopped and removed." -ForegroundColor Green

# Step 2: Backup volumes
Write-Host "[2/4] Backing up volumes to .\$BackupDir..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

# Ensure alpine image is available for backup
Write-Host "      Pulling alpine image for backup..." -ForegroundColor Cyan
$prevErrorActionDocker = $ErrorActionPreference
$ErrorActionPreference = 'SilentlyContinue'
$null = docker pull alpine:latest 2>&1
$dockerPullExitCode = $LASTEXITCODE
$ErrorActionPreference = $prevErrorActionDocker
if ($dockerPullExitCode -ne 0) {
    Write-Host "      WARNING: Could not pull alpine image. Skipping backup." -ForegroundColor Yellow
    Write-Host "      (This is non-fatal - volumes will still be removed)" -ForegroundColor Cyan
}

$backupOk = $true
foreach ($vol in $TargetVolumes) {
    $volExists = docker volume ls -q | Select-String -Pattern ([regex]::Escape($vol))
    if ($volExists) {
        $tarName = ($vol -replace "${VolumePrefix}_", "") + ".tar.gz"
        Write-Host "      Backing up $vol -> $tarName" -ForegroundColor Cyan
        $prevErrorActionRun = $ErrorActionPreference
        $ErrorActionPreference = 'SilentlyContinue'
        $null = docker run --rm `
            -v "${vol}:/src:ro" `
            -v "$(Get-Location):/dst" `
            alpine tar czf "/dst/$BackupDir/$tarName" -C /src . 2>&1
        $dockerRunExitCode = $LASTEXITCODE
        $ErrorActionPreference = $prevErrorActionRun
        if ($dockerRunExitCode -ne 0) {
            Write-Host "      WARNING: Failed to backup $vol" -ForegroundColor Red
            $backupOk = $false
        }
    } else {
        Write-Host "      Skipping $vol (not found)" -ForegroundColor DarkGray
    }
}

if ($backupOk) {
    Write-Host "      Backup complete: .\$BackupDir" -ForegroundColor Green
} else {
    Write-Host "      Backup had warnings. Check $BackupDir." -ForegroundColor Red
}

# Step 3: Remove volumes
Write-Host "[3/4] Removing stale volumes..." -ForegroundColor Yellow
foreach ($vol in $TargetVolumes) {
    Write-Host "      Removing $vol..." -ForegroundColor Cyan
    docker volume rm $vol 2>$null
}
Write-Host "      Volumes removed." -ForegroundColor Green

# Step 4: Restart Kafka
Write-Host "[4/4] Starting Kafka stack..." -ForegroundColor Yellow
Push-Location "d:/Sources/cryptocurrency-trading-app/be-cryptocurrency-trading-app"
docker compose -f docker-compose.infrastructure.yml --profile kafka up -d
Pop-Location

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Cyan
Write-Host "Run the following to check Kafka logs:" -ForegroundColor White
Write-Host "  docker logs $KafkaContainer --tail 50" -ForegroundColor Gray
Write-Host ""
