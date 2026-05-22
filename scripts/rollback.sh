#!/bin/bash
# ============================================================
# Rollback Script for Crypto Trading Backend
# Usage: ./scripts/rollback.sh [IMAGE_TAG]
#
# Arguments:
#   IMAGE_TAG    Docker image tag to rollback to (optional)
#                If not provided, uses 'previous' image
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

IMAGE_TAG="${1:-previous}"
IMAGE_NAME="crypto-trading-backend"

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

cd "$APP_DIR"

log_info "Starting rollback to image: $IMAGE_TAG"

# Check if target image exists
if ! docker image inspect "$IMAGE_NAME:$IMAGE_TAG" > /dev/null 2>&1; then
    if [ "$IMAGE_TAG" = "previous" ]; then
        log_error "No previous image found to rollback to"
        log_info "Available images:"
        docker images "$IMAGE_NAME"
        exit 1
    else
        log_error "Image $IMAGE_NAME:$IMAGE_TAG not found"
        exit 1
    fi
fi

# Create backup of current state
log_info "Creating state backup..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
docker tag "$IMAGE_NAME:latest" "$IMAGE_NAME:rollback-$TIMESTAMP" 2>/dev/null || true
log_info "Current state backed up as: $IMAGE_NAME:rollback-$TIMESTAMP"

# Tag the target image as latest
log_info "Tagging $IMAGE_NAME:$IMAGE_TAG as latest..."
docker tag "$IMAGE_NAME:$IMAGE_TAG" "$IMAGE_NAME:latest"

# Stop current container
log_info "Stopping current container..."
docker compose stop app

# Start with new image
log_info "Starting container with rolled back image..."
docker compose up -d app

# Wait for health check
log_info "Waiting for application to be healthy..."
sleep 5

# Run health check
if "$SCRIPT_DIR/health-check.sh"; then
    log_success "Rollback completed successfully!"
else
    log_error "Health check failed after rollback!"
    log_info "Current state:"
    docker compose ps
    log_warning "Manual intervention may be required"
fi

log_success "Rollback to $IMAGE_TAG completed"
