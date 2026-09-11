[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Ref,
    [switch]$InstallDependencies,
    [switch]$Build
)

Write-Warning "update-upstream.ps1 is deprecated. Use update-dsh.ps1 -Ref <branch-or-tag>."
& (Join-Path $PSScriptRoot 'update-dsh.ps1') @PSBoundParameters
exit $LASTEXITCODE
