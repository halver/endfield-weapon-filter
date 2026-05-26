Add-Type -AssemblyName System.Drawing

$baseImagePath = "C:\Users\yf-02\.gemini\antigravity\brain\6a6e690b-1bb1-4530-b188-be42091d3d2c\app_icon_base_1779597045614.png"
$resDir = "C:\Users\yf-02\.gemini\antigravity\scratch\endfield-android-app\app\src\main\res"

$sizes = @{
    "mipmap-mdpi" = 48
    "mipmap-hdpi" = 72
    "mipmap-xhdpi" = 96
    "mipmap-xxhdpi" = 144
    "mipmap-xxxhdpi" = 192
}

$srcImage = [System.Drawing.Image]::FromFile($baseImagePath)

function Resize-And-Save {
    param($size, $destDir)
    
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir | Out-Null
    }
    
    $destBitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($destBitmap)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    
    $graphics.DrawImage($srcImage, 0, 0, $size, $size)
    $graphics.Dispose()
    
    # Save as ic_launcher.png
    $destPath = Join-Path $destDir "ic_launcher.png"
    $destBitmap.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    # Save as ic_launcher_round.png
    $destPathRound = Join-Path $destDir "ic_launcher_round.png"
    $destBitmap.Save($destPathRound, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $destBitmap.Dispose()
}

foreach ($key in $sizes.Keys) {
    $size = $sizes[$key]
    $destPathDir = Join-Path $resDir $key
    Resize-And-Save -size $size -destDir $destPathDir
    Write-Host "Resized to $size x $size and saved to $destPathDir"
}

$srcImage.Dispose()

# Remove mipmap-anydpi-v26 directory to ensure PNG icons are used
$anyDpiDir = Join-Path $resDir "mipmap-anydpi-v26"
if (Test-Path $anyDpiDir) {
    Remove-Item -Path $anyDpiDir -Recurse -Force
    Write-Host "Removed $anyDpiDir to default to PNG icons"
}
