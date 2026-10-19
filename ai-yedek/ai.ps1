# ai — Windows sürümü. Kredisi/kotası biten araç atlanır, sıradakine geçilir.
# Kullanım:  ai "soru"    |   Get-Content dosya.txt | ai "bunu özetle"
# Sıra:      $env:AI_SIRA="gemini claude"; ai "soru"
$Sira = if ($env:AI_SIRA) { $env:AI_SIRA -split '\s+' } else { @('claude','gemini','codex','qwen') }
$LimitKalibi = 'usage limit|rate limit|limit reached|quota|credit balance|RESOURCE_EXHAUSTED|429|too many requests|insufficient|exceeded'
$Prompt = $args -join ' '
$Girdi = @($input) -join "`n"
if (-not $Prompt -and -not $Girdi) { Write-Error 'Kullanım: ai "sorun"'; exit 2 }

foreach ($arac in $Sira) {
  if (-not (Get-Command $arac -ErrorAction SilentlyContinue)) { Write-Host "· $arac kurulu değil, atlanıyor." -ForegroundColor DarkGray; continue }
  Write-Host "· $arac deneniyor..." -ForegroundColor DarkGray
  $cikti = switch ($arac) {
    'claude' { $Girdi | claude -p $Prompt 2>&1 }
    'gemini' { $Girdi | gemini -p $Prompt 2>&1 }
    'codex'  { $Girdi | codex exec --skip-git-repo-check $Prompt 2>&1 }
    'qwen'   { $Girdi | qwen $Prompt 2>&1 }
  }
  $kod = $LASTEXITCODE
  $metin = ($cikti | Out-String)
  $limitDoldu = ($metin.Length -lt 600) -and ($metin -match $LimitKalibi)
  if ($kod -eq 0 -and -not $limitDoldu) { Write-Output $metin; exit 0 }
  $ozet = $metin.Substring(0, [Math]::Min(200, $metin.Length)) -replace "`r?`n", ' '
  Write-Host "· $arac başarısız (çıkış kodu $kod): $ozet" -ForegroundColor Yellow
}
Write-Host 'Hiçbir araç cevap veremedi. Girişleri kontrol et.' -ForegroundColor Red
exit 1
