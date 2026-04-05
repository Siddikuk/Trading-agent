# ============================================================
#  Trading Agent — Windows Task Scheduler Installer
#  Run once as Administrator. No downloads needed.
#
#  Usage:
#    Right-click PowerShell → "Run as Administrator"
#    cd C:\vps-agent
#    .\setup-windows-services.ps1
# ============================================================

$ErrorActionPreference = "Stop"

# ── Paths ─────────────────────────────────────────────────────────────────────
$RepoRoot  = Split-Path -Parent $MyInvocation.MyCommand.Path
$BridgeDir = Join-Path $RepoRoot "vps-bridge"
$AgentDir  = Join-Path $RepoRoot "vps-agent"
$LogDir    = Join-Path $RepoRoot "logs"

# ── Detect Python ─────────────────────────────────────────────────────────────
$PyCmd = Get-Command python -ErrorAction SilentlyContinue
if ($PyCmd) { $Python = $PyCmd.Source } else { $Python = $null }
if (-not $Python) {
    $PyCmd = Get-Command python3 -ErrorAction SilentlyContinue
    if ($PyCmd) { $Python = $PyCmd.Source } else { $Python = $null }
}
if (-not $Python) {
    Write-Error "Python not found. Make sure Python is installed and on PATH."
    exit 1
}
Write-Host "Using Python: $Python" -ForegroundColor Cyan

# ── Create log directory ──────────────────────────────────────────────────────
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

# ── Create batch launcher files ───────────────────────────────────────────────
# These redirect stdout+stderr to log files so you can watch them later.

$BridgeBat = Join-Path $BridgeDir "start.bat"
@"
@echo off
cd /d "$BridgeDir"
:loop
"$Python" server.py --port 8080 --host 127.0.0.1 >> "$LogDir\bridge.log" 2>&1
echo [%date% %time%] Bridge exited, restarting in 10s... >> "$LogDir\bridge.log"
timeout /t 10 /nobreak >nul
goto loop
"@ | Set-Content $BridgeBat -Encoding ASCII

$AgentBat = Join-Path $AgentDir "start.bat"
@"
@echo off
cd /d "$AgentDir"
:loop
"$Python" main.py >> "$LogDir\agent.log" 2>&1
echo [%date% %time%] Agent exited, restarting in 10s... >> "$LogDir\agent.log"
timeout /t 10 /nobreak >nul
goto loop
"@ | Set-Content $AgentBat -Encoding ASCII

Write-Host "Batch launchers created." -ForegroundColor Green

# ── Helper: register a scheduled task ────────────────────────────────────────
function Register-AgentTask {
    param([string]$TaskName, [string]$BatFile, [int]$DelaySeconds = 0)

    # Remove existing task if present
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

    $action = New-ScheduledTaskAction `
        -Execute "cmd.exe" `
        -Argument "/c `"$BatFile`""

    $trigger = New-ScheduledTaskTrigger -AtStartup

    # Add delay for agent so bridge starts first
    if ($DelaySeconds -gt 0) {
        $trigger.Delay = "PT${DelaySeconds}S"
    }

    $settings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit (New-TimeSpan -Days 3650) `
        -RestartCount 999 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -MultipleInstances IgnoreNew

    $principal = New-ScheduledTaskPrincipal `
        -UserId "SYSTEM" `
        -LogonType ServiceAccount `
        -RunLevel Highest

    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Force | Out-Null

    Write-Host "Task '$TaskName' registered." -ForegroundColor Green
}

# ── Register tasks ────────────────────────────────────────────────────────────
Register-AgentTask -TaskName "TradingBridge" -BatFile $BridgeBat -DelaySeconds 0
Register-AgentTask -TaskName "TradingAgent"  -BatFile $AgentBat  -DelaySeconds 15

# ── Start them now ────────────────────────────────────────────────────────────
Write-Host "Starting TradingBridge..." -ForegroundColor Cyan
Start-ScheduledTask -TaskName "TradingBridge"
Start-Sleep -Seconds 5

Write-Host "Starting TradingAgent..." -ForegroundColor Cyan
Start-ScheduledTask -TaskName "TradingAgent"

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Done! Both services are running." -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Yellow
Write-Host "  Check status:  Get-ScheduledTask TradingBridge, TradingAgent"
Write-Host "  Stop bridge:   Stop-ScheduledTask TradingBridge"
Write-Host "  Stop agent:    Stop-ScheduledTask TradingAgent"
Write-Host "  Start bridge:  Start-ScheduledTask TradingBridge"
Write-Host "  Start agent:   Start-ScheduledTask TradingAgent"
Write-Host "  Watch logs:    Get-Content '$LogDir\agent.log' -Tail 50 -Wait"
Write-Host ""
Write-Host "Logs are in: $LogDir" -ForegroundColor Cyan
