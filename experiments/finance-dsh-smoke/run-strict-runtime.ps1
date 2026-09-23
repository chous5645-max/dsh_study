[CmdletBinding()]
param(
    [string]$DshSource,
    [switch]$RequireBrowser
)

$ErrorActionPreference = 'Stop'
$probeRoot = $PSScriptRoot
if (-not $DshSource) {
    $DshSource = [System.IO.Path]::GetFullPath((Join-Path $probeRoot '..\..\source\deepseek-harness'))
}
$DshSource = [System.IO.Path]::GetFullPath($DshSource)
$runtimePath = [System.IO.Path]::GetFullPath((Join-Path $probeRoot '.runtime\strict-runtime'))
$bundlePath = [System.IO.Path]::GetFullPath((Join-Path $runtimePath 'bundle'))
if (-not $bundlePath.StartsWith($runtimePath + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Bundle output escaped the isolated runtime directory'
}
$homePath = Join-Path $runtimePath 'home'
$patchPath = Join-Path $runtimePath 'probe.patch.yml'
$outPath = Join-Path $runtimePath 'stdout.log'
$errPath = Join-Path $runtimePath 'stderr.log'
$cliPath = Join-Path $DshSource 'apps\cli\lib\bin.js'
$tsdownPath = Join-Path $DshSource 'node_modules\.bin\tsdown.cmd'
$entryPath = Join-Path $probeRoot '.runtime\strict-remote-workspace\client-entry.js'
$bundleFile = Join-Path $bundlePath 'client-entry.iife.js'
$clientLib = Join-Path $probeRoot 'strict-client-plugin\lib'
$clientPath = Join-Path $clientLib 'client.js'
if (-not (Test-Path -LiteralPath $cliPath)) { throw "Built DSH CLI missing: $cliPath" }
if (-not (Test-Path -LiteralPath $tsdownPath)) { throw "DSH bundler missing: $tsdownPath" }
New-Item -ItemType Directory -Force -Path $runtimePath,$homePath,$clientLib | Out-Null
& (Join-Path $probeRoot 'run-strict-remote.ps1') -DshSource $DshSource
if (-not (Test-Path -LiteralPath $entryPath)) { throw 'Strict Remote client entry missing' }
& $tsdownPath $entryPath --no-config --platform browser --format iife --out-dir $bundlePath --no-clean
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $bundleFile)) { throw 'Strict Remote browser bundle failed' }
$clientSource = Get-Content -LiteralPath (Join-Path $probeRoot 'strict-client-plugin\client-source.js') -Raw
$remoteBundle = Get-Content -LiteralPath $bundleFile -Raw
Set-Content -LiteralPath $clientPath -Value ($remoteBundle + "`n" + $clientSource) -Encoding utf8
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
& $nodePath --check $clientPath
if ($LASTEXITCODE -ne 0) { throw 'Strict client bundle syntax invalid' }

$coreUri = ([System.Uri](Join-Path $probeRoot 'strict-core-plugin\index.mjs')).AbsoluteUri
$uiUri = ([System.Uri](Join-Path $probeRoot 'strict-client-plugin\index.mjs')).AbsoluteUri
@"
- insert:
    - id: finance-strict-core-probe
      name: '$coreUri'
    - id: finance-strict-ui-probe
      name: '$uiUri'
"@ | Set-Content -LiteralPath $patchPath -Encoding utf8

$env:DSH_HOME = $homePath
$env:DSH_SOURCE_ROOT = $DshSource
$process = Start-Process -FilePath $nodePath -ArgumentList @($cliPath, 'web', '--patch', $patchPath, '--port', '0', '--no-open') -WorkingDirectory $DshSource -WindowStyle Hidden -RedirectStandardOutput $outPath -RedirectStandardError $errPath -PassThru
try {
    $deadline = (Get-Date).AddSeconds(60)
    [string]$output = ''
    while ((Get-Date) -lt $deadline) {
        $process.Refresh()
        [string]$output = if (Test-Path -LiteralPath $outPath) { [string](Get-Content -LiteralPath $outPath -Raw) } else { '' }
        $ready = $output.Contains('[finance-strict] Host descriptor and service ready') -and $output.Contains('[finance-strict] Host Gateway strict invocation passed')
        $tokenMatch = [regex]::Match($output, 'http://127\.0\.0\.1:\d+/\?token=[^\s]+')
        if ($ready -and $tokenMatch.Success) { break }
        if ($process.HasExited) { break }
        Start-Sleep -Milliseconds 500
    }
    Write-Host "DSH commit: $(git -C $DshSource rev-parse --short HEAD)"
    Write-Host "Strict Host descriptor and Gateway passed: $ready"
    $webBoot = $false
    $clientInBoot = $false
    if ($tokenMatch.Success) {
        $webDeadline = (Get-Date).AddSeconds(15)
        while ((Get-Date) -lt $webDeadline -and -not ($webBoot -and $clientInBoot)) {
            try {
                $page = Invoke-WebRequest -Uri $tokenMatch.Value -UseBasicParsing -TimeoutSec 5
                $webBoot = ($page.StatusCode -eq 200 -and $page.Content.Contains('__DSH_BOOT__'))
                $clientInBoot = $page.Content.Contains('dsh-finance-strict-ui-probe')
            }
            catch { $webBoot = $false }
            if (-not ($webBoot -and $clientInBoot)) { Start-Sleep -Milliseconds 500 }
        }
    }
    Write-Host "Authenticated Web boot and strict client package: $($webBoot -and $clientInBoot)"
    $clientRpcPassed = $false
    if ($webBoot -and $clientInBoot) {
        $rpcOutput = & (Join-Path $DshSource 'node_modules\.bin\tsx.cmd') (Join-Path $probeRoot 'strict-client-rpc-probe.mjs') $DshSource $runtimePath 2>&1
        $clientRpcPassed = ($LASTEXITCODE -eq 0 -and [bool]($rpcOutput -match 'Client ctx.remote called strict Host endpoint over authenticated Connection RPC: true'))
        $rpcOutput | ForEach-Object { Write-Host (($_ -replace 'token=[^\s]+','token=[REDACTED]')) }
    }
    Write-Host "Strict Client Remote RPC passed: $clientRpcPassed"
    $browserPassed = $false
    $chromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
    if ($RequireBrowser -and $webBoot -and $clientInBoot -and (Test-Path -LiteralPath $chromePath)) {
        $browserOutput = & $nodePath (Join-Path $probeRoot 'browser-probe.mjs') $tokenMatch.Value $runtimePath $chromePath strict 2>&1
        $browserPassed = ($LASTEXITCODE -eq 0 -and [bool]($browserOutput -match 'Browser ctx.remote used generated contribution: true'))
        $browserOutput | ForEach-Object { Write-Host (($_ -replace 'token=[^\s]+','token=[REDACTED]')) }
    }
    if ($RequireBrowser) { Write-Host "Strict browser Remote passed: $browserPassed" }
    if (-not ($ready -and $webBoot -and $clientInBoot -and $clientRpcPassed -and ($browserPassed -or -not $RequireBrowser) -and -not $process.HasExited)) {
        $errorText = if (Test-Path -LiteralPath $errPath) { [string](Get-Content -LiteralPath $errPath -Raw) } else { '' }
        $safeTail = (($errorText -replace 'token=[^\s]+','token=[REDACTED]') -split "`n" | Select-Object -Last 14) -join "`n"
        Write-Host "Sanitized stderr tail: $safeTail"
        throw 'Strict Remote runtime smoke test failed'
    }
}
finally {
    $process.Refresh()
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
}
