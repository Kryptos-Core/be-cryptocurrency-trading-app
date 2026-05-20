#!/bin/bash
# cleanup-kafka-volumes.sh
# Clean up Kafka/Zookeeper Docker volumes and optionally restart the infrastructure stack.
#
# Use when Kafka crashes with: KeeperErrorCode = NodeExists
# This script stops containers, backs up volume data to a timestamped archive,
# then removes the stale volumes so Kafka can start fresh.
#
# Usage:
#   ./scripts/docker/cleanup-kafka-volumes.sh       # Interactive (prompts for confirm)
#   ./scripts/docker/cleanup-kafka-volumes.sh -y   # Non-interactive

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
VOLUME_PREFIX="be-cryptocurrency-trading-app"

TARGET_VOLUMES=(
    "${VOLUME_PREFIX}_zookeeper_data"
    "${VOLUME_PREFIX}_zookeeper_txn"
    "${VOLUME_PREFIX}_kafka_data"
)

BACKUP_DIR="kafka-volume-backup-$(date +%Y%m%d%H%M%S)"

# Parse flags
AUTO_CONFIRM=false
if [[ "$1" == "-y" ]] || [[ "$1" == "--yes" ]]; then
    AUTO_CONFIRM=true
fi

echo ""
echo "=== Kafka/Zookeeper Volume Cleanup ===" 
echo ""

if [[ "$AUTO_CONFIRM" == "false" ]]; then
    echo "The following volumes will be REMOVED:"
    for vol in "${TARGET_VOLUMES[@]}"; do
        echo "  - $vol"
    done
    echo ""
    echo "A backup archive will be created at: $BACKUP_DIR"
    echo ""
    read -p "Proceed? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[yY]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

# Step 1: Stop containers
echo "[1/4] Stopping Kafka and Zookeeper containers..."
docker stop crypto_trading_kafka crypto_trading_zookeeper 2>/dev/null || true
docker rm crypto_trading_kafka crypto_trading_zookeeper 2>/dev/null || true
echo "      Containers stopped and removed."

# Step 2: Backup volumes
echo "[2/4] Backing up volumes to ./$BACKUP_DIR..."
mkdir -p "$BACKUP_DIR"

backup_ok=true
for vol in "${TARGET_VOLUMES[@]}"; do
    if docker volume ls -q | grep -q "^${vol}$"; then
        tar_name="$(echo "$vol" | sed "s/${VOLUME_PREFIX}_//").tar.gz"
        echo "      Backing up $vol -> $tar_name"
        docker run --rm \
            -v "${vol}:/src:ro" \
            -v "$(pwd)/$BACKUP_DIR:/dst" \
            alpine tar czf "/dst/$tar_name" -C /src . 2>/dev/null || {
            echo "      WARNING: Failed to backup $vol"
            backup_ok=false
        }
    else
        echo "      Skipping $vol (not found)"
    fi
done

if [[ "$backup_ok" == "true" ]]; then
    echo "      Backup complete: ./$BACKUP_DIR"
else
    echo "      Backup had warnings. Check $BACKUP_DIR."
fi

# Step 3: Remove volumes
echo "[3/4] Removing stale volumes..."
for vol in "${TARGET_VOLUMES[@]}"; do
    echo "      Removing $vol..."
    docker volume rm "$vol" 2>/dev/null || true
done
echo "      Volumes removed."

# Step 4: Restart Kafka
echo "[4/4] Starting Kafka stack..."
cd "$COMPOSE_DIR"
docker compose -f docker-compose.infrastructure.yml --profile kafka up -d

echo ""
echo "=== Done ==="
echo "Run the following to check Kafka logs:"
echo "  docker logs crypto_trading_kafka --tail 50"
echo ""
