<#
.SYNOPSIS
  KubeChat One-Click Deployment Script
  Automatically installs Docker Desktop + ngrok if missing,
  clones the repo (if needed), starts all services, and opens the tunnel.

.USAGE
  Right-click → Run with PowerShell
  OR from any terminal: powershell -ExecutionPolicy Bypass -File deploy.ps1

.NOTES
  Works on any Windows 10/11 PC.
  Requires internet connection.
  Run AS ADMINISTRATOR for auto-install features.
#>

# ─────────────────────────────────────────────────────────────
# CONFIG — Edit these if needed
# ─────────────────────────────────────────────────────────────
$REPO_URL    = "https://github.com/mittal122/chattining-application.git"
$NGROK_URL   = "guileless-blinkingly-ezra.ngrok-free.dev"   # Your fixed ngrok domain
$NGROK_TOKEN = ""   # <-- Paste your ngrok authtoken here (from dashboard.ngrok.com)
$APP_PORT    = 5000

# Smart deploy dir: if running FROM inside the repo, use current dir.
# Otherwise clone to %USERPROFILE%\kubechat
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if (Test-Path "$scriptDir\docker-compose.yml") {
    $DEPLOY_DIR = $scriptDir
} else {
    $DEPLOY_DIR = "$env:USERPROFILE\kubechat"
}

# ─────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────
function Write-Header($msg) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
    Write-Host "  $msg" -ForegroundColor Cyan
    Write-Host "═══════════════════════════════════════════════════" -ForegroundColor Cyan
}

function Write-Step($n, $total, $msg) {
    Write-Host ""
    Write-Host "[$n/$total] $msg" -ForegroundColor Yellow
}

function Write-OK($msg)   { Write-Host "  ✅ $msg" -ForegroundColor Green }
function Write-Info($msg) { Write-Host "  ℹ️  $msg" -ForegroundColor Gray }
function Write-Warn($msg) { Write-Host "  ⚠️  $msg" -ForegroundColor Magenta }
function Write-Fail($msg) { Write-Host "  ❌ $msg" -ForegroundColor Red }

function CommandExists($cmd) {
    return $null -ne (Get-Command $cmd -ErrorAction SilentlyContinue)
}

function Wait-ForDocker {
    Write-Info "Waiting for Docker Engine to start (up to 2 minutes)..."
    $timeout = 120
    $elapsed = 0
    while ($elapsed -lt $timeout) {
        $result = docker info 2>&1
        if ($LASTEXITCODE -eq 0) { return $true }
        Start-Sleep -Seconds 5
        $elapsed += 5
        Write-Host "  ." -NoNewline
    }
    Write-Host ""
    return $false
}

# ─────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────
Write-Header "KubeChat One-Click Deployment"
Write-Info "This script will set up and run KubeChat on this machine."
Write-Info "Deploy directory: $DEPLOY_DIR"

# ══ STEP 1: Install Chocolatey (package manager) ══════════════
Write-Step 1 6 "Checking Chocolatey (Windows package manager)..."
if (-not (CommandExists "choco")) {
    Write-Info "Chocolatey not found — installing..."
    try {
        Set-ExecutionPolicy Bypass -Scope Process -Force
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
        Invoke-Expression ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        Write-OK "Chocolatey installed!"
    } catch {
        Write-Fail "Failed to install Chocolatey: $_"
        Write-Warn "Please install manually from https://chocolatey.org and re-run this script."
        Read-Host "Press Enter to exit"
        exit 1
    }
} else {
    Write-OK "Chocolatey is already installed."
}

# ══ STEP 2: Install Git ════════════════════════════════════════
Write-Step 2 6 "Checking Git..."
if (-not (CommandExists "git")) {
    Write-Info "Git not found — installing via Chocolatey..."
    choco install git -y --no-progress 2>&1 | Out-Null
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    if (CommandExists "git") {
        Write-OK "Git installed!"
    } else {
        Write-Fail "Git installation failed. Please install from https://git-scm.com and re-run."
        exit 1
    }
} else {
    Write-OK "Git is already installed ($(git --version))"
}

# ══ STEP 3: Install Docker Desktop ════════════════════════════
Write-Step 3 6 "Checking Docker..."
$dockerRunning = $false

