[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Ref,
    [switch]$InstallDependencies,
    [switch]$Build
)

$ErrorActionPreference = 'Stop'
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $workspaceRoot 'source\deepseek-harness'
$officialRepository = 'https://github.com/deepseek-ai/deepseek-harness.git'
$runtimeDirectory = Join-Path $workspaceRoot '.runtime'
$corepackHome = Join-Path $runtimeDirectory 'corepack'
$corepackBin = Join-Path $runtimeDirectory 'corepack-bin'

function Invoke-Git {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    & git -C $sourceDirectory @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "git command failed: git -C $sourceDirectory $($Arguments -join ' ')"
    }
}

function Initialize-Corepack {
    New-Item -ItemType Directory -Force -Path $corepackHome | Out-Null
    New-Item -ItemType Directory -Force -Path $corepackBin | Out-Null
    $env:COREPACK_HOME = $corepackHome
    & corepack enable --install-directory $corepackBin
    if ($LASTEXITCODE -ne 0) {
        throw 'Corepack could not create project-local package manager shims.'
    }
    $env:PATH = "$corepackBin;$env:PATH"
}

if (-not (Test-Path (Join-Path $sourceDirectory '.git'))) {
    & (Join-Path $PSScriptRoot 'bootstrap.ps1') -SkipInstall -SkipBuild
    if ($LASTEXITCODE -ne 0) {
        throw 'Failed to initialize the DeepSeek Harness submodule.'
    }
}

$remoteNames = @(Invoke-Git remote)
if ($remoteNames -notcontains 'origin') {
    Invoke-Git remote add origin $officialRepository
}
elseif ((Invoke-Git remote get-url origin | Select-Object -Last 1).Trim() -ne $officialRepository) {
    Invoke-Git remote set-url origin $officialRepository
}
if ($remoteNames -contains 'upstream') {
    Invoke-Git remote remove upstream
}
Invoke-Git remote set-url --push origin DISABLED

$changes = @(Invoke-Git status --porcelain)
if ($changes.Count -gt 0) {
    throw 'The DSH source checkout has local changes. Commit, stash, or discard them before changing versions.'
}

Invoke-Git fetch origin --prune --tags
$tagReference = "refs/tags/$Ref^{commit}"
& git -C $sourceDirectory rev-parse --verify --quiet $tagReference | Out-Null
if ($LASTEXITCODE -eq 0) {
    $targetCommit = (Invoke-Git rev-parse $tagReference | Select-Object -Last 1).Trim()
    $targetDescription = "tag $Ref"
}
else {
    $branchReference = "refs/remotes/origin/$Ref"
    & git -C $sourceDirectory show-ref --verify --quiet $branchReference
    if ($LASTEXITCODE -ne 0) {
        throw "'$Ref' is neither an official DSH tag nor an origin branch."
    }
    $targetCommit = (Invoke-Git rev-parse $branchReference | Select-Object -Last 1).Trim()
    $targetDescription = "branch $Ref"
}

Invoke-Git checkout --detach $targetCommit

if ($InstallDependencies -or $Build) {
    Initialize-Corepack
}
if ($InstallDependencies) {
    Push-Location $sourceDirectory
    try {
        & corepack pnpm install --frozen-lockfile
        if ($LASTEXITCODE -ne 0) { throw 'pnpm install --frozen-lockfile failed.' }
    }
    finally { Pop-Location }
}
if ($Build) {
    Push-Location $sourceDirectory
    try {
        & corepack pnpm run build
        if ($LASTEXITCODE -ne 0) { throw 'pnpm run build failed.' }
    }
    finally { Pop-Location }
}

& git -C $workspaceRoot add -- source/deepseek-harness
if ($LASTEXITCODE -ne 0) {
    throw 'Could not stage the updated DeepSeek Harness submodule pointer.'
}

Write-Host "DeepSeek Harness now uses $targetDescription at $targetCommit"
Write-Host 'The updated submodule pointer is staged in dsh_study. Verify it, then commit the staged change.'
