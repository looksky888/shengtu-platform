param(
  [string]$TaskName = "race"
)

# The race suite must not write into the source tree. Cache location is derived
# from the OS temp directory and can be overridden when a specific disk is
# preferred (e.g. RACE_CACHE_ROOT=D:\caches\race on Windows).
$ErrorActionPreference = "Stop"
if ($env:RACE_CACHE_ROOT) {
  $cacheRoot = Join-Path $env:RACE_CACHE_ROOT $TaskName
} else {
  $cacheRoot = Join-Path ([System.IO.Path]::GetTempPath()) (Join-Path "chatgpt2api-race" $TaskName)
}
New-Item -ItemType Directory -Force -Path "$cacheRoot\go-build", "$cacheRoot\go-mod", "$cacheRoot\go-tmp" | Out-Null

$env:GOCACHE = "$cacheRoot\go-build"
$env:GOMODCACHE = "$cacheRoot\go-mod"
$env:GOTMPDIR = "$cacheRoot\go-tmp"
$env:CGO_ENABLED = "1"

$gcc = Get-Command gcc -ErrorAction SilentlyContinue
if (-not $gcc) {
  Write-Error "gcc is required for go test -race. Run this script in Linux CI or install a C compiler."
}

go test -race ./...
