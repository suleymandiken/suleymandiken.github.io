/* Nişbul: Shopify mağaza ve ürün dizini.
   Veri: data.json (araclar/tara.py üretir) varsa o, yoksa demo.js'in kurgusal verisi. */
(() => {
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const GUN = 864e5, SAYFA = 48;
  const depo = {
    al(k, v) { try { const x = localStorage.getItem("nisbul:" + k); return x ? JSON.parse(x) : v; } catch { return v; } },
    yaz(k, v) { try { localStorage.setItem("nisbul:" + k, JSON.stringify(v)); } catch { /* gizli pencere vb. */ } }
  };
  const adlandir = tur => { try { const d = new Intl.DisplayNames(["tr"], { type: tur }); return k => { try { return d.of(k) || k; } catch { return k; } }; } catch { return k => k; } };
  const ulkeAdi = adlandir("region"), dilAdi = adlandir("language"), paraAdi = adlandir("currency");
  const bayrak = k => /^[A-Z]{2}$/.test(k || "") ? String.fromCodePoint(...[...k].map(c => 0x1f1e6 + c.charCodeAt(0) - 65)) : "🏳️";
  const fmtCache = {};
  const para = (v, kur) => { if (v == null) return ""; try { return (fmtCache[kur] ||= new Intl.NumberFormat("tr-TR", { style: "currency", currency: kur || "USD", maximumFractionDigits: 2 })).format(v); } catch { return v + " " + (kur || ""); } };
  const sayi = new Intl.NumberFormat("tr-TR");
  const once = iso => { const g = Math.floor((Date.now() - Date.parse(iso)) / GUN); return g <= 0 ? "bugün" : g === 1 ? "dün" : g < 30 ? g + " gün önce" : g < 365 ? Math.floor(g / 30) + " ay önce" : Math.floor(g / 365) + " yıl önce"; };
  const ton = id => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

  let V, NIS = {}, KAT = {}, MAG = {};
  const DIGER = { id: "diger", ad: "Diğer", emoji: "📦", kategori: "diger" };
  const nisOf = id => NIS[id] || DIGER;

  const F0 = { ara: "", kategori: "", nis: "", fmin: "", fmax: "", amin: "", amax: "", zaman: "", ulke: "", para: "", dil: "", tld: "", indirim: false };
  const S = {
    sekme: "urunler", f: { ...F0 }, sirala: { urunler: "yeni", magazalar: "yeni" }, limit: SAYFA,
    kayit: { u: new Set(depo.al("kayitU", [])), m: new Set(depo.al("kayitM", [])) },
    bulucu: { liste: [], i: 0, gecilen: 0, kaydedilen: 0 }
  };
  const kayitYaz = () => { depo.yaz("kayitU", [...S.kayit.u]); depo.yaz("kayitM", [...S.kayit.m]); $("#kayitSayi").textContent = S.kayit.u.size + S.kayit.m.size; };

  /* ---------- filtreleme ---------- */
  const SIRALA = {
    urunler: [["yeni", "En yeni"], ["fiyat-a", "Fiyat: düşükten yükseğe"], ["fiyat-z", "Fiyat: yüksekten düşüğe"], ["indirim", "En yüksek indirim"]],
    magazalar: [["yeni", "En yeni"], ["urun-cok", "En çok ürün"], ["urun-az", "En az ürün"], ["ad", "Ada göre"]]
  };
  const sayiAl = v => v === "" ? null : Number(v);
  function magazaUyar(m, f, metinDahil) {
    if (f.ulke && m.ulke !== f.ulke) return false;
    if (f.para && m.para !== f.para) return false;
    if (f.dil && m.dil !== f.dil) return false;
    if (f.tld && m.tld !== f.tld) return false;
    if (metinDahil) {
      if (f.kategori && m.kategori !== f.kategori) return false;
      if (f.nis && m.nis !== f.nis) return false;
      if (f.zaman && Date.now() - Date.parse(m.eklenme) > f.zaman * GUN) return false;
      const amin = sayiAl(f.amin), amax = sayiAl(f.amax);
      if (amin != null && m.urunSayisi < amin) return false;
      if (amax != null && m.urunSayisi > amax) return false;
      if (f.ara) { const q = f.ara.toLocaleLowerCase("tr"); if (!(m.ad + " " + m.alan + " " + nisOf(m.nis).ad).toLocaleLowerCase("tr").includes(q)) return false; }
    }
    return true;
  }
  function urunleriSuz() {
    const f = S.f, fmin = sayiAl(f.fmin), fmax = sayiAl(f.fmax), q = f.ara.toLocaleLowerCase("tr");
    const sinir = f.zaman ? Date.now() - f.zaman * GUN : 0;
    return V.urunler.filter(p => {
      if (f.kategori && p.kategori !== f.kategori) return false;
      if (f.nis && p.nis !== f.nis) return false;
      if (fmin != null && p.fiyat < fmin) return false;
      if (fmax != null && p.fiyat > fmax) return false;
      if (f.indirim && !(p.eskiFiyat > p.fiyat)) return false;
      if (sinir && Date.parse(p.eklenme) < sinir) return false;
      const m = MAG[p.magaza];
      if (!m || !magazaUyar(m, f, false)) return false;
      if (q && !(p.ad + " " + m.ad + " " + m.alan + " " + nisOf(p.nis).ad).toLocaleLowerCase("tr").includes(q)) return false;
      return true;
    });
  }
  const indirimOrani = p => p.eskiFiyat > p.fiyat ? 1 - p.fiyat / p.eskiFiyat : 0;
  function urunSirala(a) {
    const k = S.sirala.urunler;
    return a.sort(k === "fiyat-a" ? (x, y) => x.fiyat - y.fiyat : k === "fiyat-z" ? (x, y) => y.fiyat - x.fiyat : k === "indirim" ? (x, y) => indirimOrani(y) - indirimOrani(x) : (x, y) => y.eklenme.localeCompare(x.eklenme));
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

  /* ---------- görünümler ---------- */
  function ciz() {
    const sek = S.sekme;
    document.querySelectorAll("[data-sekme]").forEach(a => a.dataset.sekme === sek ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
    const anahtar = { urunler: "urun", magazalar: "magaza", bulucu: "bulucu" }[sek];
    document.querySelectorAll("[data-sadece]").forEach(el => el.toggleAttribute("data-gizli", !el.dataset.sadece.split(" ").includes(anahtar)));
    const kayitta = sek === "kaydedilenler";
    $("#filtre").toggleAttribute("data-gizli", kayitta);
    $("#aracCubugu").toggleAttribute("data-gizli", kayitta);
    $("#hizli").toggleAttribute("data-gizli", kayitta);
    $(".duzen").style.gridTemplateColumns = kayitta ? "1fr" : "";
    const srl = $("#fSirala");
    srl.parentElement.toggleAttribute("data-gizli", !SIRALA[sek]);
    if (SIRALA[sek]) { srl.innerHTML = SIRALA[sek].map(([v, t]) => `<option value="${v}">${t}</option>`).join(""); srl.value = S.sirala[sek]; }
    hizliCiz(); filtreSayiCiz();
    ({ urunler: urunlerCiz, magazalar: magazalarCiz, bulucu: bulucuCiz, kaydedilenler: kayitCiz })[sek]();
  }
  function urunlerCiz() {
    const a = urunSirala(urunleriSuz());
    $("#sonucSayi").innerHTML = `<b>${sayi.format(a.length)}</b> ürün, <b>${sayi.format(new Set(a.map(p => p.magaza)).size)}</b> mağazadan`;
    $("#gorunum").innerHTML = a.length ? `<div class="izgara">${a.slice(0, S.limit).map(urunKart).join("")}</div>${a.length > S.limit ? `<button class="daha" type="button" data-daha>Daha fazla göster (${sayi.format(a.length - S.limit)} kaldı)</button>` : ""}`
      : bos("Bu filtrelerle ürün yok.", "Bir iki filtreyi gevşetmeyi dene.");
  }
  function magazalarCiz() {
    const a = magazaSirala(V.magazalar.filter(m => magazaUyar(m, S.f, true)));
    $("#sonucSayi").innerHTML = `<b>${sayi.format(a.length)}</b> mağaza`;
    $("#gorunum").innerHTML = a.length ? `<div class="tablo">${magazaBas}${a.slice(0, S.limit).map(magazaSatir).join("")}</div>${a.length > S.limit ? `<button class="daha" type="button" data-daha>Daha fazla göster (${sayi.format(a.length - S.limit)} kaldı)</button>` : ""}`
      : bos("Bu filtrelerle mağaza yok.", "Bir iki filtreyi gevşetmeyi dene.");
  }

  /* bulucu: filtrelenmiş ürünleri karıştırıp tek tek gösterir */
  function bulucuHazirla() {
    const a = urunleriSuz();
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
    $("#gorunum").innerHTML = `
      <div class="bolum-bas"><h2>Kaydedilen ürünler (${u.length})</h2><a class="ikincil" href="#" data-csv="u" ${u.length ? "" : 'aria-disabled="true"'}>CSV indir</a><button class="ikincil" type="button" data-temizle="u" ${u.length ? "" : "disabled"}>Temizle</button></div>
      ${u.length ? `<div class="izgara">${u.map(urunKart).join("")}</div>` : bos("Henüz ürün kaydetmedin.", "Ürün kartlarındaki ♡ ya da Bulucu'da sağa kaydırma burada toplanır.")}
      <div class="bolum-bas" style="margin-top:36px"><h2>Kaydedilen mağazalar (${m.length})</h2><a class="ikincil" href="#" data-csv="m" ${m.length ? "" : 'aria-disabled="true"'}>CSV indir</a><button class="ikincil" type="button" data-temizle="m" ${m.length ? "" : "disabled"}>Temizle</button></div>
      ${m.length ? `<div class="tablo">${magazaBas}${m.map(magazaSatir).join("")}</div>` : bos("Henüz mağaza kaydetmedin.", "Rakip olarak izlemek istediğin mağazaları buraya ekle.")}`;
  }
  function csvIndir(tur) {
    const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const satirlar = tur === "u"
      ? [["Ürün", "Fiyat", "Eski fiyat", "Para", "Niş", "Mağaza", "Alan adı", "Ülke", "Ürün linki", "Eklenme"],
        ...V.urunler.filter(p => S.kayit.u.has(p.id)).map(p => { const m = MAG[p.magaza]; return [p.ad, p.fiyat, p.eskiFiyat, p.para, nisOf(p.nis).ad, m.ad, m.alan, m.ulke, p.url, p.eklenme.slice(0, 10)]; })]
      : [["Mağaza", "Alan adı", "Niş", "Ülke", "Dil", "Para", "Ürün sayısı", "Eklenme"],
        ...V.magazalar.filter(m => S.kayit.m.has(m.id)).map(m => [m.ad, m.alan, nisOf(m.nis).ad, m.ulke, m.dil, m.para, m.urunSayisi, m.eklenme.slice(0, 10)])];
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
    const digerleri = V.urunler.filter(x => x.magaza === mid && x.id !== odakUrun).sort((a, b) => b.eklenme.localeCompare(a.eklenme));
    const fiyatlar = V.urunler.filter(x => x.magaza === mid).map(x => x.fiyat).sort((a, b) => a - b);
    const orta = fiyatlar.length ? fiyatlar[Math.floor(fiyatlar.length / 2)] : null;
    const km = S.kayit.m.has(mid);
    $("#detayIc").innerHTML = `
      <div class="d-bas"><span class="m-ic gorsel" style="--h:${ton(n.id)};aspect-ratio:auto;width:56px;height:56px"><span aria-hidden="true">${n.emoji}</span></span>
        <div><h2 id="detayBaslik">${esc(m.ad)}</h2><p>${esc(m.alan)} · ${esc(KAT[m.kategori]?.ad || "Diğer")} › ${esc(n.ad)}</p></div>
        <button class="kapat" type="button" data-kapat aria-label="Kapat">✕</button></div>
      ${p ? `<div class="d-urun">${gorsel(p, true)}<div><h3>${esc(p.ad)}</h3>${fiyatHtml(p)}
        <p class="alt" style="white-space:normal">${esc(nisOf(p.nis).ad)} · ${once(p.eklenme)} eklendi</p>
        <div class="d-eylem" style="padding:12px 0 0">${disLink(p.url, "Ürüne git", "birincil")}<button class="ikincil" type="button" data-kaydet="u:${esc(p.id)}">${S.kayit.u.has(p.id) ? "♥ Kaydedildi" : "♡ Ürünü kaydet"}</button></div></div></div>` : ""}
      <div class="d-ozellik">
        <div><span>Ülke</span><b>${bayrak(m.ulke)} ${esc(ulkeAdi(m.ulke))}</b></div>
        <div><span>Dil</span><b>${esc(dilAdi(m.dil))}</b></div>
        <div><span>Para birimi</span><b>${esc(m.para)}</b></div>
        <div><span>Ürün sayısı</span><b>${sayi.format(m.urunSayisi)}</b></div>
        <div><span>Ortanca fiyat</span><b>${orta != null ? para(orta, m.para) : "–"}</b></div>
        <div><span>Dizine eklenme</span><b>${once(m.eklenme)}</b></div>
      </div>
      <div class="d-eylem">${disLink("https://" + m.alan, "Mağazayı aç", p ? "ikincil" : "birincil")}<button class="ikincil" type="button" data-kaydet="m:${esc(m.id)}">${km ? "♥ Mağaza kaydedildi" : "♡ Mağazayı kaydet"}</button>
        <button class="ikincil" type="button" data-benzer="${esc(m.nis)}">Bu nişteki diğer ürünler</button></div>
      ${digerleri.length ? `<div class="d-alt"><h3>Bu mağazanın ${p ? "diğer " : ""}ürünleri (${digerleri.length})</h3><div class="izgara">${digerleri.slice(0, 12).map(urunKart).join("")}</div></div>` : ""}`;
    if (!dlg.open) dlg.showModal();
    dlg.scrollTop = 0;
  }
  const urunAc = uid => { const p = V.urunler.find(x => x.id === uid); if (p) magazaAc(p.magaza, uid); };

  /* ---------- filtre paneli ---------- */
  function secenekler(id, liste, bosMetin) {
    const el = $(id), v = el.value;
    el.innerHTML = `<option value="">${bosMetin}</option>` + liste.map(([d, t]) => `<option value="${esc(d)}">${esc(t)}</option>`).join("");
    el.value = liste.some(([d]) => d === v) ? v : "";
  }
  const dagilim = alan => { const c = {}; for (const m of V.magazalar) c[m[alan]] = (c[m[alan]] || 0) + 1; return Object.entries(c).sort((a, b) => b[1] - a[1]); };
  function nisSecenek() {
    const kats = S.f.kategori ? V.tax.kategoriler.filter(k => k.id === S.f.kategori) : V.tax.kategoriler;
    const el = $("#fNis");
    el.innerHTML = `<option value="">Tüm nişler</option>` + kats.map(k => `<optgroup label="${esc(k.ad)}">${k.nisler.map(n => `<option value="${n.id}">${n.emoji} ${esc(n.ad)}</option>`).join("")}</optgroup>`).join("");
    el.value = kats.some(k => k.nisler.some(n => n.id === S.f.nis)) ? S.f.nis : (S.f.nis = "");
  }
  function filtreleriKur() {
    secenekler("#fKategori", V.tax.kategoriler.map(k => [k.id, k.ad]), "Tüm kategoriler");
    nisSecenek();
    secenekler("#fUlke", dagilim("ulke").map(([k, c]) => [k, `${bayrak(k)} ${ulkeAdi(k)} (${c})`]), "Tüm ülkeler");
    secenekler("#fPara", dagilim("para").map(([k, c]) => [k, `${k} · ${paraAdi(k)} (${c})`]), "Tüm para birimleri");
    secenekler("#fDil", dagilim("dil").map(([k, c]) => [k, `${dilAdi(k)} (${c})`]), "Tüm diller");
    secenekler("#fTld", dagilim("tld").map(([k, c]) => [k, `${k} (${c})`]), "Tüm uzantılar");
  }
  const ALANLAR = { fAra: "ara", fKategori: "kategori", fNis: "nis", fFiyatMin: "fmin", fFiyatMax: "fmax", fAdetMin: "amin", fAdetMax: "amax", fZaman: "zaman", fUlke: "ulke", fPara: "para", fDil: "dil", fTld: "tld", fIndirim: "indirim" };
  function filtreDegisti() {
    S.limit = SAYFA;
    if (S.sekme === "bulucu") bulucuHazirla();
    ciz();
  }
  function filtreleriYansit() {
    for (const [id, k] of Object.entries(ALANLAR)) { const el = document.getElementById(id); if (el.type === "checkbox") el.checked = S.f[k]; else el.value = S.f[k]; }
  }
  function filtreSayiCiz() {
    const n = Object.keys(F0).filter(k => S.f[k] !== F0[k]).length, el = $("#filtreSayi");
    el.hidden = !n; el.textContent = n;
  }
  function hizliCiz() {
    $("#hizli").innerHTML = [["", "Tümü"], ...V.tax.kategoriler.map(k => [k.id, `${k.nisler[0].emoji} ${k.ad}`])]
      .map(([id, ad]) => `<button class="cip" type="button" role="listitem" data-kat="${id}" aria-pressed="${S.f.kategori === id}">${esc(ad)}</button>`).join("");
  }
  const panelAc = ac => { $("#filtre").classList.toggle("acik", ac); $("#perde").hidden = !ac; if (ac) $("#fAra").focus(); };

  function istatistikCiz() {
    const yedi = V.magazalar.filter(m => Date.now() - Date.parse(m.eklenme) < 7 * GUN).length;
    const nisSay = new Set(V.urunler.map(p => p.nis)).size;
    $("#istatistik").innerHTML = [[V.magazalar.length, "mağaza"], [V.urunler.length, "ürün"], [nisSay, "niş"], [yedi, "son 7 günde yeni mağaza"]]
      .map(([s, t]) => `<div><b>${sayi.format(s)}</b><span>${t}</span></div>`).join("");
  }

  /* ---------- olaylar ---------- */
  function baglan() {
    let araZaman;
    for (const [id, k] of Object.entries(ALANLAR)) {
      const el = document.getElementById(id);
      el.addEventListener(el.type === "search" || el.type === "number" ? "input" : "change", () => {
        S.f[k] = el.type === "checkbox" ? el.checked : el.value;
        if (k === "kategori") nisSecenek();
        clearTimeout(araZaman); araZaman = setTimeout(filtreDegisti, el.type === "search" ? 180 : 0);
      });
    }
    $("#fSirala").addEventListener("change", e => { S.sirala[S.sekme] = e.target.value; S.limit = SAYFA; ciz(); });
    $("#sifirla").addEventListener("click", () => { S.f = { ...F0 }; nisSecenek(); filtreleriYansit(); filtreDegisti(); });
    $("#filtreAc").addEventListener("click", () => panelAc(true));
    $("#filtreKapat").addEventListener("click", () => panelAc(false));
    $("#perde").addEventListener("click", () => panelAc(false));
    $("#hizli").addEventListener("click", e => {
      const b = e.target.closest("[data-kat]"); if (!b) return;
      S.f.kategori = b.dataset.kat; $("#fKategori").value = S.f.kategori; nisSecenek(); filtreDegisti();
    });

    document.addEventListener("click", e => {
      const t = e.target.closest("[data-kaydet],[data-urun],[data-magaza],[data-daha],[data-bk],[data-yenidesteyi],[data-csv],[data-temizle],[data-kapat],[data-benzer]");
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
      if (d.benzer) { dlg.close(); S.f = { ...F0, kategori: nisOf(d.benzer).kategori, nis: d.benzer }; nisSecenek(); filtreleriYansit(); location.hash = "urunler"; return filtreDegisti(); }
    });
    document.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") { const s = e.target.closest?.(".satir[data-magaza]"); if (s && e.target === s) { e.preventDefault(); s.click(); } }
      if (S.sekme !== "bulucu" || dlg.open || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName)) return;
      if (e.key === "ArrowRight") { e.preventDefault(); bulucuKarar("kay"); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); bulucuKarar("gec"); }
      else if (e.key === "Enter" && !e.target.closest("button,a")) { e.preventDefault(); bulucuKarar("ac"); }
    });
    dlg.addEventListener("close", () => { if (S.sekme === "kaydedilenler") ciz(); });
    addEventListener("hashchange", sekmeAyarla);
  }
  function sekmeAyarla() {
    const h = location.hash.slice(1);
    const yeni = ["urunler", "magazalar", "bulucu", "kaydedilenler"].includes(h) ? h : "urunler";
    if (yeni === "bulucu" && (S.sekme !== "bulucu" || !S.bulucu.liste.length)) bulucuHazirla();
    S.sekme = yeni; S.limit = SAYFA; depo.yaz("sekme", yeni);
    panelAc(false); ciz();
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
    for (const m of V.magazalar) MAG[m.id] = m;
    // Silinmiş ürün ya da mağazalara ait eski kayıtları ayıkla.
    for (const id of [...S.kayit.u]) if (!V.urunler.some(p => p.id === id)) S.kayit.u.delete(id);
    for (const id of [...S.kayit.m]) if (!MAG[id]) S.kayit.m.delete(id);
    kayitYaz();
    $("#demoUyari").hidden = V.kaynak !== "demo";
    istatistikCiz(); filtreleriKur(); baglan();
    if (!location.hash) { const s = depo.al("sekme", ""); if (s) history.replaceState(null, "", "#" + s); }
    sekmeAyarla();
  }
  basla();
})();
