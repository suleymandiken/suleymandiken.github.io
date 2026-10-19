# Nişbul

storelister.com'un tersine mühendislikle çıkarılmış işlevsel karşılığı: yeni Shopify mağazalarını ve ürünlerini nişe göre listeleyen bir ürün araştırma aracı.

## Neler var
- **Filtre paneli** (orijinaldeki yapı): takvimden eklenme günü, 26 kategoride aranabilir çoklu seçim, ₺ cinsinden fiyat aralığı (farklı para birimleri yaklaşık kurla çevrilir), mağaza başına maks ürün (1–10), tüm ülkeler, para birimi, dil ve domain uzantısı listeleri. Her bölümde "?" açıklaması var. Seçimler "Filtreleri Uygula"ya basınca devreye girer; uygulananlar sonuçların üstünde kaldırılabilir çipler olarak görünür.
- **Ürünler:** ızgara görünüm, anlık arama, 4 sıralama.
- **Mağazalar:** ürün sayısı filtresiyle mağaza dizini. Mağazaya tıklayınca ortanca fiyat ve tüm ürünleri açılır.
- **Bulucu:** filtrelenmiş ürünleri tek tek gösteren kaydırmalı deste (sağa kaydır = kaydet, sola = geç, klavyede ← →).
- **Kaydedilenler:** ürün ve mağaza listeleri, Excel'e uygun CSV dışa aktarma. Kayıtlar tarayıcıda kalır.

## Veri
- `data.json` yoksa `demo.js` kurgusal örnek veri üretir. Arayüz bunu sarı uyarıyla belirtir ve dış bağlantıları kapatır.
- Gerçek veri için:
  ```
  python3 araclar/tara.py magazalar.txt
  ```
  `magazalar.txt` dosyasına her satıra bir Shopify alan adı yaz. Betik her mağazanın herkese açık `/products.json` uç noktasını okur, ürünleri `taksonomi.json` içindeki anahtar kelimelerle nişlere ayırır ve `data.json` yazar. Dosyayı commit'lersen site onu kullanır.
- Nişleri genişletmek için `taksonomi.json`'a niş ve anahtar kelime ekle. Arayüz ve tarayıcı aynı dosyayı okur.

## Orijinalden eksik olan
Asıl zor kısım arayüz değil, **her gün yeni açılan mağazaları bulmak**. storelister bunu sunucu tarafında sürekli çalışan bir tarayıcıyla yapıyor; GitHub Pages statik olduğu için burada yok. Mağaza listesini toplamak için uygulanabilir yollar:
1. Sertifika şeffaflık kayıtları (crt.sh): yeni alınan alan adlarını çekip Shopify IP'sine (`23.227.38.x`) yönlenenleri ayıklamak.
2. Google: `site:myshopify.com "niş kelimesi"` ve `"powered by shopify"` aramaları.
3. Reklam kütüphaneleri (Meta Ad Library, TikTok Creative Center): reklam veren mağazalar zaten satış deneyen mağazalardır.

Bu adımı GitHub Actions'ta günlük çalışan bir iş olarak kurup `tara.py` ile birleştirmek, bu projeyi demo olmaktan çıkarıp gerçek ürüne çevirir.

Yerelde denemek için klasörde `python3 -m http.server` çalıştırıp `localhost:8000` adresini aç (dosyayı çift tıklayarak açınca `fetch` çalışmaz).
