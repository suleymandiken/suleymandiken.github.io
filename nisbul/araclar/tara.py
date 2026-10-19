#!/usr/bin/env python3
"""Shopify mağazalarını tarayıp Nişbul'un okuyacağı data.json dosyasını üretir.

Kullanım:
    python3 araclar/tara.py magazalar.txt            # nisbul/data.json yazar
    python3 araclar/tara.py magazalar.txt -o data.json --sayfa 4 --bekle 1.5

magazalar.txt: her satırda bir alan adı (ör. ornekmagaza.com). # ile başlayan satırlar atlanır.

Sadece herkese açık uç noktaları okur: /products.json, /meta.json ve ana sayfa.
Bazı mağazalar /products.json'u kapatır ya da hız sınırı koyar; onlar atlanır.
Yalnızca Python standart kütüphanesi gerekir.
"""
import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

KLASOR = Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (compatible; NisbulTarayici/1.0)"


def getir(url, json_mu=True, zaman_asimi=20):
    istek = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json" if json_mu else "text/html"})
    with urllib.request.urlopen(istek, timeout=zaman_asimi) as yanit:
        govde = yanit.read()
    return json.loads(govde) if json_mu else govde.decode("utf-8", "replace")


def siniflandirici(taksonomi):
    """Anahtar kelimeleri regex'e çevirir; en çok eşleşen niş kazanır."""
    kurallar = []
    for kat in taksonomi["kategoriler"]:
        for nis in kat["nisler"]:
            for kelime in nis["anahtar"]:
                kurallar.append((re.compile(r"\b" + re.escape(kelime.lower()) + r"s?\b"), nis["id"], kat["id"], len(kelime)))

    def siniflandir(metin):
        metin = metin.lower()
        puan = Counter()
        kategori = {}
        for desen, nis, kat, uzunluk in kurallar:
            if desen.search(metin):
                puan[nis] += uzunluk  # uzun ifade (ör. "water bottle") tek kelimeden daha güvenilir
                kategori[nis] = kat
        if not puan:
            return "diger", "diger"
        nis = puan.most_common(1)[0][0]
        return nis, kategori[nis]

    return siniflandir


def fiyat(v):
    try:
        f = float(v)
        return f if f > 0 else None
    except (TypeError, ValueError):
        return None


def magaza_tara(alan, mid, siniflandir, en_cok_sayfa, bekle):
    taban = "https://" + alan
    meta = {}
    try:
        meta = getir(taban + "/meta.json")
    except Exception:
        pass  # meta.json her mağazada açık değil; ad ve para birimini başka yerden tahmin ederiz

    dil = "en"
    try:
        html = getir(taban + "/", json_mu=False)
        m = re.search(r'<html[^>]*\blang="([a-zA-Z]{2})', html)
        if m:
            dil = m.group(1).lower()
        if not meta.get("currency"):
            m = re.search(r'Shopify\.currency\s*=\s*\{"active":"([A-Z]{3})"', html)
            if m:
                meta["currency"] = m.group(1)
    except Exception:
        pass

    ham = []
    for sayfa in range(1, en_cok_sayfa + 1):
        veri = getir(f"{taban}/products.json?limit=250&page={sayfa}")
        urunler = veri.get("products", [])
        ham.extend(urunler)
        if len(urunler) < 250:
            break
        time.sleep(bekle)
    if not ham:
        return None, []

    para = meta.get("currency") or "USD"
    urunler = []
    for u in ham:
        varyant = (u.get("variants") or [{}])[0]
        etiketler = u.get("tags") or []
        if isinstance(etiketler, str):
            etiketler = etiketler.split(",")
        nis, kat = siniflandir(" ".join([u.get("title", ""), u.get("product_type", ""), " ".join(etiketler)]))
        gorseller = u.get("images") or []
        urunler.append({
            "id": f"{mid}-{u.get('id')}",
            "magaza": mid,
            "ad": (u.get("title") or "").strip()[:160],
            "fiyat": fiyat(varyant.get("price")) or 0,
            "eskiFiyat": fiyat(varyant.get("compare_at_price")),
            "para": para,
            "kategori": kat,
            "nis": nis,
            "gorsel": gorseller[0].get("src") if gorseller else None,
            "url": f"{taban}/products/{u.get('handle')}",
            "eklenme": u.get("published_at") or u.get("created_at") or datetime.now(timezone.utc).isoformat(),
        })

    # Mağazanın nişi: ürünlerinin en sık nişi. Açılış tarihi için en eski ürünü kullanırız.
    nis_sayim = Counter(u["nis"] for u in urunler if u["nis"] != "diger")
    nis = nis_sayim.most_common(1)[0][0] if nis_sayim else "diger"
    kat = next((u["kategori"] for u in urunler if u["nis"] == nis), "diger")
    parcalar = alan.split(".")
    tld = "." + ".".join(parcalar[-2:]) if len(parcalar) > 2 and parcalar[-2] in ("com", "co", "org", "net") else "." + parcalar[-1]
    magaza = {
        "id": mid,
        "ad": (meta.get("name") or parcalar[0]).strip()[:80],
        "alan": alan,
        "ulke": (meta.get("country") or "").upper()[:2] or "US",
        "dil": dil,
        "para": para,
        "tld": tld,
        "kategori": kat,
        "nis": nis,
        "eklenme": min(u["eklenme"] for u in urunler),
        "urunSayisi": len(urunler),
    }
    return magaza, urunler


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("liste", help="alan adlarının olduğu metin dosyası")
    ap.add_argument("-o", "--cikti", default=str(KLASOR / "data.json"))
    ap.add_argument("--taksonomi", default=str(KLASOR / "taksonomi.json"))
    ap.add_argument("--sayfa", type=int, default=4, help="mağaza başına en çok kaç sayfa (250 ürün/sayfa)")
    ap.add_argument("--bekle", type=float, default=1.0, help="istekler arası bekleme, saniye")
    a = ap.parse_args()

    siniflandir = siniflandirici(json.loads(Path(a.taksonomi).read_text(encoding="utf-8")))
    alanlar = []
    for satir in Path(a.liste).read_text(encoding="utf-8").splitlines():
        satir = re.sub(r"^https?://", "", satir.strip()).split("/")[0].lower()
        if satir and not satir.startswith("#") and satir not in alanlar:
            alanlar.append(satir)

    magazalar, urunler = [], []
    for i, alan in enumerate(alanlar):
        try:
            m, u = magaza_tara(alan, f"m{i}", siniflandir, a.sayfa, a.bekle)
        except urllib.error.HTTPError as e:
            print(f"✗ {alan}: HTTP {e.code}", file=sys.stderr)
            continue
        except Exception as e:
            print(f"✗ {alan}: {e}", file=sys.stderr)
            continue
        if not m:
            print(f"✗ {alan}: ürün yok", file=sys.stderr)
            continue
        magazalar.append(m)
        urunler.extend(u)
        print(f"✓ {alan}: {len(u)} ürün, niş: {m['nis']}")
        time.sleep(a.bekle)

    cikti = {"kaynak": "tarama", "olusturma": datetime.now(timezone.utc).isoformat(), "magazalar": magazalar, "urunler": urunler}
    Path(a.cikti).write_text(json.dumps(cikti, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"\n{len(magazalar)} mağaza, {len(urunler)} ürün → {a.cikti}")


if __name__ == "__main__":
    main()
