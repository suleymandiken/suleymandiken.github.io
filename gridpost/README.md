# Izgara (Windows)

AppX Studio'nun **Grid Post** uygulamasının mantığıyla çalışan masaüstü sürüm:
bir fotoğrafı Instagram profilinde tek büyük görsel gibi görünecek parçalara böler.

## Kullanım
1. **Fotoğraf aç** (Ctrl+O)
2. Izgara (3x1, 3x2, 3x3, 3x4, 2x1, 2x2) ve parça oranını (3:4, 4:5, 1:1) seç
3. Önizlemede **sürükleyerek** kadrajı kaydır, **tekerlekle** yakınlaştır
4. **Parçaları kaydet** (Ctrl+S) → `foto_grid_3x3/01.jpg, 02.jpg…`
5. Instagram'a **01'den başlayarak sırayla** paylaş (01 = sağ alt köşe)

Parçalar 1080 px genişlikte, %95 JPEG kalitesinde kaydedilir.

## Kurulum (tek satır)
Başlat → "PowerShell" yaz → aç → şunu yapıştır → Enter:

```powershell
irm https://raw.githubusercontent.com/suleymandiken/suleymandiken.github.io/claude/amazing-dirac-h329sc/gridpost/kur.ps1 | iex
```

`%LOCALAPPDATA%\Izgara\ızgara.exe` olarak kurulur, masaüstüne ve Başlat menüsüne kısayol eklenir.

## Diğer yollar
- **Manuel:** GitHub → Actions → "GridPost Mini .exe" → son çalışmanın
  `Izgara-windows.zip` dosyasını indir, içindeki `Izgara.exe`'yi çalıştır.
- **Python varsa:** `calistir.bat`'a çift tıkla.
- **Kendin .exe yapmak için:** `exe-yap.bat` → `dist\Izgara.exe`

> Not: İmzasız .exe olduğu için Windows SmartScreen uyarı verebilir →
> "Ek bilgi" → "Yine de çalıştır".
