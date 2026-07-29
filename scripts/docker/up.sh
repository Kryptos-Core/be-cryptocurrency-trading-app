#!/usr/bin/env bash
# up.sh — bring up the local stack using .env.development.
#
# Each compose file pairs with its own .env file. This script defaults to the
# development pair but lets you target any environment.
#
# Usage:
#   ./scripts/docker/up.sh                            # development (default)
#   ./scripts/docker/up.sh development --build        # rebuild Go service images
#   ./scripts/docker/up.sh staging                    # .env.staging + docker-compose.staging.yml
#   ./scripts/docker/up.sh staging --infra-only       # only infra pieces from the staging compose
#   ./scripts/docker/up.sh development --down         # stop + remove volumes
#
# Pairing is enforced by compose-env.sh: a bare .env file at repo root causes
# the script to abort.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_ROOT}"

ENV_NAME="${1:-development}"
shift || true

BUILD=false
DOWN=false
INFRA_ONLY=false
SERVICES_ONLY=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --build)        BUILD=true; shift ;;
        --down)         DOWN=true; shift ;;
        --infra-only)   INFRA_ONLY=true; shift ;;
        --services-only) SERVICES_ONLY=true; shift ;;
        *)
            echo "Unknown arg: $1" >&2
            exit 1
            ;;
    esac
done

# shellcheck disable=SC1091
source "${SCRIPT_DIR}/compose-env.sh" "${ENV_NAME}"

DOCKER_BASE=(docker compose --env-file "${ENV_FILE}")

if [[ "${DOWN}" == true ]]; then
    echo "==> Stopping and removing containers + volumes for ${ENV_NAME}"
    if [[ -n "${INFRA_FILE:-}" ]]; then
        "${DOCKER_BASE[@]}" -f "${COMPOSE_FILE}" --profile services down -v
    else
        "${DOCKER_BASE[@]}" -f "${COMPOSE_FILE}" down -v
    fi
    exit $?
fi

BUILD_ARGS=()
[[ "${BUILD}" == true ]] && BUILD_ARGS=("--build")

if [[ "${INFRA_ONLY}" == true ]]; then
    echo "==> Starting infrastructure only (${ENV_NAME})"
    INFRA_TARGET="${INFRA_FILE:-${COMPOSE_FILE}}"
    "${DOCKER_BASE[@]}" -f "${INFRA_TARGET}" up -d
    exit $?
fi

if [[ "${SERVICES_ONLY}" == true ]]; then
    echo "==> Starting Go services only (${ENV_NAME})"
    "${DOCKER_BASE[@]}" -f "${COMPOSE_FILE}" --profile services up -d "${BUILD_ARGS[@]}"
    exit $?
fi

# Default: infra + Go services (development only — staging/prod are all-in-one)
if [[ -n "${INFRA_FILE:-}" ]]; then
    echo "==> Starting infrastructure + Go services (${ENV_NAME})"
    "${DOCKER_BASE[@]}" -f "${INFRA_FILE}" up -d
    "${DOCKER_BASE[@]}" -f "${COMPOSE_FILE}" --profile services up -d "${BUILD_ARGS[@]}"
else
    echo "==> Starting full stack (${ENV_NAME})"
    "${DOCKER_BASE[@]}" -f "${COMPOSE_FILE}" up -d "${BUILD_ARGS[@]}"
fi
