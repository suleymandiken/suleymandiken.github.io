# Izgara kurulumu: exe'yi indirir, %LOCALAPPDATA%\Izgara\ızgara.exe olarak kurar,
# masaüstü + Başlat menüsü kısayolu ekler ve açar.
# Kullanım (PowerShell):  irm https://raw.githubusercontent.com/suleymandiken/suleymandiken.github.io/claude/amazing-dirac-h329sc/gridpost/kur.ps1 | iex
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ad  = "$([char]0x131)zgara"   # "ızgara" (betik kodlamasından bağımsız)
$url = 'https://github.com/suleymandiken/suleymandiken.github.io/releases/download/gridpost/Izgara-windows.zip'
$dir = Join-Path $env:LOCALAPPDATA 'Izgara'
$zip = Join-Path $env:TEMP 'izgara.zip'
$tmp = Join-Path $env:TEMP 'izgara_kurulum'

Write-Host "Indiriliyor..."
Invoke-WebRequest $url -OutFile $zip -UseBasicParsing
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Expand-Archive $zip $tmp -Force

New-Item -ItemType Directory -Force $dir | Out-Null
$exe = Join-Path $dir "$ad.exe"
Copy-Item (Join-Path $tmp 'Izgara.exe') $exe -Force
Unblock-File $exe

$ws = New-Object -ComObject WScript.Shell
$yerler = @([Environment]::GetFolderPath('Desktop'),
            (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))
foreach ($yer in $yerler) {
    $k = $ws.CreateShortcut((Join-Path $yer "$ad.lnk"))
    $k.TargetPath = $exe
    $k.WorkingDirectory = $dir
    $k.Save()
}
Remove-Item $zip, $tmp -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Kuruldu: $exe" -ForegroundColor Green
Start-Process $exe
