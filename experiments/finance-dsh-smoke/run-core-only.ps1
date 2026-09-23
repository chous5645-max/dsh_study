[CmdletBinding()]
param([Parameter(Mandatory = $true)][string]$DshSource)

$ErrorActionPreference = 'Stop'
$probeRoot = $PSScriptRoot
$runtime = Join-Path $probeRoot '.runtime-core-only'
$homePath = Join-Path $runtime 'home'
$patchPath = Join-Path $runtime 'probe.patch.yml'
$outPath = Join-Path $runtime 'stdout.log'
$errPath = Join-Path $runtime 'stderr.log'
$cliPath = Join-Path $DshSource 'apps\cli\lib\bin.js'
if (-not (Test-Path -LiteralPath $cliPath)) { throw 'Built DSH CLI is missing' }
if (Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 3080 is occupied' }
New-Item -ItemType Directory -Force -Path $homePath | Out-Null
$coreUri = ([System.Uri](Join-Path $probeRoot 'finance-core.mjs')).AbsoluteUri
$checkUri = ([System.Uri](Join-Path $probeRoot 'headless-check.mjs')).AbsoluteUri
@"
- insert:
    - id: finance-core-probe
      name: '$coreUri'
    - id: finance-headless-check
      name: '$checkUri'
"@ | Set-Content -LiteralPath $patchPath -Encoding utf8
$env:DSH_HOME = $homePath
$env:DSH_SOURCE_ROOT = $DshSource
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$process = Start-Process -FilePath $nodePath -ArgumentList @($cliPath, 'web', '--patch', $patchPath) -WorkingDirectory $DshSource -WindowStyle Hidden -RedirectStandardOutput $outPath -RedirectStandardError $errPath -PassThru
try {
    $ready = $false
    $url = $null
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        $process.Refresh()
        [string]$output = if (Test-Path $outPath) { [string](Get-Content -LiteralPath $outPath -Raw) } else { '' }
        $ready = $output.Contains('[finance-smoke] core-only query passed=true')
        $match = [regex]::Match($output, 'http://127\.0\.0\.1:3080/\?token=[^\s]+')
        if ($ready -and $match.Success) { $url = $match.Value; break }
        if ($process.HasExited) { break }
        Start-Sleep -Milliseconds 500
    }
    $webReady = $false
    $uiAbsent = $false
    if ($url) {
        for ($attempt = 0; $attempt -lt 20 -and -not $webReady; $attempt++) {
            try {
                $page = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
                $webReady = $page.StatusCode -eq 200
                $uiAbsent = -not $page.Content.Contains('dsh-finance-ui-probe')
            }
            catch { Start-Sleep -Milliseconds 500 }
        }
    }
    Write-Host "Core-only query passed: $ready"
    Write-Host "Web boot works without finance UI: $webReady"
    Write-Host "Finance UI absent from boot graph: $uiAbsent"
    if (-not ($ready -and $webReady -and $uiAbsent -and -not $process.HasExited)) { exit 1 }
}
finally {
    $process.Refresh()
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
}
