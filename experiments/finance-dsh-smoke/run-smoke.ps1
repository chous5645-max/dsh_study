[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$DshSource
)

$ErrorActionPreference = 'Stop'
$probeRoot = $PSScriptRoot
$runtime = Join-Path $probeRoot '.runtime'
$homePath = Join-Path $runtime 'home'
$patchPath = Join-Path $runtime 'probe.patch.yml'
$outPath = Join-Path $runtime 'stdout.log'
$errPath = Join-Path $runtime 'stderr.log'
$cliPath = Join-Path $DshSource 'apps\cli\lib\bin.js'
if (-not (Test-Path -LiteralPath $cliPath)) { throw "Built DSH CLI missing: $cliPath" }
if (-not (Test-Path -LiteralPath (Join-Path $DshSource 'node_modules\.modules.yaml'))) { throw 'DSH dependencies are missing' }
if (Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue) { throw 'Port 3080 is already occupied; smoke test did not start DSH' }
New-Item -ItemType Directory -Force -Path $homePath | Out-Null
$coreUri = ([System.Uri](Join-Path $probeRoot 'finance-core.mjs')).AbsoluteUri
$uiUri = ([System.Uri](Join-Path $probeRoot 'client-plugin\index.mjs')).AbsoluteUri
@"
- insert:
    - id: finance-core-probe
      name: '$coreUri'
    - id: finance-ui-adapter-probe
      name: '$uiUri'
"@ | Set-Content -LiteralPath $patchPath -Encoding utf8
$env:DSH_HOME = $homePath
$env:DSH_SOURCE_ROOT = $DshSource
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$process = Start-Process -FilePath $nodePath -ArgumentList @($cliPath, 'web', '--patch', $patchPath) -WorkingDirectory $DshSource -WindowStyle Hidden -RedirectStandardOutput $outPath -RedirectStandardError $errPath -PassThru
try {
    $deadline = (Get-Date).AddSeconds(60)
    $coreReady = $false
    $uiReady = $false
    while ((Get-Date) -lt $deadline) {
        $process.Refresh()
        [string]$outText = if (Test-Path $outPath) { [string](Get-Content -LiteralPath $outPath -Raw) } else { '' }
        [string]$errText = if (Test-Path $errPath) { [string](Get-Content -LiteralPath $errPath -Raw) } else { '' }
        $coreReady = $outText.Contains('[finance-smoke] core ready; tool registered; remote service provided')
        $uiReady = $outText.Contains('[finance-smoke] ui adapter summary=expenseMinor=3500;bankDeltaMinor=-3500; toolVisible=true; toolExecuted=true; remoteDispatched=true')
        if ($coreReady -and $uiReady -and [regex]::IsMatch($outText, 'http://127\.0\.0\.1:3080/\?token=[^\s]+')) { break }
        if ($process.HasExited) { break }
        Start-Sleep -Milliseconds 500
    }
    $listener = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    Write-Host "DSH commit: $(git -C $DshSource rev-parse --short HEAD)"
    Write-Host "Core loaded and tool registered: $coreReady"
    Write-Host "Plugin store reused: $($outText.Contains('[finance-smoke] store reused=true'))"
    Write-Host "Adapter read same core result and saw tool: $uiReady"
    Write-Host "Web listener on 3080: $($null -ne $listener)"
    $tokenMatch = [regex]::Match($outText, 'http://127\.0\.0\.1:3080/\?token=[^\s]+')
    $webBoot = $false
    $clientInBoot = $false
    $webError = ''
    if ($tokenMatch.Success) {
        $webDeadline = (Get-Date).AddSeconds(15)
        while ((Get-Date) -lt $webDeadline -and -not ($webBoot -and $clientInBoot)) {
            try {
                $page = Invoke-WebRequest -Uri $tokenMatch.Value -UseBasicParsing -TimeoutSec 5
                $webBoot = ($page.StatusCode -eq 200 -and $page.Content.Contains('__DSH_BOOT__'))
                $clientInBoot = $page.Content.Contains('dsh-finance-ui-probe')
            }
            catch { $webError = $_.Exception.Message -replace 'token=[^\s]+', 'token=[REDACTED]' }
            if (-not ($webBoot -and $clientInBoot)) { Start-Sleep -Milliseconds 500 }
        }
    }
    $browserClient = $false
    $chromePath = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
    if ($webBoot -and $clientInBoot -and (Test-Path -LiteralPath $chromePath)) {
        $browserScript = Join-Path $probeRoot 'browser-probe.mjs'
        $browserOutput = & $nodePath $browserScript $tokenMatch.Value $runtime $chromePath 2>&1
        $browserClient = ($LASTEXITCODE -eq 0 -and [bool]($browserOutput -match 'Browser executed client module: true'))
    }
    Write-Host "Browser executed client module: $browserClient"
    Write-Host "Browser Remote returned core summary: $browserClient"
    Write-Host "Main Slot probe rendered: $browserClient"
    if (-not $browserClient) { $browserOutput | ForEach-Object { Write-Host (($_ -replace 'token=[^\s]+','token=[REDACTED]')) } }
    Write-Host "Authenticated Web boot page: $webBoot"
    if (-not $webBoot) { Write-Host "Web error: $webError" }
    Write-Host "Client package in boot graph: $clientInBoot"
    Write-Host "Process exited before checks: $($process.HasExited)"
    if (-not ($coreReady -and $uiReady -and $null -ne $listener -and $webBoot -and $clientInBoot -and $browserClient -and -not $process.HasExited)) {
        $safeError = $errText -replace 'token=[^\s]+', 'token=[REDACTED]'
        $safeError = ($safeError -split "`n" | Select-Object -Last 12) -join "`n"
        Write-Host "Sanitized stderr tail: $safeError"
        exit 1
    }
}
finally {
    $process.Refresh()
    if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force }
}
