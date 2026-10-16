# Build a clean runtime/source release directory from an allowlist.
# Usage (from source/):
#   powershell -File scripts/package-release-allowlist.ps1 -OutDir ..\dist-clean
param(
  [string]$OutDir = "..\dist-clean",
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path

if ([string]::IsNullOrWhiteSpace($Version)) {
  $versionFile = Join-Path $Root "VERSION.txt"
  if (-not (Test-Path -LiteralPath $versionFile -PathType Leaf)) {
    throw "release version file missing: VERSION.txt"
  }
  $Version = (Get-Content -Raw -LiteralPath $versionFile).Trim()
}
if ($Version -notmatch '^[0-9A-Za-z][0-9A-Za-z._-]*$') {
  throw "invalid release version: $Version"
}

$Include = @(
  "cmd",
  "internal",
  "web\src",
  "web\public",
  "web\scripts",
  "web\index.html",
  "web\package.json",
  "web\package-lock.json",
  "web\tsconfig.json",
  "web\vite.config.ts",
  "web\eslint.config.mjs",
  "web\postcss.config.mjs",
  "web\components.json",
  "web\.npmrc",
  "docs",
  "scripts",
  "services",
  "deploy",
  "Dockerfile",
  "Dockerfile.goreleaser",
  "docker-compose.yml",
  "docker-compose.build.yml",
  "docker-compose.local.yml",
  "docker-compose.warp.yml",
  ".env.example",
  ".env.with-warp.example",
  ".dockerignore",
  ".gitignore",
  "go.mod",
  "go.sum",
  "LICENSE",
  "README.md",
  "DESIGN.md",
  "AGENTS.md",
  "VERSION.txt",
  ".goreleaser.yaml",
  ".goreleaser.simple.yaml"
)

$RequiredReleaseFiles = @(
  "docker-compose.yml",
  "services\grok-runtime\Dockerfile",
  "services\grok-runtime\requirements.lock",
  "services\grok-runtime\upstream\services\register\package-lock.json",
  "deploy\icloud-privacy-mail\Dockerfile",
  "internal\web\dist\build-manifest.json",
  "internal\web\dist\index.html",
  "VERSION.txt"
)

function Test-Forbidden([string]$RelPath) {
  $name = Split-Path $RelPath -Leaf
  $segments = @($RelPath -split '[\\/]' | Where-Object { $_ -ne '' })
  if ($name -eq ".env") { return $true }
  if ($name -eq "bootstrap-admin.txt") { return $true }
  if ($RelPath -match '(^|\\|/)data(\\|/|$)') { return $true }
  if ($RelPath -match '(^|\\|/)node_modules(\\|/|$)') { return $true }
  if ($RelPath -match '(^|\\|/)\.codex(\\|/|$)') { return $true }
  if ($segments | Where-Object { $_ -match '(?i)^(\.?(pytest|ruff|mypy)[_-]?cache|\.venv|venv|__pycache__|htmlcov|coverage|test-results|playwright-report|runtime[ _-]?logs?|dumps?)$' }) { return $true }
  if ($segments | Where-Object { $_ -match '(?i)pytest[_-]?cache$' }) { return $true }
  if ($RelPath -match '(^|\\|/)__pycache__(\\|/|$)') { return $true }
  if ($name -like "*.pyc") { return $true }
  if ($name -like "*.log" -or $name -like "*.dmp" -or $name -like "*.dump" -or $name -eq ".coverage") { return $true }
  if ($name -like "*.db" -or $name -like "*.db-wal" -or $name -like "*.db-shm") { return $true }
  if ($name -like "*.bak" -or $name -like "*.tsbuildinfo") { return $true }
  return $false
}

function Copy-AllowedPath([string]$Source, [string]$Destination, [string]$RelativePath) {
  if (Test-Forbidden $RelativePath) {
    return
  }
  if (Test-Path -LiteralPath $Source -PathType Container) {
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Get-ChildItem -Force -LiteralPath $Source | ForEach-Object {
      $childRelative = Join-Path $RelativePath $_.Name
      $childDestination = Join-Path $Destination $_.Name
      Copy-AllowedPath $_.FullName $childDestination $childRelative
    }
    return
  }
  $destinationParent = Split-Path $Destination -Parent
  if (-not (Test-Path -LiteralPath $destinationParent)) {
    New-Item -ItemType Directory -Force -Path $destinationParent | Out-Null
  }
  Copy-Item -Force -LiteralPath $Source -Destination $Destination
}

function Invoke-NpmCommand([string[]]$Arguments) {
  & npm @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "npm command failed with exit code $LASTEXITCODE`: npm $($Arguments -join ' ')"
  }
}

