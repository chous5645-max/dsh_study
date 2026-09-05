[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $workspaceRoot 'source\deepseek-harness'

if (-not (Test-Path (Join-Path $sourceDirectory '.git'))) {
    throw "DeepSeek Harness is not cloned at $sourceDirectory"
}

& git -C $sourceDirectory fetch upstream --prune
if ($LASTEXITCODE -ne 0) {
    throw 'Could not fetch the upstream remote.'
}

$defaultReference = (& git -C $sourceDirectory symbolic-ref refs/remotes/upstream/HEAD | Select-Object -Last 1).Trim()
$defaultBranch = $defaultReference -replace '^refs/remotes/upstream/', ''
$counts = (& git -C $sourceDirectory rev-list --left-right --count "HEAD...upstream/$defaultBranch" | Select-Object -Last 1).Trim() -split '\s+'
$revision = (& git -C $sourceDirectory rev-parse --short=12 HEAD | Select-Object -Last 1).Trim()
$subject = (& git -C $sourceDirectory log -1 --format=%s | Select-Object -Last 1).Trim()
$changes = @(& git -C $sourceDirectory status --porcelain)

Write-Host "Local revision : $revision"
Write-Host "Latest commit  : $subject"
Write-Host "Default branch : $defaultBranch"
Write-Host "Ahead / behind : $($counts[0]) / $($counts[1])"
Write-Host "Working tree   : $(if ($changes.Count -eq 0) { 'clean' } else { 'has local changes' })"
