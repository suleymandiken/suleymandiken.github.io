# Windows kurulumu. PowerShell'de çalıştır:  powershell -ExecutionPolicy Bypass -File kur.ps1
$ErrorActionPreference = 'Stop'
$Klasor = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  Write-Host 'Önce Node.js kur: https://nodejs.org (LTS sürümü). Sonra bu betiği tekrar çalıştır.' -ForegroundColor Red
  exit 1
}

Write-Host '1/3 Ücretsiz yapay zekâ araçları kuruluyor...'
npm install -g @anthropic-ai/claude-code @google/gemini-cli @openai/codex @qwen-code/qwen-code

Write-Host "2/3 'ai' komutu kuruluyor..."
$Bin = Join-Path $HOME '.local\bin'
New-Item -ItemType Directory -Force -Path $Bin | Out-Null
Copy-Item (Join-Path $Klasor 'ai.ps1') (Join-Path $Bin 'ai.ps1') -Force
$KullaniciPath = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($KullaniciPath -notlike "*$Bin*") {
  [Environment]::SetEnvironmentVariable('Path', "$KullaniciPath;$Bin", 'User')
  Write-Host '   PATH güncellendi; PowerShell penceresini kapatıp aç.'
}

Write-Host "3/3 Claude'a 'yardimci-modeller' becerisi ekleniyor..."
$Skill = Join-Path $HOME '.claude\skills\yardimci-modeller'
New-Item -ItemType Directory -Force -Path $Skill | Out-Null
Copy-Item (Join-Path $Klasor 'skill\SKILL.md') (Join-Path $Skill 'SKILL.md') -Force

Write-Host ''
Write-Host 'Kurulum bitti. Şimdi her araca BİR KEZ giriş yap: gemini, codex, qwen (README''deki Giriş adımı).'
Write-Host 'Test:  ai "merhaba"'
