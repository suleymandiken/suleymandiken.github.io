# Siteni ücretsiz yayınlama (GitHub Pages)

Bu işlemi **bilgisayardan** yap. Telefondan klasör yüklemek zahmetli. Yaklaşık 15 dakika sürer.

## 1. Hesap aç
1. github.com adresine git ve **Sign up** ile ücretsiz hesap aç.
2. Kullanıcı adını `suleymandiken` olarak seçmeye çalış. Siten bu adla açılacak. Alınmışsa `suleymandiken-dev` gibi bir ad seç.

## 2. Depoyu (repository) oluştur
1. Sağ üstteki **+** → **New repository**.
2. Repository name alanına tam olarak şunu yaz: `KULLANICIADIN.github.io`
   Örnek: `suleymandiken.github.io`
3. **Public** seçili kalsın (ücretsiz yayın için gerekli) ve **Create repository** de.

## 3. Dosyaları yükle
1. Açılan sayfada **uploading an existing file** bağlantısına tıkla.
2. Bu zip'i açtığın klasörün **içindeki her şeyi** (index.html, .nojekyll dosyası, gelirgider klasörü) sürükleyip bırak. Klasörün kendisini değil, içini sürükle.
3. `.nojekyll` gizli bir dosya olabilir. Görünmüyorsa dert etme, site onsuz da çalışır.
4. Aşağıdaki **Commit changes** düğmesine bas.

## 4. Yayını aç
1. Depoda **Settings** → soldan **Pages**.
2. **Source**: Deploy from a branch. **Branch**: `main`, klasör `/ (root)` → **Save**.
3. 1-2 dakika bekle. Siten açılır:
   - Ana sayfa: `https://suleymandiken.github.io/`
   - Zarfım: `https://suleymandiken.github.io/gelirgider/`

## 5. Telefona uygulama gibi kurmak
Telefonda Chrome ile `…/gelirgider/` adresini aç → ⋮ menüsü → **Uygulamayı yükle** (ya da Ana ekrana ekle). Artık Claude'un değil, Zarfım'ın kendi simgesiyle, tam ekran açılır ve internetsiz de çalışır.

## Yeni proje eklemek
1. Depoda **Add file** → **Upload files** ile yeni bir klasör yükle, örneğin `hesaplayici/index.html`.
2. Ana sayfadaki `index.html` dosyasını aç (kalem simgesi ile düzenle), en üstteki `PROJELER` listesine bir satır ekle:
   ```
   {adres:"hesaplayici",emoji:"🧮",ad:"Hesaplayıcı",aciklama:"Ne işe yaradığı",etiketler:["Etiket"]},
   ```
3. **Commit changes**. Bir dakika sonra sitede görünür.

## Kendi alan adını bağlamak (ileride)
suleymandiken.com'u aldığında: **Settings → Pages → Custom domain** alanına yaz ve alan adını aldığın sitedeki DNS ayarlarına GitHub'ın verdiği kayıtları ekle. Adresler `suleymandiken.com/gelirgider` olur.

## Bilmen gerekenler
- **Kodun herkese açık.** Ücretsiz GitHub Pages'te depo herkese açıktır. Kullanıcıların verileri ise koda girmez, onların kendi tarayıcısında kalır.
- **Tüm projeler aynı adreste çalışır ve tarayıcı depolamasını paylaşır.** Yeni projelerde kayıt anahtarlarını projeye özel adlandır (Zarfım `zk2` kullanıyor). Bir projeyi bana yaptırırken bunu söylemen yeterli.
- **Bu sürümde AI ve eşitleme yok.** Fiş okuma, bordro, danışman ve cihazlar arası eşitleme yalnızca Claude'daki sürümde çalışır.
