# Nişbul

Her gün yeni açılan Shopify mağazalarını bulan, ürünlerini çeken ve nişe göre listeleyen ürün araştırma aracı. Üyelik sistemli: kayıt olan kişiyi yönetici belirli bir süre için açar.

**Uydurma veri yoktur.** Sitedeki her mağaza ve ürün, tarayıcının gerçek Shopify mağazalarından okuduğu kayıttır. Tarama hiç çalışmadıysa site boş görünür.

## Nasıl çalışıyor

```
whoisds.com (dün kaydedilen ~100 bin alan adı)
   │  kesif.py: her alan adının DNS kaydına bakar
   ▼  Shopify'a yönlenenler (23.227.38.x / shops.myshopify.com) = yeni kurulan mağaza
Supabase: magazalar (durum: yeni)
   │  tara.py: /products.json, ana sayfa, /meta.json
   ▼
magazalar (açık / açılmak üzere / kapalı) + urunler + trendler
   │  Üyeliği süren kullanıcılar (veritabanı kuralı, RLS)
   ▼
Vercel'deki site
```

- **Açılmak üzere:** mağaza şifreli, yani kuruluyor. Her gün bakılır; açıldığı gün ürünleri gelir.
- **Kaldırıldı:** mağazanın daha önce sattığı ama artık listelemediği ürün. Test edilip vazgeçilmiş ürünleri gösterir.
- **Trendler:** aynı ürünün kaç farklı mağazada satıldığı. Eşleştirme önce **ürün görselinin parmak iziyle** yapılır (mağazalar aynı tedarikçi görselini kullanıp adı değiştirse de yakalanır), görseli olmayanlarda normalize başlıkla. Son 14 günde birden çok yeni mağaza ekliyorsa *yükselen*; toplam mağaza sayısı azsa *henüz doymamış*.
- **Satış takibi:** Shopify satış adedini açıklamaz. Ama her mağazanın "en çok satanlar" sıralamasını gerçek satışlara göre kendisi hesaplar ve bu sıralama herkese açıktır. Her taramada bu sıralama kaydedilir; ürün detayında iki takip vardır: *takip başladığından beri* ve *seçtiğin tarihten beri*. Sayılar adet değil, sıralamadaki yükseliş sayısıdır.
- **Türkiye önceliği:** ülkesi TR, para birimi TRY, dili Türkçe ya da uzantısı .tr olan mağazalar (açık ya da açılmak üzere) her taramada sıranın başına alınır. Bulucu "Türkiye ağırlıklı" çalışır, ürünlerde tek tık 🇹🇷 Türkiye filtresi var.
- Tarama **günde iki kez** (06:17 ve 18:17) çalışır; açık mağazalar her çalışmada yeniden taranır, yeni eklenen ürünler "yayına girdiği gün" ile görünür.
- **Saklanan veri:** her mağazanın "en çok satanlar" sıralamasındaki **ilk 10 ürünü** saklanır; listeden düşen ürün silinir, yerine giren eklenir (kaydedilen ürünler hariç). Sıralaması okunamayan mağazalarda en yeni 10 ürün alınır. Toplam ürün **500 bini** geçerse en eski mağazalar silinir; böylece ücretsiz 500 MB dolmaz. Tavan ve ürün sayısı `tara.py --en-cok-urun` ve `--en-cok-satan` ile, isteğe bağlı gün sınırı `--gun` ile değiştirilebilir.

## Kurulum (bir kez, ~30 dakika)

