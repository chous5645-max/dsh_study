[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$workspaceRoot = $PSScriptRoot
$sourceDirectory = Join-Path $workspaceRoot 'source\deepseek-harness'
$pluginConfigFile = Join-Path $workspaceRoot 'config\plugins.json'
$runtimeDirectory = Join-Path $workspaceRoot '.runtime'
$harnessHome = Join-Path $runtimeDirectory 'dsh-home'
$patchFile = Join-Path $runtimeDirectory 'local-plugins.patch.yml'
$processFile = Join-Path $runtimeDirectory 'dsh-process.json'
$stdoutFile = Join-Path $runtimeDirectory 'dsh.out.log'
$stderrFile = Join-Path $runtimeDirectory 'dsh.err.log'

if (-not (Test-Path (Join-Path $sourceDirectory 'package.json'))) {
    throw "DeepSeek Harness source was not found at $sourceDirectory. Run '.\bootstrap-dsh.cmd' first."
}

if (-not (Test-Path $pluginConfigFile)) {
    throw "Plugin configuration was not found at $pluginConfigFile"
}

if (-not (Test-Path (Join-Path $sourceDirectory 'node_modules\.modules.yaml'))) {
    throw "DeepSeek Harness dependencies are not installed. Run '.\bootstrap-dsh.cmd' first."
}

New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
New-Item -ItemType Directory -Force -Path $harnessHome | Out-Null

if (Test-Path $processFile) {
    $record = Get-Content -Raw $processFile | ConvertFrom-Json
    $running = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
    if ($null -ne $running -and $running.StartTime.ToUniversalTime().ToString('o') -eq $record.processStartTime) {
        Write-Host "DeepSeek Harness is already running (PID $($record.pid))."
        Write-Host "Open $($record.url)"
        exit 0
    }
    Remove-Item -LiteralPath $processFile -Force
}

$existingListener = Get-NetTCPConnection -LocalPort 3080 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -ne $existingListener) {
    throw "Port 3080 is already used by PID $($existingListener.OwningProcess). Stop that service before starting this workspace."
}

$configuration = Get-Content -Raw $pluginConfigFile | ConvertFrom-Json
$patchLines = [System.Collections.Generic.List[string]]::new()
$patchLines.Add('- insert:')
$enabledCount = 0

foreach ($plugin in $configuration.plugins) {
    if ($plugin.enabled -ne $true) {
        continue
    }
    if ($plugin.id -notmatch '^[a-zA-Z0-9][a-zA-Z0-9_-]*$') {
        throw "Invalid plugin id '$($plugin.id)' in $pluginConfigFile"
    }

    $pluginPath = [System.IO.Path]::GetFullPath((Join-Path $workspaceRoot $plugin.path))
    $workspacePrefix = $workspaceRoot.TrimEnd('\') + '\'
    if (-not $pluginPath.StartsWith($workspacePrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Plugin '$($plugin.id)' resolves outside this workspace: $pluginPath"
    }
    if (-not (Test-Path -LiteralPath $pluginPath -PathType Leaf)) {
        throw "Plugin '$($plugin.id)' was not found at $pluginPath"
    }

    $yamlPath = ([System.Uri]$pluginPath).AbsoluteUri.Replace("'", "''")
    $patchLines.Add("    - id: $($plugin.id)")
    $patchLines.Add("      name: '$yamlPath'")
    $enabledCount += 1
}

if ($enabledCount -eq 0) {
    throw "No enabled plugins are configured in $pluginConfigFile"
}

[System.IO.File]::WriteAllLines($patchFile, $patchLines, [System.Text.UTF8Encoding]::new($false))

$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if ($null -eq $nodeCommand) {
    $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
}
if ($null -eq $nodeCommand) {
    throw 'Node.js was not found in PATH.'
}

$env:DSH_HOME = $harnessHome

$process = Start-Process `
    -FilePath $nodeCommand.Source `
    -ArgumentList @('--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web', '--patch', $patchFile) `
    -WorkingDirectory $sourceDirectory `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdoutFile `
    -RedirectStandardError $stderrFile `
    -PassThru

Start-Sleep -Milliseconds 500
$process.Refresh()
if ($process.HasExited) {
    $errorOutput = if (Test-Path $stderrFile) { Get-Content -Raw $stderrFile } else { '' }
    throw "DeepSeek Harness exited during startup.`n$errorOutput"
}

$record = [ordered]@{
    pid = $process.Id
    processStartTime = $process.StartTime.ToUniversalTime().ToString('o')
    startedAt = (Get-Date).ToUniversalTime().ToString('o')
    url = 'http://127.0.0.1:3080'
    enabledPlugins = $enabledCount
}
$record | ConvertTo-Json | Set-Content -LiteralPath $processFile -Encoding utf8

$ready = $false
$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
    $process.Refresh()
    if ($process.HasExited) {
        Remove-Item -LiteralPath $processFile -Force -ErrorAction SilentlyContinue
        $errorOutput = if (Test-Path $stderrFile) { Get-Content -Raw $stderrFile } else { '' }
        throw "DeepSeek Harness exited during startup.`n$errorOutput"
    }

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connection = $client.ConnectAsync('127.0.0.1', 3080)
        if ($connection.Wait(500) -and $client.Connected) {
            Start-Sleep -Seconds 1
            $process.Refresh()
            if (-not $process.HasExited) {
                $ready = $true
                break
            }
        }
    }
    catch {
        # The service may still be compiling and opening its listener.
    }
    finally {
        $client.Dispose()
    }
    Start-Sleep -Milliseconds 500
}

if ($ready) {
    $logOutput = if (Test-Path $stdoutFile) { Get-Content -Raw $stdoutFile } else { '' }
    $urlMatch = [regex]::Match($logOutput, 'https?://127\.0\.0\.1:3080/\?token=[^\s]+')
    if ($urlMatch.Success) {
        $record.url = $urlMatch.Value
        $record | ConvertTo-Json | Set-Content -LiteralPath $processFile -Encoding utf8
    }
    Write-Host "DeepSeek Harness started with $enabledCount custom plugin(s) (PID $($process.Id))."
    Write-Host "Open $($record.url)"
    Write-Host "Logs: $stdoutFile and $stderrFile"
}
else {
    Write-Warning "The process is running, but port 3080 was not ready after 30 seconds. Check $stdoutFile and $stderrFile"
}
