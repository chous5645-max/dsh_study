[CmdletBinding()]
param(
    [switch]$InstallDependencies,
    [switch]$Build
)

$ErrorActionPreference = 'Stop'

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $workspaceRoot 'source\deepseek-harness'
$forkRepository = 'https://github.com/chous5645-max/deepseek-harness.git'
$officialRepository = 'https://github.com/deepseek-ai/deepseek-harness.git'
$runtimeDirectory = Join-Path $workspaceRoot '.runtime'
$corepackHome = Join-Path $runtimeDirectory 'corepack'

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)

    & git -C $sourceDirectory @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "git command failed: git -C $sourceDirectory $($Arguments -join ' ')"
    }
}

if (-not (Test-Path (Join-Path $sourceDirectory '.git'))) {
    & (Join-Path $PSScriptRoot 'bootstrap.ps1') -SkipInstall -SkipBuild
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to initialize the DeepSeek Harness submodule.'
    }
}

$remoteNames = @(Invoke-Git remote)
if ($remoteNames -notcontains 'origin') {
    Invoke-Git remote add origin $forkRepository
}
$originUrl = (Invoke-Git remote get-url origin | Select-Object -Last 1).Trim()
if ($originUrl -ne $forkRepository) {
    throw "The DSH origin points to '$originUrl', not '$forkRepository'."
}
if ($remoteNames -notcontains 'upstream') {
    Invoke-Git remote add upstream $officialRepository
}

$upstreamUrl = (Invoke-Git remote get-url upstream | Select-Object -Last 1).Trim()
if ($upstreamUrl -ne $officialRepository) {
    throw "The 'upstream' remote points to '$upstreamUrl', not '$officialRepository'."
}
Invoke-Git remote set-url --push upstream DISABLED
Invoke-Git config branch.master.remote upstream
Invoke-Git config branch.master.merge refs/heads/master

$changes = @(Invoke-Git status --porcelain)
if ($changes.Count -gt 0) {
    throw 'The upstream source checkout has local changes. Commit, stash, or discard them before syncing.'
}

Invoke-Git fetch upstream --prune --tags

$defaultReference = (Invoke-Git symbolic-ref refs/remotes/upstream/HEAD | Select-Object -Last 1).Trim()
$defaultBranch = $defaultReference -replace '^refs/remotes/upstream/', ''
$currentBranch = (Invoke-Git branch --show-current | Select-Object -Last 1).Trim()

if ($currentBranch -ne $defaultBranch) {
    throw "Current branch is '$currentBranch'. Switch to '$defaultBranch' before syncing the upstream checkout."
}

Invoke-Git merge --ff-only "upstream/$defaultBranch"

if ($InstallDependencies) {
    New-Item -ItemType Directory -Force -Path $corepackHome | Out-Null
    $env:COREPACK_HOME = $corepackHome
    Push-Location $sourceDirectory
    try {
        & corepack pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) {
            throw 'pnpm install --frozen-lockfile failed.'
        }
    }
    finally {
        Pop-Location
    }
}

if ($Build) {
    New-Item -ItemType Directory -Force -Path $corepackHome | Out-Null
    $env:COREPACK_HOME = $corepackHome
    Push-Location $sourceDirectory
    try {
        & corepack pnpm run build
        if ($LASTEXITCODE -ne 0) {
            throw 'pnpm run build failed.'
        }
    }
    finally {
        Pop-Location
    }
}

$revision = (Invoke-Git rev-parse HEAD | Select-Object -Last 1).Trim()
Write-Host "DeepSeek Harness is synchronized at $revision"
Write-Host "The dsh_study repository now records a changed submodule pointer. Commit source/deepseek-harness after verification."
