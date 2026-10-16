param(
  [string]$TaskName = "p3-5-race"
)

$ErrorActionPreference = "Stop"
$cacheRoot = "D:\BaiduNetdiskDownload\生图\生图测试缓存\4.5\$TaskName"
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
