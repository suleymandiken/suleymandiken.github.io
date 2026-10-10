// Ürünler. Fotoğraf eklemek için "img" alanına yol yaz, örn. img: "img/ceket.jpg"
const C = {
  siyah: { name: "Siyah", hex: "#000000" },
  gri: { name: "Gri", hex: "#6b6b6b" },
  acik: { name: "Açık gri", hex: "#bdbdbd" }
};
const WEAR = ["S", "M", "L", "XL"];
window.PRODUCTS = [
  { id: "denim-ceket", name: "Yıkama denim ceket", cat: "erkek", price: 1890, isNew: true, kind: "CEKET", sizes: WEAR, colors: [C.siyah, C.gri, C.acik], desc: "Rahat kesim, yıkamalı denim kumaş. İki göğüs cebi ve düğmeli kapanış.", rating: 4.5, reviews: 124 },
  { id: "oversize-blazer", name: "Oversize blazer", cat: "kadin", price: 2490, isNew: true, kind: "BLAZER", sizes: WEAR, colors: [C.siyah, C.gri], desc: "Bol omuzlu, astarlı blazer. Tişörtün de gömleğin de üstüne giyilir.", rating: 4.7, reviews: 86 },
  { id: "basic-tisort", name: "Basic tişört", cat: "erkek", price: 590, isNew: true, kind: "TİŞÖRT", sizes: WEAR, colors: [C.siyah, C.gri, C.acik], desc: "Ağır pamuklu, düz kesim. Yıkandıkça formunu korur.", rating: 4.3, reviews: 212 },
  { id: "kalin-taban-bot", name: "Kalın tabanlı bot", cat: "aksesuar", price: 3190, isNew: false, kind: "BOT", sizes: ["38", "40", "42", "44"], colors: [C.siyah], desc: "Yüksek bilekli, tırtıklı kalın taban. Su itici yüzey.", rating: 4.6, reviews: 58 },
  { id: "grafik-kapusonlu", name: "Grafik kapüşonlu", cat: "erkek", price: 1290, isNew: false, kind: "SWEAT", sizes: WEAR, colors: [C.siyah, C.gri], desc: "İçi tüylü, sırtı baskılı kapüşonlu sweatshirt.", rating: 4.4, reviews: 97 },
  { id: "oversize-tisort", name: "Oversize tişört", cat: "kadin", price: 690, isNew: true, kind: "TİŞÖRT", sizes: WEAR, colors: [C.siyah, C.acik], desc: "Düşük omuzlu, bol kesim. Beline kadar uzanır.", rating: 4.2, reviews: 143 },
  { id: "cargo-denim", name: "Cargo denim", cat: "kadin", price: 1490, isNew: false, kind: "PANTOLON", sizes: WEAR, colors: [C.siyah, C.gri], desc: "Geniş paça, yanlarda büyük kargo ceplar.", rating: 4.5, reviews: 71 },
  { id: "rahat-gomlek", name: "Rahat kesim gömlek", cat: "erkek", price: 1190, isNew: false, kind: "GÖMLEK", sizes: WEAR, colors: [C.siyah, C.acik], desc: "Bol kesim, kısa yaka. Düğmesiz giyilebilir.", rating: 4.1, reviews: 39 },
  { id: "minimal-sapka", name: "Minimal şapka", cat: "aksesuar", price: 390, isNew: false, kind: "ŞAPKA", sizes: ["Tek ebat"], colors: [C.siyah, C.gri], desc: "Ayarlanabilir kayışlı, logosuz düz şapka.", rating: 4.0, reviews: 64 },
  { id: "capraz-canta", name: "Çapraz çanta", cat: "aksesuar", price: 890, isNew: true, kind: "ÇANTA", sizes: ["Tek ebat"], colors: [C.siyah], desc: "Ayarlanabilir askılı, iki bölmeli, fermuarlı.", rating: 4.6, reviews: 52 },
  { id: "parca-yelek", name: "Cepli yelek", cat: "kadin", price: 1390, isNew: false, kind: "YELEK", sizes: WEAR, colors: [C.siyah, C.gri], desc: "Çok cepli, fermuarlı hafif yelek.", rating: 4.4, reviews: 33 },
  { id: "deri-kemer", name: "Deri kemer", cat: "aksesuar", price: 490, isNew: false, kind: "KEMER", sizes: ["Tek ebat"], colors: [C.siyah], desc: "Geniş, mat metal tokalı kemer.", rating: 4.3, reviews: 28 }
];
