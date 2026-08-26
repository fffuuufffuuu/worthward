$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$ReleaseRoot = Join-Path $ProjectRoot 'release'
$StageDir = Join-Path $ReleaseRoot "Worthward-portable-$stamp"
$ZipPath = Join-Path $ReleaseRoot "Worthward-portable-$stamp.zip"
$GuideFileName = -join ([char]0x4F7F, [char]0x7528, [char]0x8BF4, [char]0x660E, '.html')
$GuideSource = Join-Path (Join-Path $ProjectRoot 'guide') $GuideFileName
$ExeName = 'Worthward.exe'

function Assert-CleanText([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $text = [IO.File]::ReadAllText($Path)
  $forbidden = @(
    @{ Name = 'legacy-lark-id'; Pattern = 'lark-curiosity-' }
    @{ Name = 'legacy-obsidian-id'; Pattern = 'obsidian-inbox-' }
    @{ Name = 'feishu-migration'; Pattern = (-join ([char]0x4E00, [char]0x6B21, [char]0x6027, [char]0x8FC1, [char]0x79FB, [char]0x81EA, [char]0x98DE, [char]0x4E66)) }
    @{ Name = 'openai-sk-prefix'; Pattern = 'sk-[A-Za-z0-9]{10,}' }
  )
  foreach ($rule in $forbidden) {
    if ($text -match $rule.Pattern) {
      throw "Clean package check failed in ${Label}: found $($rule.Name)"
    }
  }
}

Write-Output 'PACK_STEP=build'
Push-Location $ProjectRoot
try {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
}
finally {
  Pop-Location
}

if (Test-Path -LiteralPath $StageDir) {
  Remove-Item -LiteralPath $StageDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $StageDir | Out-Null

Write-Output 'PACK_STEP=node'
$NodeDir = Join-Path $StageDir 'node'
New-Item -ItemType Directory -Force -Path $NodeDir | Out-Null
& (Join-Path $PSScriptRoot 'fetch-portable-node.ps1')
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'node\node.exe') -Destination (Join-Path $NodeDir 'node.exe') -Force

Write-Output 'PACK_STEP=launcher'
& (Join-Path $PSScriptRoot 'build-xiang-exe.ps1') -TargetDir $StageDir

Write-Output 'PACK_STEP=copy'
Copy-Item -LiteralPath (Join-Path $ProjectRoot 'dist') -Destination (Join-Path $StageDir 'dist') -Recurse
New-Item -ItemType Directory -Force -Path (Join-Path $StageDir 'server') | Out-Null
Get-ChildItem -LiteralPath (Join-Path $ProjectRoot 'server') -File |
  Where-Object { $_.Extension -eq '.mjs' -and $_.Name -notmatch '\.test\.' } |
  ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path (Join-Path $StageDir 'server') $_.Name) }

New-Item -ItemType Directory -Force -Path (Join-Path $StageDir 'scripts') | Out-Null
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'install-shortcut.ps1') -Destination (Join-Path (Join-Path $StageDir 'scripts') 'install-shortcut.ps1')
if (-not (Test-Path -LiteralPath $GuideSource)) { throw 'Missing guide HTML' }
Copy-Item -LiteralPath $GuideSource -Destination (Join-Path $StageDir $GuideFileName)

Write-Output 'PACK_STEP=verify'
Assert-CleanText (Join-Path $ProjectRoot 'src\data\personal-seed.json') 'personal-seed.json'
Get-ChildItem -LiteralPath (Join-Path $StageDir 'dist') -Recurse -File |
  Where-Object { $_.Extension -in '.js', '.css', '.html', '.json' } |
  ForEach-Object { Assert-CleanText $_.FullName $_.FullName }
Get-ChildItem -LiteralPath (Join-Path $StageDir 'server') -File |
  ForEach-Object { Assert-CleanText $_.FullName $_.FullName }

if (-not (Test-Path -LiteralPath (Join-Path $StageDir $ExeName))) { throw 'Portable launcher exe was not created.' }
if (-not (Test-Path -LiteralPath (Join-Path $NodeDir 'node.exe'))) { throw 'Portable node.exe was not copied.' }

$distJs = Get-ChildItem -LiteralPath (Join-Path $StageDir 'dist\assets') -Filter '*.js' -File
$joined = ($distJs | ForEach-Object { [IO.File]::ReadAllText($_.FullName) }) -join "`n"
if ($joined -notmatch 'demo-explore-radar') {
  throw 'Clean package check failed: demo seed cards missing from dist bundle.'
}
$feishu = -join ([char]0x4E00, [char]0x6B21, [char]0x6027, [char]0x8FC1, [char]0x79FB, [char]0x81EA, [char]0x98DE, [char]0x4E66)
if ($joined -match "lark-curiosity-|obsidian-inbox-|$([regex]::Escape($feishu))") {
  throw 'Clean package check failed: personal migration residue found in dist.'
}

Write-Output 'PACK_STEP=zip'
if (Test-Path -LiteralPath $ZipPath) {
  Remove-Item -LiteralPath $ZipPath -Force
}
Compress-Archive -Path $StageDir -DestinationPath $ZipPath -Force

Write-Output "PACK_READY=$ZipPath"
Write-Output "PACK_DIR=$StageDir"
Write-Output ("PACK_BYTES={0}" -f (Get-Item -LiteralPath $ZipPath).Length)
