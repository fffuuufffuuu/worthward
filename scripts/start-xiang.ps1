param(
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LocalUrl = 'http://127.0.0.1:5174'
$HealthUrl = "$LocalUrl/api/health"
$DistEntry = Join-Path $ProjectRoot 'dist\index.html'
$ServerEntry = Join-Path $ProjectRoot 'server\local-server.mjs'

if (-not (Test-Path -LiteralPath $DistEntry)) { throw 'dist/index.html was not found. Rebuild or unpack the clean package again.' }
if (-not (Test-Path -LiteralPath $ServerEntry)) { throw 'server/local-server.mjs was not found.' }

function Test-XiangHealth {
    try {
        $response = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 2
        return $response.ok -eq $true
    }
    catch {
        return $false
    }
}

function Stop-XiangListener {
    $processIds = @()
    try {
        $processIds = @(
            Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort 5174 -State Listen -ErrorAction SilentlyContinue |
                Select-Object -ExpandProperty OwningProcess -Unique
        )
    }
    catch {
        $processIds = @()
    }

    foreach ($processId in $processIds) {
        if ($processId -and $processId -ne 0) {
            Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        }
    }

    for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
        if (-not (Test-XiangHealth)) { return }
        Start-Sleep -Milliseconds 250
    }
}

function Start-XiangService {
    $node = Get-Command node -ErrorAction Stop
    Start-Process -FilePath $node.Source -ArgumentList @('server/local-server.mjs') -WorkingDirectory $ProjectRoot -WindowStyle Hidden

    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
        Start-Sleep -Milliseconds 500
        if (Test-XiangHealth) {
            $ready = $true
            break
        }
    }
    if (-not $ready) { throw 'The local service did not start on port 5174.' }
}

if (Test-XiangHealth) {
    Stop-XiangListener
}
Start-XiangService

if (-not $NoBrowser) {
    Start-Process $LocalUrl
}

Write-Output "XIANG_READY=$LocalUrl"
Write-Output 'XIANG_ACTION=start-clean-package'
