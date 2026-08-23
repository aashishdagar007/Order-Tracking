Add-Type -AssemblyName System.Drawing

$srcIcon = [System.Drawing.Image]::FromFile((Join-Path (Get-Location) "windows\assets\app_icon.jpg"))
$bmpIcon = New-Object System.Drawing.Bitmap($srcIcon, 256, 256)
$bmpIcon.Save((Join-Path (Get-Location) "windows\assets\app_icon.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)

$hIcon = $bmpIcon.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)

$icoPath = Join-Path (Get-Location) "windows\assets\app_icon.ico"
$fs = [System.IO.File]::Create($icoPath)
$icon.Save($fs)
$fs.Close()

$favPath = Join-Path (Get-Location) "public\favicon.ico"
$fsFav = [System.IO.File]::Create($favPath)
$icon.Save($fsFav)
$fsFav.Close()

$srcBanner = [System.Drawing.Image]::FromFile((Join-Path (Get-Location) "windows\assets\wizard_image.jpg"))
$bmpBanner = New-Object System.Drawing.Bitmap($srcBanner, 164, 314)
$bmpBanner.Save((Join-Path (Get-Location) "windows\assets\wizard_image.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)

$bmpSmall = New-Object System.Drawing.Bitmap($srcIcon, 55, 55)
$bmpSmall.Save((Join-Path (Get-Location) "windows\assets\wizard_small.bmp"), [System.Drawing.Imaging.ImageFormat]::Bmp)

Write-Host "All BMP and ICO assets created successfully!"
