"""Keşif ve tarama betiklerinin ortak parçaları. Sadece Python standart kütüphanesi kullanır."""
import json
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

KLASOR = Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (compatible; NisbulBot/1.0; +https://github.com/suleymandiken)"


# ---------- HTTP ----------
class Yanit:
    def __init__(self, durum, url, govde):
        self.durum, self.url, self.govde = durum, url, govde

    def json(self):
        return json.loads(self.govde)

    def metin(self):
        return self.govde.decode("utf-8", "replace")


def getir(url, zaman_asimi=20, basliklar=None):
    """Yönlendirmeleri izler. HTTP hatalarında istisna atmaz, durumu döndürür."""
    istek = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json, text/html;q=0.9", **(basliklar or {})})
    try:
        with urllib.request.urlopen(istek, timeout=zaman_asimi) as y:
            return Yanit(y.status, y.geturl(), y.read(8_000_000))
    except urllib.error.HTTPError as e:
        return Yanit(e.code, e.geturl() or url, e.read(200_000) if e.fp else b"")


# ---------- Supabase REST (service_role anahtarıyla, RLS'i atlar) ----------
class Supabase:
    def __init__(self, url=None, anahtar=None):
        self.url = (url or os.environ.get("SUPABASE_URL", "")).rstrip("/")
        self.anahtar = anahtar or os.environ.get("SUPABASE_SERVICE_KEY", "")
        if not self.url or not self.anahtar:
            raise SystemExit("SUPABASE_URL ve SUPABASE_SERVICE_KEY ortam değişkenleri gerekli.")

    def istek(self, yontem, yol, veri=None, tercih=None, deneme=3):
        basliklar = {"apikey": self.anahtar, "Content-Type": "application/json"}
        # Eski (JWT) service_role anahtarı Authorization başlığında da gider; yeni sb_secret_ anahtarları JWT değildir,
        # Supabase onları sadece apikey başlığından tanır.
        if not self.anahtar.startswith("sb_"):
            basliklar["Authorization"] = "Bearer " + self.anahtar
        if tercih:
            basliklar["Prefer"] = tercih
        govde = json.dumps(veri, ensure_ascii=False, default=str).encode() if veri is not None else None
        for i in range(deneme):
            istek = urllib.request.Request(f"{self.url}/rest/v1/{yol}", data=govde, method=yontem, headers=basliklar)
            try:
                with urllib.request.urlopen(istek, timeout=60) as y:
                    icerik = y.read()
                    return json.loads(icerik) if icerik else None
            except urllib.error.HTTPError as e:
                hata = e.read().decode("utf-8", "replace")[:500]
                if e.code < 500 or i == deneme - 1:
                    raise RuntimeError(f"Supabase {yontem} {yol.split('?')[0]}: HTTP {e.code} {hata}") from None
            except (urllib.error.URLError, TimeoutError) as e:
                if i == deneme - 1:
                    raise RuntimeError(f"Supabase bağlantı hatası: {e}") from None
            time.sleep(2 ** i)

    def ekle(self, tablo, satirlar, cakisma, birlestir=True):
        """Toplu upsert. birlestir=False ise var olan satırlara dokunmaz."""
        for i in range(0, len(satirlar), 500):
            self.istek("POST", f"{tablo}?on_conflict={cakisma}", satirlar[i:i + 500],
                       tercih=("resolution=merge-duplicates" if birlestir else "resolution=ignore-duplicates") + ",return=minimal")

    def guncelle(self, tablo, filtre, veri):
        self.istek("PATCH", f"{tablo}?{filtre}", veri, tercih="return=minimal")

    def sec(self, tablo, sorgu):
        return self.istek("GET", f"{tablo}?{sorgu}")

    def sec_hepsi(self, tablo, sorgu, limit, sayfa=1000):
        """Supabase tek istekte en fazla 1000 satır döndürür; limit'e kadar sayfa sayfa okur.
        Sorgu kararlı bir sıralama (order=...) içermelidir."""
        satirlar = []
        while len(satirlar) < limit:
            istenen = min(sayfa, limit - len(satirlar))
            parca = self.sec(tablo, f"{sorgu}&limit={istenen}&offset={len(satirlar)}") or []
            satirlar.extend(parca)
            if len(parca) < istenen:
                break
        return satirlar

    def rpc(self, ad, veri=None):
        return self.istek("POST", f"rpc/{ad}", veri or {})


# ---------- Sınıflandırma ----------
def taksonomi_yukle(yol=None):
    return json.loads(Path(yol or KLASOR / "taksonomi.json").read_text(encoding="utf-8"))


def siniflandirici(taksonomi):
    """Anahtar kelimeleri regex'e çevirir; en yüksek puanı alan niş kazanır."""
    kurallar = []
    for kat in taksonomi["kategoriler"]:
        for nis in kat["nisler"]:
            for kelime in nis["anahtar"]:
                kurallar.append((re.compile(r"\b" + re.escape(kelime.lower()) + r"(?:e?s)?\b"), nis["id"], kat["id"], len(kelime)))

    def siniflandir(metin):
        metin = metin.lower()
        puan, kategori = Counter(), {}
        for desen, nis, kat, uzunluk in kurallar:
            if desen.search(metin):
                puan[nis] += uzunluk  # uzun ifade (ör. "water bottle") tek kelimeden daha güvenilir
                kategori[nis] = kat
        if not puan:
            return "diger", "diger"
        nis = puan.most_common(1)[0][0]
        return nis, kategori[nis]

    return siniflandir


# Aynı ürünü farklı mağazalarda eşleştirmek için başlıktan atılan kelimeler.
GURULTU = set("""
the a an and or of for with in on to by from new hot sale free shipping best top quality high premium
original official authentic genuine luxury 2022 2023 2024 2025 2026 2027 pcs pc piece pieces pack lot
black white red blue green pink gray grey yellow purple orange brown beige gold silver rose navy khaki
small medium large xl xxl xs size one gift ideal perfect amazing upgraded upgrade version edition style
""".split())


def anahtar(baslik):
    """Başlığı sıralanmış anlamlı kelimelere indirger: 'Portable Mini Blender - Pink' → 'blender mini portable'."""
    metin = re.sub(r"[\(\[\{].*?[\)\]\}]", " ", (baslik or "").lower())
    kelimeler = {k for k in re.findall(r"[a-zçğıöşüäöüßéèàñ]+", metin) if len(k) > 2 and k not in GURULTU}
    if len(kelimeler) < 2:
        return None
    return " ".join(sorted(kelimeler)[:8])


# ---------- Döviz ----------
YEDEK_KUR = {"TRY": 1, "USD": 41, "EUR": 44.6, "GBP": 51.9, "CAD": 29.9, "AUD": 27, "BRL": 7.6, "SEK": 3.87, "AED": 11.2,
             "CHF": 51, "NZD": 24.5, "MXN": 2.2, "INR": .48, "JPY": .27, "PLN": 10.4, "DKK": 6, "NOK": 3.9, "SGD": 31.6, "ZAR": 2.3}


def tl_kurlari():
    """1 birim yabancı paranın kaç TL ettiği. Çevrimiçi kaynak yoksa yedek tabloya döner."""
    try:
        r = getir("https://open.er-api.com/v6/latest/TRY", zaman_asimi=15).json()
        if r.get("result") == "success":
            return {k: 1 / v for k, v in r["rates"].items() if v}
    except Exception:
        pass
    return dict(YEDEK_KUR)


def tld_bul(alan):
    parcalar = alan.split(".")
    if len(parcalar) > 2 and parcalar[-2] in ("com", "co", "org", "net", "gov", "edu"):
        return "." + ".".join(parcalar[-2:])
    return "." + parcalar[-1]


def alan_temizle(satir):
    satir = re.sub(r"^https?://", "", satir.strip().lower()).split("/")[0].split("?")[0]
    satir = satir.removeprefix("www.")
    return satir if re.fullmatch(r"[a-z0-9.-]+\.[a-z]{2,}", satir) else None
