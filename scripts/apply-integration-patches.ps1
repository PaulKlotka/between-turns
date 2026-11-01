# Run this from RPG Rewards in a user-owned PowerShell after reviewing both patches.
$ErrorActionPreference = 'Stop'
$rewardRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent $rewardRoot
$targets = @('between-turns', 'rpg-bingo')
# Check every patch before changing either repository.
foreach ($name in $targets) {
  $target = Join-Path $projectRoot $name
  $patch = Join-Path $rewardRoot "docs\integration\$name.patch"
  & git -C $target apply --check -- $patch
  if ($LASTEXITCODE -ne 0) { throw "Patch check failed for $name. No patches were applied." }
}
foreach ($name in $targets) {
  & git -C (Join-Path $projectRoot $name) apply -- (Join-Path $rewardRoot "docs\integration\$name.patch")
  if ($LASTEXITCODE -ne 0) { throw "Applying $name failed. Inspect git status before retrying." }
}
Write-Output 'Integration patches applied. No commits or deployments were made.'
