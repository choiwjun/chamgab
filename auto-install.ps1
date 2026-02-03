# Claude Labs v1.7.6 - Auto Install Script
# Installs all skills and constitutions to global ~/.claude/

$ErrorActionPreference = "Stop"
$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$TARGET_DIR = "$env:USERPROFILE\.claude"

Write-Host ""
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  Claude Labs v1.7.6 - Auto Install" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Source: $SCRIPT_DIR\.claude"
Write-Host "  Target: $TARGET_DIR"
Write-Host ""

# Create directories
Write-Host "Creating directories..." -ForegroundColor Cyan
$dirs = @("skills", "agents", "constitutions", "docs", "commands")
foreach ($dir in $dirs) {
    New-Item -ItemType Directory -Force -Path "$TARGET_DIR\$dir" | Out-Null
}
Write-Host "  Done" -ForegroundColor Green

# Copy skills
Write-Host "Copying skills..." -ForegroundColor Cyan
$skillsSource = "$SCRIPT_DIR\.claude\skills"
if (Test-Path $skillsSource) {
    Get-ChildItem -Path $skillsSource -Directory | ForEach-Object {
        Write-Host "  Installing $($_.Name)..." -NoNewline
        Copy-Item -Recurse -Force $_.FullName "$TARGET_DIR\skills\$($_.Name)"
        Write-Host " Done" -ForegroundColor Green
    }
}

# Copy agents
Write-Host "Copying agents..." -ForegroundColor Cyan
$agentsSource = "$SCRIPT_DIR\.claude\agents"
if (Test-Path $agentsSource) {
    Copy-Item -Recurse -Force "$agentsSource\*" "$TARGET_DIR\agents\"
    Write-Host "  Done" -ForegroundColor Green
}

# Copy constitutions
Write-Host "Copying constitutions..." -ForegroundColor Cyan
$constSource = "$SCRIPT_DIR\.claude\constitutions"
if (Test-Path $constSource) {
    Copy-Item -Recurse -Force "$constSource\*" "$TARGET_DIR\constitutions\"
    Write-Host "  Done" -ForegroundColor Green
}

# Copy docs
Write-Host "Copying docs..." -ForegroundColor Cyan
$docsSource = "$SCRIPT_DIR\.claude\docs"
if (Test-Path $docsSource) {
    Copy-Item -Recurse -Force "$docsSource\*" "$TARGET_DIR\docs\"
    Write-Host "  Done" -ForegroundColor Green
}

# Copy commands
Write-Host "Copying commands..." -ForegroundColor Cyan
$commandsSource = "$SCRIPT_DIR\.claude\commands"
if (Test-Path $commandsSource) {
    Copy-Item -Recurse -Force "$commandsSource\*" "$TARGET_DIR\commands\"
    Write-Host "  Done" -ForegroundColor Green
}

# Copy settings.json if not exists
$settingsSource = "$SCRIPT_DIR\.claude\settings.json"
$settingsTarget = "$TARGET_DIR\settings.json"
if ((Test-Path $settingsSource) -and (-not (Test-Path $settingsTarget))) {
    Write-Host "Copying settings.json..." -ForegroundColor Cyan
    Copy-Item -Force $settingsSource $settingsTarget
    Write-Host "  Done" -ForegroundColor Green
}

# Summary
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  Installation Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

$skillCount = (Get-ChildItem "$TARGET_DIR\skills" -Directory -ErrorAction SilentlyContinue).Count
$constCount = (Get-ChildItem "$TARGET_DIR\constitutions" -Directory -ErrorAction SilentlyContinue).Count
$agentCount = (Get-ChildItem "$TARGET_DIR\agents" -File -Filter "*.md" -ErrorAction SilentlyContinue).Count

Write-Host "  Location: $TARGET_DIR"
Write-Host "  Skills: $skillCount"
Write-Host "  Constitutions: $constCount"
Write-Host "  Agents: $agentCount"
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "  1. Run Claude Code: claude"
Write-Host "  2. Start planning: /socrates"
Write-Host ""
