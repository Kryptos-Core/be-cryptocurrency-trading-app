#!/bin/bash
# ============================================================
# Health Check Script for Crypto Trading Backend
# Usage: ./scripts/health-check.sh [OPTIONS]
#
# Options:
#   -u, --url      Health check URL (default: http://localhost:3000/health)
#   -r, --retries  Number of retries (default: 30)
#   -i, --interval Retry interval in seconds (default: 5)
#   -t, --timeout  Request timeout in seconds (default: 10)
#   -h, --help     Show this help message
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Default values
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/health}"
MAX_RETRIES=30
RETRY_INTERVAL=5
TIMEOUT=10

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -u|--url)
            HEALTH_URL="$2"
            shift 2
            ;;
        -r|--retries)
            MAX_RETRIES="$2"
            shift 2
            ;;
        -i|--interval)
            RETRY_INTERVAL="$2"
            shift 2
            ;;
        -t|--timeout)
            TIMEOUT="$2"
            shift 2
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

log_info "Health check URL: $HEALTH_URL"
log_info "Max retries: $MAX_RETRIES, Interval: ${RETRY_INTERVAL}s, Timeout: ${TIMEOUT}s"

# Try to find curl or wget
CURL_CMD=""
if command -v curl &> /dev/null; then
    CURL_CMD="curl"
elif command -v wget &> /dev/null; then
    CURL_CMD="wget"
else
    log_error "Neither curl nor wget found. Please install curl."
    exit 1
fi

perform_check() {
    if [ "$CURL_CMD" = "curl" ]; then
        response=$(curl -sf --max-time "$TIMEOUT" "$HEALTH_URL" 2>/dev/null)
        status=$?
    else
        response=$(wget --timeout="$TIMEOUT" -q -O - "$HEALTH_URL" 2>/dev/null)
        status=$?
    fi

    if [ $status -eq 0 ]; then
        return 0
    else
        return 1
    fi
}

# Health check loop
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    RETRY_COUNT=$((RETRY_COUNT + 1))

    echo -ne "${BLUE}[HEALTH]${NC} Check $RETRY_COUNT/$MAX_RETRIES... "

    if perform_check; then
        echo -e "${GREEN}OK${NC}"

        # Additional checks if available
        if command -v curl &> /dev/null; then
            http_code=$(curl -sf --max-time "$TIMEOUT" -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")
            if [ "$http_code" = "200" ]; then
                log_success "Application is healthy (HTTP $http_code)"
                exit 0
            else
                log_warning "Application responded with HTTP $http_code"
            fi
        fi

        log_success "Application is healthy"
        exit 0
    else
        echo -e "${RED}FAILED${NC}"

        if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
            log_error "Health check failed after $MAX_RETRIES attempts"
            log_info "Container logs:"
            docker compose logs --tail=20 app 2>/dev/null || true
            exit 1
        fi

        sleep "$RETRY_INTERVAL"
    fi
done

log_error "Health check failed"
exit 1
