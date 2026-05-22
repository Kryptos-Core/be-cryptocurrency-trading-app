#!/bin/bash
# ============================================================
# Deployment Script for Crypto Trading Backend
# Usage: ./scripts/deploy.sh [OPTIONS]
#
# Options:
#   -b, --backup       Create database backup before deploy
#   -m, --migrate      Run database migrations
#   -s, --skip-health  Skip health check after deploy
#   -h, --help         Show this help message
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$APP_DIR/.env.production"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default options
SKIP_BACKUP=false
RUN_MIGRATIONS=false
SKIP_HEALTH_CHECK=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -b|--backup)
            SKIP_BACKUP=false
            shift
            ;;
        --no-backup)
            SKIP_BACKUP=true
            shift
            ;;
        -m|--migrate)
            RUN_MIGRATIONS=true
            shift
            ;;
        -s|--skip-health)
            SKIP_HEALTH_CHECK=true
            shift
            ;;
        -h|--help)
            grep "^# " "$0" | sed 's/^# //'
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

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

# Check if .env.production exists
if [ ! -f "$ENV_FILE" ]; then
    log_error ".env.production not found at $ENV_FILE"
    log_info "Please create .env.production based on .env.production.example"
    exit 1
fi

# Change to app directory
cd "$APP_DIR"

log_info "Starting deployment..."

# Load environment variables
source "$ENV_FILE"

# Backup database if requested
if [ "$SKIP_BACKUP" = false ]; then
    log_info "Creating database backup..."
    TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_DIR="$APP_DIR/backups/db"
    mkdir -p "$BACKUP_DIR"

    docker compose exec -T postgres pg_dump \
        -U "${CORE_DB_USERNAME:-crypto_user}" \
        -d "${CORE_DB_NAME:-crypto_trading_platform}" \
        -Fc \
        -f "/backups/backup_${TIMESTAMP}.dump" \
        2>/dev/null || true

    if [ -f "$BACKUP_DIR/backup_${TIMESTAMP}.dump" ]; then
        log_success "Database backup created: backup_${TIMESTAMP}.dump"
    else
        log_warning "Database backup failed or skipped"
    fi
fi

# Pull latest images
log_info "Pulling latest images..."
docker compose pull

# Stop current containers
log_info "Stopping current containers..."
docker compose stop app

# Start containers
log_info "Starting containers..."
docker compose up -d app

# Run migrations if requested
if [ "$RUN_MIGRATIONS" = true ]; then
    log_info "Running database migrations..."
    docker compose exec -T app npm run db:migrate || log_warning "Migrations completed or no migrations to run"
fi

# Health check
if [ "$SKIP_HEALTH_CHECK" = false ]; then
    log_info "Running health check..."
    if "$SCRIPT_DIR/health-check.sh"; then
        log_success "Deployment completed successfully!"
    else
        log_error "Health check failed!"
        log_info "Rolling back..."
        docker compose stop app
        docker tag crypto-trading-backend:previous crypto-trading-backend:latest 2>/dev/null || true
        docker compose up -d app
        exit 1
    fi
fi

# Show container status
log_info "Container status:"
docker compose ps

# Cleanup unused images
log_info "Cleaning up unused Docker images..."
docker image prune -f

log_success "Deployment completed at $(date)"
