# compose-env.ps1 — Resolve compose file + env file pair for an environment.
#
# Usage:
#   . .\scripts\docker\compose-env.ps1 -Environment development
#   Write-Host "Compose: $COMPOSE_FILE, Env: $ENV_FILE"
#
# Pairing rules (mandatory):
#   development  -> docker-compose.development.yml        + .env.development
#   staging      -> docker-compose.staging.yml            + .env.staging
#   production   -> docker-compose.prod.yml               + .env.prod
#   monitoring   -> docker-compose.monitoring.prod.yml     + .env.prod (base)
#   monitoring-staging -> docker-compose.monitoring.staging.yml + .env.staging
#
# Refuses to run if no env is specified, or the resolved files don't exist.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet("development", "dev", "staging", "stg", "production", "prod", "monitoring", "mon", "monitoring-staging", "mon-stg")]
    [string]$Environment
)

$ErrorActionPreference = "Stop"

$scriptDir = $PSScriptRoot
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")

switch ($Environment) {
    { $_ -in @("development", "dev") } {
        $composeFile = Join-Path $repoRoot "docker-compose.development.yml"
        $infraFile   = Join-Path $repoRoot "docker-compose.infrastructure.development.yml"
        $envFile     = Join-Path $repoRoot ".env.development"
    }
    { $_ -in @("staging", "stg") } {
        $composeFile = Join-Path $repoRoot "docker-compose.staging.yml"
        $envFile     = Join-Path $repoRoot ".env.staging"
    }
    { $_ -in @("production", "prod") } {
        $composeFile = Join-Path $repoRoot "docker-compose.prod.yml"
        $envFile     = Join-Path $repoRoot ".env.prod"
    }
    { $_ -in @("monitoring", "mon") } {
        $composeFile = Join-Path $repoRoot "docker-compose.monitoring.prod.yml"
        $envFile     = Join-Path $repoRoot ".env.prod"
    }
    { $_ -in @("monitoring-staging", "mon-stg") } {
        $composeFile = Join-Path $repoRoot "docker-compose.monitoring.staging.yml"
        $envFile     = Join-Path $repoRoot ".env.staging"
    }
}

if (-not (Test-Path $composeFile)) {
    throw "Compose file not found: $composeFile"
}
if (-not (Test-Path $envFile)) {
    throw "Env file not found: $envFile. Each compose file must pair with its own .env.<environment>."
}

$bareEnv = Join-Path $repoRoot ".env"
if (Test-Path $bareEnv) {
    throw "Bare .env file detected at $bareEnv. This project forbids a generic .env. Each environment must use its own .env.<environment> file (paired with docker-compose.<environment>.yml)."
}

$script:COMPOSE_FILE = $composeFile
$script:ENV_FILE     = $envFile
if ($infraFile) {
    $script:INFRA_FILE = $infraFile
}

Write-Host "[compose-env] env=$Environment"
Write-Host "  COMPOSE_FILE = $COMPOSE_FILE"
Write-Host "  ENV_FILE     = $ENV_FILE"
if ($INFRA_FILE) {
    Write-Host "  INFRA_FILE   = $INFRA_FILE"
}
