/* Nişbul: yeni Shopify mağazalarından toplanan gerçek ürün verisi.
   Veri ve üyelik Supabase'te durur; erişimi veritabanı kuralları (RLS) belirler, bu dosya sadece arayüzdür. */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const GUN = 864e5, SAYFA = 48, FIYAT_TAVAN = 10000;
  const depo = {
    al(k, v) { try { const x = localStorage.getItem("nisbul:" + k); return x ? JSON.parse(x) : v; } catch { return v; } },
    yaz(k, v) { try { localStorage.setItem("nisbul:" + k, JSON.stringify(v)); } catch { /* gizli pencere vb. */ } }
  };
  const adlandir = tur => { try { const d = new Intl.DisplayNames(["tr"], { type: tur }); return k => { try { return d.of(k) || k; } catch { return k; } }; } catch { return k => k; } };
  const ulkeAdi = adlandir("region"), dilAdi = adlandir("language"), paraAdi = adlandir("currency");
  const bayrak = k => /^[A-Z]{2}$/.test(k || "") ? String.fromCodePoint(...[...k].map(c => 0x1f1e6 + c.charCodeAt(0) - 65)) : "🏳️";
  const fmtCache = {};
  const para = (v, kur) => { if (v == null) return "–"; try { return (fmtCache[kur] ||= new Intl.NumberFormat("tr-TR", { style: "currency", currency: kur || "USD", maximumFractionDigits: 2 })).format(v); } catch { return v + " " + (kur || ""); } };
  const tl = v => para(Math.round(v), "TRY").replace(",00", "");
  const sayi = new Intl.NumberFormat("tr-TR");
  const once = iso => { if (!iso) return "–"; const dk = (Date.now() - Date.parse(iso)) / 6e4; if (dk < 60) return Math.max(1, Math.round(dk)) + " dk önce"; if (dk < 1440) return Math.round(dk / 60) + " saat önce"; const g = Math.floor(dk / 1440); return g === 1 ? "dün" : g < 30 ? g + " gün önce" : g < 365 ? Math.floor(g / 30) + " ay önce" : Math.floor(g / 365) + " yıl önce"; };
  const ton = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const gunAnahtar = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const gunUzun = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" });
  const gunKisa = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" });
  const ayAdi = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" });
  const tarihAl = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
  const buyukBas = t => t ? t.charAt(0).toLocaleUpperCase("tr") + t.slice(1) : t;
  const ULKE_KODLARI = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");

  const AYAR = window.NISBUL || {};
  let sb = null, KULLANICI = null, PROFIL = null, OZET = null, TAX = null, NIS = {}, KAT = {}, baglandi = false;
  const DIGER = { id: "diger", ad: "Diğer", emoji: "📦", kategori: "diger" };
  const nisOf = id => NIS[id] || DIGER;
  const URUN = new Map(), MAGAZA = new Map();

  /* S.f uygulanmış filtreler, T paneldeki taslak. "Filtreleri Uygula" T'yi S.f'ye kopyalar. */
  const F0 = { ara: "", gun: "", kesif: "", kategoriler: [], nis: "", anahtar: "", anahtarAd: "", fmin: 0, fmax: null, magazaBasi: 0, ulkeler: [], paralar: [], diller: [], tldler: [], durumlar: [], amin: "", amax: "", maxMagaza: "", indirim: false, satista: false };
  const kopya = f => JSON.parse(JSON.stringify(f));
  const S = {
    sekme: "urunler", f: kopya(F0), sirala: { urunler: "yeni", magazalar: "yeni", trendler: "yukselen" },
    liste: { satirlar: [], toplam: 0, magaza: 0, yukleniyor: false, bitti: false },
    kayit: { u: new Set(), m: new Set() },
    bulucu: { liste: [], i: 0, gecilen: 0, kaydedilen: 0, tohum: "", bitti: false, yukleniyor: false },
    istek: 0
  };
  let T = kopya(F0), takvimAy = null;
  S.bulucuTR = depo.al("bulucuTR", true);
  const araMetni = {};
  const kayitSayiYaz = () => { $("#kayitSayi").textContent = S.kayit.u.size + S.kayit.m.size; };

  /* ---------- küçük yardımcılar ---------- */
  let bildirimZaman;
  function bildir(metin, hata) {
    const el = $("#bildirim"); el.textContent = metin; el.classList.toggle("hata", !!hata); el.hidden = false;
    clearTimeout(bildirimZaman); bildirimZaman = setTimeout(() => { el.hidden = true; }, hata ? 6000 : 3000);
  }
  const bos = (b, t) => `<div class="bos"><b>${b}</b>${t}</div>`;
  const yukleniyor = () => `<div class="bos"><span class="donen" aria-hidden="true"></span><span class="sr">Yükleniyor</span></div>`;
  const hataMetni = e => {
    const m = String(e?.message || e || "");
    if (/Invalid login credentials/i.test(m)) return "E-posta ya da şifre hatalı.";
    if (/already registered|already exists/i.test(m)) return "Bu e-postayla zaten bir hesap var. Giriş yapmayı dene.";
    if (/Email not confirmed/i.test(m)) return "E-postanı henüz onaylamadın. Gelen kutundaki bağlantıya tıkla.";
    if (/Password should be at least|weak/i.test(m)) return "Şifre en az 8 karakter olmalı.";
    if (/rate limit|too many/i.test(m)) return "Çok fazla deneme yapıldı. Birkaç dakika sonra tekrar dene.";
    if (/Failed to fetch|NetworkError/i.test(m)) return "Sunucuya ulaşılamadı. İnternet bağlantını kontrol et.";
    return "Bir hata oluştu: " + m.slice(0, 160);
  };
  async function rpc(ad, args) {
    const { data, error } = await sb.rpc(ad, args);
    if (error) {
      if (/uyelik_yok/.test(error.message)) { await profilYukle(); throw new Error("Üyeliğin aktif değil."); }
      throw error;
    }
    return data;
  }
  const aktifMi = () => !!PROFIL && (PROFIL.rol === "admin" || (!!PROFIL.uyelik_bitis && Date.parse(PROFIL.uyelik_bitis) > Date.now()));
  const kalanGun = () => PROFIL?.uyelik_bitis ? Math.ceil((Date.parse(PROFIL.uyelik_bitis) - Date.now()) / GUN) : 0;

  /* ---------- giriş ve üyelik ekranları ---------- */
  function ekranGoster(html) {
    $("#ekran").innerHTML = html; $("#ekran").hidden = false;
    $("#uygulama").hidden = true; $("#sekmeler").hidden = true;
    hesapCiz();
  }
  function hesapCiz() {
    const el = $("#hesap");
    if (!KULLANICI) { el.hidden = true; return; }
    const rozet = PROFIL?.rol === "admin" ? `<span class="hesap-rozet yonetici">Yönetici</span>`
      : aktifMi() ? `<span class="hesap-rozet${kalanGun() <= 3 ? " az" : ""}">${kalanGun()} gün kaldı</span>` : `<span class="hesap-rozet az">Üyelik yok</span>`;
    el.innerHTML = `${rozet}<span class="hesap-eposta" title="${esc(KULLANICI.email)}">${esc(KULLANICI.email)}</span><button class="ikincil" type="button" data-cikis>Çıkış</button>`;
    el.hidden = false;
  }
  function girisEkrani(mod = "giris", mesaj = "") {
    KULLANICI = null; PROFIL = null;
    const kayit = mod === "kayit", unuttum = mod === "unuttum";
    ekranGoster(`<div class="kart-ekran"><div class="giris">
      <span class="logo-ic buyuk" aria-hidden="true"></span>
      <h1>${kayit ? "Hesap oluştur" : unuttum ? "Şifreni sıfırla" : "Giriş yap"}</h1>
      <p class="giris-alt">Her gün yeni açılan Shopify mağazalarından toplanan gerçek ürün verisi.</p>
      ${unuttum ? "" : `<div class="giris-sekme" role="tablist"><button type="button" role="tab" data-mod="giris" aria-selected="${!kayit}">Giriş yap</button><button type="button" role="tab" data-mod="kayit" aria-selected="${kayit}">Kayıt ol</button></div>`}
      <form id="girisForm" novalidate>
        <label>E-posta<input name="eposta" type="email" autocomplete="email" required></label>
        ${unuttum ? "" : `<label>Şifre<input name="sifre" type="password" autocomplete="${kayit ? "new-password" : "current-password"}" minlength="8" required></label>`}
        <p class="form-mesaj" id="formMesaj" role="alert">${mesaj}</p>
        <button class="birincil genis" type="submit">${kayit ? "Kayıt ol" : unuttum ? "Sıfırlama bağlantısı gönder" : "Giriş yap"}</button>
      </form>
      ${kayit ? `<p class="giris-not">Kayıt olduktan sonra yönetici üyeliğini açar. Erişimin, yöneticinin verdiği süre boyunca geçerli olur.</p>` : ""}
      <p class="giris-not">${unuttum ? `<button class="metin-btn" type="button" data-mod="giris">Girişe dön</button>` : kayit ? "" : `<button class="metin-btn" type="button" data-mod="unuttum">Şifremi unuttum</button>`}</p>
    </div></div>`);
    $("#girisForm").addEventListener("submit", async e => {
      e.preventDefault();
      const fd = new FormData(e.target), eposta = String(fd.get("eposta")).trim(), sifre = String(fd.get("sifre") || "");
      const msj = $("#formMesaj"), dugme = e.target.querySelector("button[type=submit]");
      msj.className = "form-mesaj";
      if (!/^\S+@\S+\.\S+$/.test(eposta)) { msj.textContent = "Geçerli bir e-posta yaz."; return; }
      if (!unuttum && sifre.length < 8) { msj.textContent = "Şifre en az 8 karakter olmalı."; return; }
      dugme.disabled = true;
      try {
        if (unuttum) {
          const { error } = await sb.auth.resetPasswordForEmail(eposta, { redirectTo: location.origin + location.pathname });
          if (error) throw error;
          msj.className = "form-mesaj iyi"; msj.textContent = "Sıfırlama bağlantısı e-postana gönderildi.";
        } else if (kayit) {
          const { data, error } = await sb.auth.signUp({ email: eposta, password: sifre, options: { emailRedirectTo: location.origin + location.pathname } });
          if (error) throw error;
          if (!data.session) { msj.className = "form-mesaj iyi"; msj.textContent = "Neredeyse bitti: e-postana gelen onay bağlantısına tıkla, sonra giriş yap."; }
        } else {
          const { error } = await sb.auth.signInWithPassword({ email: eposta, password: sifre });
          if (error) throw error;
        }
      } catch (err) { msj.className = "form-mesaj"; msj.textContent = hataMetni(err); }
      finally { dugme.disabled = false; }
    });
    $("#ekran").querySelectorAll("[data-mod]").forEach(b => b.addEventListener("click", () => girisEkrani(b.dataset.mod)));
    $("#girisForm input")?.focus();
  }
  function yeniSifreEkrani() {
    ekranGoster(`<div class="kart-ekran"><div class="giris"><h1>Yeni şifre belirle</h1>
      <form id="sifreForm"><label>Yeni şifre<input name="sifre" type="password" autocomplete="new-password" minlength="8" required></label>
      <p class="form-mesaj" id="formMesaj" role="alert"></p><button class="birincil genis" type="submit">Şifreyi kaydet</button></form></div></div>`);
    $("#sifreForm").addEventListener("submit", async e => {
      e.preventDefault();
      const sifre = String(new FormData(e.target).get("sifre"));
      if (sifre.length < 8) { $("#formMesaj").textContent = "Şifre en az 8 karakter olmalı."; return; }
      const { error } = await sb.auth.updateUser({ password: sifre });
      if (error) { $("#formMesaj").textContent = hataMetni(error); return; }
      bildir("Şifren güncellendi."); history.replaceState(null, "", location.pathname); oturumKontrol();
    });
  }
  function uyelikEkrani() {
    const bitti = PROFIL?.uyelik_bitis;
    const iletisim = AYAR.iletisim ? `<a class="birincil genis" href="${esc(AYAR.iletisim)}" target="_blank" rel="noopener">Yöneticiye ulaş</a>` : "";
    ekranGoster(`<div class="kart-ekran"><div class="giris">
      <span class="logo-ic buyuk" aria-hidden="true"></span>
      <h1>${bitti ? "Üyeliğinin süresi doldu" : "Üyeliğin henüz açılmadı"}</h1>
      <p class="giris-alt">${bitti ? `Erişimin ${gunKisa.format(new Date(bitti))} tarihinde sona erdi.` : "Hesabın oluşturuldu."} Yönetici üyeliğini açtığında bu sayfayı yenilemen yeterli.</p>
      <p class="giris-not">Hesap: <b>${esc(KULLANICI?.email)}</b></p>
      ${iletisim}
      <button class="ikincil genis" type="button" id="yenidenDene">Üyeliğimi kontrol et</button>
    </div></div>`);
    $("#yenidenDene").addEventListener("click", profilYukle);
  }
  function kurulumEkrani() {
    ekranGoster(`<div class="kart-ekran"><div class="giris"><h1>Kurulum tamamlanmamış</h1>
      <p class="giris-alt">Supabase bağlantı bilgileri bulunamadı. Vercel'de <code>SUPABASE_URL</code> ve <code>SUPABASE_ANON_KEY</code> ortam değişkenlerini ekleyip yeniden yayınla. Ayrıntılar README'de.</p></div></div>`);
  }

  async function oturumKontrol() {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return girisEkrani();
    KULLANICI = session.user;
    await profilYukle();
  }
  async function profilYukle() {
    if (!KULLANICI) return girisEkrani();
    const { data, error } = await sb.from("profiller").select("*").eq("id", KULLANICI.id).maybeSingle();
    if (error) { ekranGoster(bos("Profil yüklenemedi.", esc(hataMetni(error)))); return; }
    PROFIL = data;
    if (!aktifMi()) return uyelikEkrani();
    await uygulamaBaslat();
  }

  /* ---------- uygulama ---------- */
  async function uygulamaBaslat() {
    $("#ekran").hidden = true; $("#ekran").innerHTML = "";
    $("#uygulama").hidden = false; $("#sekmeler").hidden = false;
    $("#yonetimSekme").hidden = PROFIL.rol !== "admin";
    hesapCiz();
    $("#istatistik").innerHTML = ""; $("#gorunum").innerHTML = yukleniyor();
    try {
      const [tax, ozet, kayitlar] = await Promise.all([
        TAX ? TAX : fetch("taksonomi.json").then(r => r.json()),
        rpc("ozet"),
        sb.from("kayitlar").select("tur, ref")
      ]);
      TAX = tax; OZET = ozet;
      for (const k of TAX.kategoriler) { KAT[k.id] = k; for (const n of k.nisler) NIS[n.id] = { ...n, kategori: k.id }; }
      S.kayit.u = new Set((kayitlar.data || []).filter(k => k.tur === "u").map(k => k.ref));
      S.kayit.m = new Set((kayitlar.data || []).filter(k => k.tur === "m").map(k => k.ref));
      kayitSayiYaz();
    } catch (e) { $("#gorunum").innerHTML = bos("Veri yüklenemedi.", esc(hataMetni(e))); return; }
    istatistikCiz();
    if (!baglandi) { baglan(); baglandi = true; }
    const kayitli = depo.al("filtre", null);
    if (kayitli && typeof kayitli === "object") S.f = { ...kopya(F0), ...kayitli, anahtar: "", anahtarAd: "" };
    if (!location.hash) { const s = depo.al("sekme", ""); if (s) history.replaceState(null, "", "#" + s); }
    sekmeAyarla();
  }

  function istatistikCiz() {
    const o = OZET;
    $("#istatistik").innerHTML = [[o.yeni_24s, "son 24 saatte yeni mağaza"], [o.yeni_7g, "son 7 günde"], [o.acik, "açık mağaza"], [o.sifreli, "açılmak üzere"], [o.urun, "ürün"], [o.trend, "yükselen ürün"]]
      .map(([s, t]) => `<div><b>${sayi.format(s || 0)}</b><span>${t}</span></div>`).join("")
      + `<p class="son-tarama">Son tarama: ${o.son_tarama ? once(o.son_tarama) : "henüz yok"}${o.veri_gun ? ` · Veri: son ${o.veri_gun} gün` : ""}</p>`;
  }

  const SIRALA = {
    urunler: [["yeni", "En yeni"], ["fiyat-a", "Fiyat: düşükten yükseğe"], ["fiyat-z", "Fiyat: yüksekten düşüğe"], ["indirim", "En yüksek indirim"], ["satis", "Satış hareketi (7 gün)"]],
    magazalar: [["yeni", "En yeni keşfedilen"], ["urun-cok", "En çok ürün"], ["urun-az", "En az ürün"], ["ad", "Ada göre"]],
    trendler: [["yukselen", "Yükselen (son 14 gün)"], ["doymamis", "Henüz doymamış"], ["satan", "En çok satış hareketi"], ["yaygin", "En yaygın"], ["yeni", "Yeni çıkan"]]
  };
  function parametre(tur) {
    const f = S.f, p = { ara: f.ara, kategoriler: f.kategoriler };
    if (tur === "trend") return { ...p, max_magaza: f.maxMagaza || null, sirala: S.sirala.trendler };
    Object.assign(p, { nis: f.nis, gun: f.gun, kesif_gun: f.kesif || null, ulkeler: f.ulkeler, paralar: f.paralar, diller: f.diller, tldler: f.tldler });
    if (tur === "magaza") return { ...p, durumlar: f.durumlar, amin: f.amin, amax: f.amax, sirala: S.sirala.magazalar };
    return { ...p, fmin: f.fmin || null, fmax: f.fmax, indirim: f.indirim, satista: f.satista, magaza_basi: f.magazaBasi || null, anahtar: f.anahtar, sirala: S.sirala.urunler };
  }

  /* ---------- parçalar ---------- */
  const yerTutucu = n => `<span class="yer" aria-hidden="true">${n.emoji}</span>`;
  const gorsel = (src, nisId, buyuk) => {
    const n = nisOf(nisId);
    return `<div class="gorsel" style="--h:${ton(n.id)}">${yerTutucu(n)}${src ? `<img src="${esc(src)}" alt="" loading="${buyuk ? "eager" : "lazy"}" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</div>`;
  };
  const indirimOrani = p => p.eski_fiyat > p.fiyat ? 1 - p.fiyat / p.eski_fiyat : 0;
  const fiyatHtml = p => `<div class="fiyat">${para(p.fiyat, p.para)}${p.eski_fiyat > p.fiyat ? `<s>${para(p.eski_fiyat, p.para)}</s>` : ""}</div>`;
  const kalp = (tur, id, ad) => { const k = S.kayit[tur].has(id); return `<button class="kalp" type="button" data-kaydet="${tur}:${id}" aria-pressed="${k}" aria-label="${esc(ad)} ${k ? "kaydedilenlerden çıkar" : "kaydet"}">${k ? "♥" : "♡"}</button>`; };
  const urunUrl = p => p.alan && p.handle ? `https://${p.alan}/products/${encodeURIComponent(p.handle)}` : null;
  function urunKart(p) {
    URUN.set(p.id, p);
    const ind = indirimOrani(p), yeni = Date.now() - Date.parse(p.eklenme) < 3 * GUN;
    return `<article class="kart">${kalp("u", p.id, p.ad)}<button class="ac" type="button" data-urun="${p.id}">${gorsel(p.gorsel, p.nis)}
      ${p.kaldirildi ? `<span class="rozet kal">Kaldırıldı</span>` : yeni ? `<span class="rozet">Yeni</span>` : ""}${ind >= .2 ? `<span class="rozet ind">-%${Math.round(ind * 100)}</span>` : ""}
      <div class="kart-ic"><div class="kart-ad">${esc(p.ad)}</div>${fiyatHtml(p)}${satisCizgi(p)}<div class="alt">${bayrak(p.ulke)} ${esc(p.alan)} · ${once(p.eklenme)}</div></div></button></article>`;
  }
  // Mağazanın "en çok satanlar" listesindeki yeri ve son 7 gündeki yükselişi.
  const satisCizgi = p => {
    const ust = p.satis_sira && p.satis_sira <= 3, hareket = p.satis_hareket_7g > 0;
    if (!ust && !hareket) return "";
    return `<div class="satis-cizgi">${ust ? `🔥 Mağazada #${p.satis_sira} satan` : ""}${ust && hareket ? " · " : ""}${hareket ? `↑${p.satis_hareket_7g} (7 gün)` : ""}</div>`;
  };
  const DURUM = { acik: ["Açık", "acik"], sifreli: ["Açılmak üzere", "sifreli"], kapali: ["Kapalı", "kapali"], yeni: ["Sırada", "kapali"] };
  const durumRozet = d => { const [t, c] = DURUM[d] || DURUM.yeni; return `<span class="durum ${c}">${t}</span>`; };
  function magazaSatir(m) {
    MAGAZA.set(m.id, m);
    const n = nisOf(m.nis);
    return `<div class="satir tikla" data-magaza="${m.id}" role="button" tabindex="0" aria-label="${esc(m.ad || m.alan)} ayrıntıları">
      <span class="m-ic gorsel" style="--h:${ton(n.id)};aspect-ratio:auto">${yerTutucu(n)}</span>
      <span class="m-ad">${esc(m.ad || m.alan)}<small>${esc(m.alan)}</small></span>
      <span class="m-hucre gizle-m">${durumRozet(m.durum)} ${esc(n.ad)}</span>
      <span class="m-hucre gizle-m" title="${esc(ulkeAdi(m.ulke || ""))}">${m.ulke ? bayrak(m.ulke) : ""} ${esc(m.para || "")}</span>
      <span class="m-hucre">${m.durum === "sifreli" ? "şifreli" : sayi.format(m.urun_sayisi) + " ürün"}</span>
      <span class="m-hucre gizle-m">${once(m.ilk_gorulme)}</span>
      ${kalp("m", m.id, m.ad || m.alan)}</div>`;
  }
  const magazaBas = `<div class="satir bas"><span></span><span>Mağaza</span><span>Durum · niş</span><span>Ülke</span><span>Ürün</span><span>Keşif</span><span></span></div>`;
  function trendKart(t) {
    const hiz = t.yeni_magaza_14g, n = nisOf(t.nis);
    return `<article class="kart trend"><button class="ac" type="button" data-trend="${esc(t.anahtar)}" data-trend-ad="${esc(t.ornek_ad)}">${gorsel(t.ornek_gorsel, t.nis)}
      ${hiz >= 2 ? `<span class="rozet ind">+${hiz} mağaza / 14 gün</span>` : ""}
      <div class="kart-ic"><div class="kart-ad">${esc(t.ornek_ad)}</div>
      <div class="trend-say"><b>${sayi.format(t.magaza_sayisi)}</b> mağazada${t.magaza_sayisi <= 5 ? ` <span class="durum acik">az rekabet</span>` : ""}</div>
      ${t.satis_hareket_7g > 0 ? `<div class="satis-cizgi">↑${t.satis_hareket_7g} satış hareketi (7 gün)</div>` : ""}
      <div class="alt">${t.gorsel_eslesme ? "📷 görselle eşleşti · " : ""}${esc(n.ad)} · ortanca ${t.medyan_fiyat_tl ? tl(t.medyan_fiyat_tl) : "–"} · ilk ${once(t.ilk_gorulme)}</div></div></button></article>`;
  }

  /* ---------- görünümler ---------- */
  function ciz() {
    const sek = S.sekme;
    document.querySelectorAll("[data-sekme]").forEach(a => a.dataset.sekme === sek ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
    const tek = sek === "kaydedilenler" || sek === "yonetim";
    for (const id of ["#filtre", "#aracCubugu", "#hizli", "#aktifler"]) $(id).toggleAttribute("data-gizli", tek);
    $(".ozet").toggleAttribute("data-gizli", sek === "yonetim");
    $(".duzen").classList.toggle("tek", tek);
    const srl = $("#fSirala");
    srl.parentElement.toggleAttribute("data-gizli", !SIRALA[sek]);
    if (SIRALA[sek]) { srl.innerHTML = SIRALA[sek].map(([v, t]) => `<option value="${v}">${t}</option>`).join(""); srl.value = S.sirala[sek]; }
    $("#fAra").value = S.f.ara;
    $("#fAra").placeholder = sek === "trendler" ? "Ürün adı ara" : sek === "magazalar" ? "Mağaza ya da alan adı ara" : "Ürün ya da mağaza ara";
    hizliCiz(); aktiflerCiz(); panelCiz();
  }
  async function yenile() {
    depo.yaz("filtre", { ...S.f, anahtar: "", anahtarAd: "" });
    ciz();
    const sek = S.sekme;
    if (sek === "bulucu") { bulucuHazirla(); return; }
    if (sek === "kaydedilenler") return kayitCiz();
    if (sek === "yonetim") return yonetimCiz();
    S.liste = { satirlar: [], toplam: 0, magaza: 0, yukleniyor: false, bitti: false };
    $("#sonucSayi").textContent = ""; $("#gorunum").innerHTML = yukleniyor();
    await listeYukle();
  }
  async function listeYukle() {
    const sek = S.sekme, L = S.liste, no = ++S.istek;
    if (L.yukleniyor || L.bitti) return;
    L.yukleniyor = true;
    const tur = { urunler: "urun", magazalar: "magaza", trendler: "trend" }[sek];
    try {
      const sonuc = await rpc({ urun: "urun_ara", magaza: "magaza_ara", trend: "trend_ara" }[tur], { p: { ...parametre(tur), limit: SAYFA, offset: L.satirlar.length } });
      if (no !== S.istek || sek !== S.sekme) return;
      L.satirlar.push(...sonuc.satirlar); L.toplam = sonuc.toplam; L.magaza = sonuc.magaza; L.bitti = L.satirlar.length >= L.toplam || !sonuc.satirlar.length;
      listeCiz(tur);
    } catch (e) {
      if (no === S.istek) $("#gorunum").innerHTML = bos("Sonuçlar yüklenemedi.", esc(hataMetni(e)));
    } finally { if (no === S.istek) L.yukleniyor = false; }
  }
  function listeCiz(tur) {
    const L = S.liste, kalan = L.toplam - L.satirlar.length;
    $("#sonucSayi").innerHTML = tur === "urun" ? `<b>${sayi.format(L.toplam)}</b> ürün, <b>${sayi.format(L.magaza || 0)}</b> mağazadan${S.f.magazaBasi ? ` · mağaza başına en çok ${S.f.magazaBasi} ürün` : ""}`
      : tur === "magaza" ? `<b>${sayi.format(L.toplam)}</b> mağaza` : `<b>${sayi.format(L.toplam)}</b> ürün en az 2 farklı mağazada satılıyor`;
    if (!L.satirlar.length) { $("#gorunum").innerHTML = bosSonuc(tur); return; }
    const govde = tur === "urun" ? `<div class="izgara">${L.satirlar.map(urunKart).join("")}</div>`
      : tur === "magaza" ? `<div class="tablo">${magazaBas}${L.satirlar.map(magazaSatir).join("")}</div>`
      : `<div class="izgara">${L.satirlar.map(trendKart).join("")}</div>`;
    $("#gorunum").innerHTML = govde + (kalan > 0 ? `<button class="daha" type="button" data-daha>Daha fazla göster (${sayi.format(kalan)} kaldı)</button>` : "");
  }
  function bosSonuc(tur) {
    if (!OZET.urun && !OZET.magaza) return bos("Henüz veri yok.", PROFIL.rol === "admin"
      ? "Günlük tarama ilk kez çalıştığında burası gerçek mağazalarla dolacak. GitHub'da Actions sekmesinden “Nişbul günlük tarama” işini elle başlatabilirsin."
      : "İlk tarama tamamlandığında burası dolacak.");
    if (tur === "trend") return bos("Bu filtrelerle trend yok.", "Trend için aynı ürünün en az iki farklı mağazada görülmesi gerekir. Veri biriktikçe bu liste uzar.");
    return bos("Bu filtrelerle sonuç yok.", "Bir iki filtreyi gevşetmeyi dene.");
  }

  /* bulucu: filtrelenmiş ürünleri rastgele sırayla tek tek gösterir */
  async function bulucuHazirla() {
    S.bulucu = { liste: [], i: 0, gecilen: 0, kaydedilen: 0, tohum: Math.random().toString(36).slice(2), bitti: false, yukleniyor: false };
    $("#gorunum").innerHTML = yukleniyor(); $("#sonucSayi").textContent = "";
    await bulucuDoldur(); bulucuCiz();
  }
  async function bulucuDoldur() {
    const b = S.bulucu; if (b.bitti || b.yukleniyor) return;
    b.yukleniyor = true;
    try {
      const r = await rpc("urun_ara", { p: { ...parametre("urun"), sirala: "rastgele", tr_agirlik: S.bulucuTR, tohum: b.tohum, limit: 40, offset: b.liste.length } });
      b.liste.push(...r.satirlar); b.toplam = r.toplam; b.bitti = b.liste.length >= r.toplam || !r.satirlar.length;
    } catch (e) { bildir(hataMetni(e), true); b.bitti = true; }
    finally { b.yukleniyor = false; }
  }
  function bulucuCiz() {
    if (S.sekme !== "bulucu") return;
    const b = S.bulucu, kalan = (b.toplam || 0) - b.i;
    $("#sonucSayi").innerHTML = `<b>${sayi.format(Math.max(0, kalan))}</b> ürün sırada · ${b.kaydedilen} kaydedildi · ${b.gecilen} geçildi`;
    if (b.i >= b.liste.length) { $("#gorunum").innerHTML = b.liste.length ? bulucuTRHtml() + bos("Deste bitti.", `<p><button class="daha" type="button" data-yenidesteyi>Yeniden karıştır</button></p>`) : bosSonuc("urun"); return; }
    const kart = (p, arka) => { URUN.set(p.id, p); return `<div class="bkart${arka ? " arka" : ""}" ${arka ? 'aria-hidden="true"' : 'id="ustKart"'}>
      <span class="damga kay">Kaydet</span><span class="damga gec">Geç</span>${gorsel(p.gorsel, p.nis, true)}
      <div class="kart-ic"><div class="kart-ad">${esc(p.ad)}</div>${fiyatHtml(p)}<div class="alt">${bayrak(p.ulke)} ${esc(p.alan)} · ${esc(nisOf(p.nis).ad)} · ${once(p.eklenme)}</div></div></div>`; };
    const p = b.liste[b.i], sonraki = b.liste[b.i + 1];
    $("#gorunum").innerHTML = `<div class="bulucu">${bulucuTRHtml()}<div class="deste">${sonraki ? kart(sonraki, true) : ""}${kart(p)}</div>
      <div class="b-dugmeler"><button type="button" data-bk="gec" aria-label="Geç">✕</button><button class="buyuk" type="button" data-bk="kay" aria-label="Kaydet">♥</button><button type="button" data-bk="ac" aria-label="Ayrıntılar">↗</button></div>
      <p class="b-ipucu">Kartı sağa kaydır ya da → ile kaydet, sola ya da ← ile geç. Enter ayrıntıyı açar.</p></div>`;
    surukle($("#ustKart"));
    if (b.liste.length - b.i < 8) bulucuDoldur();
  }
  const bulucuTRHtml = () => `<label class="kutu tr-agirlik"><input type="checkbox" id="bulucuTR" ${S.bulucuTR ? "checked" : ""}> 🇹🇷 Türkiye ağırlıklı <small>Türk mağazalarının ürünleri daha sık gelir</small></label>`;
  function bulucuKarar(k) {
    const b = S.bulucu, p = b.liste[b.i];
    if (!p) return;
    if (k === "ac") return urunAc(p.id);
    const el = $("#ustKart");
    if (k === "kay") { if (!S.kayit.u.has(p.id)) kaydetDegistir("u", p.id); b.kaydedilen++; } else b.gecilen++;
    b.i++;
    const sonra = async () => { if (b.i >= b.liste.length && !b.bitti) { $("#gorunum").innerHTML = yukleniyor(); await bulucuDoldur(); } bulucuCiz(); };
    if (el && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.transition = "transform .25s ease-in, opacity .25s";
      el.style.transform = `translateX(${k === "kay" ? 140 : -140}%) rotate(${k === "kay" ? 18 : -18}deg)`;
      el.style.opacity = "0";
      setTimeout(sonra, 220);
    } else sonra();
  }
  function surukle(el) {
    if (!el) return;
    let x0 = null, dx = 0;
    const kay = el.querySelector(".damga.kay"), gec = el.querySelector(".damga.gec");
    el.addEventListener("pointerdown", e => { x0 = e.clientX; dx = 0; el.setPointerCapture(e.pointerId); el.style.transition = "none"; });
    el.addEventListener("pointermove", e => {
      if (x0 == null) return;
      dx = e.clientX - x0;
      el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      kay.style.opacity = Math.max(0, Math.min(1, dx / 90)); gec.style.opacity = Math.max(0, Math.min(1, -dx / 90));
    });
    const birak = () => {
      if (x0 == null) return;
      x0 = null;
      if (Math.abs(dx) > 100) return bulucuKarar(dx > 0 ? "kay" : "gec");
      if (Math.abs(dx) < 5) return bulucuKarar("ac");
      el.style.transition = "transform .2s"; el.style.transform = ""; kay.style.opacity = gec.style.opacity = 0;
    };
    el.addEventListener("pointerup", birak); el.addEventListener("pointercancel", birak);
  }

  /* ---------- kaydedilenler ---------- */
  let KAYIT = { urunler: [], magazalar: [] };
  async function kaydetDegistir(tur, id) {
    const set = S.kayit[tur], vardi = set.has(id);
    vardi ? set.delete(id) : set.add(id); kayitSayiYaz();
    const { error } = vardi
      ? await sb.from("kayitlar").delete().match({ tur, ref: id })
      : await sb.from("kayitlar").insert({ tur, ref: id });
    if (error) { vardi ? set.add(id) : set.delete(id); kayitSayiYaz(); bildir(hataMetni(error), true); return false; }
    return true;
  }
  async function kayitCiz() {
    $("#sonucSayi").textContent = ""; $("#gorunum").innerHTML = yukleniyor();
    try { KAYIT = await rpc("kayitlarim"); } catch (e) { $("#gorunum").innerHTML = bos("Kayıtlar yüklenemedi.", esc(hataMetni(e))); return; }
    if (S.sekme !== "kaydedilenler") return;
    const u = KAYIT.urunler, m = KAYIT.magazalar;
    $("#gorunum").innerHTML = `
      <div class="bolum-bas"><h2>Kaydedilen ürünler (${u.length})</h2><button class="ikincil" type="button" data-csv="u" ${u.length ? "" : "disabled"}>CSV indir</button></div>
      ${u.length ? `<div class="izgara">${u.map(urunKart).join("")}</div>` : bos("Henüz ürün kaydetmedin.", "Ürün kartlarındaki ♡ ya da Bulucu'da sağa kaydırma burada toplanır.")}
      <div class="bolum-bas" style="margin-top:36px"><h2>Kaydedilen mağazalar (${m.length})</h2><button class="ikincil" type="button" data-csv="m" ${m.length ? "" : "disabled"}>CSV indir</button></div>
      ${m.length ? `<div class="tablo">${magazaBas}${m.map(magazaSatir).join("")}</div>` : bos("Henüz mağaza kaydetmedin.", "Rakip olarak izlemek istediğin mağazaları buraya ekle.")}`;
  }
  function csvIndir(tur) {
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const satirlar = tur === "u"
      ? [["Ürün", "Fiyat", "Eski fiyat", "Para", "Yaklaşık TL", "Kategori", "Niş", "Mağaza", "Ülke", "Ürün linki", "Eklenme", "Mağazadan kaldırıldı"],
        ...KAYIT.urunler.map(p => [p.ad, p.fiyat, p.eski_fiyat, p.para, p.fiyat_tl, KAT[p.kategori]?.ad || "Diğer", nisOf(p.nis).ad, p.alan, p.ulke, urunUrl(p), (p.eklenme || "").slice(0, 10), p.kaldirildi ? "evet" : ""])]
      : [["Mağaza", "Alan adı", "Durum", "Kategori", "Niş", "Ülke", "Dil", "Para", "Ürün sayısı", "Keşif"],
        ...KAYIT.magazalar.map(m => [m.ad, m.alan, DURUM[m.durum]?.[0], KAT[m.kategori]?.ad || "Diğer", nisOf(m.nis).ad, m.ulke, m.dil, m.para, m.urun_sayisi, (m.ilk_gorulme || "").slice(0, 10)])];
    const url = URL.createObjectURL(new Blob(["﻿" + satirlar.map(r => r.map(q).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `nisbul-${tur === "u" ? "urunler" : "magazalar"}.csv` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- yönetim ---------- */
  let UYELER = [], uyeAra = "", uyeFiltre = "";
  const uyeDurum = u => u.rol === "admin" ? "yonetici" : !u.uyelik_bitis ? "bekliyor" : Date.parse(u.uyelik_bitis) > Date.now() ? "aktif" : "doldu";
  async function yonetimCiz(yeniden = true) {
    if (yeniden) {
      $("#gorunum").innerHTML = yukleniyor();
      try { UYELER = await rpc("uyeler"); } catch (e) { $("#gorunum").innerHTML = bos("Üyeler yüklenemedi.", esc(hataMetni(e))); return; }
    }
    if (S.sekme !== "yonetim") return;
    const say = { aktif: 0, bekliyor: 0, doldu: 0, yonetici: 0 };
    UYELER.forEach(u => say[uyeDurum(u)]++);
    const q = uyeAra.toLocaleLowerCase("tr");
    const liste = UYELER.filter(u => (!q || u.eposta.toLocaleLowerCase("tr").includes(q)) && (!uyeFiltre || uyeDurum(u) === uyeFiltre));
    const ETIKET = { aktif: "Aktif", bekliyor: "Onay bekliyor", doldu: "Süresi doldu", yonetici: "Yönetici" };
    $("#sonucSayi").textContent = "";
    $("#gorunum").innerHTML = `
      <div class="bolum-bas"><h2>Üyeler</h2></div>
      <div class="yonetim-ozet">${[["", "Tümü", UYELER.length], ["bekliyor", "Onay bekliyor", say.bekliyor], ["aktif", "Aktif", say.aktif], ["doldu", "Süresi doldu", say.doldu], ["yonetici", "Yönetici", say.yonetici]]
        .map(([k, t, n]) => `<button type="button" class="cip" data-uye-filtre="${k}" aria-pressed="${uyeFiltre === k}">${t} <b>${n}</b></button>`).join("")}</div>
      <input class="ara" id="uyeAra" type="search" placeholder="E-posta ara" value="${esc(uyeAra)}" aria-label="Üye ara" style="max-width:360px;margin:12px 0 16px">
      <div class="tablo uyeler">${liste.length ? liste.map(u => {
        const d = uyeDurum(u), ben = u.id === KULLANICI.id;
        return `<div class="uye" data-uye="${u.id}">
          <div class="uye-bilgi"><b>${esc(u.eposta)}${ben ? " (sen)" : ""}</b><small>Kayıt: ${gunKisa.format(new Date(u.olusturma))}</small></div>
          <div class="uye-durum"><span class="durum ${d === "aktif" || d === "yonetici" ? "acik" : d === "bekliyor" ? "sifreli" : "kapali"}">${ETIKET[d]}</span>
            <small>${d === "yonetici" ? "Sınırsız erişim" : u.uyelik_bitis ? (d === "aktif" ? `${gunKisa.format(new Date(u.uyelik_bitis))} tarihine kadar · ${Math.ceil((Date.parse(u.uyelik_bitis) - Date.now()) / GUN)} gün` : `${gunKisa.format(new Date(u.uyelik_bitis))} tarihinde bitti`) : "Henüz süre verilmedi"}</small></div>
          <div class="uye-eylem">
            ${d === "yonetici" ? "" : [7, 30, 90, 365].map(g => `<button type="button" class="ikincil kucuk" data-sure="${g}">+${g === 365 ? "1 yıl" : g + " gün"}</button>`).join("")}
            ${d === "yonetici" ? "" : `<label class="tarih-sec"><span class="sr">Bitiş tarihi</span><input type="date" data-bitis value="${u.uyelik_bitis ? gunAnahtar(new Date(u.uyelik_bitis)) : ""}" min="${gunAnahtar(new Date())}"></label>`}
            ${d === "aktif" ? `<button type="button" class="ikincil kucuk tehlike" data-bitir>Erişimi kapat</button>` : ""}
            ${ben ? "" : `<button type="button" class="metin-btn" data-rol="${u.rol === "admin" ? "uye" : "admin"}">${u.rol === "admin" ? "Yöneticilikten çıkar" : "Yönetici yap"}</button>`}
          </div></div>`;
      }).join("") : bos("Üye bulunamadı.", "")}</div>
      <p class="ipucu" style="margin-top:14px">Süre ekleme, kalan sürenin üstüne eklenir; süresi dolmuş üyede bugünden başlar. Yöneticiler süresiz erişir.</p>`;
  }
  async function uyeIslem(uid, islem, deger) {
    const u = UYELER.find(x => x.id === uid);
    try {
      let r;
      if (islem === "sure") r = await rpc("uyelik_ver", { kullanici: uid, gun: deger });
      else if (islem === "bitis") r = await rpc("uyelik_bitis_ayarla", { kullanici: uid, bitis: deger });
      else if (islem === "rol") r = await rpc("rol_ata", { kullanici: uid, yeni_rol: deger });
      Object.assign(u, r);
      bildir(islem === "sure" ? `${u.eposta}: +${deger} gün eklendi.` : islem === "rol" ? `${u.eposta}: rol güncellendi.` : `${u.eposta}: bitiş tarihi güncellendi.`);
      yonetimCiz(false);
    } catch (e) { bildir(hataMetni(e), true); }
  }

  /* ---------- detay penceresi ---------- */
  const dlg = $("#detay");
  const disLink = (url, metin, cls) => url ? `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${metin} ↗</a>` : "";
  async function magazaAc(mid, odakUrun) {
    dlg.dataset.magaza = mid; dlg.dataset.urun = odakUrun || "";
    if (!dlg.open) { $("#detayIc").innerHTML = yukleniyor(); dlg.showModal(); }
    let m = MAGAZA.get(mid), urunler;
    try {
      const [mr, ur] = await Promise.all([
        m ? null : rpc("magaza_ara", { p: { id: mid, limit: 1 } }),
        rpc("urun_ara", { p: { magaza_id: mid, sirala: "satis-sira", limit: 24 } })
      ]);
      if (mr) { m = mr.satirlar[0]; if (m) MAGAZA.set(mid, m); }
      urunler = ur;
    } catch (e) { $("#detayIc").innerHTML = bos("Yüklenemedi.", esc(hataMetni(e))); return; }
    if (!m || dlg.dataset.magaza != mid) return;
    const n = nisOf(m.nis), p = odakUrun && URUN.get(odakUrun);
    const digerleri = urunler.satirlar.filter(x => x.id !== odakUrun);
    $("#detayIc").innerHTML = `
      <div class="d-bas"><span class="m-ic gorsel" style="--h:${ton(n.id)};aspect-ratio:auto;width:56px;height:56px">${yerTutucu(n)}</span>
        <div><h2 id="detayBaslik">${esc(m.ad || m.alan)}</h2><p>${esc(m.alan)} · ${esc(KAT[m.kategori]?.ad || "Diğer")} › ${esc(n.ad)}</p></div>
        <button class="kapat" type="button" data-kapat aria-label="Kapat">✕</button></div>
      ${p ? `<div class="d-urun">${gorsel(p.gorsel, p.nis, true)}<div><h3>${esc(p.ad)}</h3>${fiyatHtml(p)}
        ${p.para !== "TRY" && p.fiyat_tl ? `<p class="alt" style="margin:0">≈ ${tl(p.fiyat_tl)}</p>` : ""}
        <p class="alt" style="white-space:normal">${esc(nisOf(p.nis).ad)} · mağazada ${once(p.eklenme)} yayına girdi${p.kaldirildi ? " · <b>mağaza bu ürünü kaldırdı</b>" : ""}</p>
        <div class="d-eylem" style="padding:12px 0 0">${disLink(urunUrl(p), "Ürüne git", "birincil")}<button class="ikincil" type="button" data-kaydet="u:${p.id}">${S.kayit.u.has(p.id) ? "♥ Kaydedildi" : "♡ Ürünü kaydet"}</button>
        ${p.grup || p.anahtar ? `<button class="ikincil" type="button" data-trend="${esc(p.grup || p.anahtar)}" data-trend-ad="${esc(p.ad)}">Bu ürünü satan diğer mağazalar</button>` : ""}</div></div></div>
      <div class="takip" id="satisTakip" data-urun="${p.id}">${yukleniyor()}</div>` : ""}
      <div class="d-ozellik">
        <div><span>Durum</span><b>${durumRozet(m.durum)}</b></div>
        <div><span>Ülke</span><b>${m.ulke ? bayrak(m.ulke) + " " + esc(ulkeAdi(m.ulke)) : "–"}</b></div>
        <div><span>Dil</span><b>${m.dil ? esc(buyukBas(dilAdi(m.dil))) : "–"}</b></div>
        <div><span>Para birimi</span><b>${esc(m.para || "–")}</b></div>
        <div><span>Ürün sayısı</span><b>${sayi.format(m.urun_sayisi)}</b></div>
        <div><span>Ortanca fiyat</span><b>${m.ortanca_fiyat != null ? para(m.ortanca_fiyat, m.para) : "–"}</b></div>
        <div><span>Keşfedildi</span><b>${gunKisa.format(new Date(m.ilk_gorulme))}</b></div>
        <div><span>Alan adı alındı</span><b>${m.alan_kayit ? gunKisa.format(tarihAl(m.alan_kayit)) : "–"}</b></div>
      </div>
      <div class="d-eylem">${disLink("https://" + m.alan, "Mağazayı aç", p ? "ikincil" : "birincil")}<button class="ikincil" type="button" data-kaydet="m:${m.id}">${S.kayit.m.has(m.id) ? "♥ Mağaza kaydedildi" : "♡ Mağazayı kaydet"}</button>
        <button class="ikincil" type="button" data-benzer="${esc(m.nis)}">Bu nişteki diğer ürünler</button></div>
      ${m.durum === "sifreli" ? `<p class="d-not">Bu mağaza henüz şifreli: kurulum aşamasında. Her gün kontrol ediliyor; açıldığı gün ürünleri burada görünecek.</p>` : ""}
      ${digerleri.length ? `<div class="d-alt"><h3>Bu mağazanın ${p ? "diğer " : ""}ürünleri (${sayi.format(urunler.toplam - (p ? 1 : 0))}, ${digerleri.some(x => x.satis_sira) ? "en çok satandan başlayarak" : "en yeniler"})</h3><div class="izgara">${digerleri.slice(0, 12).map(urunKart).join("")}</div></div>` : ""}`;
    dlg.scrollTop = 0;
    if (p) satisTakipYukle(p.id);
  }

  /* ---------- satış takibi ---------- */
  const takipTarihi = () => depo.al("takipTarihi", gunAnahtar(new Date(Date.now() - 7 * GUN)));
  const siraYazi = s => s == null ? "listede yok" : `#${s}`;
  async function satisTakipYukle(uid) {
    const t = takipTarihi();
    let r;
    try { r = await rpc("satis_takip", { urun: uid, baslangic: new Date(t + "T00:00:00").toISOString() }); }
    catch (e) { const el = $("#satisTakip"); if (el) el.innerHTML = `<p class="ipucu">${esc(hataMetni(e))}</p>`; return; }
    const el = $("#satisTakip");
    if (el && Number(el.dataset.urun) === uid) el.innerHTML = satisTakipHtml(r, t);
  }
  function satisTakipHtml(r, t) {
    const baslik = `<h3>Satış takibi <button class="yardim" type="button" data-yardim-satis aria-expanded="false" aria-label="Satış takibi nasıl çalışır">?</button></h3>
      <p class="yardim-metin" id="y-satis" hidden>Shopify satış adedini kimseye göstermez. Ama her mağazanın "en çok satanlar" sıralamasını gerçek satışlara göre kendisi hesaplar ve bu sıralama herkese açıktır. Bu ürünün o listedeki yerini her taramada (günde iki kez) kaydediyoruz. Yukarı çıkması satış yaptığı anlamına gelir. Buradaki sayılar adet değil, sıralamadaki yükseliş sayısıdır.</p>`;
    if (!r || !r.takip_baslangic) return baslik + `<p class="ipucu">Bu mağazanın "en çok satanlar" sıralaması henüz okunmadı. Bir sonraki taramada takip başlar.</p>`;
    const yuk = n => `<em class="${n ? "iyi" : ""}">${n ? `↑ ${n} kez yükseldi` : "hareket yok"}</em>`;
    return baslik + `<div class="takip-izgara">
      <div class="takip-kutu"><span>Takip başladığından beri</span><small>${gunKisa.format(new Date(r.takip_baslangic))}</small>
        <b>${siraYazi(r.ilk_sira)} → ${siraYazi(r.simdi_sira)}</b>${yuk(r.toplam_yukselis)}</div>
      <div class="takip-kutu"><span>Seçtiğin tarihten beri</span>
        <label class="tarih-sec"><span class="sr">Başlangıç tarihi</span><input type="date" id="takipTarih" value="${t}" max="${gunAnahtar(new Date())}"></label>
        ${r.baslangic_biliniyor ? `<b>${siraYazi(r.baslangic_sira)} → ${siraYazi(r.simdi_sira)}</b>${yuk(r.yukselis_baslangictan)}`
          : `<em>Bu ürünün takibi ${gunKisa.format(new Date(r.takip_baslangic))} tarihinde başladı; daha eski bir tarih için veri yok.</em>`}</div>
    </div>${siraGrafik(r)}`;
  }
  // Sıralama geçmişi basamak çizgisi: yukarısı #1, en altı "listede yok".
  function siraGrafik(r) {
    if (!r.olaylar.length) return "";
    const nok = [[Date.parse(r.takip_baslangic), r.ilk_sira], ...r.olaylar.map(o => [Date.parse(o.zaman), o.yeni]), [Date.now(), r.simdi_sira]];
    const dip = Math.max(2, ...nok.map(n => n[1] || 0)) + 1, t0 = nok[0][0], t1 = nok[nok.length - 1][0];
    const x = t => 34 + (t - t0) / Math.max(1, t1 - t0) * 560, y = s => 8 + ((s ?? dip) - 1) / (dip - 1) * 60;
    let d = `M${x(nok[0][0]).toFixed(1)},${y(nok[0][1]).toFixed(1)}`;
    for (const [t, s] of nok.slice(1)) d += ` H${x(t).toFixed(1)} V${y(s).toFixed(1)}`;
    return `<svg class="sira-grafik" viewBox="0 0 600 76" role="img" aria-label="Sıralama geçmişi, ${r.olaylar.length} değişim">
      <text x="2" y="12">#1</text><text x="2" y="70">yok</text><line x1="34" x2="594" y1="8" y2="8"/><line x1="34" x2="594" y1="68" y2="68"/>
      <path d="${d}"/></svg>`;
  }
  const urunAc = uid => { const p = URUN.get(uid); if (p) magazaAc(p.magaza_id, uid); };

  /* ---------- filtre paneli ---------- */
  const YARDIM = {
    gun: "Ürünlerde: ürünün mağazada yayına girdiği gün. Mağazalarda: mağazayı keşfettiğimiz gün. Bir güne tıkla, sadece o gün kalsın; aynı güne tekrar tıklamak seçimi kaldırır.",
    kesif: "Sadece yakın zamanda keşfedilen (yeni açılan) mağazaların ürünlerini göster. Yeni test edilen ürünleri bulmanın en hızlı yolu.",
    kategoriler: "Ürünler başlık, ürün tipi ve etiketlerinden otomatik olarak kategorilere ayrılır. Birden fazla kategori seçebilirsin.",
    fiyat: "Farklı para birimlerini karşılaştırabilmek için fiyatlar tarama günündeki kurla ₺'ye çevrilir. Maks en sağdayken üst sınır yoktur.",
    durumlar: "Açılmak üzere: mağaza şifreli, yani kuruluyor. Bunları izlemeye alırsan açıldıkları gün ürünlerini görürsün.",
    ulkeler: "Mağazanın Shopify'da kayıtlı ülkesi. Parantezdeki sayı o ülkedeki mağaza sayısıdır.",
    paralar: "Mağazanın satış yaptığı ana para birimi.",
    diller: "Mağaza vitrininin dili.",
    tldler: "Alan adının uzantısı. .de gibi ülke uzantıları yerel pazara odaklanan mağazaları gösterir.",
    adet: "Mağazanın katalogundaki ürün sayısı. 1-10 ürünlü mağazalar genelde ürün test eden dropshipping mağazalarıdır.",
    maxMagaza: "Bir ürünü en çok kaç mağazanın sattığı. Düşük tutarsan henüz doymamış ürünler kalır."
  };
  const bolum = (anahtar, baslik, govde, sadece) => `<section class="fb"${sadece ? ` data-sadece="${sadece}"` : ""}>
    <div class="fb-bas"><h3>${baslik}</h3><button class="yardim" type="button" data-yardim="${anahtar}" aria-expanded="false" aria-label="${baslik} hakkında">?</button></div>
    <p class="yardim-metin" id="y-${anahtar}" hidden>${YARDIM[anahtar]}</p>${govde}</section>`;
  const konumdanFiyat = k => { const v = FIYAT_TAVAN * (k / 100) ** 2; return v < 100 ? Math.round(v / 5) * 5 : v < 1000 ? Math.round(v / 25) * 25 : Math.round(v / 250) * 250; };
  const fiyattanKonum = v => Math.round(Math.sqrt(Math.min(v, FIYAT_TAVAN) / FIYAT_TAVAN) * 100);
  const okSvg = d => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

  function takvimHtml() {
    const bugun = new Date(); bugun.setHours(0, 0, 0, 0);
    const dolu = new Set(OZET.gunler || []);
    const ay = takvimAy || (T.gun ? tarihAl(T.gun) : bugun);
    const ilk = new Date(ay.getFullYear(), ay.getMonth(), 1);
    const bas = new Date(ilk); bas.setDate(1 - ((ilk.getDay() + 6) % 7));
    const sonrakiAyVar = new Date(ay.getFullYear(), ay.getMonth() + 1, 1) <= bugun;
    let hucreler = "";
    for (let i = 0; i < 42; i++) {
      const d = new Date(bas); d.setDate(bas.getDate() + i);
      const k = gunAnahtar(d), gelecek = d > bugun, buAy = d.getMonth() === ay.getMonth();
      const etiket = gunUzun.format(d) + (k === T.gun ? ", Seçili gün" : "") + (+d === +bugun ? ", Bugün" : "") + (gelecek ? ", Kullanılamaz" : "");
      hucreler += `<button type="button" class="gun${buAy ? "" : " dis"}${k === T.gun ? " secili" : ""}${+d === +bugun ? " bugun" : ""}${dolu.has(k) ? " dolu" : ""}" data-gun="${k}" aria-label="${etiket}" ${gelecek ? "disabled" : ""} ${k === T.gun ? 'aria-pressed="true"' : ""}>${d.getDate()}</button>`;
    }
    return `<div class="takvim">
      <div class="secili-gun">Seçili gün: <b>${T.gun ? gunKisa.format(tarihAl(T.gun)) : "Tümü"}</b>${T.gun ? ` <button class="metin-btn" type="button" data-gun="">Kaldır</button>` : ""}</div>
      <div class="t-bas"><button type="button" class="t-ok" data-ay="-1" aria-label="Önceki ay">${okSvg("M15 6l-6 6 6 6")}</button><b>${ayAdi.format(ay)}</b><button type="button" class="t-ok" data-ay="1" aria-label="Sonraki ay" ${sonrakiAyVar ? "" : "disabled"}>${okSvg("M9 6l6 6-6 6")}</button></div>
      <div class="t-izgara">${["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"].map(g => `<span class="t-gun-adi">${g}</span>`).join("")}${hucreler}</div></div>`;
  }
  const paraSembol = k => { try { return new Intl.NumberFormat("tr-TR", { style: "currency", currency: k, currencyDisplay: "narrowSymbol" }).formatToParts(0).find(x => x.type === "currency")?.value || k; } catch { return k; } };
  function listeOgeleri(anahtar) {
    const c = OZET[anahtar] || {};
    if (anahtar === "kategoriler") return TAX.kategoriler.map(k => ({ v: k.id, ad: k.ad, on: k.emoji, n: c[k.id] || 0 }));
    if (anahtar === "ulkeler") return [...new Set([...ULKE_KODLARI, ...Object.keys(c)])].map(k => ({ v: k, ad: ulkeAdi(k), on: bayrak(k), n: c[k] || 0 })).sort((a, b) => a.ad.localeCompare(b.ad, "tr"));
    if (anahtar === "paralar") return Object.keys(c).sort((a, b) => c[b] - c[a]).map(k => ({ v: k, ad: `${k} (${paraSembol(k)})`, ara: paraAdi(k), n: c[k] }));
    if (anahtar === "diller") return Object.keys(c).sort((a, b) => c[b] - c[a]).map(k => ({ v: k, ad: buyukBas(dilAdi(k)), n: c[k] }));
    if (anahtar === "tldler") return Object.keys(c).sort((a, b) => c[b] - c[a]).map(k => ({ v: k, ad: k, n: c[k] }));
    return [];
  }
  function listeIcerik(anahtar) {
    const q = (araMetni[anahtar] || "").toLocaleLowerCase("tr");
    const secili = T[anahtar];
    const ogeler = listeOgeleri(anahtar).filter(o => !q || (o.ad + " " + o.v + " " + (o.ara || "")).toLocaleLowerCase("tr").includes(q));
    ogeler.sort((a, b) => secili.includes(b.v) - secili.includes(a.v));
    return ogeler.length ? ogeler.map(o => `<label class="sec${o.n ? "" : " sifir"}"><input type="checkbox" data-liste="${anahtar}" value="${esc(o.v)}" ${secili.includes(o.v) ? "checked" : ""}>${o.on ? `<span class="sec-on" aria-hidden="true">${o.on}</span>` : ""}<span class="sec-ad">${esc(o.ad)}</span><small>${o.n ? sayi.format(o.n) : ""}</small></label>`).join("")
      : `<p class="liste-bos">${OZET.magaza ? "Sonuç yok." : "Veri geldikçe dolacak."}</p>`;
  }
  const PLACEHOLDER = { kategoriler: "Kategori ara...", ulkeler: "Ülke ara...", paralar: "Para birimi ara...", diller: "Dil ara...", tldler: "Alan adı ara..." };
  const seciliOzet = anahtar => T[anahtar].length ? `<p class="secim-ozet">${T[anahtar].length} seçili · <button class="metin-btn" type="button" data-liste-temizle="${anahtar}">Temizle</button></p>` : "";
  const listeBolumu = anahtar => `<input class="liste-ara" type="search" data-liste-ara="${anahtar}" placeholder="${PLACEHOLDER[anahtar]}" value="${esc(araMetni[anahtar] || "")}" aria-label="${PLACEHOLDER[anahtar]}" autocomplete="off">
    ${seciliOzet(anahtar)}<div class="liste" id="liste-${anahtar}" role="group">${listeIcerik(anahtar)}</div>`;
  const secenekCipleri = (alan, secenekler) => `<div class="cipler">${secenekler.map(([v, t]) => `<button type="button" class="cip" data-secenek="${alan}" data-deger="${v}" aria-pressed="${String(T[alan]) === String(v)}">${t}</button>`).join("")}</div>`;

  function fiyatHtmlPanel() {
    const kMin = fiyattanKonum(T.fmin), kMax = T.fmax == null ? 100 : fiyattanKonum(T.fmax);
    return `<div class="aralik">
      <div class="aralik-deger"><div><span>Min</span><b id="fMinYazi">${tl(T.fmin)}</b></div><div><span>Maks</span><b id="fMaxYazi">${T.fmax == null ? tl(FIYAT_TAVAN) + "+" : tl(T.fmax)}</b></div></div>
      <div class="cift-kaydirici" style="--a:${kMin}%;--b:${kMax}%"><input type="range" min="0" max="100" value="${kMin}" id="fMin" aria-label="En düşük fiyat"><input type="range" min="0" max="100" value="${kMax}" id="fMax" aria-label="En yüksek fiyat"></div>
      <div class="magaza-basi">
        <label class="kutu"><input type="checkbox" id="fMbAc" ${T.magazaBasi ? "checked" : ""}> Mağaza başına maks <b id="fMbYazi">${T.magazaBasi || "1–10"}</b></label>
        <input type="range" min="1" max="10" value="${T.magazaBasi || 10}" id="fMb" aria-label="Mağaza başına en çok ürün" ${T.magazaBasi ? "" : "disabled"}>
        <p class="ipucu">Sonuçları mağaza başına maks ${T.magazaBasi || 10} ürünle sınırlayın</p>
      </div></div>`;
  }
  function panelCiz() {
    const anahtar = { urunler: "urun", magazalar: "magaza", bulucu: "bulucu", trendler: "trend" }[S.sekme];
    if (!anahtar || !TAX) return;
    const govde = $("#filtreGovde"), kaydirma = govde.scrollTop;
    govde.innerHTML =
      bolum("gun", "Eklenme Tarihi", takvimHtml(), "urun magaza bulucu") +
      bolum("kesif", "Mağaza Keşfi", secenekCipleri("kesif", [["", "Tümü"], [1, "Son 24 saat"], [3, "3 gün"], [7, "7 gün"], [30, "30 gün"]]), "urun magaza bulucu") +
      bolum("kategoriler", "Kategori", listeBolumu("kategoriler") + (T.nis ? `<p class="secim-ozet">Niş: <b>${esc(nisOf(T.nis).ad)}</b> · <button class="metin-btn" type="button" data-nis-kaldir>Kaldır</button></p>` : "")) +
      bolum("maxMagaza", "Rekabet", secenekCipleri("maxMagaza", [["", "Tümü"], [3, "≤ 3 mağaza"], [5, "≤ 5"], [10, "≤ 10"], [25, "≤ 25"]]), "trend") +
      bolum("fiyat", "Fiyat Aralığı", fiyatHtmlPanel(), "urun bulucu") +
      bolum("durumlar", "Mağaza Durumu", `<div class="cipler">${[["acik", "Açık"], ["sifreli", "Açılmak üzere"]].map(([v, t]) => `<label class="sec"><input type="checkbox" data-liste="durumlar" value="${v}" ${T.durumlar.includes(v) ? "checked" : ""}><span class="sec-ad">${t}</span><small>${sayi.format(OZET[v] || 0)}</small></label>`).join("")}</div>`, "magaza") +
      bolum("adet", "Ürün Sayısı", `<div class="cift"><input id="fAdetMin" type="number" min="0" inputmode="numeric" placeholder="En az" value="${esc(T.amin)}" aria-label="En az ürün sayısı"><input id="fAdetMax" type="number" min="0" inputmode="numeric" placeholder="En çok" value="${esc(T.amax)}" aria-label="En çok ürün sayısı"></div>`, "magaza") +
      bolum("ulkeler", "Ülke", listeBolumu("ulkeler"), "urun magaza bulucu") +
      bolum("paralar", "Para Birimi", listeBolumu("paralar"), "urun magaza bulucu") +
      bolum("diller", "Dil", listeBolumu("diller"), "urun magaza bulucu") +
      bolum("tldler", "Domain Uzantısı", listeBolumu("tldler"), "urun magaza bulucu") +
      `<section class="fb" data-sadece="urun bulucu"><label class="kutu"><input id="fIndirim" type="checkbox" ${T.indirim ? "checked" : ""}> Sadece indirimdeki ürünler</label>
        <label class="kutu" style="margin-top:10px"><input id="fSatista" type="checkbox" ${T.satista ? "checked" : ""}> Sadece son 7 günde satışı hareketlenenler</label></section>`;
    govde.querySelectorAll("[data-sadece]").forEach(el => el.toggleAttribute("data-gizli", !el.dataset.sadece.split(" ").includes(anahtar)));
    govde.scrollTop = kaydirma;
    uygulaDurum();
  }
  const farkli = () => JSON.stringify({ ...T, ara: "" }) !== JSON.stringify({ ...S.f, ara: "" });
  function uygulaDurum() { const d = farkli(); $("#uygula").classList.toggle("bekliyor", d); $("#uygula").textContent = d ? "Filtreleri Uygula •" : "Filtreleri Uygula"; }
  function uygula() { S.f = { ...kopya(T), ara: S.f.ara }; panelAc(false); yenile(); }
  const taslakSifirla = () => { T = kopya(S.f); takvimAy = null; };

  function aktiflerCiz() {
    const f = S.f, c = [], sek = S.sekme, trend = sek === "trendler", magaza = sek === "magazalar";
    const ekle = (metin, kaldir) => c.push(`<button class="aktif" type="button" data-kaldir='${esc(JSON.stringify(kaldir))}'>${metin} <span aria-hidden="true">✕</span><span class="sr">filtresini kaldır</span></button>`);
    if (f.ara) ekle(`“${esc(f.ara)}”`, ["ara"]);
    if (f.anahtar && !trend && !magaza) ekle(`Aynı ürün: ${esc(f.anahtarAd || f.anahtar)}`, ["anahtar"]);
    if (f.gun && !trend) ekle(gunKisa.format(tarihAl(f.gun)), ["gun"]);
    if (f.kesif && !trend) ekle(`Son ${f.kesif == 1 ? "24 saatte" : f.kesif + " günde"} keşfedilen mağazalar`, ["kesif"]);
    f.kategoriler.forEach(k => ekle(`${KAT[k]?.emoji || ""} ${esc(KAT[k]?.ad || k)}`, ["kategoriler", k]));
    if (f.nis && !trend) ekle(`Niş: ${esc(nisOf(f.nis).ad)}`, ["nis"]);
    if (trend && f.maxMagaza) ekle(`≤ ${f.maxMagaza} mağaza`, ["maxMagaza"]);
    if (!trend && !magaza && (f.fmin || f.fmax != null)) ekle(`${tl(f.fmin)} – ${f.fmax == null ? tl(FIYAT_TAVAN) + "+" : tl(f.fmax)}`, ["fiyat"]);
    if (!trend && !magaza && f.magazaBasi) ekle(`Mağaza başına ${f.magazaBasi}`, ["magazaBasi"]);
    if (!trend) {
      f.ulkeler.forEach(k => ekle(`${bayrak(k)} ${esc(ulkeAdi(k))}`, ["ulkeler", k]));
      f.paralar.forEach(k => ekle(esc(k), ["paralar", k]));
      f.diller.forEach(k => ekle(esc(buyukBas(dilAdi(k))), ["diller", k]));
      f.tldler.forEach(k => ekle(esc(k), ["tldler", k]));
    }
    if (magaza) f.durumlar.forEach(k => ekle(DURUM[k][0], ["durumlar", k]));
    if (magaza && (f.amin !== "" || f.amax !== "")) ekle(`${f.amin || 0}–${f.amax || "∞"} ürün`, ["adet"]);
    if (!trend && !magaza && f.indirim) ekle("İndirimde", ["indirim"]);
    if (!trend && !magaza && f.satista) ekle("Satışı hareketlenenler", ["satista"]);
    $("#aktifler").innerHTML = c.length ? c.join("") + `<button class="metin-btn" type="button" data-hepsini-kaldir>Tümünü temizle</button>` : "";
    const n = c.length - (f.ara ? 1 : 0), el = $("#filtreSayi");
    el.hidden = !n; el.textContent = n;
  }
  function aktifKaldir([k, v]) {
    const f = S.f;
    if (k === "fiyat") { f.fmin = 0; f.fmax = null; }
    else if (k === "adet") { f.amin = ""; f.amax = ""; }
    else if (k === "anahtar") { f.anahtar = ""; f.anahtarAd = ""; }
    else if (v !== undefined) f[k] = f[k].filter(x => x !== v);
    else f[k] = kopya(F0[k]);
    taslakSifirla(); yenile();
  }
  function hizliCiz() {
    if (!TAX) return;
    const tek = S.f.kategoriler.length === 1 ? S.f.kategoriler[0] : null, hic = !S.f.kategoriler.length;
    const tr = S.f.ulkeler.length === 1 && S.f.ulkeler[0] === "TR";
    $("#hizli").innerHTML = (S.sekme === "trendler" ? "" : `<button class="cip tr" type="button" role="listitem" data-turkiye aria-pressed="${tr}">🇹🇷 Türkiye</button><span class="cip-ayrac" aria-hidden="true"></span>`)
      + [["", "Tümü"], ...TAX.kategoriler.map(k => [k.id, `${k.emoji} ${k.ad}`])]
      .map(([id, ad]) => `<button class="cip" type="button" role="listitem" data-kat="${id}" aria-pressed="${id ? tek === id : hic}">${esc(ad)}</button>`).join("");
  }
  const panelAc = ac => {
    if (ac) { taslakSifirla(); panelCiz(); }
    $("#filtre").classList.toggle("acik", ac); $("#perde").hidden = !ac;
  };

  /* ---------- olaylar ---------- */
  function baglan() {
    let araZaman;
    $("#fAra").addEventListener("input", e => {
      clearTimeout(araZaman);
      araZaman = setTimeout(() => { S.f.ara = T.ara = e.target.value.trim(); yenile(); }, 300);
    });
    $("#fSirala").addEventListener("change", e => { S.sirala[S.sekme] = e.target.value; yenile(); });
    $("#uygula").addEventListener("click", uygula);
    $("#temizle").addEventListener("click", () => { T = { ...kopya(F0), ara: S.f.ara }; takvimAy = null; for (const k in araMetni) araMetni[k] = ""; panelCiz(); });
    $("#sifirla").addEventListener("click", () => { T = { ...kopya(F0), ara: S.f.ara }; for (const k in araMetni) araMetni[k] = ""; takvimAy = null; uygula(); });
    $("#filtreAc").addEventListener("click", () => panelAc(true));
    $("#filtreKapat").addEventListener("click", () => panelAc(false));
    $("#perde").addEventListener("click", () => panelAc(false));
    $("#hizli").addEventListener("click", e => {
      if (e.target.closest("[data-turkiye]")) {
        const acik = S.f.ulkeler.length === 1 && S.f.ulkeler[0] === "TR";
        S.f.ulkeler = acik ? [] : ["TR"];
        taslakSifirla(); return yenile();
      }
      const b = e.target.closest("[data-kat]"); if (!b) return;
      S.f.kategoriler = b.dataset.kat ? [b.dataset.kat] : []; S.f.nis = "";
      taslakSifirla(); yenile();
    });

    // Panel: taslak (T) üzerinde çalışır, Uygula'ya kadar sonuçlar değişmez.
    const govde = $("#filtreGovde");
    govde.addEventListener("click", e => {
      const t = e.target.closest("[data-gun],[data-ay],[data-yardim],[data-liste-temizle],[data-nis-kaldir],[data-secenek]"); if (!t) return;
      const d = t.dataset;
      if (d.yardim) { const p = $("#y-" + d.yardim); p.hidden = !p.hidden; t.setAttribute("aria-expanded", !p.hidden); return; }
      if (d.secenek) T[d.secenek] = d.deger === "" ? "" : Number(d.deger);
      else if (d.gun !== undefined) { T.gun = d.gun === T.gun ? "" : d.gun; if (T.gun) takvimAy = tarihAl(T.gun); }
      else if (d.ay) { const a = takvimAy || (T.gun ? tarihAl(T.gun) : new Date()); takvimAy = new Date(a.getFullYear(), a.getMonth() + Number(d.ay), 1); }
      else if (d.listeTemizle) T[d.listeTemizle] = [];
      else if ("nisKaldir" in d) T.nis = "";
      panelCiz();
      const odak = d.gun !== undefined ? govde.querySelector(`[data-gun="${T.gun || d.gun}"]`) : d.ay ? govde.querySelector(`[data-ay="${d.ay}"]`) : d.secenek ? govde.querySelector(`[data-secenek="${d.secenek}"][data-deger="${d.deger}"]`) : null;
      odak?.focus();
    });
    govde.addEventListener("change", e => {
      const t = e.target;
      if (t.dataset.liste) {
        const k = t.dataset.liste;
        T[k] = t.checked ? [...T[k], t.value] : T[k].filter(x => x !== t.value);
        if (k === "kategoriler" && T.nis && !T.kategoriler.includes(nisOf(T.nis).kategori)) T.nis = "";
        const fb = t.closest(".fb"), sk = govde.scrollTop;
        fb.querySelector(".secim-ozet")?.remove();
        fb.querySelector(".liste-ara")?.insertAdjacentHTML("afterend", seciliOzet(k));
        govde.scrollTop = sk;
      } else if (t.id === "fIndirim") T.indirim = t.checked;
      else if (t.id === "fSatista") T.satista = t.checked;
      else if (t.id === "fMbAc") { T.magazaBasi = t.checked ? Number($("#fMb").value) : 0; $("#fMb").disabled = !t.checked; mbYaz(); }
      uygulaDurum();
    });
    const mbYaz = () => { $("#fMbYazi").textContent = T.magazaBasi || "1–10"; govde.querySelector(".magaza-basi .ipucu").textContent = `Sonuçları mağaza başına maks ${T.magazaBasi || 10} ürünle sınırlayın`; };
    govde.addEventListener("input", e => {
      const t = e.target;
      if (t.dataset.listeAra) { araMetni[t.dataset.listeAra] = t.value; $("#liste-" + t.dataset.listeAra).innerHTML = listeIcerik(t.dataset.listeAra); return; }
      if (t.id === "fMin" || t.id === "fMax") {
        let a = Number($("#fMin").value), b = Number($("#fMax").value);
        if (a > b) { if (t.id === "fMin") a = b; else b = a; $("#fMin").value = a; $("#fMax").value = b; }
        T.fmin = konumdanFiyat(a); T.fmax = b >= 100 ? null : konumdanFiyat(b);
        $("#fMinYazi").textContent = tl(T.fmin); $("#fMaxYazi").textContent = T.fmax == null ? tl(FIYAT_TAVAN) + "+" : tl(T.fmax);
        t.parentElement.style.setProperty("--a", a + "%"); t.parentElement.style.setProperty("--b", b + "%");
      } else if (t.id === "fMb") { T.magazaBasi = Number(t.value); mbYaz(); }
      else if (t.id === "fAdetMin") T.amin = t.value;
      else if (t.id === "fAdetMax") T.amax = t.value;
      uygulaDurum();
    });
    govde.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("input[type=number]")) uygula(); });

    // Yönetim paneli
    $("#gorunum").addEventListener("input", e => { if (e.target.id === "uyeAra") { uyeAra = e.target.value; const pos = e.target.selectionStart; yonetimCiz(false); const el = $("#uyeAra"); el.focus(); el.setSelectionRange(pos, pos); } });
    $("#gorunum").addEventListener("change", e => {
      if (e.target.id === "bulucuTR") { S.bulucuTR = e.target.checked; depo.yaz("bulucuTR", S.bulucuTR); bulucuHazirla(); }
    });
    dlg.addEventListener("change", e => {
      if (e.target.id !== "takipTarih" || !e.target.value) return;
      depo.yaz("takipTarihi", e.target.value);
      satisTakipYukle(Number($("#satisTakip").dataset.urun));
    });
    dlg.addEventListener("click", e => {
      const b = e.target.closest("[data-yardim-satis]"); if (!b) return;
      const p = $("#y-satis"); p.hidden = !p.hidden; b.setAttribute("aria-expanded", !p.hidden);
    });
    $("#gorunum").addEventListener("change", e => {
      const t = e.target; if (!t.matches("[data-bitis]") || !t.value) return;
      const uid = t.closest("[data-uye]").dataset.uye;
      uyeIslem(uid, "bitis", new Date(t.value + "T23:59:59").toISOString());
    });

    document.addEventListener("click", async e => {
      const t = e.target.closest("[data-kaydet],[data-urun],[data-magaza],[data-daha],[data-bk],[data-yenidesteyi],[data-csv],[data-kapat],[data-benzer],[data-kaldir],[data-hepsini-kaldir],[data-trend],[data-sure],[data-bitir],[data-rol],[data-uye-filtre]");
      if (!t) { if (e.target === dlg) dlg.close(); return; }
      const d = t.dataset;
      if (d.kaydet) {
        e.stopPropagation();
        const [tur, id] = d.kaydet.split(":");
        await kaydetDegistir(tur, Number(id));
        document.querySelectorAll(`[data-kaydet="${d.kaydet}"]`).forEach(b => {
          const k = S.kayit[tur].has(Number(id));
          if (b.classList.contains("kalp")) { b.setAttribute("aria-pressed", k); b.textContent = k ? "♥" : "♡"; }
          else b.textContent = tur === "u" ? (k ? "♥ Kaydedildi" : "♡ Ürünü kaydet") : (k ? "♥ Mağaza kaydedildi" : "♡ Mağazayı kaydet");
        });
        return;
      }
      if (d.urun) return urunAc(Number(d.urun));
      if (d.magaza) return magazaAc(Number(d.magaza));
      if ("daha" in d) { t.disabled = true; t.textContent = "Yükleniyor…"; return listeYukle(); }
      if (d.bk) return bulucuKarar(d.bk);
      if ("yenidesteyi" in d) return bulucuHazirla();
      if (d.csv) return csvIndir(d.csv);
      if ("kapat" in d) return dlg.close();
      if (d.kaldir) return aktifKaldir(JSON.parse(d.kaldir));
      if ("hepsiniKaldir" in d) { S.f = { ...kopya(F0), ara: "" }; taslakSifirla(); return yenile(); }
      if (d.trend) {
        if (dlg.open) dlg.close();
        S.f = { ...kopya(F0), anahtar: d.trend, anahtarAd: d.trendAd || "" }; S.sirala.urunler = "yeni"; taslakSifirla();
        if (location.hash !== "#urunler") location.hash = "urunler"; else yenile();
        return;
      }
      if (d.benzer) { dlg.close(); S.f = { ...kopya(F0), kategoriler: [nisOf(d.benzer).kategori], nis: d.benzer }; taslakSifirla(); if (location.hash !== "#urunler") location.hash = "urunler"; else yenile(); return; }
      if (d.uyeFiltre !== undefined) { uyeFiltre = d.uyeFiltre; return yonetimCiz(false); }
      const uid = t.closest("[data-uye]")?.dataset.uye;
      if (uid && d.sure) return uyeIslem(uid, "sure", Number(d.sure));
      if (uid && d.bitir !== undefined) { if (confirm("Bu üyenin erişimi hemen kapatılsın mı?")) uyeIslem(uid, "bitis", new Date().toISOString()); return; }
      if (uid && d.rol) { if (confirm(d.rol === "admin" ? "Bu kişi yönetici olsun mu? Yöneticiler süresiz erişir ve üyelik verebilir." : "Yöneticilik kaldırılsın mı?")) uyeIslem(uid, "rol", d.rol); }
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { const s = e.target.closest?.(".satir[data-magaza]"); if (s && e.target === s) { e.preventDefault(); s.click(); } }
      if (e.key === "Escape" && $("#filtre").classList.contains("acik")) panelAc(false);
      if (S.sekme !== "bulucu" || dlg.open || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); bulucuKarar("kay"); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); bulucuKarar("gec"); }
      else if (e.key === "Enter" && !e.target.closest("button,a,label")) { e.preventDefault(); bulucuKarar("ac"); }
    });
    dlg.addEventListener("close", () => { dlg.dataset.magaza = ""; if (S.sekme === "kaydedilenler") kayitCiz(); });
    addEventListener("hashchange", sekmeAyarla);
  }
  function sekmeAyarla() {
    if ($("#uygulama").hidden) return;
    const h = location.hash.slice(1);
    let yeni = ["urunler", "trendler", "magazalar", "bulucu", "kaydedilenler", "yonetim"].includes(h) ? h : "urunler";
    if (yeni === "yonetim" && PROFIL?.rol !== "admin") yeni = "urunler";
    S.sekme = yeni; depo.yaz("sekme", yeni);
    taslakSifirla(); panelAc(false); yenile();
  }

  /* ---------- başlat ---------- */
  if (!AYAR.supabaseUrl || !AYAR.supabaseAnonKey || !window.supabase) { kurulumEkrani(); return; }
  // Çıkış düğmesi üyelik bekleme ekranında da çalışmalı; uygulama dinleyicilerinden bağımsız bağlanır.
  $("#hesap").addEventListener("click", async e => {
    if (!e.target.closest("[data-cikis]")) return;
    const { error } = await sb.auth.signOut();
    if (error) { await sb.auth.signOut({ scope: "local" }); girisEkrani(); }
  });
  sb = window.supabase.createClient(AYAR.supabaseUrl, AYAR.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  sb.auth.onAuthStateChange((olay, oturum) => {
    // Supabase, olayın içinden başka bir Supabase çağrısı beklenmesini önermiyor; işi bir sonraki tura bırakıyoruz.
    setTimeout(() => {
      if (olay === "PASSWORD_RECOVERY") { KULLANICI = oturum?.user || null; return yeniSifreEkrani(); }
      if (olay === "SIGNED_OUT") return girisEkrani();
      if (olay === "SIGNED_IN" && oturum?.user?.id !== KULLANICI?.id) { KULLANICI = oturum.user; profilYukle(); }
      if (olay === "TOKEN_REFRESHED" && oturum) KULLANICI = oturum.user;
    }, 0);
  });
  oturumKontrol().catch(e => ekranGoster(bos("Bağlantı kurulamadı.", esc(hataMetni(e)))));
})();
