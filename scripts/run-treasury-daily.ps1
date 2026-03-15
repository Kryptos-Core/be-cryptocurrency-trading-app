param(
  [string]$RepoPath = (Resolve-Path "$PSScriptRoot\..").Path,
  [string]$E2EEnvFile = "scripts\treasury-e2e.env"
)

$ErrorActionPreference = 'Stop'

function Import-EnvFile {
  param([string]$FilePath)

  if (!(Test-Path $FilePath)) {
    return
  }

  Get-Content $FilePath | ForEach-Object {
    $line = $_.Trim()
    if ($line -eq '' -or $line.StartsWith('#')) {
      return
    }

    $pair = $line -split '=', 2
    if ($pair.Length -ne 2) {
      return
    }

    $key = $pair[0].Trim()
    $value = $pair[1].Trim().Trim('"')
    if ($key) {
      [Environment]::SetEnvironmentVariable($key, $value, 'Process')
    }
  }
}

Import-EnvFile -FilePath (Join-Path $RepoPath ".env")
Import-EnvFile -FilePath (Join-Path $RepoPath $E2EEnvFile)

# Dev-friendly defaults: skip E2E if missing env, keep health check as non-blocking unless explicitly strict.
if (-not $env:TREASURY_E2E_ALLOW_SKIP) {
  $env:TREASURY_E2E_ALLOW_SKIP = 'true'
}
if (-not $env:TREASURY_HEALTH_FAIL_ON_CRITICAL) {
  $env:TREASURY_HEALTH_FAIL_ON_CRITICAL = 'false'
}

$logDir = Join-Path $RepoPath "logs"
if (!(Test-Path $logDir)) {
  New-Item -ItemType Directory -Path $logDir | Out-Null
}

$logFile = Join-Path $logDir "treasury-daily.log"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

"[$timestamp] START treasury:daily" | Out-File -FilePath $logFile -Append -Encoding utf8

Push-Location $RepoPath
try {
  npm run treasury:daily 2>&1 | Tee-Object -FilePath $logFile -Append
  if ($LASTEXITCODE -ne 0) {
    throw "npm run treasury:daily exited with code $LASTEXITCODE"
  }
  $endTs = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "[$endTs] SUCCESS treasury:daily" | Out-File -FilePath $logFile -Append -Encoding utf8
}
catch {
  $endTs = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  "[$endTs] FAILED treasury:daily :: $($_.Exception.Message)" | Out-File -FilePath $logFile -Append -Encoding utf8
  throw
}
finally {
  Pop-Location
}
