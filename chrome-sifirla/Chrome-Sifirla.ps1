# Chrome'u orijinal haline döndürür: politikalar, kısayol bayrakları, chrome://flags, koyu mod zorlaması.
# Kullanım: PowerShell'i YÖNETİCİ olarak aç ->  powershell -ExecutionPolicy Bypass -File .\Chrome-Sifirla.ps1
# Yer imleri, şifreler, geçmiş silinmez. Değiştirilen dosyaların yedeği masaüstüne alınır.

$ErrorActionPreference = "SilentlyContinue"
$yedek = Join-Path ([Environment]::GetFolderPath("Desktop")) "Chrome-Yedek-$(Get-Date -Format yyyyMMdd-HHmmss)"
New-Item -ItemType Directory -Path $yedek -Force | Out-Null

Write-Host "1) Chrome kapatiliyor..." -ForegroundColor Cyan
Get-Process chrome | Stop-Process -Force
Start-Sleep 2

Write-Host "2) Politikalar (kayit defteri) siliniyor..." -ForegroundColor Cyan
foreach ($yol in @(
  "HKLM:\SOFTWARE\Policies\Google\Chrome",
  "HKCU:\SOFTWARE\Policies\Google\Chrome",
  "HKLM:\SOFTWARE\WOW6432Node\Policies\Google\Chrome",
  "HKLM:\SOFTWARE\Policies\Google\Update",
  "HKCU:\SOFTWARE\Policies\Google\Update")) {
  if (Test-Path $yol) {
    $ad = ($yol -replace '[:\\]', '_') + ".reg"
    reg export ($yol -replace '^HKLM:', 'HKLM' -replace '^HKCU:', 'HKCU') (Join-Path $yedek $ad) /y | Out-Null
    Remove-Item $yol -Recurse -Force
    Write-Host "   silindi: $yol"
  }
}

Write-Host "3) Kisayollardaki ek bayraklar temizleniyor..." -ForegroundColor Cyan
$chromeExe = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
               "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
               "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
$klasorler = @([Environment]::GetFolderPath("Desktop"),
               [Environment]::GetFolderPath("CommonDesktopDirectory"),
               [Environment]::GetFolderPath("Programs"),
               [Environment]::GetFolderPath("CommonPrograms"),
               "$env:APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned")
$sh = New-Object -ComObject WScript.Shell
foreach ($k in $klasorler) {
  Get-ChildItem $k -Filter *.lnk -Recurse | ForEach-Object {
    $lnk = $sh.CreateShortcut($_.FullName)
    if ($lnk.TargetPath -like "*chrome.exe" -and $lnk.Arguments) {
      Write-Host "   $($_.Name): '$($lnk.Arguments)' kaldirildi"
      $lnk.Arguments = ""
      if ($chromeExe) { $lnk.TargetPath = $chromeExe }
      $lnk.Save()
    }
  }
}

Write-Host "4) chrome://flags ve koyu mod zorlamasi sifirlaniyor..." -ForegroundColor Cyan
$veri = "$env:LOCALAPPDATA\Google\Chrome\User Data"
$ls = Join-Path $veri "Local State"
if (Test-Path $ls) {
  Copy-Item $ls (Join-Path $yedek "Local State") -Force
  $j = Get-Content $ls -Raw | ConvertFrom-Json
  if ($j.browser.PSObject.Properties["enabled_labs_experiments"]) {
    $j.browser.PSObject.Properties.Remove("enabled_labs_experiments")
  }
  $j | ConvertTo-Json -Depth 100 -Compress | Set-Content $ls -Encoding UTF8
}
# Profillerdeki tema / koyu mod tercihleri
Get-ChildItem $veri -Directory | Where-Object { $_.Name -match '^(Default|Profile \d+)$' } | ForEach-Object {
  $pf = Join-Path $_.FullName "Preferences"
  if (Test-Path $pf) {
    Copy-Item $pf (Join-Path $yedek "$($_.Name)-Preferences") -Force
    $p = Get-Content $pf -Raw | ConvertFrom-Json
    if ($p.browser.PSObject.Properties["theme"]) { $p.browser.PSObject.Properties.Remove("theme") }
    if ($p.extensions.PSObject.Properties["theme"]) { $p.extensions.PSObject.Properties.Remove("theme") }
    if ($p.PSObject.Properties["webkit"] -and $p.webkit.webprefs.PSObject.Properties["force_dark_mode_enabled"]) {
      $p.webkit.webprefs.PSObject.Properties.Remove("force_dark_mode_enabled")
    }
    $p | ConvertTo-Json -Depth 100 -Compress | Set-Content $pf -Encoding UTF8
  }
}

Write-Host "5) Windows uygulama modu aciliyor (Chrome buna uyar)..." -ForegroundColor Cyan
$kisi = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize"
Set-ItemProperty $kisi -Name AppsUseLightTheme -Value 1 -Type DWord
Set-ItemProperty $kisi -Name SystemUsesLightTheme -Value 1 -Type DWord

Write-Host "`nBitti. Yedek: $yedek" -ForegroundColor Green
Write-Host "Simdi Chrome'u ac, 'chrome://policy' sayfasinda hicbir sey listelenmedigini kontrol et."
Write-Host "NOT: Eklentiler (Dark Reader vb.) bu scriptle silinmez -> chrome://extensions"
Start-Process $chromeExe
