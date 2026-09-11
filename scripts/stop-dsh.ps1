[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$workspaceRoot = Split-Path -Parent $PSScriptRoot
$runtimeDirectory = Join-Path $workspaceRoot '.runtime'
$processFile = Join-Path $runtimeDirectory 'dsh-process.json'

if (-not (Test-Path $processFile)) {
    Write-Host 'DeepSeek Harness is not running (no process record found).'
    exit 0
}

$record = Get-Content -Raw $processFile | ConvertFrom-Json
$process = Get-Process -Id $record.pid -ErrorAction SilentlyContinue

if ($null -eq $process) {
    Remove-Item -LiteralPath $processFile -Force
    Write-Host 'DeepSeek Harness was already stopped; the stale process record was removed.'
    exit 0
}

if ($process.StartTime.ToUniversalTime().ToString('o') -ne $record.processStartTime) {
    throw "PID $($record.pid) now belongs to a different process. Refusing to stop it; remove $processFile after checking it manually."
}

& taskkill.exe /PID $record.pid /T /F | Out-Host
if ($LASTEXITCODE -ne 0) {
    throw "Could not stop the DeepSeek Harness process tree rooted at PID $($record.pid)."
}

Remove-Item -LiteralPath $processFile -Force
Write-Host 'DeepSeek Harness stopped.'
