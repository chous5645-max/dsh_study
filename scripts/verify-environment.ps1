[CmdletBinding()]
param(
    [switch]$RequireDependencies,
    [switch]$RequireBuild
)

$ErrorActionPreference = 'Stop'

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $workspaceRoot 'source\deepseek-harness'
$expectedRootOrigin = 'https://github.com/chous5645-max/dsh_study.git'
$expectedDshOrigin = 'https://github.com/deepseek-ai/deepseek-harness.git'
$failures = [System.Collections.Generic.List[string]]::new()

function Add-CheckFailure {
    param([Parameter(Mandatory = $true)][string]$Message)
    $failures.Add($Message)
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Add-CheckSuccess {
    param([Parameter(Mandatory = $true)][string]$Message)
    Write-Host "[ OK ] $Message" -ForegroundColor Green
}

function Get-RemoteUrl {
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
        Add-CheckFailure "Required command '$command' is not available."
    }
    else {
        Add-CheckSuccess "$command is available"
    }
}

if ($null -ne (Get-Command node -ErrorAction SilentlyContinue)) {
    $nodeVersionText = (& node -p 'process.versions.node' | Select-Object -Last 1).Trim()
    $nodeVersion = [version]$nodeVersionText
    if (($nodeVersion.Major -eq 22 -and $nodeVersion.Minor -ge 19) -or $nodeVersion.Major -ge 24) {
        Add-CheckSuccess "Node.js $nodeVersionText satisfies the DSH engine range"
    }
    else {
        Add-CheckFailure "Node.js $nodeVersionText does not satisfy ^22.19.0 or >=24.0.0."
    }
}

$rootOrigin = Get-RemoteUrl -Repository $workspaceRoot -Remote 'origin'
if ($rootOrigin -eq $expectedRootOrigin) {
    Add-CheckSuccess 'root origin points to dsh_study'
}
else {
    Add-CheckFailure "Root origin is '$rootOrigin', expected '$expectedRootOrigin'."
}

if (-not (Test-Path (Join-Path $sourceDirectory 'package.json'))) {
    Add-CheckFailure 'DeepSeek Harness submodule is not initialized.'
}
else {
    $indexEntry = (& git -C $workspaceRoot ls-files --stage -- source/deepseek-harness | Select-Object -First 1)
    $actualCommit = (& git -C $sourceDirectory rev-parse HEAD | Select-Object -Last 1).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($indexEntry)) {
        Add-CheckFailure 'Could not read the DeepSeek Harness gitlink from the root index.'
    }
    else {
        $pinnedCommit = ($indexEntry -split '\s+')[1]
        if ($actualCommit -ne $pinnedCommit) {
            Add-CheckFailure "Submodule is at $actualCommit, but dsh_study pins $pinnedCommit."
        }
        else {
            Add-CheckSuccess "submodule matches the pinned commit $pinnedCommit"
        }
    }

    $dshOrigin = Get-RemoteUrl -Repository $sourceDirectory -Remote 'origin'
    if ($dshOrigin -eq $expectedDshOrigin) {
        Add-CheckSuccess 'DSH origin points to the official repository'
    }
    else {
        Add-CheckFailure "DSH origin is '$dshOrigin', expected '$expectedDshOrigin'."
    }

}

$pluginConfig = Join-Path $workspaceRoot 'config\plugins.json'
try {
    $plugins = (Get-Content -Raw $pluginConfig | ConvertFrom-Json).plugins
    $missingPlugins = 0
    foreach ($plugin in $plugins) {
        $pluginPath = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot $plugin.path))
        if (-not (Test-Path -LiteralPath $pluginPath -PathType Leaf)) {
            $missingPlugins += 1
            Add-CheckFailure "Configured plugin '$($plugin.id)' is missing at $pluginPath."
        }
    }
    if ($missingPlugins -eq 0) {
        Add-CheckSuccess 'plugin configuration is valid JSON and all entries exist'
    }
}
catch {
    Add-CheckFailure "Plugin configuration is invalid: $($_.Exception.Message)"
}

if ($RequireDependencies) {
    if (Test-Path (Join-Path $sourceDirectory 'node_modules\.modules.yaml')) {
        Add-CheckSuccess 'DSH dependencies are installed'
    }
    else {
        Add-CheckFailure 'DSH dependencies are not installed.'
    }
}

if ($RequireBuild) {
    if (Test-Path (Join-Path $sourceDirectory 'packages\client\ui-chat\lib\client.js')) {
        Add-CheckSuccess 'DSH browser bundles are built'
    }
    else {
        Add-CheckFailure 'DSH browser bundles are not built.'
    }
}

if ($failures.Count -gt 0) {
    Write-Host ''
    Write-Host "Environment verification failed with $($failures.Count) issue(s)." -ForegroundColor Red
    exit 1
}

Write-Host ''
Write-Host 'Environment verification passed.' -ForegroundColor Green
