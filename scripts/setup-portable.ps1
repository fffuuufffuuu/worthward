param(
    [switch]$SkipShortcut
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Push-Location $ProjectRoot
try {
    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
}
finally {
    Pop-Location
}

& (Join-Path $PSScriptRoot 'fetch-portable-node.ps1')
& (Join-Path $PSScriptRoot 'build-xiang-exe.ps1')

if (-not $SkipShortcut) {
    & (Join-Path $PSScriptRoot 'install-shortcut.ps1')
}

$ExeName = -join ([char]0x6240, [char]0x5411, '.exe')
Write-Output "PORTABLE_READY=$(Join-Path $ProjectRoot $ExeName)"
