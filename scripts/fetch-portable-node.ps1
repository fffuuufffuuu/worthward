param(
    [string]$NodeVersion = '22.15.0'
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$NodeDir = Join-Path $ProjectRoot 'node'
$NodeExe = Join-Path $NodeDir 'node.exe'

if (Test-Path -LiteralPath $NodeExe) {
    $versionText = & $NodeExe -v 2>&1
    if ($versionText -match '^v(22|23|24|25|26|27|28|29|30)\.') {
        Write-Output "NODE_READY=$NodeExe ($versionText)"
        exit 0
    }
}

New-Item -ItemType Directory -Force -Path $NodeDir | Out-Null
$zipName = "node-v$NodeVersion-win-x64.zip"
$zipUrl = "https://nodejs.org/dist/v$NodeVersion/$zipName"
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("xiang-node-" + [Guid]::NewGuid().ToString('N'))
$zipPath = Join-Path $tempRoot $zipName
New-Item -ItemType Directory -Force -Path $tempRoot | Out-Null

try {
    Write-Output "NODE_DOWNLOAD=$zipUrl"
    Invoke-WebRequest -Uri $zipUrl -OutFile $zipPath -UseBasicParsing
    Expand-Archive -LiteralPath $zipPath -DestinationPath $tempRoot -Force
    $extracted = Join-Path $tempRoot "node-v$NodeVersion-win-x64\node.exe"
    if (-not (Test-Path -LiteralPath $extracted)) { throw 'Downloaded Node archive did not contain node.exe.' }
    Copy-Item -LiteralPath $extracted -Destination $NodeExe -Force
}
finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Output "NODE_READY=$NodeExe"