if (-not (CommandExists "docker")) {
    Write-Info "Docker not found — installing Docker Desktop via Chocolatey..."
    Write-Warn "This will take 3-5 minutes and may require a system restart."
    choco install docker-desktop -y --no-progress 2>&1 | Out-Null
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")

    if (CommandExists "docker") {
        Write-OK "Docker Desktop installed!"
        Write-Warn "NOTE: If this is the first-ever Docker install, a system restart may be required."
        Write-Warn "After restarting, run this script again to continue."
    } else {
        Write-Fail "Docker installation failed."
        Write-Info "Please install manually from https://www.docker.com/products/docker-desktop"
        Read-Host "Press Enter to exit"
        exit 1
    }
}

# Check if Docker Engine is responding
$dockerCheck = docker info 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Info "Docker is installed but not running — attempting to start Docker Desktop..."
    $dockerExe = "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    if (Test-Path $dockerExe) {
        Start-Process $dockerExe
    } else {
        # Try to find it
        $found = Get-ChildItem "C:\Program Files" -Recurse -Filter "Docker Desktop.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($found) { Start-Process $found.FullName }
    }
    $dockerRunning = Wait-ForDocker
    if (-not $dockerRunning) {
        Write-Fail "Docker Engine did not start in time."
        Write-Info "Please open Docker Desktop manually and re-run this script."
        Read-Host "Press Enter to exit"
        exit 1
    }
}
Write-OK "Docker Engine is running!"

# ══ STEP 4: Install ngrok ══════════════════════════════════════
Write-Step 4 6 "Checking ngrok..."
if (-not (CommandExists "ngrok")) {
    Write-Info "ngrok not found — installing via Chocolatey..."
    choco install ngrok -y --no-progress 2>&1 | Out-Null
    $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
    if (CommandExists "ngrok") {
        Write-OK "ngrok installed!"
    } else {
        Write-Fail "ngrok installation failed."
        Write-Info "Please download ngrok manually from https://ngrok.com/download"
    }
} else {
    Write-OK "ngrok is already installed."
}

# Configure ngrok authtoken if provided
if ($NGROK_TOKEN -ne "") {
    Write-Info "Configuring ngrok authtoken..."
    ngrok config add-authtoken $NGROK_TOKEN 2>&1 | Out-Null
    Write-OK "ngrok authtoken configured."
} else {
    Write-Warn "No NGROK_TOKEN set in the script. ngrok tunnel may not work."
    Write-Warn "Edit deploy.ps1 and add your token from https://dashboard.ngrok.com"
}

# ══ STEP 5: Clone or Update the Repository ════════════════════
Write-Step 5 6 "Setting up project..."
if (-not (Test-Path $DEPLOY_DIR)) {
    Write-Info "Cloning repository to $DEPLOY_DIR..."
    git clone $REPO_URL $DEPLOY_DIR
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Failed to clone repository. Check your internet connection."
        Read-Host "Press Enter to exit"
        exit 1
    }
    Write-OK "Repository cloned!"
} else {
    Write-Info "Project already exists at $DEPLOY_DIR — pulling latest changes..."
    Set-Location $DEPLOY_DIR
    git pull origin master
    Write-OK "Repository updated!"
}

Set-Location $DEPLOY_DIR

# ══ STEP 6: Start All Services ════════════════════════════════
Write-Step 6 6 "Starting KubeChat services..."
Write-Info "This will build and start all Docker containers (first run takes 3-5 minutes)..."

docker-compose up -d --build

if ($LASTEXITCODE -ne 0) {
    Write-Fail "docker-compose failed. Check error messages above."
    Read-Host "Press Enter to exit"
    exit 1
}

Write-OK "All containers started!"
Write-Info "Waiting 10 seconds for services to initialize..."
Start-Sleep -Seconds 10

# Health check
try {
    $health = Invoke-RestMethod "http://localhost:$APP_PORT/health" -TimeoutSec 10
    Write-OK "API Gateway is healthy: $($health.status)"
} catch {
    Write-Warn "Health check timed out — services may still be starting. This is normal."
}

# ══ START ngrok TUNNEL ════════════════════════════════════════
Write-Header "Opening Public Internet Tunnel"
Write-Info "Starting ngrok tunnel on port $APP_PORT..."
Write-Info ""

if ($NGROK_URL -ne "") {
    Write-OK "Your app will be accessible at:"
    Write-Host "  👉  https://$NGROK_URL" -ForegroundColor Green
    Write-Host ""
    Write-Warn "Update your Flutter app's api_config.dart with this URL, then rebuild APK."
    Write-Warn "DO NOT close this window — closing it stops the tunnel!"
    Write-Host ""
    ngrok http --url=$NGROK_URL $APP_PORT
} else {
    Write-Info "Starting ngrok (random URL — check terminal output for your URL)..."
    Write-Warn "DO NOT close this window — closing it stops the tunnel!"
    ngrok http $APP_PORT
}
