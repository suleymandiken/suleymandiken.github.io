/* Örnek veri üreticisi.
   data.json yoksa arayüzün boş kalmaması için kurgusal mağaza ve ürün üretir.
   Aynı tohumla her açılışta aynı veriyi verir. Mağaza adları ve alan adları uydurmadır;
   bu yüzden arayüz örnek verideki dış bağlantıları kapatır. */
function demoVeriUret(taksonomi, tohum = 20261019) {
  let s = tohum >>> 0;
  const r = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const sec = a => a[Math.floor(r() * a.length)];
  const agirlikli = liste => { let x = r() * liste.reduce((t, [, w]) => t + w, 0); for (const [v, w] of liste) { if ((x -= w) < 0) return v; } return liste[0][0]; };
  const buyukHarf = t => t.replace(/\b\w/g, c => c.toUpperCase());

  const ULKELER = [
    ["US", 34, "USD", "en"], ["GB", 10, "GBP", "en"], ["CA", 7, "CAD", "en"], ["AU", 7, "AUD", "en"],
    ["DE", 8, "EUR", "de"], ["FR", 6, "EUR", "fr"], ["TR", 8, "TRY", "tr"], ["NL", 4, "EUR", "nl"],
    ["ES", 4, "EUR", "es"], ["IT", 3, "EUR", "it"], ["BR", 4, "BRL", "pt"], ["SE", 2, "SEK", "sv"],
    ["AE", 3, "AED", "en"]
  ];
  const KUR = { USD: 1, GBP: .79, CAD: 1.37, AUD: 1.52, EUR: .92, TRY: 41, BRL: 5.4, SEK: 10.6, AED: 3.67 };
  const TLD_ULKE = { GB: ".co.uk", DE: ".de", FR: ".fr", TR: ".com.tr", NL: ".nl", ES: ".es", IT: ".it", BR: ".com.br", SE: ".se", AU: ".com.au", CA: ".ca" };
  const ON = ["nova", "luma", "kora", "vela", "mira", "oslo", "aura", "zest", "halo", "rue", "kin", "loom", "fern", "sol", "nook", "bloom", "pebble", "ember", "tidal", "atlas", "mint", "quill", "orbit", "maple", "lark", "cove", "nimbus", "olive", "pine", "sage"];
  const SON = ["co", "shop", "studio", "supply", "lab", "house", "goods", "store", "market", "club", "life", "hq"];
  const SIFAT = ["Premium", "Mini", "Portable", "Classic", "Minimalist", "Luxe", "Everyday", "Signature", "Soft", "Ultra", "Pro", "Essential", "Deluxe", "Compact"];
  const EK = ["", "", "", " Set", " Kit", " 2.0", " Bundle", " Duo", " Max"];
  const FIYAT = { giyim: [15, 90], ayakkabi: [25, 140], taki: [9, 60], guzellik: [10, 55], saglik: [15, 120], ev: [12, 70], mobilya: [60, 600], bahce: [12, 150], elektronik: [15, 140], spor: [12, 110], oyuncak: [8, 60], bebek: [9, 50], evcil: [8, 60], canta: [15, 160], gida: [8, 40], arac: [10, 80], sanat: [8, 60], ofis: [6, 45], alet: [12, 120], kitap: [8, 35], muzik: [20, 300], hediye: [15, 80], "yas-sinirli": [10, 60], endustri: [20, 400], "el-yapimi": [15, 90], dijital: [5, 49] };

  const nisler = taksonomi.kategoriler.flatMap(k => k.nisler.map(n => ({ ...n, kategori: k.id })));
  const simdi = Date.now(), GUN = 864e5;
  const fiyatYuvarla = (v, para) => para === "TRY" ? Math.max(49, Math.round(v / 10) * 10 - 1) : Math.max(4.99, Math.floor(v) + .99);

  const magazalar = [], urunler = [], kullanilan = new Set();
  for (let i = 0; i < 420; i++) {
    const ulke = agirlikli(ULKELER.map(u => [u, u[1]]));
    const [kod, , para, dil] = ulke;
    const nis = sec(nisler);
    let ad, alan;
    do {
      const kelime = sec(nis.anahtar).split(" ").pop().replace(/s$/, "");
      const yapi = r();
      ad = yapi < .4 ? `${buyukHarf(sec(ON))} ${buyukHarf(kelime)}` : yapi < .75 ? `${buyukHarf(sec(ON))} ${buyukHarf(sec(SON))}` : `The ${buyukHarf(kelime)} ${buyukHarf(sec(SON))}`;
      const tld = TLD_ULKE[kod] && r() < .55 ? TLD_ULKE[kod] : agirlikli([[".com", 70], [".co", 10], [".shop", 9], [".store", 7], [".io", 4]]);
      alan = ad.toLowerCase().replace(/^the /, "the").replace(/[^a-z]/g, "") + tld;
    } while (kullanilan.has(alan));
    kullanilan.add(alan);
    const yas = Math.floor(Math.pow(r(), 2.2) * 120);
    const eklenme = new Date(simdi - yas * GUN - Math.floor(r() * GUN)).toISOString();
    const urunSayisi = Math.max(1, Math.round(Math.pow(r(), 1.8) * 46) + 1);
    const m = { id: "m" + i, ad, alan, ulke: kod, dil, para, tld: "." + alan.split(".").slice(1).join("."), kategori: nis.kategori, nis: nis.id, eklenme, urunSayisi };
    magazalar.push(m);

    const [enAz, enCok] = FIYAT[nis.kategori] || [10, 60];
    for (let j = 0; j < urunSayisi; j++) {
      // Mağazaların çoğu tek nişe odaklanır, bir kısmı genel mağazadır.
      const un = r() < .82 ? nis : sec(nisler);
      const usd = enAz + Math.pow(r(), 1.6) * (enCok - enAz);
      const fiyat = fiyatYuvarla(usd * KUR[para], para);
      const indirimli = r() < .42;
      const urunYas = Math.floor(r() * (yas + 1));
      urunler.push({
        id: `u${i}-${j}`, magaza: m.id,
        ad: `${sec(SIFAT)} ${buyukHarf(sec(un.anahtar))}${sec(EK)}`,
        fiyat, eskiFiyat: indirimli ? fiyatYuvarla(fiyat * (1.3 + r() * .9), para) : null,
        para, kategori: un.kategori, nis: un.id, gorsel: null, url: null,
        eklenme: new Date(simdi - urunYas * GUN - Math.floor(r() * GUN)).toISOString()
      });
    }
  }
  return { kaynak: "demo", olusturma: new Date(simdi).toISOString(), magazalar, urunler };
}
