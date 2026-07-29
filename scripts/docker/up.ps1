# up.ps1 — bring up the local stack using the matching .env file.
#
# Each compose file pairs with its own .env file. This script defaults to the
# development pair but lets you target any environment.
#
# Usage:
#   .\scripts\docker\up.ps1                                   # development (default)
#   .\scripts\docker\up.ps1 -Environment development -Build   # rebuild Go service images
#   .\scripts\docker\up.ps1 -Environment staging              # .env.staging + docker-compose.staging.yml
#   .\scripts\docker\up.ps1 -Environment development -InfraOnly
#   .\scripts\docker\up.ps1 -Environment development -Down    # stop + remove volumes
#
# Pairing is enforced by compose-env.ps1: a bare .env file at repo root causes
# the script to abort.

[CmdletBinding()]
param(
    [ValidateSet("development", "dev", "staging", "stg", "production", "prod", "monitoring", "mon", "monitoring-staging", "mon-stg")]
    [string]$Environment = "development",

    [switch]$Build,
    [switch]$Down,
    [switch]$InfraOnly,
    [switch]$ServicesOnly
)

$ErrorActionPreference = "Stop"
$scriptDir = $PSScriptRoot
$repoRoot = Resolve-Path (Join-Path $scriptDir "..\..")
Set-Location $repoRoot

. (Join-Path $scriptDir "compose-env.ps1") -Environment $Environment

$dockerArgs = @("compose", "--env-file", $ENV_FILE)

function Invoke-DockerCompose {
    param([string[]]$ExtraArgs)
    & docker @dockerArgs @ExtraArgs
}

if ($Down) {
    Write-Host "==> Stopping and removing containers + volumes for $Environment" -ForegroundColor Yellow
    if ($INFRA_FILE) {
        Invoke-DockerCompose -ExtraArgs @("-f", $COMPOSE_FILE, "--profile", "services", "down", "-v")
    } else {
        Invoke-DockerCompose -ExtraArgs @("-f", $COMPOSE_FILE, "down", "-v")
    }
    exit $LASTEXITCODE
}

$buildArgs = @()
if ($Build) { $buildArgs += "--build" }

if ($InfraOnly) {
    Write-Host "==> Starting infrastructure only ($Environment)" -ForegroundColor Cyan
    $infraTarget = if ($INFRA_FILE) { $INFRA_FILE } else { $COMPOSE_FILE }
    Invoke-DockerCompose -ExtraArgs @("-f", $infraTarget, "up", "-d")
    exit $LASTEXITCODE
}

if ($ServicesOnly) {
    Write-Host "==> Starting Go services only ($Environment)" -ForegroundColor Cyan
    Invoke-DockerCompose -ExtraArgs (@("-f", $COMPOSE_FILE, "--profile", "services", "up", "-d") + $buildArgs)
    exit $LASTEXITCODE
}

# Default path
if ($INFRA_FILE) {
    Write-Host "==> Starting infrastructure + Go services ($Environment)" -ForegroundColor Cyan
    Invoke-DockerCompose -ExtraArgs @("-f", $INFRA_FILE, "up", "-d")
    Invoke-DockerCompose -ExtraArgs (@("-f", $COMPOSE_FILE, "--profile", "services", "up", "-d") + $buildArgs)
} else {
    Write-Host "==> Starting full stack ($Environment)" -ForegroundColor Cyan
    Invoke-DockerCompose -ExtraArgs (@("-f", $COMPOSE_FILE, "up", "-d") + $buildArgs)
}
exit $LASTEXITCODE
