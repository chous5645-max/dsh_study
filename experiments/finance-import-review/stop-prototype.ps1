[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$recordPath = Join-Path $PSScriptRoot '.runtime\process.json'
if (-not (Test-Path -LiteralPath $recordPath)) {
    Write-Host 'Prototype service is not running.'
    exit 0
}
$record = Get-Content -LiteralPath $recordPath -Raw | ConvertFrom-Json
$process = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
if ($process) {
    if ($process.StartTime.ToUniversalTime().ToString('o') -ne $record.startTime.ToUniversalTime().ToString('o')) {
        throw 'Recorded PID now belongs to a different process; refusing to stop it'
    }
    Stop-Process -Id $process.Id -Force
}
Remove-Item -LiteralPath $recordPath -Force
Write-Host 'Prototype service stopped.'
