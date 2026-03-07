param(
  [string]$Service = "chamgab-ml-api"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot
$mlApiRoot = Join-Path $repoRoot "ml-api"

if (-not (Test-Path $mlApiRoot)) {
  throw "ml-api directory not found: $mlApiRoot"
}

Push-Location $mlApiRoot
try {
  Write-Host "Deploying Railway service '$Service' from $mlApiRoot"
  railway up . --path-as-root --service $Service
} finally {
  Pop-Location
}
