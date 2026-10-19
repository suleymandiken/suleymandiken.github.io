/* Nişbul: Shopify mağaza ve ürün dizini.
   Veri: data.json (araclar/tara.py üretir) varsa o, yoksa demo.js'in kurgusal verisi. */
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
  const para = (v, kur) => { if (v == null) return ""; try { return (fmtCache[kur] ||= new Intl.NumberFormat("tr-TR", { style: "currency", currency: kur || "USD", maximumFractionDigits: 2 })).format(v); } catch { return v + " " + (kur || ""); } };
  const tl = v => para(Math.round(v), "TRY").replace(",00", "");
  const sayi = new Intl.NumberFormat("tr-TR");
  const once = iso => { const g = Math.floor((Date.now() - Date.parse(iso)) / GUN); return g <= 0 ? "bugün" : g === 1 ? "dün" : g < 30 ? g + " gün önce" : g < 365 ? Math.floor(g / 30) + " ay önce" : Math.floor(g / 365) + " yıl önce"; };
  const ton = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const gunAnahtar = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const gunUzun = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", weekday: "long" });
  const gunKisa = new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "short", year: "numeric" });
  const ayAdi = new Intl.DateTimeFormat("tr-TR", { month: "long", year: "numeric" });
  const tarihAl = k => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };

  // Fiyat filtresi farklı para birimlerini karşılaştırabilsin diye her şey yaklaşık kurla ₺'ye çevrilir.
  const KUR_TL = { TRY: 1, USD: 41, EUR: 44.6, GBP: 51.9, CAD: 29.9, AUD: 27, BRL: 7.6, SEK: 3.87, AED: 11.2, CHF: 51, NZD: 24.5, MXN: 2.2, INR: .48, JPY: .27 };
  const ULKE_KODLARI = "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");

  let V, NIS = {}, KAT = {}, MAG = {}, GUNLER = new Set();
  const DIGER = { id: "diger", ad: "Diğer", emoji: "📦", kategori: "diger" };
  const nisOf = id => NIS[id] || DIGER;

  /* S.f uygulanmış filtreler, T paneldeki taslak. "Filtreleri Uygula" T'yi S.f'ye kopyalar. */
  const F0 = { ara: "", gun: "", kategoriler: [], nis: "", fmin: 0, fmax: null, magazaBasi: 0, ulkeler: [], paralar: [], diller: [], tldler: [], amin: "", amax: "", indirim: false };
  const kopya = f => JSON.parse(JSON.stringify(f));
  const S = {
    sekme: "urunler", f: kopya(F0), sirala: { urunler: "yeni", magazalar: "yeni" }, limit: SAYFA,
    kayit: { u: new Set(depo.al("kayitU", [])), m: new Set(depo.al("kayitM", [])) },
    bulucu: { liste: [], i: 0, gecilen: 0, kaydedilen: 0 }
  };
  let T = kopya(F0), takvimAy = null;
  const araMetni = {};
  const kayitYaz = () => { depo.yaz("kayitU", [...S.kayit.u]); depo.yaz("kayitM", [...S.kayit.m]); $("#kayitSayi").textContent = S.kayit.u.size + S.kayit.m.size; };

  /* ---------- filtreleme ---------- */
  const SIRALA = {
    urunler: [["yeni", "En yeni"], ["fiyat-a", "Fiyat: düşükten yükseğe"], ["fiyat-z", "Fiyat: yüksekten düşüğe"], ["indirim", "En yüksek indirim"]],
    magazalar: [["yeni", "En yeni"], ["urun-cok", "En çok ürün"], ["urun-az", "En az ürün"], ["ad", "Ada göre"]]
  };
  const sayiAl = v => v === "" || v == null ? null : Number(v);
  const icinde = (liste, v) => !liste.length || liste.includes(v);
  function magazaUyar(m, f, magazaSekmesi) {
    if (!icinde(f.ulkeler, m.ulke) || !icinde(f.paralar, m.para) || !icinde(f.diller, m.dil) || !icinde(f.tldler, m.tld)) return false;
    if (magazaSekmesi) {
      if (!icinde(f.kategoriler, m.kategori)) return false;
      if (f.nis && m.nis !== f.nis) return false;
      if (f.gun && m._gun !== f.gun) return false;
      const amin = sayiAl(f.amin), amax = sayiAl(f.amax);
      if (amin != null && m.urunSayisi < amin) return false;
      if (amax != null && m.urunSayisi > amax) return false;
      if (f.ara && !m._ara.includes(f.ara.toLocaleLowerCase("tr"))) return false;
    }
    return true;
  }
  function urunleriSuz() {
    const f = S.f, q = f.ara.toLocaleLowerCase("tr");
    return V.urunler.filter(p => {
      if (!icinde(f.kategoriler, p.kategori)) return false;
      if (f.nis && p.nis !== f.nis) return false;
      if (p._tl < f.fmin) return false;
      if (f.fmax != null && p._tl > f.fmax) return false;
      if (f.indirim && !(p.eskiFiyat > p.fiyat)) return false;
      if (f.gun && p._gun !== f.gun) return false;
      const m = MAG[p.magaza];
      if (!m || !magazaUyar(m, f, false)) return false;
      if (q && !(p.ad.toLocaleLowerCase("tr").includes(q) || m._ara.includes(q))) return false;
      return true;
    });
  }
  // Aynı mağazanın onlarca ürünü listeyi doldurmasın diye isteğe bağlı mağaza başına üst sınır.
  function magazaBasinaSinirla(a) {
    const n = S.f.magazaBasi; if (!n) return a;
    const say = {};
    return a.filter(p => (say[p.magaza] = (say[p.magaza] || 0) + 1) <= n);
  }
  const indirimOrani = p => p.eskiFiyat > p.fiyat ? 1 - p.fiyat / p.eskiFiyat : 0;
  function urunSirala(a) {
    const k = S.sirala.urunler;
    return a.sort(k === "fiyat-a" ? (x, y) => x._tl - y._tl : k === "fiyat-z" ? (x, y) => y._tl - x._tl : k === "indirim" ? (x, y) => indirimOrani(y) - indirimOrani(x) : (x, y) => y.eklenme.localeCompare(x.eklenme));
  }
  function magazaSirala(a) {
    const k = S.sirala.magazalar;
    return a.sort(k === "urun-cok" ? (x, y) => y.urunSayisi - x.urunSayisi : k === "urun-az" ? (x, y) => x.urunSayisi - y.urunSayisi : k === "ad" ? (x, y) => x.ad.localeCompare(y.ad, "tr") : (x, y) => y.eklenme.localeCompare(x.eklenme));
  }

  /* ---------- parçalar ---------- */
  const gorsel = (p, buyuk) => {
    const n = nisOf(p.nis);
    return `<div class="gorsel" style="--h:${ton(n.id)}"><span aria-hidden="true">${n.emoji}</span>${p.gorsel ? `<img src="${esc(p.gorsel)}" alt="" loading="${buyuk ? "eager" : "lazy"}" onerror="this.remove()">` : ""}</div>`;
  };
  const yeniMi = iso => Date.now() - Date.parse(iso) < 3 * GUN;
  const fiyatHtml = p => `<div class="fiyat">${para(p.fiyat, p.para)}${p.eskiFiyat > p.fiyat ? `<s>${para(p.eskiFiyat, p.para)}</s>` : ""}</div>`;
  const kalp = (tur, id, ad) => { const k = S.kayit[tur].has(id); return `<button class="kalp" type="button" data-kaydet="${tur}:${esc(id)}" aria-pressed="${k}" aria-label="${esc(ad)} ${k ? "kaydedilenlerden çıkar" : "kaydet"}">${k ? "♥" : "♡"}</button>`; };
  function urunKart(p) {
    const m = MAG[p.magaza], ind = indirimOrani(p);
    return `<article class="kart">${kalp("u", p.id, p.ad)}<button class="ac" type="button" data-urun="${esc(p.id)}">${gorsel(p)}
      ${yeniMi(p.eklenme) ? `<span class="rozet">Yeni</span>` : ""}${ind >= .2 ? `<span class="rozet ind">-%${Math.round(ind * 100)}</span>` : ""}
      <div class="kart-ic"><div class="kart-ad">${esc(p.ad)}</div>${fiyatHtml(p)}<div class="alt">${bayrak(m.ulke)} ${esc(m.alan)}</div></div></button></article>`;
  }
  function magazaSatir(m) {
    const n = nisOf(m.nis);
    return `<div class="satir tikla" data-magaza="${esc(m.id)}" role="button" tabindex="0" aria-label="${esc(m.ad)} ayrıntıları">
      <span class="m-ic gorsel" style="--h:${ton(n.id)};aspect-ratio:auto"><span aria-hidden="true">${n.emoji}</span></span>
      <span class="m-ad">${esc(m.ad)}<small>${esc(m.alan)}</small></span>
      <span class="m-hucre gizle-m">${esc(n.ad)}</span>
      <span class="m-hucre gizle-m" title="${esc(ulkeAdi(m.ulke))}">${bayrak(m.ulke)} ${esc(m.para)}</span>
      <span class="m-hucre">${sayi.format(m.urunSayisi)} ürün</span>
      <span class="m-hucre gizle-m">${once(m.eklenme)}</span>
      ${kalp("m", m.id, m.ad)}</div>`;
  }
  const magazaBas = `<div class="satir bas"><span></span><span>Mağaza</span><span>Niş</span><span>Ülke</span><span>Ürün</span><span>Eklenme</span><span></span></div>`;
  const bos = (b, t) => `<div class="bos"><b>${b}</b>${t}</div>`;
  const dahaDugme = kalan => kalan > 0 ? `<button class="daha" type="button" data-daha>Daha fazla göster (${sayi.format(kalan)} kaldı)</button>` : "";

  /* ---------- görünümler ---------- */
  function ciz() {
    const sek = S.sekme;
    document.querySelectorAll("[data-sekme]").forEach(a => a.dataset.sekme === sek ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
    const kayitta = sek === "kaydedilenler";
    for (const id of ["#filtre", "#aracCubugu", "#hizli", "#aktifler"]) $(id).toggleAttribute("data-gizli", kayitta);
    $(".duzen").classList.toggle("tek", kayitta);
    const srl = $("#fSirala");
    srl.parentElement.toggleAttribute("data-gizli", !SIRALA[sek]);
    if (SIRALA[sek]) { srl.innerHTML = SIRALA[sek].map(([v, t]) => `<option value="${v}">${t}</option>`).join(""); srl.value = S.sirala[sek]; }
    $("#fAra").value = S.f.ara;
    hizliCiz(); aktiflerCiz(); panelCiz();
    ({ urunler: urunlerCiz, magazalar: magazalarCiz, bulucu: bulucuCiz, kaydedilenler: kayitCiz })[sek]();
  }
  function urunlerCiz() {
    const tum = urunSirala(urunleriSuz()), a = magazaBasinaSinirla(tum);
    $("#sonucSayi").innerHTML = `<b>${sayi.format(a.length)}</b> ürün, <b>${sayi.format(new Set(a.map(p => p.magaza)).size)}</b> mağazadan`
      + (a.length < tum.length ? ` · mağaza başına en çok ${S.f.magazaBasi} ürün gösteriliyor` : "");
    $("#gorunum").innerHTML = a.length ? `<div class="izgara">${a.slice(0, S.limit).map(urunKart).join("")}</div>${dahaDugme(a.length - S.limit)}`
      : bos("Bu filtrelerle ürün yok.", "Bir iki filtreyi gevşetmeyi dene.");
  }
  function magazalarCiz() {
    const a = magazaSirala(V.magazalar.filter(m => magazaUyar(m, S.f, true)));
    $("#sonucSayi").innerHTML = `<b>${sayi.format(a.length)}</b> mağaza`;
    $("#gorunum").innerHTML = a.length ? `<div class="tablo">${magazaBas}${a.slice(0, S.limit).map(magazaSatir).join("")}</div>${dahaDugme(a.length - S.limit)}`
      : bos("Bu filtrelerle mağaza yok.", "Bir iki filtreyi gevşetmeyi dene.");
  }

  /* bulucu: filtrelenmiş ürünleri karıştırıp tek tek gösterir */
  function bulucuHazirla() {
    const a = magazaBasinaSinirla(urunleriSuz());
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    S.bulucu = { liste: a, i: 0, gecilen: 0, kaydedilen: 0 };
  }
  function bulucuCiz() {
    const b = S.bulucu, kalan = b.liste.length - b.i;
    $("#sonucSayi").innerHTML = `<b>${sayi.format(Math.max(0, kalan))}</b> ürün sırada · ${b.kaydedilen} kaydedildi · ${b.gecilen} geçildi`;
    if (kalan <= 0) { $("#gorunum").innerHTML = bos(b.liste.length ? "Deste bitti." : "Bu filtrelerle ürün yok.", `<p><button class="daha" type="button" data-yenidesteyi>Yeniden karıştır</button></p>`); return; }
    const kart = (p, arka) => { const m = MAG[p.magaza]; return `<div class="bkart${arka ? " arka" : ""}" ${arka ? 'aria-hidden="true"' : 'id="ustKart"'}>
      <span class="damga kay">Kaydet</span><span class="damga gec">Geç</span>${gorsel(p, true)}
      <div class="kart-ic"><div class="kart-ad">${esc(p.ad)}</div>${fiyatHtml(p)}<div class="alt">${bayrak(m.ulke)} ${esc(m.alan)} · ${esc(nisOf(p.nis).ad)} · ${once(p.eklenme)}</div></div></div>`; };
    const p = b.liste[b.i], sonraki = b.liste[b.i + 1];
    $("#gorunum").innerHTML = `<div class="bulucu"><div class="deste">${sonraki ? kart(sonraki, true) : ""}${kart(p)}</div>
      <div class="b-dugmeler"><button type="button" data-bk="gec" aria-label="Geç">✕</button><button class="buyuk" type="button" data-bk="kay" aria-label="Kaydet">♥</button><button type="button" data-bk="ac" aria-label="Ayrıntılar">↗</button></div>
      <p class="b-ipucu">Kartı sağa kaydır ya da → ile kaydet, sola ya da ← ile geç. Enter ayrıntıyı açar.</p></div>`;
    surukle($("#ustKart"));
  }
  function bulucuKarar(k) {
    const b = S.bulucu, p = b.liste[b.i];
    if (!p) return;
    if (k === "ac") return urunAc(p.id);
    const el = $("#ustKart");
    if (k === "kay") { S.kayit.u.add(p.id); b.kaydedilen++; kayitYaz(); } else b.gecilen++;
    b.i++;
    if (el && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.style.transition = "transform .25s ease-in, opacity .25s";
      el.style.transform = `translateX(${k === "kay" ? 140 : -140}%) rotate(${k === "kay" ? 18 : -18}deg)`;
      el.style.opacity = "0";
      setTimeout(bulucuCiz, 220);
    } else bulucuCiz();
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

  function kayitCiz() {
    const u = V.urunler.filter(p => S.kayit.u.has(p.id)), m = V.magazalar.filter(x => S.kayit.m.has(x.id));
    $("#sonucSayi").textContent = "";
    $("#gorunum").innerHTML = `
      <div class="bolum-bas"><h2>Kaydedilen ürünler (${u.length})</h2><a class="ikincil" href="#" data-csv="u" ${u.length ? "" : 'aria-disabled="true"'}>CSV indir</a><button class="ikincil" type="button" data-temizle="u" ${u.length ? "" : "disabled"}>Temizle</button></div>
      ${u.length ? `<div class="izgara">${u.map(urunKart).join("")}</div>` : bos("Henüz ürün kaydetmedin.", "Ürün kartlarındaki ♡ ya da Bulucu'da sağa kaydırma burada toplanır.")}
      <div class="bolum-bas" style="margin-top:36px"><h2>Kaydedilen mağazalar (${m.length})</h2><a class="ikincil" href="#" data-csv="m" ${m.length ? "" : 'aria-disabled="true"'}>CSV indir</a><button class="ikincil" type="button" data-temizle="m" ${m.length ? "" : "disabled"}>Temizle</button></div>
      ${m.length ? `<div class="tablo">${magazaBas}${m.map(magazaSatir).join("")}</div>` : bos("Henüz mağaza kaydetmedin.", "Rakip olarak izlemek istediğin mağazaları buraya ekle.")}`;
  }
  function csvIndir(tur) {
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const satirlar = tur === "u"
      ? [["Ürün", "Fiyat", "Eski fiyat", "Para", "Yaklaşık TL", "Kategori", "Niş", "Mağaza", "Alan adı", "Ülke", "Ürün linki", "Eklenme"],
        ...V.urunler.filter(p => S.kayit.u.has(p.id)).map(p => { const m = MAG[p.magaza]; return [p.ad, p.fiyat, p.eskiFiyat, p.para, Math.round(p._tl), KAT[p.kategori]?.ad || "Diğer", nisOf(p.nis).ad, m.ad, m.alan, m.ulke, p.url, p.eklenme.slice(0, 10)]; })]
      : [["Mağaza", "Alan adı", "Kategori", "Niş", "Ülke", "Dil", "Para", "Ürün sayısı", "Eklenme"],
        ...V.magazalar.filter(m => S.kayit.m.has(m.id)).map(m => [m.ad, m.alan, KAT[m.kategori]?.ad || "Diğer", nisOf(m.nis).ad, m.ulke, m.dil, m.para, m.urunSayisi, m.eklenme.slice(0, 10)])];
    const url = URL.createObjectURL(new Blob(["﻿" + satirlar.map(r => r.map(q).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `nisbul-${tur === "u" ? "urunler" : "magazalar"}.csv` });
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- detay penceresi ---------- */
  const dlg = $("#detay");
  const disLink = (url, metin, cls) => V.kaynak === "demo" || !url
    ? `<a class="${cls}" aria-disabled="true" title="Örnek veride dış bağlantı yok">${metin}</a>`
    : `<a class="${cls}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${metin} ↗</a>`;
  function magazaAc(mid, odakUrun) {
    const m = MAG[mid]; if (!m) return;
    dlg.dataset.magaza = mid; dlg.dataset.urun = odakUrun || "";
    const n = nisOf(m.nis), p = odakUrun && V.urunler.find(x => x.id === odakUrun);
    const urunleri = V.urunler.filter(x => x.magaza === mid);
    const digerleri = urunleri.filter(x => x.id !== odakUrun).sort((a, b) => b.eklenme.localeCompare(a.eklenme));
    const fiyatlar = urunleri.map(x => x.fiyat).sort((a, b) => a - b);
    const orta = fiyatlar.length ? fiyatlar[Math.floor(fiyatlar.length / 2)] : null;
    const km = S.kayit.m.has(mid);
    $("#detayIc").innerHTML = `
      <div class="d-bas"><span class="m-ic gorsel" style="--h:${ton(n.id)};aspect-ratio:auto;width:56px;height:56px"><span aria-hidden="true">${n.emoji}</span></span>
        <div><h2 id="detayBaslik">${esc(m.ad)}</h2><p>${esc(m.alan)} · ${esc(KAT[m.kategori]?.ad || "Diğer")} › ${esc(n.ad)}</p></div>
        <button class="kapat" type="button" data-kapat aria-label="Kapat">✕</button></div>
      ${p ? `<div class="d-urun">${gorsel(p, true)}<div><h3>${esc(p.ad)}</h3>${fiyatHtml(p)}
        ${p.para !== "TRY" ? `<p class="alt" style="margin:0">≈ ${tl(p._tl)}</p>` : ""}
        <p class="alt" style="white-space:normal">${esc(nisOf(p.nis).ad)} · ${once(p.eklenme)} eklendi</p>
        <div class="d-eylem" style="padding:12px 0 0">${disLink(p.url, "Ürüne git", "birincil")}<button class="ikincil" type="button" data-kaydet="u:${esc(p.id)}">${S.kayit.u.has(p.id) ? "♥ Kaydedildi" : "♡ Ürünü kaydet"}</button></div></div></div>` : ""}
      <div class="d-ozellik">
        <div><span>Ülke</span><b>${bayrak(m.ulke)} ${esc(ulkeAdi(m.ulke))}</b></div>
        <div><span>Dil</span><b>${esc(dilAdi(m.dil))}</b></div>
        <div><span>Para birimi</span><b>${esc(m.para)}</b></div>
        <div><span>Ürün sayısı</span><b>${sayi.format(m.urunSayisi)}</b></div>
        <div><span>Ortanca fiyat</span><b>${orta != null ? para(orta, m.para) : "–"}</b></div>
        <div><span>Dizine eklenme</span><b>${gunKisa.format(new Date(m.eklenme))}</b></div>
      </div>
      <div class="d-eylem">${disLink("https://" + m.alan, "Mağazayı aç", p ? "ikincil" : "birincil")}<button class="ikincil" type="button" data-kaydet="m:${esc(m.id)}">${km ? "♥ Mağaza kaydedildi" : "♡ Mağazayı kaydet"}</button>
        <button class="ikincil" type="button" data-benzer="${esc(m.nis)}">Bu nişteki diğer ürünler</button></div>
      ${digerleri.length ? `<div class="d-alt"><h3>Bu mağazanın ${p ? "diğer " : ""}ürünleri (${digerleri.length})</h3><div class="izgara">${digerleri.slice(0, 12).map(urunKart).join("")}</div></div>` : ""}`;
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
  }
  const urunAc = uid => { const p = V.urunler.find(x => x.id === uid); if (p) magazaAc(p.magaza, uid); };

  /* ---------- filtre paneli ---------- */
  const YARDIM = {
    gun: "Mağazanın ya da ürünün dizine eklendiği gün. Bir güne tıkla, sadece o gün eklenenler kalsın. Aynı güne tekrar tıklamak seçimi kaldırır.",
    kategoriler: "Ürünler başlık, ürün tipi ve etiketlerinden otomatik olarak kategorilere ayrılır. Birden fazla kategori seçebilirsin.",
    fiyat: "Farklı para birimlerini karşılaştırabilmek için fiyatlar yaklaşık kurla ₺'ye çevrilir. Maks en sağdayken üst sınır yoktur.",
    ulkeler: "Mağazanın Shopify'da kayıtlı ülkesi. Parantezdeki sayı o ülkedeki mağaza sayısıdır.",
    paralar: "Mağazanın satış yaptığı ana para birimi.",
    diller: "Mağaza vitrininin dili.",
    tldler: "Alan adının uzantısı. .de, .com.tr gibi ülke uzantıları yerel pazara odaklanan mağazaları gösterir.",
    adet: "Mağazanın katalogundaki ürün sayısı. Az ürünlü mağazalar genelde tek ürün test eden dropshipping mağazalarıdır."
  };
  const bolum = (anahtar, baslik, govde, sadece) => `<section class="fb"${sadece ? ` data-sadece="${sadece}"` : ""}>
    <div class="fb-bas"><h3>${baslik}</h3><button class="yardim" type="button" data-yardim="${anahtar}" aria-expanded="false" aria-label="${baslik} hakkında">?</button></div>
    <p class="yardim-metin" id="y-${anahtar}" hidden>${YARDIM[anahtar]}</p>${govde}</section>`;

  // Fiyat kaydırıcısı karesel ölçekli: düşük fiyatlarda hassas, 10.000'e kadar uzanır.
  const konumdanFiyat = k => { const v = FIYAT_TAVAN * (k / 100) ** 2; return v < 100 ? Math.round(v / 5) * 5 : v < 1000 ? Math.round(v / 25) * 25 : Math.round(v / 250) * 250; };
  const fiyattanKonum = v => Math.round(Math.sqrt(Math.min(v, FIYAT_TAVAN) / FIYAT_TAVAN) * 100);

  function takvimHtml() {
    const bugun = new Date(); bugun.setHours(0, 0, 0, 0);
    const ay = takvimAy || (T.gun ? tarihAl(T.gun) : bugun);
    const ilk = new Date(ay.getFullYear(), ay.getMonth(), 1);
    const bas = new Date(ilk); bas.setDate(1 - ((ilk.getDay() + 6) % 7));
    const sonrakiAyVar = new Date(ay.getFullYear(), ay.getMonth() + 1, 1) <= bugun;
    let hucreler = "";
    for (let i = 0; i < 42; i++) {
      const d = new Date(bas); d.setDate(bas.getDate() + i);
      const k = gunAnahtar(d), gelecek = d > bugun, buAy = d.getMonth() === ay.getMonth();
      const etiket = gunUzun.format(d) + (k === T.gun ? ", Seçili gün" : "") + (+d === +bugun ? ", Bugün" : "") + (gelecek ? ", Kullanılamaz" : "");
      hucreler += `<button type="button" class="gun${buAy ? "" : " dis"}${k === T.gun ? " secili" : ""}${+d === +bugun ? " bugun" : ""}${GUNLER.has(k) ? " dolu" : ""}" data-gun="${k}" aria-label="${etiket}" ${gelecek ? "disabled" : ""} ${k === T.gun ? 'aria-pressed="true"' : ""}>${d.getDate()}</button>`;
    }
    return `<div class="takvim">
      <div class="secili-gun">Seçili gün: <b>${T.gun ? gunKisa.format(tarihAl(T.gun)) : "Tümü"}</b>${T.gun ? ` <button class="metin-btn" type="button" data-gun="">Kaldır</button>` : ""}</div>
      <div class="t-bas"><button type="button" class="t-ok" data-ay="-1" aria-label="Önceki ay"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button><b>${ayAdi.format(ay)}</b><button type="button" class="t-ok" data-ay="1" aria-label="Sonraki ay" ${sonrakiAyVar ? "" : "disabled"}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></div>
      <div class="t-izgara">${["Pt", "Sa", "Ça", "Pe", "Cu", "Ct", "Pz"].map(g => `<span class="t-gun-adi">${g}</span>`).join("")}${hucreler}</div></div>`;
  }
  function listeOgeleri(anahtar) {
    const say = (alan, kaynak) => { const c = {}; for (const x of kaynak) c[x[alan]] = (c[x[alan]] || 0) + 1; return c; };
    if (anahtar === "kategoriler") { const c = say("kategori", V.urunler); return V.tax.kategoriler.map(k => ({ v: k.id, ad: k.ad, on: k.emoji, n: c[k.id] || 0 })); }
    if (anahtar === "ulkeler") { const c = say("ulke", V.magazalar); return [...new Set([...ULKE_KODLARI, ...Object.keys(c)])].map(k => ({ v: k, ad: ulkeAdi(k), on: bayrak(k), n: c[k] || 0 })).sort((a, b) => a.ad.localeCompare(b.ad, "tr")); }
    if (anahtar === "paralar") { const c = say("para", V.magazalar); return Object.keys(c).sort((a, b) => c[b] - c[a]).map(k => ({ v: k, ad: `${k} (${(new Intl.NumberFormat("tr-TR", { style: "currency", currency: k, currencyDisplay: "narrowSymbol" }).formatToParts(0).find(x => x.type === "currency") || {}).value || k})`, ara: paraAdi(k), n: c[k] })); }
    if (anahtar === "diller") { const c = say("dil", V.magazalar); return Object.keys(c).sort((a, b) => c[b] - c[a]).map(k => ({ v: k, ad: buyukBas(dilAdi(k)), n: c[k] })); }
    if (anahtar === "tldler") { const c = say("tld", V.magazalar); return Object.keys(c).sort((a, b) => c[b] - c[a]).map(k => ({ v: k, ad: k, n: c[k] })); }
    return [];
  }
  const buyukBas = t => t.charAt(0).toLocaleUpperCase("tr") + t.slice(1);
  function listeIcerik(anahtar) {
    const q = (araMetni[anahtar] || "").toLocaleLowerCase("tr");
    const secili = T[anahtar];
    const ogeler = listeOgeleri(anahtar).filter(o => !q || (o.ad + " " + o.v + " " + (o.ara || "")).toLocaleLowerCase("tr").includes(q));
    ogeler.sort((a, b) => secili.includes(b.v) - secili.includes(a.v));
    return ogeler.length ? ogeler.map(o => `<label class="sec${o.n ? "" : " sifir"}"><input type="checkbox" data-liste="${anahtar}" value="${esc(o.v)}" ${secili.includes(o.v) ? "checked" : ""}>${o.on ? `<span class="sec-on" aria-hidden="true">${o.on}</span>` : ""}<span class="sec-ad">${esc(o.ad)}</span><small>${o.n ? sayi.format(o.n) : ""}</small></label>`).join("")
      : `<p class="liste-bos">Sonuç yok.</p>`;
  }
  const PLACEHOLDER = { kategoriler: "Kategori ara...", ulkeler: "Ülke ara...", paralar: "Para birimi ara...", diller: "Dil ara...", tldler: "Alan adı ara..." };
  const listeBolumu = anahtar => `<input class="liste-ara" type="search" data-liste-ara="${anahtar}" placeholder="${PLACEHOLDER[anahtar]}" value="${esc(araMetni[anahtar] || "")}" aria-label="${PLACEHOLDER[anahtar]}" autocomplete="off">
    ${T[anahtar].length ? `<p class="secim-ozet">${T[anahtar].length} seçili · <button class="metin-btn" type="button" data-liste-temizle="${anahtar}">Temizle</button></p>` : ""}
    <div class="liste" id="liste-${anahtar}" role="group">${listeIcerik(anahtar)}</div>`;

  function fiyatHtmlPanel() {
    const kMin = fiyattanKonum(T.fmin), kMax = T.fmax == null ? 100 : fiyattanKonum(T.fmax);
    return `<div class="aralik">
      <div class="aralik-deger"><div><span>Min</span><b id="fMinYazi">${tl(T.fmin)}</b></div><div><span>Maks</span><b id="fMaxYazi">${T.fmax == null ? tl(FIYAT_TAVAN) + "+" : tl(T.fmax)}</b></div></div>
      <div class="cift-kaydirici" style="--a:${kMin}%;--b:${kMax}%"><input type="range" min="0" max="100" value="${kMin}" id="fMin" aria-label="En düşük fiyat"><input type="range" min="0" max="100" value="${kMax}" id="fMax" aria-label="En yüksek fiyat"></div>
      <div class="magaza-basi" data-sadece="urun bulucu">
        <label class="kutu"><input type="checkbox" id="fMbAc" ${T.magazaBasi ? "checked" : ""}> Mağaza başına maks <b id="fMbYazi">${T.magazaBasi || "1–10"}</b></label>
        <input type="range" min="1" max="10" value="${T.magazaBasi || 10}" id="fMb" aria-label="Mağaza başına en çok ürün" ${T.magazaBasi ? "" : "disabled"}>
        <p class="ipucu">Sonuçları mağaza başına maks ${T.magazaBasi || 10} ürünle sınırlayın</p>
      </div></div>`;
  }
  function panelCiz() {
    const anahtar = { urunler: "urun", magazalar: "magaza", bulucu: "bulucu" }[S.sekme] || "urun";
    const kaydirma = $("#filtreGovde").scrollTop;
    $("#filtreGovde").innerHTML =
      bolum("gun", "Eklenme Tarihi", takvimHtml()) +
      bolum("kategoriler", "Kategori", listeBolumu("kategoriler") + (T.nis ? `<p class="secim-ozet">Niş: <b>${esc(nisOf(T.nis).ad)}</b> · <button class="metin-btn" type="button" data-nis-kaldir>Kaldır</button></p>` : "")) +
      bolum("fiyat", "Fiyat Aralığı", fiyatHtmlPanel(), "urun bulucu") +
      bolum("adet", "Ürün Sayısı", `<div class="cift"><input id="fAdetMin" type="number" min="0" inputmode="numeric" placeholder="En az" value="${esc(T.amin)}" aria-label="En az ürün sayısı"><input id="fAdetMax" type="number" min="0" inputmode="numeric" placeholder="En çok" value="${esc(T.amax)}" aria-label="En çok ürün sayısı"></div>`, "magaza") +
      bolum("ulkeler", "Ülke", listeBolumu("ulkeler")) +
      bolum("paralar", "Para Birimi", listeBolumu("paralar")) +
      bolum("diller", "Dil", listeBolumu("diller")) +
      bolum("tldler", "Domain Uzantısı", listeBolumu("tldler")) +
      `<section class="fb" data-sadece="urun bulucu"><label class="kutu"><input id="fIndirim" type="checkbox" ${T.indirim ? "checked" : ""}> Sadece indirimdeki ürünler</label></section>`;
    $("#filtreGovde").querySelectorAll("[data-sadece]").forEach(el => el.toggleAttribute("data-gizli", !el.dataset.sadece.split(" ").includes(anahtar)));
    $("#filtreGovde").scrollTop = kaydirma;
    uygulaDurum();
  }
  const farkli = () => JSON.stringify({ ...T, ara: "" }) !== JSON.stringify({ ...S.f, ara: "" });
  function uygulaDurum() { const d = farkli(); $("#uygula").classList.toggle("bekliyor", d); $("#uygula").textContent = d ? "Filtreleri Uygula •" : "Filtreleri Uygula"; }
  function uygula() {
    S.f = { ...kopya(T), ara: S.f.ara };
    S.limit = SAYFA;
    if (S.sekme === "bulucu") bulucuHazirla();
    panelAc(false); ciz();
  }
  const taslakSifirla = () => { T = kopya(S.f); takvimAy = null; };

  function aktiflerCiz() {
    const f = S.f, c = [];
    const ekle = (metin, kaldir) => c.push(`<button class="aktif" type="button" data-kaldir='${esc(JSON.stringify(kaldir))}'>${metin} <span aria-hidden="true">✕</span><span class="sr">filtresini kaldır</span></button>`);
    if (f.ara) ekle(`“${esc(f.ara)}”`, ["ara"]);
    if (f.gun) ekle(gunKisa.format(tarihAl(f.gun)), ["gun"]);
    f.kategoriler.forEach(k => ekle(`${KAT[k]?.emoji || ""} ${esc(KAT[k]?.ad || k)}`, ["kategoriler", k]));
    if (f.nis) ekle(`Niş: ${esc(nisOf(f.nis).ad)}`, ["nis"]);
    if (S.sekme !== "magazalar" && (f.fmin || f.fmax != null)) ekle(`${tl(f.fmin)} – ${f.fmax == null ? tl(FIYAT_TAVAN) + "+" : tl(f.fmax)}`, ["fiyat"]);
    if (S.sekme !== "magazalar" && f.magazaBasi) ekle(`Mağaza başına ${f.magazaBasi}`, ["magazaBasi"]);
    f.ulkeler.forEach(k => ekle(`${bayrak(k)} ${esc(ulkeAdi(k))}`, ["ulkeler", k]));
    f.paralar.forEach(k => ekle(esc(k), ["paralar", k]));
    f.diller.forEach(k => ekle(esc(buyukBas(dilAdi(k))), ["diller", k]));
    f.tldler.forEach(k => ekle(esc(k), ["tldler", k]));
    if (S.sekme === "magazalar" && (f.amin !== "" || f.amax !== "")) ekle(`${f.amin || 0}–${f.amax || "∞"} ürün`, ["adet"]);
    if (S.sekme !== "magazalar" && f.indirim) ekle("İndirimde", ["indirim"]);
    $("#aktifler").innerHTML = c.length ? c.join("") + `<button class="metin-btn" type="button" data-hepsini-kaldir>Tümünü temizle</button>` : "";
    const n = c.length - (f.ara ? 1 : 0), el = $("#filtreSayi");
    el.hidden = !n; el.textContent = n;
  }
  function aktifKaldir([k, v]) {
    const f = S.f;
    if (k === "fiyat") { f.fmin = 0; f.fmax = null; }
    else if (k === "adet") { f.amin = ""; f.amax = ""; }
    else if (v !== undefined) f[k] = f[k].filter(x => x !== v);
    else f[k] = kopya(F0[k]);
    taslakSifirla(); S.limit = SAYFA;
    if (S.sekme === "bulucu") bulucuHazirla();
    ciz();
  }
  function hizliCiz() {
    const tek = S.f.kategoriler.length === 1 ? S.f.kategoriler[0] : null, hic = !S.f.kategoriler.length;
    $("#hizli").innerHTML = [["", "Tümü"], ...V.tax.kategoriler.map(k => [k.id, `${k.emoji} ${k.ad}`])]
      .map(([id, ad]) => `<button class="cip" type="button" role="listitem" data-kat="${id}" aria-pressed="${id ? tek === id : hic}">${esc(ad)}</button>`).join("");
  }
  const panelAc = ac => {
    if (ac) { taslakSifirla(); panelCiz(); }
    $("#filtre").classList.toggle("acik", ac); $("#perde").hidden = !ac;
  };

  function istatistikCiz() {
    const yedi = V.magazalar.filter(m => Date.now() - Date.parse(m.eklenme) < 7 * GUN).length;
    const nisSay = new Set(V.urunler.map(p => p.nis)).size;
    $("#istatistik").innerHTML = [[V.magazalar.length, "mağaza"], [V.urunler.length, "ürün"], [nisSay, "niş"], [yedi, "son 7 günde yeni mağaza"]]
      .map(([s, t]) => `<div><b>${sayi.format(s)}</b><span>${t}</span></div>`).join("");
  }

  /* ---------- olaylar ---------- */
  function baglan() {
    let araZaman;
    $("#fAra").addEventListener("input", e => {
      clearTimeout(araZaman);
      araZaman = setTimeout(() => { S.f.ara = T.ara = e.target.value.trim(); S.limit = SAYFA; if (S.sekme === "bulucu") bulucuHazirla(); ciz(); }, 200);
    });
    $("#fSirala").addEventListener("change", e => { S.sirala[S.sekme] = e.target.value; S.limit = SAYFA; ciz(); });
    $("#uygula").addEventListener("click", uygula);
    $("#temizle").addEventListener("click", () => { T = { ...kopya(F0), ara: S.f.ara }; takvimAy = null; for (const k in araMetni) araMetni[k] = ""; panelCiz(); });
    $("#sifirla").addEventListener("click", () => { T = { ...kopya(F0), ara: S.f.ara }; for (const k in araMetni) araMetni[k] = ""; takvimAy = null; uygula(); });
    $("#filtreAc").addEventListener("click", () => panelAc(true));
    $("#filtreKapat").addEventListener("click", () => panelAc(false));
    $("#perde").addEventListener("click", () => panelAc(false));
    $("#hizli").addEventListener("click", e => {
      const b = e.target.closest("[data-kat]"); if (!b) return;
      S.f.kategoriler = b.dataset.kat ? [b.dataset.kat] : []; S.f.nis = "";
      taslakSifirla(); S.limit = SAYFA; if (S.sekme === "bulucu") bulucuHazirla(); ciz();
    });

    // Panel: taslak (T) üzerinde çalışır, Uygula'ya kadar sonuçlar değişmez.
    const govde = $("#filtreGovde");
    govde.addEventListener("click", e => {
      const t = e.target.closest("[data-gun],[data-ay],[data-yardim],[data-liste-temizle],[data-nis-kaldir]"); if (!t) return;
      const d = t.dataset;
      if (d.yardim) { const p = $("#y-" + d.yardim); p.hidden = !p.hidden; t.setAttribute("aria-expanded", !p.hidden); return; }
      if (d.gun !== undefined) { T.gun = d.gun === T.gun ? "" : d.gun; if (T.gun) takvimAy = tarihAl(T.gun); }
      else if (d.ay) { const a = takvimAy || (T.gun ? tarihAl(T.gun) : new Date()); takvimAy = new Date(a.getFullYear(), a.getMonth() + Number(d.ay), 1); }
      else if (d.listeTemizle) T[d.listeTemizle] = [];
      else if ("nisKaldir" in d) T.nis = "";
      panelCiz();
      const odak = d.gun !== undefined ? govde.querySelector(`[data-gun="${T.gun || d.gun}"]`) : d.ay ? govde.querySelector(`[data-ay="${d.ay}"]`) : null;
      odak?.focus();
    });
    govde.addEventListener("change", e => {
      const t = e.target;
      if (t.dataset.liste) {
        const k = t.dataset.liste;
        T[k] = t.checked ? [...T[k], t.value] : T[k].filter(x => x !== t.value);
        if (k === "kategoriler" && T.nis && !T.kategoriler.includes(nisOf(T.nis).kategori)) T.nis = "";
        const ozet = t.closest(".fb"); const sk = govde.scrollTop;
        ozet.querySelector(".secim-ozet")?.remove();
        if (T[k].length) ozet.querySelector(".liste-ara").insertAdjacentHTML("afterend", `<p class="secim-ozet">${T[k].length} seçili · <button class="metin-btn" type="button" data-liste-temizle="${k}">Temizle</button></p>`);
        govde.scrollTop = sk;
      } else if (t.id === "fIndirim") T.indirim = t.checked;
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

    document.addEventListener("click", e => {
      const t = e.target.closest("[data-kaydet],[data-urun],[data-magaza],[data-daha],[data-bk],[data-yenidesteyi],[data-csv],[data-temizle],[data-kapat],[data-benzer],[data-kaldir],[data-hepsini-kaldir]");
      if (!t) { if (e.target === dlg) dlg.close(); return; }
      const d = t.dataset;
      if (d.kaydet) {
        e.stopPropagation();
        const [tur, id] = d.kaydet.split(":"), set = S.kayit[tur];
        set.has(id) ? set.delete(id) : set.add(id); kayitYaz();
        if (dlg.open) magazaAc(dlg.dataset.magaza, dlg.dataset.urun || null);
        if (S.sekme !== "bulucu") ciz();
        return;
      }
      if (d.urun) return urunAc(d.urun);
      if (d.magaza) return magazaAc(d.magaza);
      if ("daha" in d) { S.limit += SAYFA; return ciz(); }
      if (d.bk) return bulucuKarar(d.bk);
      if ("yenidesteyi" in d) { bulucuHazirla(); return ciz(); }
      if (d.csv) { e.preventDefault(); return csvIndir(d.csv); }
      if (d.temizle) { if (confirm(d.temizle === "u" ? "Kaydedilen tüm ürünler silinsin mi?" : "Kaydedilen tüm mağazalar silinsin mi?")) { S.kayit[d.temizle].clear(); kayitYaz(); ciz(); } return; }
      if ("kapat" in d) return dlg.close();
      if (d.kaldir) return aktifKaldir(JSON.parse(d.kaldir));
      if ("hepsiniKaldir" in d) { S.f = kopya(F0); taslakSifirla(); S.limit = SAYFA; if (S.sekme === "bulucu") bulucuHazirla(); return ciz(); }
      if (d.benzer) { dlg.close(); S.f = { ...kopya(F0), kategoriler: [nisOf(d.benzer).kategori], nis: d.benzer }; taslakSifirla(); if (location.hash !== "#urunler") location.hash = "urunler"; else ciz(); return; }
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { const s = e.target.closest?.(".satir[data-magaza]"); if (s && e.target === s) { e.preventDefault(); s.click(); } }
      if (e.key === "Escape" && $("#filtre").classList.contains("acik")) panelAc(false);
      if (S.sekme !== "bulucu" || dlg.open || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); bulucuKarar("kay"); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); bulucuKarar("gec"); }
      else if (e.key === "Enter" && !e.target.closest("button,a,label")) { e.preventDefault(); bulucuKarar("ac"); }
    });
    dlg.addEventListener("close", () => { if (S.sekme === "kaydedilenler") ciz(); });
    addEventListener("hashchange", sekmeAyarla);
  }
  function sekmeAyarla() {
    const h = location.hash.slice(1);
    const yeni = ["urunler", "magazalar", "bulucu", "kaydedilenler"].includes(h) ? h : "urunler";
    if (yeni === "bulucu") bulucuHazirla();
    S.sekme = yeni; S.limit = SAYFA; depo.yaz("sekme", yeni);
    taslakSifirla(); panelAc(false); ciz();
  }

  /* ---------- başlat ---------- */
  async function basla() {
    try {
      const tax = await (await fetch("taksonomi.json")).json();
      let veri = null;
      try { const r = await fetch("data.json", { cache: "no-cache" }); if (r.ok) veri = await r.json(); } catch { /* yok, demo kullanılır */ }
      if (!veri?.urunler?.length) veri = demoVeriUret(tax);
      V = { ...veri, tax };
    } catch {
      $("#gorunum").innerHTML = bos("Veri yüklenemedi.", "Dosyayı doğrudan açtıysan klasörde <code>python3 -m http.server</code> çalıştırıp <code>localhost:8000</code> adresinden aç.");
      return;
    }
    for (const k of V.tax.kategoriler) { KAT[k.id] = k; for (const n of k.nisler) NIS[n.id] = { ...n, kategori: k.id }; }
    // Filtrelemede tekrar tekrar hesaplanmasın diye türetilmiş alanlar bir kez eklenir.
    for (const m of V.magazalar) { MAG[m.id] = m; m._gun = gunAnahtar(new Date(m.eklenme)); m._ara = (m.ad + " " + m.alan + " " + nisOf(m.nis).ad).toLocaleLowerCase("tr"); GUNLER.add(m._gun); }
    for (const p of V.urunler) { p._gun = gunAnahtar(new Date(p.eklenme)); p._tl = p.fiyat * (KUR_TL[p.para] ?? KUR_TL.USD); GUNLER.add(p._gun); }
    // Silinmiş ürün ya da mağazalara ait eski kayıtları ayıkla.
    const urunIdleri = new Set(V.urunler.map(p => p.id));
    for (const id of [...S.kayit.u]) if (!urunIdleri.has(id)) S.kayit.u.delete(id);
    for (const id of [...S.kayit.m]) if (!MAG[id]) S.kayit.m.delete(id);
    kayitYaz();
    $("#demoUyari").hidden = V.kaynak !== "demo";
    istatistikCiz(); baglan();
    if (!location.hash) { const s = depo.al("sekme", ""); if (s) history.replaceState(null, "", "#" + s); }
    sekmeAyarla();
  }
  basla();
})();
