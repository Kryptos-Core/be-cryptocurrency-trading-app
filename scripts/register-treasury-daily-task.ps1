param(
  [string]$TaskName = 'CryptoTradingTreasuryDaily',
  [string]$RunAt = '02:30',
  [string]$RepoPath = (Resolve-Path "$PSScriptRoot\..").Path,
  [switch]$RunWithHighest
)

$ErrorActionPreference = 'Stop'

$runnerScript = Join-Path $RepoPath 'scripts\run-treasury-daily.ps1'
if (!(Test-Path $runnerScript)) {
  throw "Runner script not found: $runnerScript"
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runnerScript`" -RepoPath `"$RepoPath`""
$trigger = New-ScheduledTaskTrigger -Daily -At $RunAt
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$runLevel = if ($RunWithHighest) { 'Highest' } else { 'Limited' }
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel $runLevel

try {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
} catch {}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null

Write-Host "Registered scheduled task '$TaskName' at $RunAt (RunLevel=$runLevel)"
Write-Host "Run now: Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "Check history: Get-ScheduledTaskInfo -TaskName '$TaskName'"
