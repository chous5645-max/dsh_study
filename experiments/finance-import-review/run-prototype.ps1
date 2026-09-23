[CmdletBinding()]
param(
    [string]$DshSource,
    [switch]$NoOpen
)

$ErrorActionPreference = 'Stop'
$prototypeRoot = $PSScriptRoot
if (-not $DshSource) {
    $DshSource = [System.IO.Path]::GetFullPath((Join-Path $prototypeRoot '..\..\source\deepseek-harness'))
}
$runtime = Join-Path $prototypeRoot '.runtime'
$homePath = Join-Path $runtime 'home'
$recordPath = Join-Path $runtime 'process.json'
$patchPath = Join-Path $runtime 'prototype.patch.yml'
$outPath = Join-Path $runtime 'stdout.log'
$errPath = Join-Path $runtime 'stderr.log'
$cliPath = Join-Path $DshSource 'apps\cli\lib\bin.js'
if (-not (Test-Path -LiteralPath $cliPath)) { throw "Built DSH CLI missing: $cliPath" }
if (-not (Test-Path -LiteralPath (Join-Path $DshSource 'node_modules\.modules.yaml'))) { throw 'DSH dependencies are missing' }
New-Item -ItemType Directory -Force -Path (Join-Path $prototypeRoot 'lib'),$homePath | Out-Null

$source = Get-Content -LiteralPath (Join-Path $prototypeRoot 'client-source.js') -Raw
$css = Get-Content -LiteralPath (Join-Path $prototypeRoot 'style.css') -Raw
$fixtureLiteral = Get-Content -LiteralPath (Join-Path $prototypeRoot 'mock-cases.json') -Raw
if (-not $source.Contains('__FINANCE_PROTO_CSS__') -or -not $source.Contains('__FINANCE_PROTO_CASES__') -or -not $source.Contains('__FINANCE_PROTO_WORKSPACE_PATH__')) { throw 'Prototype placeholder missing' }
$cssLiteral = ConvertTo-Json -InputObject $css -Compress
$workspacePath = [System.IO.Path]::GetFullPath((Join-Path $prototypeRoot '..\..'))
$workspaceLiteral = ConvertTo-Json -InputObject $workspacePath -Compress
$bundle = $source.Replace('__FINANCE_PROTO_CSS__', $cssLiteral).Replace('__FINANCE_PROTO_WORKSPACE_PATH__', $workspaceLiteral).Replace('__FINANCE_PROTO_CASES__', $fixtureLiteral)
Set-Content -LiteralPath (Join-Path $prototypeRoot 'lib\client.js') -Value $bundle -Encoding utf8
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
& $nodePath --check (Join-Path $prototypeRoot 'lib\client.js')
if ($LASTEXITCODE -ne 0) { throw 'Client bundle syntax invalid' }

$process = $null
$url = $null
if (Test-Path -LiteralPath $recordPath) {
    $record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
    $existing = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
    if ($existing -and $existing.StartTime.ToUniversalTime().ToString('o') -eq $record.startTime.ToUniversalTime().ToString('o')) {
        $process = $existing
        $url = $record.url
    }
    else { Remove-Item -LiteralPath $recordPath -Force }
}
if (-not $process) {
    if (Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue) {
        throw 'Port 3080 is occupied by another service; stop it before starting this prototype'
    }
    $pluginUri = ([System.Uri](Join-Path $prototypeRoot 'index.mjs')).AbsoluteUri
    $coreUri = ([System.Uri](Join-Path $prototypeRoot 'core-plugin\index.mjs')).AbsoluteUri
@"
- insert:
    - id: finance-prototype-core
      name: '$coreUri'
    - id: finance-import-review-prototype
      name: '$pluginUri'
"@ | Set-Content -LiteralPath $patchPath -Encoding utf8
    $env:DSH_HOME = $homePath
    $env:DSH_SOURCE_ROOT = $DshSource
    $process = Start-Process -FilePath $nodePath -ArgumentList @($cliPath, 'web', '--patch', $patchPath) -WorkingDirectory $DshSource -WindowStyle Hidden -RedirectStandardOutput $outPath -RedirectStandardError $errPath -PassThru
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        $process.Refresh()
        [string]$output = if (Test-Path $outPath) { [string](Get-Content -LiteralPath $outPath -Raw) } else { '' }
        $match = [regex]::Match($output, 'http://127\.0\.0\.1:3080/\?token=[^\s]+')
        $loaded = $output.Contains('[finance-prototype] host bundle loaded') -and $output.Contains('[finance-prototype] read-only finance tool ready')
        if ($loaded -and $match.Success -and (Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue)) {
            $url = $match.Value
            break
        }
        if ($process.HasExited) { break }
        Start-Sleep -Milliseconds 500
    }
    if (-not $url) {
        if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
        $errorText = if (Test-Path $errPath) { Get-Content -LiteralPath $errPath -Raw } else { '' }
        throw ('DSH prototype did not start. ' + ($errorText -replace 'token=[^\s]+', 'token=[REDACTED]'))
    }
    [ordered]@{
        pid = $process.Id
        startTime = $process.StartTime.ToUniversalTime().ToString('o')
        url = $url
    } | ConvertTo-Json | Set-Content -LiteralPath $recordPath -Encoding utf8
}
if (-not $NoOpen) {
    $chromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
    if (Test-Path -LiteralPath $chromePath) {
        Start-Process -FilePath $chromePath -ArgumentList @($url) -WindowStyle Normal
    }
    else { Start-Process $url }
}
Write-Host 'DSH Finance UI prototype is running in the local Web client.'
Write-Host 'Use ?variant=A, ?variant=B or ?variant=C, or the floating switcher.'
Write-Host 'Run stop-prototype.ps1 to stop the local service.'
