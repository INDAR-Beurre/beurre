# 🧈 Beurre — One-line automated installer for Windows PowerShell
# Usage:
#   irm https://raw.githubusercontent.com/INDAR-Beurre/beurre/main/install.ps1 | iex

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "  🧈  B E U R R E — L'Agent Fondant & Autonome" -ForegroundColor Yellow
Write-Host "     Minimalist Agentic CLI for Model Aggregator & Relay" -ForegroundColor Gray
Write-Host ""

# 1. Check / Install Bun
if (Get-Command bun -ErrorAction SilentlyContinue) {
    $bunVersion = bun --version
    Write-Host "  ✔ Bun is already installed: v$bunVersion" -ForegroundColor Green
} else {
    Write-Host "  ⚡ Bun not found. Installing official Bun runtime for Windows..." -ForegroundColor Yellow
    irm bun.sh/install.ps1 | iex

    $env:BUN_INSTALL = "$HOME\.bun"
    $env:PATH = "$env:BUN_INSTALL\bin;$env:PATH"
    
    if (-not (Get-Command bun -ErrorAction SilentlyContinue)) {
        Write-Error "Failed to initialize Bun in PATH."
        exit 1
    }
    Write-Host "  ✔ Bun successfully installed!" -ForegroundColor Green
}

# 2. Install Beurre globally
Write-Host "  ⚡ Installing Beurre globally via Bun..." -ForegroundColor Yellow
if ($env:GITHUB_TOKEN) {
    bun add -g "git+https://$($env:GITHUB_TOKEN)@github.com/INDAR-Beurre/beurre.git"
} elseif (Get-Command gh -ErrorAction SilentlyContinue) {
    $token = gh auth token 2>$null
    if ($token) {
        bun add -g "git+https://${token}@github.com/INDAR-Beurre/beurre.git"
    } else {
        bun add -g "github:INDAR-Beurre/beurre"
    }
} else {
    bun add -g "github:INDAR-Beurre/beurre"
}

Write-Host ""
Write-Host "  ✨ Beurre is ready to melt!" -ForegroundColor Yellow
Write-Host "  ────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host "  Launch the interactive agentic harness:"
Write-Host "    beurre" -ForegroundColor Yellow
Write-Host "  ────────────────────────────────────────────────────────" -ForegroundColor Gray
Write-Host ""
