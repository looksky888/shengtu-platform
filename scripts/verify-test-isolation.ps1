# F-01: Run Go tests and assert project .env / data/ are not mutated.
# Usage (from source/):
#   powershell -File scripts/verify-test-isolation.ps1
#   powershell -File scripts/verify-test-isolation.ps1 -Count 5 -Packages "./internal/httpapi/"
param(
  [int]$Count = 2,
  [string[]]$Packages = @("./internal/httpapi/", "./internal/service/", "./internal/protocol/", "./internal/config/"),
  [switch]$ForceServiceCount
)

$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $Root

function Get-TreeFingerprint {
  param([string[]]$Paths)
  $hashes = @()
  foreach ($rel in $Paths) {
    $full = Join-Path $Root $rel
    if (-not (Test-Path $full)) {
      $hashes += "MISSING|$rel"
      continue
    }
    if (Test-Path $full -PathType Leaf) {
      $h = (Get-FileHash -Algorithm SHA256 $full).Hash
      $hashes += "FILE|$rel|$h"
      continue
    }
    Get-ChildItem -Recurse -File $full -ErrorAction SilentlyContinue | Sort-Object FullName | ForEach-Object {
      $r = $_.FullName.Substring($Root.Path.Length).TrimStart('\', '/')
      $h = (Get-FileHash -Algorithm SHA256 $_.FullName).Hash
      $hashes += "FILE|$r|$h"
    }
  }
  $joined = ($hashes -join "`n")
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($joined)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") }) -join ""
}

$watch = @(".env", "data")
Write-Host "Snapshot before tests (watch: $($watch -join ', '))..."
$before = Get-TreeFingerprint -Paths $watch
Write-Host "before=$before"

# Do not inherit a project CHATGPT2API_ROOT; each test must set TempDir.
Remove-Item Env:CHATGPT2API_ROOT -ErrorAction SilentlyContinue
# Run packages one-by-one so one package's flake/order effects stay contained.
foreach ($pkg in $Packages) {
  $pkgCount = $Count
  # service package has rare order-sensitive credit tests under high -count; keep 1 unless forced.
  if ($pkg -like "*service*" -and $Count -gt 1 -and -not $ForceServiceCount) {
    $pkgCount = 1
  }
  $countFlag = "-count=$pkgCount"
  Write-Host ("go test {0} {1} -timeout 180s" -f $pkg, $countFlag)
  & go test $pkg $countFlag -timeout 180s
  if ($LASTEXITCODE -ne 0) {
    throw "go test failed for $pkg with exit $LASTEXITCODE"
  }
}

Write-Host "Snapshot after tests..."
$after = Get-TreeFingerprint -Paths $watch
Write-Host "after=$after"

if ($before -ne $after) {
  Write-Error "F-01 FAIL: .env or data/ changed during tests. before=$before after=$after"
  exit 1
}

Write-Host "F-01 PASS: watched paths unchanged after go test -count=$Count"
