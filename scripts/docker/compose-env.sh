# compose-env.sh — Resolve compose file + env file pair for an environment.
#
# Usage (source this file):
#   source scripts/docker/compose-env.sh development
#   echo "$COMPOSE_FILE $ENV_FILE"
#
# Pairing rules (mandatory):
#   development  -> docker-compose.development.yml        + .env.development
#                   (includes docker-compose.infrastructure.development.yml)
#   staging      -> docker-compose.staging.yml            + .env.staging
#                   (uses docker-compose.infrastructure.development.yml + .env.development
#                    ONLY if you want a local-ish preview; staging infra otherwise
#                    comes from docker-compose.staging.yml itself)
#   production   -> docker-compose.prod.yml               + .env.production
#
# For monitoring:
#   monitoring      -> docker-compose.monitoring.yml       + .env.production (base)
#   monitoring-staging -> docker-compose.monitoring.staging.yml + .env.staging
#
# Refuses to run if no env is specified, or the resolved files don't exist.

set -euo pipefail

ENV_NAME="${1:-}"
if [[ -z "${ENV_NAME}" ]]; then
    echo "ERROR: environment name is required." >&2
    echo "Usage: source scripts/docker/compose-env.sh <development|staging|production|monitoring|monitoring-staging>" >&2
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"

case "${ENV_NAME}" in
    development|dev)
        COMPOSE_FILE="${REPO_ROOT}/docker-compose.development.yml"
        INFRA_FILE="${REPO_ROOT}/docker-compose.infrastructure.development.yml"
        ENV_FILE="${REPO_ROOT}/.env.development"
        ;;
    staging|stg)
        COMPOSE_FILE="${REPO_ROOT}/docker-compose.staging.yml"
        ENV_FILE="${REPO_ROOT}/.env.staging"
        ;;
    production|prod)
        COMPOSE_FILE="${REPO_ROOT}/docker-compose.prod.yml"
        ENV_FILE="${REPO_ROOT}/.env.production"
        ;;
    monitoring|mon)
        COMPOSE_FILE="${REPO_ROOT}/docker-compose.monitoring.yml"
        ENV_FILE="${REPO_ROOT}/.env.production"
        ;;
    monitoring-staging|mon-stg)
        COMPOSE_FILE="${REPO_ROOT}/docker-compose.monitoring.staging.yml"
        ENV_FILE="${REPO_ROOT}/.env.staging"
        ;;
    *)
        echo "ERROR: unknown environment '${ENV_NAME}'" >&2
        echo "Valid: development | staging | production | monitoring | monitoring-staging" >&2
        exit 1
        ;;
esac

if [[ ! -f "${COMPOSE_FILE}" ]]; then
    echo "ERROR: compose file not found: ${COMPOSE_FILE}" >&2
    exit 1
fi
if [[ ! -f "${ENV_FILE}" ]]; then
    echo "ERROR: env file not found: ${ENV_FILE}" >&2
    echo "Each compose file must pair with its own .env.<environment>." >&2
    exit 1
fi

# Refuse to silently fall back to .env
if [[ -f "${REPO_ROOT}/.env" ]]; then
    echo "ERROR: bare .env file detected at ${REPO_ROOT}/.env." >&2
    echo "This project forbids a generic .env. Each environment must use its own" >&2
    echo ".env.<environment> file (paired with docker-compose.<environment>.yml)." >&2
    exit 1
fi

export COMPOSE_FILE ENV_FILE
if [[ -n "${INFRA_FILE:-}" ]]; then
    export INFRA_FILE
fi

echo "[compose-env] env=${ENV_NAME}"
echo "  COMPOSE_FILE = ${COMPOSE_FILE}"
echo "  ENV_FILE     = ${ENV_FILE}"
if [[ -n "${INFRA_FILE:-}" ]]; then
    echo "  INFRA_FILE   = ${INFRA_FILE}"
fi
