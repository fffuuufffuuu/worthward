param(
    [switch]$SelfTest,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LocalUrl = 'http://127.0.0.1:5174'
$HealthUrl = "$LocalUrl/api/health"
$AiStatusUrl = "$LocalUrl/api/ai/status"

function Get-LaunchAction([bool]$Healthy, [bool]$Current) {
    if ($Healthy -and $Current) { return 'open-only' }
    if ($Healthy) { return 'restart-and-open' }
    return 'start-and-open'
}

function Test-XiangHealth {
    try {
        $response = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 2
        return $response.ok -eq $true
    }
    catch {
        return $false
    }
}

function Test-XiangSameRoot {
    try {
        $response = Invoke-RestMethod -Uri $HealthUrl -TimeoutSec 2
        if ($response.ok -ne $true) { return $false }
        if (-not $response.root) { return $false }
        $expected = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd('\', '/')
        $actual = [System.IO.Path]::GetFullPath([string]$response.root).TrimEnd('\', '/')
        return [string]::Equals($expected, $actual, [System.StringComparison]::OrdinalIgnoreCase)
    }
    catch {
        return $false
    }
}

function Test-XiangAiGateway {
    try {
        $response = Invoke-WebRequest -Uri $AiStatusUrl -TimeoutSec 2 -UseBasicParsing
        return $response.StatusCode -eq 200
    }
    catch {
        return $false
    }
}

function Test-DistStale {
    $distEntry = Join-Path $ProjectRoot 'dist\index.html'
    if (-not (Test-Path $distEntry)) { return $true }

    $distTime = (Get-Item $distEntry).LastWriteTimeUtc
    $sources = @(
        (Join-Path $ProjectRoot 'src')
        (Join-Path $ProjectRoot 'server')
        (Join-Path $ProjectRoot 'index.html')
        (Join-Path $ProjectRoot 'package.json')
        (Join-Path $ProjectRoot 'vite.config.ts')
    ) | Where-Object { Test-Path $_ }

    $latest = Get-ChildItem -Path $sources -Recurse -File -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1

    if (-not $latest) { return $false }
    return $latest.LastWriteTimeUtc -gt $distTime
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
    $npm = Get-Command npm.cmd -ErrorAction Stop

    & $npm.Source run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed; the local service was not started.' }

    Start-Process -FilePath $node.Source -ArgumentList @('server/local-server.mjs') -WorkingDirectory $ProjectRoot -WindowStyle Hidden

    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
        Start-Sleep -Milliseconds 500
        if (Test-XiangHealth) {
            $ready = $true
            break
        }
    }
    if (-not $ready) { throw 'The local service did not start on port 5174. Check whether the port is already in use.' }
}

if ($SelfTest) {
    if ((Get-LaunchAction $true $true) -ne 'open-only') { throw 'Running current branch self-test failed.' }
    if ((Get-LaunchAction $true $false) -ne 'restart-and-open') { throw 'Stale running branch self-test failed.' }
    if ((Get-LaunchAction $false $false) -ne 'start-and-open') { throw 'Stopped branch self-test failed.' }
    if ($LocalUrl -ne 'http://127.0.0.1:5174') { throw 'Fixed URL self-test failed.' }
    Write-Output 'LAUNCH_SELF_TEST=PASS'
    exit 0
}

$healthy = Test-XiangHealth
$current = $healthy -and (Test-XiangSameRoot) -and (Test-XiangAiGateway) -and -not (Test-DistStale)
$action = Get-LaunchAction $healthy $current

if ($action -eq 'restart-and-open') {
    Stop-XiangListener
    Start-XiangService
}
elseif ($action -eq 'start-and-open') {
    Start-XiangService
}

if (-not $NoBrowser) {
    Start-Process $LocalUrl
}
Write-Output "XIANG_READY=$LocalUrl"
Write-Output "XIANG_ACTION=$action"
