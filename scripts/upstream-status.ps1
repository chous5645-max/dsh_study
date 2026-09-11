[CmdletBinding()]
param(
    [string]$Ref = 'master'
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $workspaceRoot 'source\deepseek-harness'

if (-not (Test-Path (Join-Path $sourceDirectory '.git'))) {
    throw "DeepSeek Harness is not cloned at $sourceDirectory"
}

& git -C $sourceDirectory fetch origin --prune --tags
if ($LASTEXITCODE -ne 0) {
    throw 'Could not fetch the official DSH remote.'
}

$tagReference = "refs/tags/$Ref^{commit}"
& git -C $sourceDirectory rev-parse --verify --quiet $tagReference | Out-Null
if ($LASTEXITCODE -eq 0) {
    $target = (& git -C $sourceDirectory rev-parse $tagReference | Select-Object -Last 1).Trim()
    $targetLabel = "tag $Ref"
}
else {
    $branchReference = "refs/remotes/origin/$Ref"
    & git -C $sourceDirectory show-ref --verify --quiet $branchReference
    if ($LASTEXITCODE -ne 0) {
        throw "'$Ref' is neither an official DSH tag nor an origin branch."
    }
    $target = (& git -C $sourceDirectory rev-parse $branchReference | Select-Object -Last 1).Trim()
    $targetLabel = "branch $Ref"
}

$counts = (& git -C $sourceDirectory rev-list --left-right --count "HEAD...$target" | Select-Object -Last 1).Trim() -split '\s+'
$revision = (& git -C $sourceDirectory rev-parse --short=12 HEAD | Select-Object -Last 1).Trim()
$subject = (& git -C $sourceDirectory log -1 --format=%s | Select-Object -Last 1).Trim()
$changes = @(& git -C $sourceDirectory status --porcelain)

Write-Host "Local revision : $revision"
Write-Host "Latest commit  : $subject"
Write-Host "Selected ref   : $targetLabel"
Write-Host "Target commit  : $($target.Substring(0, 12))"
Write-Host "Ahead / behind : $($counts[0]) / $($counts[1])"
Write-Host "Working tree   : $(if ($changes.Count -eq 0) { 'clean' } else { 'has local changes' })"
