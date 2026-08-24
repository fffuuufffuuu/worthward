$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $ProjectRoot 'assets'
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
# New filename helps bust Explorer's icon cache after previous square versions.
$icoPath = Join-Path $outDir 'xiang-rounded.ico'
$legacyIcoPath = Join-Path $outDir 'xiang.ico'
$previewPath = Join-Path $outDir 'xiang-preview.png'

function New-RoundedRectPath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = [Math]::Min($radius * 2, [Math]::Min($width, $height))
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc(($x + $width - $diameter), $y, $diameter, $diameter, 270, 90)
  $path.AddArc(($x + $width - $diameter), ($y + $height - $diameter), $diameter, $diameter, 0, 90)
  $path.AddArc($x, ($y + $height - $diameter), $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-LogoBitmap([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $bmp.SetResolution(96, 96)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))

  # Stronger corner radius so 16/32 desktop sizes still read as rounded.
  $corner = [Math]::Max(3.0, $size * 0.28)
  $plate = New-RoundedRectPath 0 0 $size $size $corner
  $bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 31, 52, 66))
  $g.FillPath($bg, $plate)
  $bg.Dispose()
  $plate.Dispose()

  $stroke = [Math]::Max(1.5, $size * 0.06)
  $penOuter = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(115, 255, 255, 255)), $stroke
  $penMid = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(191, 255, 255, 255)), $stroke
  $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 79, 195, 161))
  $cx = $size / 2.0
  $cy = $size / 2.0
  $r1 = $size * 0.325
  $r2 = $size * 0.205
  $r3 = $size * 0.1
  $g.DrawEllipse($penOuter, [float]($cx - $r1), [float]($cy - $r1), [float](2 * $r1), [float](2 * $r1))
  $g.DrawEllipse($penMid, [float]($cx - $r2), [float]($cy - $r2), [float](2 * $r2), [float](2 * $r2))
  $g.FillEllipse($brush, [float]($cx - $r3), [float]($cy - $r3), [float](2 * $r3), [float](2 * $r3))
  $g.Dispose()
  $penOuter.Dispose()
  $penMid.Dispose()
  $brush.Dispose()
  return $bmp
}

function Get-PngBytes([System.Drawing.Bitmap]$bitmap) {
  $ms = New-Object System.IO.MemoryStream
  $bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $ms.ToArray()
  $ms.Dispose()
  return $bytes
}

function Get-BmpIconBytes([System.Drawing.Bitmap]$bitmap) {
  $width = $bitmap.Width
  $height = $bitmap.Height
  $xor = New-Object byte[] ($width * $height * 4)
  $maskStride = [int][Math]::Ceiling($width / 32.0) * 4
  $andMask = New-Object byte[] ($maskStride * $height)
  $index = 0

  for ($y = $height - 1; $y -ge 0; $y--) {
    for ($x = 0; $x -lt $width; $x++) {
      $color = $bitmap.GetPixel($x, $y)
      $xor[$index++] = $color.B
      $xor[$index++] = $color.G
      $xor[$index++] = $color.R
      $xor[$index++] = $color.A

      # AND mask: 1 = transparent. Required when shell ignores alpha.
      if ($color.A -lt 128) {
        $maskY = ($height - 1 - $y)
        $byteIndex = ($maskY * $maskStride) + [Math]::Floor($x / 8)
        $bit = 7 - ($x % 8)
        $andMask[$byteIndex] = $andMask[$byteIndex] -bor (1 -shl $bit)
      }
    }
  }

  $header = New-Object byte[] 40
  [BitConverter]::GetBytes([uint32]40).CopyTo($header, 0)
  [BitConverter]::GetBytes([int32]$width).CopyTo($header, 4)
  [BitConverter]::GetBytes([int32]($height * 2)).CopyTo($header, 8)
  [BitConverter]::GetBytes([uint16]1).CopyTo($header, 12)
  [BitConverter]::GetBytes([uint16]32).CopyTo($header, 14)
  # biCompression = BI_RGB (0), biSizeImage = XOR size only
  [BitConverter]::GetBytes([uint32]0).CopyTo($header, 16)
  [BitConverter]::GetBytes([uint32]$xor.Length).CopyTo($header, 20)

  $imageBytes = New-Object byte[] ($header.Length + $xor.Length + $andMask.Length)
  [Array]::Copy($header, 0, $imageBytes, 0, $header.Length)
  [Array]::Copy($xor, 0, $imageBytes, $header.Length, $xor.Length)
  [Array]::Copy($andMask, 0, $imageBytes, ($header.Length + $xor.Length), $andMask.Length)
  return $imageBytes
}

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$bitmaps = @()
$imageData = New-Object System.Collections.Generic.List[byte[]]

foreach ($size in $sizes) {
  $bmp = New-LogoBitmap $size
  $bitmaps += $bmp
  # PNG-in-ICO preserves alpha reliably on modern Windows.
  # Keep BMP+AND-mask for tiny sizes as a fallback path inside the same file.
  if ($size -le 32) {
    $imageData.Add((Get-BmpIconBytes $bmp))
  } else {
    $imageData.Add((Get-PngBytes $bmp))
  }
}

$preview = New-LogoBitmap 256
$preview.Save($previewPath, [System.Drawing.Imaging.ImageFormat]::Png)
$preview.Dispose()

$ms = New-Object System.IO.MemoryStream
$bw = New-Object System.IO.BinaryWriter $ms
$bw.Write([uint16]0)
$bw.Write([uint16]1)
$bw.Write([uint16]$sizes.Count)

$offset = 6 + (16 * $sizes.Count)
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $size = $sizes[$i]
  $bytes = $imageData[$i]
  $dim = if ($size -ge 256) { [byte]0 } else { [byte]$size }
  $bw.Write($dim)
  $bw.Write($dim)
  $bw.Write([byte]0)
  $bw.Write([byte]0)
  $bw.Write([uint16]1)
  $bw.Write([uint16]32)
  $bw.Write([uint32]$bytes.Length)
  $bw.Write([uint32]$offset)
  $offset += $bytes.Length
}

foreach ($bytes in $imageData) {
  $bw.Write($bytes)
}
$bw.Flush()
$icoBytes = $ms.ToArray()
$bw.Dispose()
$ms.Dispose()

[System.IO.File]::WriteAllBytes($icoPath, $icoBytes)
[System.IO.File]::WriteAllBytes($legacyIcoPath, $icoBytes)

foreach ($bmp in $bitmaps) { $bmp.Dispose() }

# Verify first BMP entry corner alpha by reconstructing from saved preview path semantics
$verify = New-LogoBitmap 32
$corner = $verify.GetPixel(0, 0)
$nearCorner = $verify.GetPixel(2, 2)
$center = $verify.GetPixel(16, 16)
$verify.Dispose()

Write-Output "ICO_READY=$icoPath"
Write-Output "ICO_LEGACY=$legacyIcoPath"
Write-Output "PREVIEW=$previewPath"
Write-Output ("CORNER_ALPHA={0}" -f $corner.A)
Write-Output ("NEAR_CORNER_ALPHA={0}" -f $nearCorner.A)
Write-Output ("CENTER_ALPHA={0}" -f $center.A)
