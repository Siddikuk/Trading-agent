# ============================================================
#  Trading Agent — Windows Service Installer
#  Run this once as Administrator to make the bridge and agent
#  run in the background (no terminal needed, auto-start on boot).
#
#  Usage:
#    Right-click PowerShell → "Run as Administrator"
#    cd C:\vps-agent\Trading-agent
#    .\setup-windows-services.ps1
# ============================================================

$ErrorActionPreference = "Stop"

# ── Paths (edit these if your setup is different) ────────────────────────────
$RepoRoot   = Split-Path -Parent $MyInvocation.MyCommand.Path
$BridgeDir  = Join-Path $RepoRoot "vps-bridge"
$AgentDir   = Join-Path $RepoRoot "vps-agent"
$NssmPath   = Join-Path $RepoRoot "nssm.exe"
$LogDir     = Join-Path $RepoRoot "logs"

# ── Detect Python ─────────────────────────────────────────────────────────────
$Python = (Get-Command python -ErrorAction SilentlyContinue)?.Source
if (-not $Python) {
    $Python = (Get-Command python3 -ErrorAction SilentlyContinue)?.Source
}
if (-not $Python) {
    Write-Error "Python not found. Make sure Python is installed and on PATH."
    exit 1
}
Write-Host "Using Python: $Python" -ForegroundColor Cyan

# ── Download NSSM if not present ──────────────────────────────────────────────
if (-not (Test-Path $NssmPath)) {
    Write-Host "Downloading NSSM..." -ForegroundColor Yellow
    $ZipPath = Join-Path $env:TEMP "nssm.zip"
    Invoke-WebRequest "https://nssm.cc/ci/nssm-2.24-101-g897c7ad.zip" -OutFile $ZipPath
    $ExtractPath = Join-Path $env:TEMP "nssm-extract"
    Expand-Archive $ZipPath -DestinationPath $ExtractPath -Force
    $NssmBin = Get-ChildItem -Path $ExtractPath -Filter "nssm.exe" -Recurse |
               Where-Object { $_.FullName -match "win64" } |
               Select-Object -First 1
    if (-not $NssmBin) {
        $NssmBin = Get-ChildItem -Path $ExtractPath -Filter "nssm.exe" -Recurse |
                   Select-Object -First 1
    }
    Copy-Item $NssmBin.FullName -Destination $NssmPath
    Write-Host "NSSM downloaded." -ForegroundColor Green
}

# ── Create log directory ──────────────────────────────────────────────────────
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir | Out-Null
}

# ── Helper: install or update a service ──────────────────────────────────────
function Install-Service {
    param(
        [string]$Name,
        [string]$DisplayName,
        [string]$WorkDir,
        [string]$Script,
        [string]$Args = ""
    )

    $existing = & sc.exe query $Name 2>&1
    if ($existing -notmatch "does not exist") {
        Write-Host "Stopping existing service '$Name'..." -ForegroundColor Yellow
        & $NssmPath stop $Name confirm 2>&1 | Out-Null
        & $NssmPath remove $Name confirm 2>&1 | Out-Null
    }

    Write-Host "Installing service '$Name'..." -ForegroundColor Cyan
    & $NssmPath install $Name $Python

    $FullArgs = if ($Args) { "$Script $Args" } else { $Script }
    & $NssmPath set $Name AppParameters    $FullArgs
    & $NssmPath set $Name AppDirectory     $WorkDir
    & $NssmPath set $Name DisplayName      $DisplayName
    & $NssmPath set $Name Description      "AI Trading Agent - $DisplayName"
    & $NssmPath set $Name Start            SERVICE_AUTO_START
    & $NssmPath set $Name AppRestartDelay  10000   # 10s delay before restart
    & $NssmPath set $Name AppStdout        (Join-Path $LogDir "$Name-stdout.log")
    & $NssmPath set $Name AppStderr        (Join-Path $LogDir "$Name-stderr.log")
    & $NssmPath set $Name AppRotateFiles   1
    & $NssmPath set $Name AppRotateBytes   10485760  # rotate at 10 MB

    Write-Host "Starting service '$Name'..." -ForegroundColor Cyan
    & $NssmPath start $Name
    Write-Host "Service '$Name' installed and started." -ForegroundColor Green
}

# ── Install MT5 Bridge ────────────────────────────────────────────────────────
Install-Service `
    -Name        "TradingBridge" `
    -DisplayName "MT5 Bridge Server" `
    -WorkDir     $BridgeDir `
    -Script      (Join-Path $BridgeDir "server.py") `
    -Args        "--port 8080 --host 127.0.0.1"

# Wait a moment for bridge to start before agent connects
Start-Sleep -Seconds 3

# ── Install Trading Agent ─────────────────────────────────────────────────────
Install-Service `
    -Name        "TradingAgent" `
    -DisplayName "AI Trading Agent" `
    -WorkDir     $AgentDir `
    -Script      (Join-Path $AgentDir "main.py")

# ── Done ─────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "  Both services installed successfully!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Yellow
Write-Host "  Check status:   sc query TradingBridge; sc query TradingAgent"
Write-Host "  Stop:           nssm stop TradingBridge; nssm stop TradingAgent"
Write-Host "  Start:          nssm start TradingBridge; nssm start TradingAgent"
Write-Host "  View logs:      Get-Content '$LogDir\TradingAgent-stdout.log' -Tail 50 -Wait"
Write-Host "  Uninstall:      nssm remove TradingBridge confirm; nssm remove TradingAgent confirm"
Write-Host ""
Write-Host "Logs are in: $LogDir" -ForegroundColor Cyan
