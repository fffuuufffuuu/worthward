param(
    [string]$TargetDir = ''
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$LauncherDir = Join-Path $PSScriptRoot 'launcher'
$SourceFile = Join-Path $LauncherDir 'XiangLauncher.cs'
$IconPath = Join-Path $ProjectRoot 'assets\xiang-rounded.ico'
if (-not (Test-Path -LiteralPath $IconPath)) {
    $IconPath = Join-Path $ProjectRoot 'assets\xiang.ico'
}
$ExeName = 'Worthward.exe'
$OutputPath = if ($TargetDir) { Join-Path $TargetDir $ExeName } else { Join-Path $ProjectRoot $ExeName }

if (-not (Test-Path -LiteralPath $SourceFile)) { throw 'Launcher source was not found.' }
if (-not (Test-Path -LiteralPath $IconPath)) {
    & (Join-Path $PSScriptRoot 'generate-xiang-icon.ps1')
    $IconPath = Join-Path $ProjectRoot 'assets\xiang-rounded.ico'
    if (-not (Test-Path -LiteralPath $IconPath)) { throw 'Launcher icon was not found.' }
}

$cscCandidates = @(
    "${env:WINDIR}\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
    "${env:WINDIR}\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)

$csc = $cscCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $csc) { throw '.NET Framework csc.exe was not found.' }

$refs = @(
    '/reference:System.dll'
    '/reference:System.Core.dll'
    '/reference:System.Windows.Forms.dll'
)

$args = @(
    '/nologo'
    '/target:winexe'
    "/out:$OutputPath"
    "/win32icon:$IconPath"
) + $refs + @($SourceFile)

& $csc @args
if ($LASTEXITCODE -ne 0) { throw 'Launcher build failed.' }
if (-not (Test-Path -LiteralPath $OutputPath)) { throw 'Launcher executable was not created.' }

Write-Output "WORTHWARD_EXE=$OutputPath"
