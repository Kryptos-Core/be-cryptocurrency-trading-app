# cleanup-kafka-volumes.ps1
# Clean up Kafka/Zookeeper Docker volumes and optionally restart the infrastructure stack.
#
# Use when Kafka crashes with: KeeperErrorCode = NodeExists
# This script stops containers, backs up volume data to a timestamped archive,
# then removes the stale volumes so Kafka can start fresh.
#
# Usage:
#   .\scripts\docker\cleanup-kafka-volumes.ps1       # Interactive (prompts for confirm)
#   .\scripts\docker\cleanup-kafka-volumes.ps1 -AutoConfirm   # Non-interactive

param(
    [switch]$AutoConfirm
)

$ErrorActionPreference = 'Stop'

$VolumePrefix = "be-cryptocurrency-trading-app"
$TargetVolumes = @(
    "${VolumePrefix}_zookeeper_data",
    "${VolumePrefix}_zookeeper_txn",
    "${VolumePrefix}_kafka_data"
)
$BackupDir = "kafka-volume-backup-$(Get-Date -Format 'yyyyMMddHHmmss')"

Write-Host ""
Write-Host "=== Kafka/Zookeeper Volume Cleanup ===" -ForegroundColor Cyan
Write-Host ""

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

# Step 1: Stop containers first
Write-Host "[1/4] Stopping Kafka and Zookeeper containers..." -ForegroundColor Yellow
$prevErrorAction = $ErrorActionPreference
$ErrorActionPreference = 'SilentlyContinue'
docker stop crypto_trading_kafka crypto_trading_zookeeper -t 5 2>&1 | Out-Null
docker rm crypto_trading_kafka crypto_trading_zookeeper -f 2>&1 | Out-Null
$ErrorActionPreference = $prevErrorAction
Write-Host "      Containers stopped and removed." -ForegroundColor Green

# Step 2: Backup volumes
Write-Host "[2/4] Backing up volumes to .\$BackupDir..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

# Ensure alpine image is available for backup
Write-Host "      Pulling alpine image for backup..." -ForegroundColor Cyan
docker pull alpine:latest 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "      WARNING: Could not pull alpine image. Skipping backup." -ForegroundColor Yellow
    Write-Host "      (This is non-fatal - volumes will still be removed)" -ForegroundColor Cyan
}

$backupOk = $true
foreach ($vol in $TargetVolumes) {
    $volExists = docker volume ls -q | Select-String -Pattern ([regex]::Escape($vol))
    if ($volExists) {
        $tarName = ($vol -replace "${VolumePrefix}_", "") + ".tar.gz"
        Write-Host "      Backing up $vol -> $tarName" -ForegroundColor Cyan
        docker run --rm `
            -v "${vol}:/src:ro" `
            -v "$(Get-Location):/dst" `
            alpine tar czf "/dst/$BackupDir/$tarName" -C /src . 2>`$null | Out-Null
        if ($LASTEXITCODE -ne 0) {
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
Write-Host "  docker logs crypto_trading_kafka --tail 50" -ForegroundColor Gray
Write-Host ""
