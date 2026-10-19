---
name: yardimci-modeller
description: Büyük dosya/klasör okuma, uzun metin özetleme, toplu çeviri, ikinci görüş alma gibi çok token yakan işleri ücretsiz modellere (Gemini CLI, Codex, Qwen) devreder. Claude kredisini korumak gerektiğinde, 300 satırdan büyük içerik okunacağında veya kullanıcı "gemini'ye sor", "ikinci görüş", "ucuza yap" dediğinde kullan.
---

# Yardımcı modellere iş devretme

Amaç: Claude kredisini karar verme ve kod yazmaya saklamak; ağır ama basit okuma işlerini ücretsiz modellere yaptırmak.

## Ne zaman devret
- 300 satırdan uzun dosya, log, CSV, ürün listesi okumak ve özetlemek
- Bütün bir klasörü tarayıp "X nerede kullanılıyor" bulmak
- Uzun metin çevirisi, toplu ürün açıklaması taslağı
- Kendi çözümün için ikinci görüş

## Ne zaman devretme
- Dosya düzenleme, commit, kararın kendisi: bunları sen yap.
- Müşteri kişisel verisi, şifre, API anahtarı, tedarikçi gizli fiyatları içeren içerik: ücretsiz planlar veriyi eğitimde kullanabilir. Kullanıcıya sormadan gönderme.

## Nasıl
Bash ile çağır, çıktıyı oku, sonucu kendin doğrula:

```bash
# Tek dosya özet
cat urunler.csv | gemini -p "Bu listeyi kategori bazında özetle, en pahalı 10 ürünü yaz."

# Klasör tarama (Gemini, @ ile dosya/klasör okuyabilir)
gemini -p "@magaza/ Bu klasörde ödeme akışı hangi dosyalarda? Sadece dosya yolu ve satır listesi ver."

# İkinci görüş
cat cozum.md | codex exec --skip-git-repo-check "Bu yaklaşımdaki hataları madde madde yaz."

# Hangisi çalışıyorsa (otomatik sıra)
cat uzun.txt | AI_SIRA="gemini qwen codex" ai "Özetle"
```

## Kurallar
- Yardımcı modelin cevabını doğrulanmış gerçek sayma; kritik iddiaları dosyadan kendin kontrol et.
- Komut kota/limit hatası verirse sıradaki aracı dene; hepsi başarısızsa işi kendin yap ve kullanıcıya söyle.
- Kullanıcıya hangi işi hangi modele devrettiğini tek satırla bildir.