$missingInputs = @()
foreach ($item in $Include) {
  if (-not (Test-Path -LiteralPath (Join-Path $Root $item))) {
    $missingInputs += $item
  }
}
if ($missingInputs.Count -gt 0) {
  throw "required release inputs missing: $($missingInputs -join ', ')"
}

if ([System.IO.Path]::IsPathRooted($OutDir)) {
  $OutDir = [System.IO.Path]::GetFullPath($OutDir)
} else {
  $OutDir = [System.IO.Path]::GetFullPath((Join-Path $Root $OutDir))
}
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$Stage = Join-Path $OutDir "chatgpt2api-$Version-clean-$Stamp"
if (Test-Path -LiteralPath $Stage) {
  throw "release stage already exists: $Stage"
}
New-Item -ItemType Directory -Path $Stage | Out-Null

foreach ($item in $Include) {
  Copy-AllowedPath (Join-Path $Root $item) (Join-Path $Stage $item) $item
}

$StagedWeb = Join-Path $Stage "web"
$PreviousAppVersion = $env:VITE_APP_VERSION
$PreviousDistDir = $env:WEB_DIST_DIR
try {
  $env:VITE_APP_VERSION = $Version
  $env:WEB_DIST_DIR = Join-Path $Stage "internal\web\dist"
  Invoke-NpmCommand -Arguments @("ci", "--prefix", $StagedWeb)
  Invoke-NpmCommand -Arguments @("run", "build", "--prefix", $StagedWeb)
  Invoke-NpmCommand -Arguments @("run", "verify:dist", "--prefix", $StagedWeb)
} finally {
  $env:VITE_APP_VERSION = $PreviousAppVersion
  $env:WEB_DIST_DIR = $PreviousDistDir
}

$GeneratedPaths = @(
  (Join-Path $StagedWeb "node_modules"),
  (Join-Path $StagedWeb "tsconfig.tsbuildinfo")
)
foreach ($generatedPath in $GeneratedPaths) {
  $resolvedGeneratedPath = [System.IO.Path]::GetFullPath($generatedPath)
  if (-not $resolvedGeneratedPath.StartsWith($Stage + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "refusing to remove generated path outside release stage: $resolvedGeneratedPath"
  }
  if (Test-Path -LiteralPath $resolvedGeneratedPath) {
    Remove-Item -Recurse -Force -LiteralPath $resolvedGeneratedPath
  }
}

foreach ($item in $RequiredReleaseFiles) {
  if (-not (Test-Path -LiteralPath (Join-Path $Stage $item) -PathType Leaf)) {
    throw "required release output missing: $item"
  }
}

$forbiddenOutputs = @(
  Get-ChildItem -Recurse -Force -LiteralPath $Stage |
    Where-Object {
      Test-Forbidden ($_.FullName.Substring($Stage.Length).TrimStart('\', '/'))
    }
)
if ($forbiddenOutputs.Count -gt 0) {
  throw "forbidden release outputs found: $($forbiddenOutputs.FullName -join ', ')"
}

$manifest = Join-Path $Stage "RELEASE_MANIFEST.txt"
$lines = @("version=$Version", "built_at=$Stamp", "")
Get-ChildItem -Recurse -File -LiteralPath $Stage | Sort-Object FullName | ForEach-Object {
  $rel = $_.FullName.Substring($Stage.Length).TrimStart('\', '/')
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
  $lines += "$hash  $rel"
}
$lines | Set-Content -Encoding UTF8 -LiteralPath $manifest

Write-Host "Staged clean release at: $Stage"
Write-Host "Verified: current compose, sidecars and deploy sources present; forbidden paths absent."
