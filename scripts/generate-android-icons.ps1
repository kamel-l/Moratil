Add-Type -AssemblyName System.Drawing

$resourceRoot = [System.IO.Path]::GetFullPath(
  (Join-Path $PSScriptRoot '..\android\app\src\main\res')
)
$jade = [System.Drawing.ColorTranslator]::FromHtml('#04231d')
$gold = [System.Drawing.ColorTranslator]::FromHtml('#e0b544')
$goldLight = [System.Drawing.ColorTranslator]::FromHtml('#eccb6c')
$page = [System.Drawing.ColorTranslator]::FromHtml('#fdfaef')
$jadeLine = [System.Drawing.ColorTranslator]::FromHtml('#12855f')
$spine = [System.Drawing.ColorTranslator]::FromHtml('#b3821f')

function New-Emblem {
  $bitmap = [System.Drawing.Bitmap]::new(
    512,
    512,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $arch = New-Object System.Drawing.Drawing2D.GraphicsPath
  $arch.AddLine(130, 414, 130, 248)
  $arch.AddArc(130, 84, 252, 328, 180, 180)
  $arch.AddLine(382, 248, 382, 414)
  $archPen = [System.Drawing.Pen]::new($gold, 18)
  $archPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $archPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawPath($archPen, $arch)

  $star = New-Object System.Drawing.Drawing2D.GraphicsPath
  $starPoints = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(256, 135),
    [System.Drawing.PointF]::new(272, 162),
    [System.Drawing.PointF]::new(299, 176),
    [System.Drawing.PointF]::new(272, 190),
    [System.Drawing.PointF]::new(256, 217),
    [System.Drawing.PointF]::new(240, 190),
    [System.Drawing.PointF]::new(213, 176),
    [System.Drawing.PointF]::new(240, 162)
  )
  $star.AddPolygon($starPoints)
  $graphics.FillPath(([System.Drawing.SolidBrush]::new($goldLight)), $star)

  $bookPen = [System.Drawing.Pen]::new($gold, 10)
  $bookPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $leftPage = New-Object System.Drawing.Drawing2D.GraphicsPath
  $leftPage.AddBezier(256, 284, 218, 256, 168, 256, 132, 278)
  $leftPage.AddLine(132, 278, 132, 384)
  $leftPage.AddBezier(132, 384, 176, 364, 220, 374, 256, 405)
  $leftPage.CloseFigure()
  $graphics.FillPath(([System.Drawing.SolidBrush]::new($page)), $leftPage)
  $graphics.DrawPath($bookPen, $leftPage)

  $rightPage = New-Object System.Drawing.Drawing2D.GraphicsPath
  $rightPage.AddBezier(256, 284, 294, 256, 344, 256, 380, 278)
  $rightPage.AddLine(380, 278, 380, 384)
  $rightPage.AddBezier(380, 384, 336, 364, 292, 374, 256, 405)
  $rightPage.CloseFigure()
  $graphics.FillPath(([System.Drawing.SolidBrush]::new($page)), $rightPage)
  $graphics.DrawPath($bookPen, $rightPage)

  $spinePen = [System.Drawing.Pen]::new($spine, 9)
  $spinePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $spinePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($spinePen, 256, 290, 256, 398)

  $linePen = [System.Drawing.Pen]::new($jadeLine, 7)
  $linePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
  $linePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
  $graphics.DrawLine($linePen, 158, 310, 220, 320)
  $graphics.DrawLine($linePen, 158, 339, 220, 349)
  $graphics.DrawLine($linePen, 354, 310, 292, 320)
  $graphics.DrawLine($linePen, 354, 339, 292, 349)

  $graphics.Dispose()
  $arch.Dispose()
  $archPen.Dispose()
  $star.Dispose()
  $bookPen.Dispose()
  $leftPage.Dispose()
  $rightPage.Dispose()
  $spinePen.Dispose()
  $linePen.Dispose()
  return $bitmap
}

function Save-ScaledPng(
  [System.Drawing.Bitmap]$Source,
  [string]$Path,
  [int]$Size,
  [bool]$Round,
  [bool]$Background
) {
  $output = [System.Drawing.Bitmap]::new(
    $Size,
    $Size,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
  )
  $graphics = [System.Drawing.Graphics]::FromImage($output)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  if ($Background) {
    $brush = [System.Drawing.SolidBrush]::new($jade)
    if ($Round) {
      $graphics.FillEllipse($brush, 0, 0, $Size, $Size)
    } else {
      $graphics.FillRectangle($brush, 0, 0, $Size, $Size)
    }
    $brush.Dispose()
  }

  $graphics.DrawImage($Source, 0, 0, $Size, $Size)
  $output.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $output.Dispose()
}

$emblem = New-Emblem
$densities = @(
  @{ Name = 'mdpi'; Legacy = 48; Foreground = 108 },
  @{ Name = 'hdpi'; Legacy = 72; Foreground = 162 },
  @{ Name = 'xhdpi'; Legacy = 96; Foreground = 216 },
  @{ Name = 'xxhdpi'; Legacy = 144; Foreground = 324 },
  @{ Name = 'xxxhdpi'; Legacy = 192; Foreground = 432 }
)

foreach ($density in $densities) {
  $directory = Join-Path $resourceRoot "mipmap-$($density.Name)"
  Save-ScaledPng $emblem (Join-Path $directory 'ic_launcher_foreground.png') $density.Foreground $false $false
  Save-ScaledPng $emblem (Join-Path $directory 'ic_launcher.png') $density.Legacy $false $true
  Save-ScaledPng $emblem (Join-Path $directory 'ic_launcher_round.png') $density.Legacy $true $true
}

$emblem.Dispose()