### 1. Supabase (veritabanı + üyelik), ücretsiz
1. supabase.com → **New project**. Bölge olarak **Frankfurt (eu-central-1)** seç. Veritabanı şifresini bir yere kaydet.
2. Sol menü **SQL Editor** → **New query** → `nisbul/supabase/schema.sql` dosyasının tamamını yapıştır → **Run**. "Success" görmelisin.
3. **Project Settings → API**: buradan üç değer alacaksın:
   - **Project URL** → `SUPABASE_URL`
   - **anon / publishable** anahtar → `SUPABASE_ANON_KEY` (siteye konur, gizli değildir)
   - **service_role / secret** anahtar → `SUPABASE_SERVICE_KEY` (**gizli**; sadece GitHub'a girilir, asla siteye ya da başka bir yere)
4. **Authentication → URL Configuration → Site URL**: Vercel adresin (3. adımdan sonra gelip güncelle). Onay e-postaları bu adrese yönlenir.

### 2. GitHub (günlük tarama), ücretsiz
1. Bu depo → **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_KEY`
2. **Actions** sekmesi → (soruyorsa) workflow'ları etkinleştir → **Nişbul günlük tarama** → **Run workflow**. İlk çalışma 1-3 saat sürebilir. Sonra her gün 06:17 ve 18:17'de kendiliğinden çalışır; bilgisayarının açık olması gerekmez.
3. Kayıtlarda sadece sayılar görünür (kaç alan adı, kaç Shopify, kaç ürün). Mağaza adları bilerek yazılmaz, çünkü depo herkese açık ve veri senin avantajın.

### 3. Vercel (site), ücretsiz
1. vercel.com → **Add New → Project** → bu GitHub deposunu seç.
2. **Root Directory**: `nisbul`. Framework: **Other** (ayarları `vercel.json` belirler).
3. **Environment Variables**:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `NISBUL_ILETISIM` (isteğe bağlı): üyeliği olmayanların göreceği "Yöneticiye ulaş" bağlantısı, ör. `https://wa.me/905xxxxxxxxx`
4. **Deploy**. Gizli anahtarı yanlışlıkla `SUPABASE_ANON_KEY`'e koyarsan derleme bilerek hata verir.

### 4. Kendini yönetici yap
1. Sitede **Kayıt ol** → e-postanı onayla.
2. Supabase **SQL Editor**'da (kendi e-postanla):
   ```sql
   update public.profiller set rol = 'admin' where eposta = 'senin@epostan.com';
   ```
3. Sitede **Üyeliğimi kontrol et**. Artık **Yönetim** sekmesi görünür. Yöneticiler süresiz erişir.

## Üyelik yönetimi
**Yönetim** sekmesinde kayıt olan herkes listelenir:
- **+7 gün / +30 / +90 / +1 yıl:** kalan sürenin üstüne eklenir; süresi dolmuşsa bugünden başlar.
- **Tarih seç:** bitiş tarihini doğrudan ayarlar.
- **Erişimi kapat:** hemen bitirir.
- **Yönetici yap:** o kişi de süresiz erişir ve üyelik verebilir. Kendini yöneticilikten düşüremezsin.

Süre dolduğu an erişim veritabanı seviyesinde kapanır. Kullanıcı tarayıcı konsolundan doğrudan sorgu atsa bile veri dönmez; kendi süresini ya da rolünü değiştiremez.

## Sınırlar
- **Sadece özel alan adı alan mağazalar bulunur.** Sadece `xxx.myshopify.com` adresiyle açılan mağazalar yeni alan adı listesinde yoktur. Ciddi satış yapmaya niyetli mağazaların çoğu alan adı alır, ama tüm yeni mağazaları göremezsin.
- **whoisds listesi** sadece genel uzantıları (.com, .shop, .store…) kapsar; .de, .com.tr gibi ülke uzantıları gelmez. Bunlar için `kesif.py --dosya alanlar.txt` ile elle liste ekleyebilirsin.
- **whoisds adresi değişirse** keşif adımı "liste bulunamadı" yazar. Actions kayıtlarını ilk haftalarda kontrol et.
- **Bazı mağazalar `/products.json`'u kapatır**; bunların ürünleri gelmez.
- **Supabase ücretsiz katman 500 MB**'dır, yaklaşık 300-400 bin ürün eder. Dolmaya yaklaşınca Pro plana (aylık 25$) geçmek gerekir. Kullanım: Supabase → Reports.
- **GitHub, 60 gün boyunca hiç commit gelmeyen** herkese açık depolarda zamanlanmış işleri durdurur. İş her çalışmada kendini yeniden etkinleştirerek bu sayacı sıfırlar; yine de ayda bir Actions sekmesine göz at.
- **Satış takibi sıralamaya dayanır:** "en çok satanlar" sayfasını tema JavaScript ile çizen az sayıdaki mağazada sıra okunamaz; o mağazalarda takip boş kalır.

## Şema güncellemesi
`supabase/schema.sql` tekrar çalıştırılabilir; var olan veriyi silmez, eksik tablo ve sütunları ekler. Yeni bir sürüm geldiğinde önce Supabase SQL Editor'da bu dosyayı çalıştır, sonra kodu birleştir.
- **Fiyatlar tarama günündeki kurla ₺'ye çevrilir** (open.er-api.com, ulaşılamazsa sabit tablo).

## Dosyalar
- `index.html`, `app.js`, `style.css`: site
- `taksonomi.json`: 26 kategori, 81 niş ve sınıflandırma anahtar kelimeleri (site ve tarayıcı ortak kullanır)
- `supabase/schema.sql`: tablolar, erişim kuralları, arama ve yönetici fonksiyonları
- `araclar/kesif.py`: yeni mağaza keşfi · `araclar/tara.py`: ürün ve satış sırası tarama · `araclar/gorsel.py`: görsel eşleştirme ve trend hesabı · `araclar/ortak.py`: ortak parçalar
- `build.mjs`, `vercel.json`: Vercel derlemesi
- Depo kökündeki `.github/workflows/nisbul-tarama.yml`: günlük zamanlama
