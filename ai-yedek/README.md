# AI Yedek Kurulumu: Claude biterse ücretsiz modellerle devam

Bu klasör senin bilgisayarına üç şey kurar:

1. **Ücretsiz araçlar:** Gemini CLI (Google hesabı), Codex CLI (ChatGPT hesabı), Qwen Code (Qwen hesabı) ve Claude Code.
2. **`ai` komutu:** Sorunu sırayla Claude → Gemini → Codex → Qwen'e sorar. Kredisi ya da kotası biten aracı atlar, sıradakinden cevap alır.
3. **Claude becerisi (`yardimci-modeller`):** Claude, büyük dosya okuma ve özetleme gibi çok kredi yiyen işleri kendiliğinden Gemini'ye devreder. Böylece Claude kredin daha geç biter.

> Grok yok: xAI'nin kalıcı ücretsiz bir komut satırı aracı ya da ücretsiz API'si yok. İstersen sonra OpenRouter üzerinden eklenebilir.

## Kurulum (yaklaşık 10 dakika, bilgisayarda)

1. **Node.js kur:** https://nodejs.org → LTS sürümünü indir ve kur.
2. Bu klasörü bilgisayarına indir (GitHub'da **Code → Download ZIP**, sonra `ai-yedek` klasörünü aç).
3. Kurulumu çalıştır:
   - **Windows:** klasörde boş bir yere Shift + sağ tık → "PowerShell penceresini burada aç" →
     `powershell -ExecutionPolicy Bypass -File kur.ps1`
   - **Mac / Linux:** klasörde terminal aç → `bash kur.sh`
4. Terminali kapatıp yeniden aç.

## Giriş (her araç için bir kez)

Terminale sırayla yaz. Her biri tarayıcı açar, hesabınla giriş yaparsın, sonra `/quit` ya da Ctrl+C ile çıkarsın:

| Komut | Hesap | Ücretsiz kota |
|---|---|---|
| `claude` | Claude aboneliği | Abonelik limitin |
| `gemini` | Google hesabı ("Login with Google") | En cömert olanı |
| `codex` | ChatGPT hesabı ("Sign in with ChatGPT") | ChatGPT planına bağlı, ücretsiz planda kısıtlı |
| `qwen` | Qwen hesabı (OAuth) | Günlük ücretsiz istek |

## Kullanım

```bash
ai "Shopify'da kargo ücretini sepete göre nasıl ayarlarım?"
cat urunler.csv | ai "Bu ürünleri kâr marjına göre sırala"   # Windows: Get-Content urunler.csv | ai "..."
```

Sırayı değiştirmek için, örneğin Claude kredisini hiç harcamamak istiyorsan:

```bash
AI_SIRA="gemini qwen codex" ai "soru"            # Mac/Linux
$env:AI_SIRA="gemini qwen codex"; ai "soru"      # Windows
```

Claude Code içindeyken bir şey yapmana gerek yok. Beceri kurulu olduğu için Claude büyük okuma işlerini kendisi Gemini'ye devreder. Elle de söyleyebilirsin: *"bunu gemini'ye özetlet"*.

## Dürüst sınırlar

- **`ai` tek soruluk işler içindir.** Claude Code'da yarım kalmış uzun bir kodlama oturumunu başka bir model otomatik devralamaz. Claude limiti dolarsa aynı klasörde `gemini` (ya da `codex`) aç ve "kaldığım yer: …" diye özetleyerek devam et.
- **Ücretsiz planlar verini eğitimde kullanabilir.** Müşteri bilgisi, şifre ve gizli tedarikçi fiyatlarını Gemini, Qwen ya da ücretsiz Codex'e verme.
- **Kalite farkı var.** Önemli kararlarda yedek modelin cevabını kontrol et.
- Kota mesajları değişirse `ai` betiğindeki `LIMIT_KALIBI` satırına yeni mesajı ekle.

## Dosyalar

| Dosya | Ne işe yarar |
|---|---|
| `kur.sh` / `kur.ps1` | Kurulum betiği |
| `ai` / `ai.ps1` | Yedeğe geçen soru komutu |
| `ai-kontrol` | Hangi araçların kurulu olduğunu gösterir (Mac/Linux) |
| `skill/SKILL.md` | Claude'a iş devretmeyi öğreten beceri |
