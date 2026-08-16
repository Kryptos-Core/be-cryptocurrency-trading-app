#!/bin/bash
# cleanup-kafka-volumes.sh
# Clean up the Kafka (KRaft) Docker volume and optionally restart the infrastructure stack.
#
# Use when Kafka crashes or needs a hard reset (stale __cluster_metadata log).
# This script stops the container, backs up the volume data to a timestamped
# archive, then removes the stale volume so Kafka can start fresh.
#
# Usage:
#   ./scripts/docker/cleanup-kafka-volumes.sh       # Interactive (prompts for confirm)
#   ./scripts/docker/cleanup-kafka-volumes.sh -y   # Non-interactive

set -e

# Auto-detect the Docker Compose project name from the running kafka container.
# The project name is taken from the `name:` field of the compose file used to
# bring up the kafka service. We fall back to historical prefixes if no container is found.
KAFKA_CONTAINER="${KAFKA_CONTAINER:-crypto-trading-dev-kafka}"
DETECTED_PROJECT=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$KAFKA_CONTAINER" 2>/dev/null || true)
if [[ -n "$DETECTED_PROJECT" ]]; then
    VOLUME_PREFIX="$DETECTED_PROJECT"
elif docker volume ls -q | grep -q '^crypto-trading-dev_crypto-trading-dev-kafka-data$'; then
    VOLUME_PREFIX="crypto-trading-dev"
elif docker volume ls -q | grep -q '^crypto-trading-staging_crypto-trading-staging-kafka-data$'; then
    VOLUME_PREFIX="crypto-trading-staging"
elif docker volume ls -q | grep -q '^crypto-trading-prod_crypto-trading-prod-kafka-data$'; then
    VOLUME_PREFIX="crypto-trading-prod"
else
    VOLUME_PREFIX="be-cryptocurrency-trading-app"
fi
TARGET_VOLUMES=(
    "${VOLUME_PREFIX}_crypto-trading-dev-kafka-data"
    "${VOLUME_PREFIX}_crypto-trading-staging-kafka-data"
    "${VOLUME_PREFIX}_crypto-trading-prod-kafka-data"
    "${VOLUME_PREFIX}_kafka_data"
)
BACKUP_DIR="kafka-volume-backup-$(date +'%Y%m%d%H%M%S')"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
AUTO_CONFIRM=false

if [[ "${1:-}" == "-y" ]] || [[ "${1:-}" == "--yes" ]]; then
    AUTO_CONFIRM=true
fi

echo ""
echo -e "\033[1;36m=== Kafka Volume Cleanup (KRaft) ===\033[0m"
echo -e "  Detected project: $VOLUME_PREFIX"
echo ""

# Filter to only volumes that actually exist on the host.
EXISTING_VOLUMES=()
for vol in "${TARGET_VOLUMES[@]}"; do
    if docker volume ls -q | grep -qE "^${vol}$"; then
        EXISTING_VOLUMES+=("$vol")
    fi
done
TARGET_VOLUMES=("${EXISTING_VOLUMES[@]}")

if [[ ${#TARGET_VOLUMES[@]} -eq 0 ]]; then
    echo -e "\033[1;33mNo kafka_data volumes found — nothing to clean.\033[0m"
    exit 0
fi

if [[ "$AUTO_CONFIRM" == "false" ]]; then
    echo -e "\033[1;33mThe following volumes will be REMOVED:\033[0m"
    for vol in "${TARGET_VOLUMES[@]}"; do
        echo "  - $vol"
    done
    echo ""
    echo -e "\033[1;36mA backup archive will be created at: $BACKUP_DIR\033[0m"
    echo ""
    echo -n "Proceed? (y/N): "
    read -r confirmation
    if [[ "$confirmation" != "y" ]] && [[ "$confirmation" != "Y" ]]; then
        echo -e "\033[1;31mAborted.\033[0m"
        exit 0
    fi
fi

# Step 1: Stop container first
echo -e "\033[1;33m[1/4] Stopping Kafka container...\033[0m"
docker stop "$KAFKA_CONTAINER" 2>/dev/null || true
docker rm "$KAFKA_CONTAINER" 2>/dev/null || true
echo -e "\033[1;32m      Container stopped and removed.\033[0m"

# Step 2: Backup volumes
echo -e "\033[1;33m[2/4] Backing up volumes to ./$BACKUP_DIR...\033[0m"
mkdir -p "$BACKUP_DIR"

# Ensure alpine image is available for backup
echo -e "\033[1;36m      Pulling alpine image for backup...\033[0m"
if ! docker pull alpine:latest 2>/dev/null; then
    echo -e "\033[1;33m      WARNING: Could not pull alpine image. Skipping backup.\033[0m"
    echo -e "\033[1;36m      (This is non-fatal - volumes will still be removed)\033[0m"
fi

backup_ok=true
for vol in "${TARGET_VOLUMES[@]}"; do
    if docker volume ls -q | grep -qE "^${vol}$"; then
        tar_name="${vol#${VOLUME_PREFIX}_}.tar.gz"
        echo -e "\033[1;36m      Backing up $vol -> $tar_name\033[0m"
        if ! docker run --rm \
            -v "${vol}:/src:ro" \
            -v "$(pwd):/dst" \
            alpine tar czf "/dst/$BACKUP_DIR/$tar_name" -C /src . 2>/dev/null; then
            echo -e "\033[1;31m      WARNING: Failed to backup $vol\033[0m"
            backup_ok=false
        fi
    else
        echo -e "\033[1;90m      Skipping $vol (not found)\033[0m"
    fi
done

if [[ "$backup_ok" == "true" ]]; then
    echo -e "\033[1;32m      Backup complete: ./$BACKUP_DIR\033[0m"
else
    echo -e "\033[1;31m      Backup had warnings. Check $BACKUP_DIR.\033[0m"
fi

# Step 3: Remove volumes
echo -e "\033[1;33m[3/4] Removing stale volumes...\033[0m"
for vol in "${TARGET_VOLUMES[@]}"; do
    echo -e "\033[1;36m      Removing $vol...\033[0m"
    docker volume rm "$vol" 2>/dev/null || true
done
echo -e "\033[1;32m      Volumes removed.\033[0m"

# Step 4: Restart Kafka
echo -e "\033[1;33m[4/4] Starting Kafka stack...\033[0m"
cd "$REPO_ROOT"
docker compose -f docker-compose.infrastructure.yml --profile kafka up -d

echo ""
echo -e "\033[1;36m=== Done ===\033[0m"
echo -e "Run the following to check Kafka logs:"
echo -e "  \033[1;90mdocker logs $KAFKA_CONTAINER --tail 50\033[0m"
echo ""