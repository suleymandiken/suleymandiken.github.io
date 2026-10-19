// Vercel derlemesi: site dosyalarını public/ klasörüne kopyalar ve config.js'i ortam değişkenlerinden üretir.
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";

const ayar = {
  supabaseUrl: (process.env.SUPABASE_URL || "").trim().replace(/\/$/, ""),
  supabaseAnonKey: (process.env.SUPABASE_ANON_KEY || "").trim(),
  iletisim: (process.env.NISBUL_ILETISIM || "").trim()
};

// Gizli (service_role / secret) anahtar sitede olursa herkes veritabanını silebilir. Yayını durdur.
const anahtar = ayar.supabaseAnonKey;
let rol = "";
try { rol = JSON.parse(Buffer.from(anahtar.split(".")[1] || "", "base64url").toString()).role || ""; } catch { /* JWT değil */ }
if (anahtar.startsWith("sb_secret_") || rol === "service_role") {
  console.error("HATA: SUPABASE_ANON_KEY olarak gizli (service_role/secret) anahtar girilmiş. Supabase'teki anon/publishable anahtarı kullan.");
  process.exit(1);
}
if (!ayar.supabaseUrl || !anahtar) console.warn("UYARI: SUPABASE_URL ya da SUPABASE_ANON_KEY eksik; site kurulum ekranı gösterecek.");

rmSync("public", { recursive: true, force: true });
mkdirSync("public");
for (const dosya of ["index.html", "app.js", "style.css", "taksonomi.json"]) copyFileSync(dosya, `public/${dosya}`);
writeFileSync("public/config.js", `window.NISBUL = ${JSON.stringify(ayar)};\n`);
console.log("public/ hazır.");
