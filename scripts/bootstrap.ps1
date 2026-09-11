[CmdletBinding()]
param(
    [switch]$SkipInstall,
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $workspaceRoot 'source\deepseek-harness'
$runtimeDirectory = Join-Path $workspaceRoot '.runtime'
$corepackHome = Join-Path $runtimeDirectory 'corepack'
$corepackBin = Join-Path $runtimeDirectory 'corepack-bin'
$studyRepository = 'https://github.com/chous5645-max/dsh_study.git'
$officialRepository = 'https://github.com/deepseek-ai/deepseek-harness.git'

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
    )

    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $Executable $($Arguments -join ' ')"
    }
}

function Get-GitRemoteUrl {
    param(
        [Parameter(Mandatory = $true)][string]$Repository,
        [Parameter(Mandatory = $true)][string]$Remote,
        [switch]$Push
    )

    $remoteNames = @(& git -C $Repository remote)
    if ($LASTEXITCODE -ne 0 -or $remoteNames -notcontains $Remote) {
        return $null
    }

    $arguments = @('-C', $Repository, 'remote', 'get-url')
    if ($Push) {
        $arguments += '--push'
    }
    $arguments += $Remote
    $value = & git @arguments
    if ($LASTEXITCODE -ne 0) {
        return $null
    }
    return ($value | Select-Object -Last 1).Trim()
}

foreach ($command in @('git', 'node', 'corepack')) {
    if ($null -eq (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "Required command '$command' was not found in PATH."
    }
}

$nodeVersionText = (& node -p 'process.versions.node' | Select-Object -Last 1).Trim()
$nodeVersion = [version]$nodeVersionText
$nodeSupported = ($nodeVersion.Major -eq 22 -and $nodeVersion.Minor -ge 19) -or $nodeVersion.Major -ge 24
if (-not $nodeSupported) {
    throw "DeepSeek Harness requires Node.js ^22.19.0 or >=24.0.0; found $nodeVersionText."
}

if (-not (Test-Path (Join-Path $workspaceRoot '.git'))) {
    throw "Run this script from a Git clone of $studyRepository."
}

$rootOrigin = Get-GitRemoteUrl -Repository $workspaceRoot -Remote 'origin'
if ($null -eq $rootOrigin) {
    Invoke-Checked git -C $workspaceRoot remote add origin $studyRepository
}
elseif ($rootOrigin -ne $studyRepository) {
    throw "The root origin is '$rootOrigin', expected '$studyRepository'."
}

$indexEntry = (& git -C $workspaceRoot ls-files --stage -- source/deepseek-harness | Select-Object -First 1)
if ([string]::IsNullOrWhiteSpace($indexEntry) -or -not $indexEntry.StartsWith('160000 ')) {
    throw 'The root repository does not contain the DeepSeek Harness submodule gitlink.'
}
$pinnedCommit = ($indexEntry -split '\s+')[1]

# Configure and initialize the pinned checkout without relying on Git's shell-based
# submodule helper. This also works in restricted Windows shells with a minimal PATH.
Invoke-Checked git -C $workspaceRoot config submodule.source/deepseek-harness.url $officialRepository
Invoke-Checked git -C $workspaceRoot config submodule.source/deepseek-harness.active true
if (-not (Test-Path (Join-Path $sourceDirectory '.git'))) {
    if ((Test-Path $sourceDirectory) -and (Get-ChildItem -Force $sourceDirectory | Select-Object -First 1)) {
        throw "$sourceDirectory exists but is not a Git checkout. Move it aside and run bootstrap again."
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $sourceDirectory) | Out-Null
    Invoke-Checked git clone $officialRepository $sourceDirectory
    Invoke-Checked git -C $sourceDirectory checkout --detach $pinnedCommit
}

if (-not (Test-Path (Join-Path $sourceDirectory 'package.json'))) {
    throw "DeepSeek Harness submodule was not initialized at $sourceDirectory."
}

$origin = Get-GitRemoteUrl -Repository $sourceDirectory -Remote 'origin'
if ($null -eq $origin) {
    Invoke-Checked git -C $sourceDirectory remote add origin $officialRepository
}
elseif ($origin -ne $officialRepository) {
    Invoke-Checked git -C $sourceDirectory remote set-url origin $officialRepository
}

if ($null -ne (Get-GitRemoteUrl -Repository $sourceDirectory -Remote 'upstream')) {
    Invoke-Checked git -C $sourceDirectory remote remove upstream
}

Invoke-Checked git -C $sourceDirectory remote set-url --push origin DISABLED
Invoke-Checked git -C $sourceDirectory config rerere.enabled true

New-Item -ItemType Directory -Force -Path $corepackHome | Out-Null
New-Item -ItemType Directory -Force -Path $corepackBin | Out-Null
$env:COREPACK_HOME = $corepackHome
& corepack enable --install-directory $corepackBin
if ($LASTEXITCODE -ne 0) {
    throw 'Corepack could not create project-local package manager shims.'
}
$env:PATH = "$corepackBin;$env:PATH"

Push-Location $sourceDirectory
try {
    $packageManager = (Get-Content -Raw package.json | ConvertFrom-Json).packageManager
    $resolvedPnpm = (& corepack pnpm --version | Select-Object -Last 1).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Corepack could not provision the repository package manager '$packageManager'."
    }
    $expectedPnpm = $packageManager -replace '^pnpm@', ''
    if ($resolvedPnpm -ne $expectedPnpm) {
        throw "Corepack resolved pnpm $resolvedPnpm, expected $expectedPnpm."
    }

    if (-not $SkipInstall) {
        Invoke-Checked corepack pnpm install --frozen-lockfile
    }
    if (-not $SkipBuild) {
        if (-not (Test-Path 'node_modules\.modules.yaml')) {
            throw 'Dependencies are absent. Run bootstrap without -SkipInstall before building.'
        }
        Invoke-Checked corepack pnpm run build
    }
}
finally {
    Pop-Location
}

& (Join-Path $PSScriptRoot 'verify-environment.ps1') `
    -RequireDependencies:(-not $SkipInstall) `
    -RequireBuild:(-not $SkipBuild)
if ($LASTEXITCODE -ne 0) {
    throw 'Environment verification failed.'
}

Write-Host ''
Write-Host 'DeepSeek Harness workspace is ready.'
Write-Host 'Start it with .\scripts\start-dsh.cmd'
