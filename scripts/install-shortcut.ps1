param(
    [string]$ShortcutName = ''
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$ExeName = 'Worthward.exe'
$ExePath = Join-Path $ProjectRoot $ExeName
$Desktop = [Environment]::GetFolderPath('Desktop')
if ([string]::IsNullOrWhiteSpace($ShortcutName)) {
    $ShortcutName = 'Worthward'
}
$ShortcutPath = Join-Path $Desktop "$ShortcutName.lnk"

if (-not (Test-Path -LiteralPath $ExePath)) {
    & (Join-Path $PSScriptRoot 'build-xiang-exe.ps1')
    if (-not (Test-Path -LiteralPath $ExePath)) { throw 'Worthward.exe was not found. Run scripts/setup-portable.ps1 first.' }
}
if (-not (Test-Path -LiteralPath $Desktop)) { throw 'Desktop directory was not found.' }

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($ShortcutPath)
$shortcut.TargetPath = $ExePath
$shortcut.WorkingDirectory = $ProjectRoot
$shortcut.Description = 'Open Worthward'
$shortcut.IconLocation = "$ExePath,0"
$shortcut.Save()

if (-not (Test-Path -LiteralPath $ShortcutPath)) { throw 'Shortcut could not be saved.' }
$saved = $shell.CreateShortcut($ShortcutPath)
if ($saved.TargetPath -ne $shortcut.TargetPath) {
    throw 'Shortcut readback verification failed.'
}

Write-Output "SHORTCUT_READY=$ShortcutPath"
Write-Output "TARGET=$($saved.TargetPath)"
