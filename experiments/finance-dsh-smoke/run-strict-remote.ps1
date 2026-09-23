[CmdletBinding()]
param(
    [string]$DshSource
)

$ErrorActionPreference = 'Stop'
if (-not $DshSource) {
    $DshSource = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\source\deepseek-harness'))
}
$tsxPath = Join-Path $DshSource 'node_modules\.bin\tsx.cmd'
if (-not (Test-Path -LiteralPath $tsxPath)) { throw "DSH TypeScript runtime missing: $tsxPath" }
$probePath = Join-Path $PSScriptRoot 'strict-remote-probe.mjs'
& $tsxPath $probePath $DshSource
if ($LASTEXITCODE -ne 0) { throw 'Strict Finance Remote probe failed' }
