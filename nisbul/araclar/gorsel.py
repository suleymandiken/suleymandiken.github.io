#!/usr/bin/env python3
"""Ürün görsellerinin parmak izini (dHash) çıkarır, ardından trend tablosunu yeniler.

Dropshipping mağazaları çoğu zaman aynı tedarikçi görselini kullanır ama ürün adını değiştirir.
Görseli 9x8 gri tonlamaya küçültüp komşu pikselleri karşılaştırarak 64 bitlik bir iz çıkarılır;
yeniden boyutlandırma ve sıkıştırma izi değiştirmez. Aynı izi taşıyan ürünler aynı ürün sayılır.

Gerekli paket: Pillow (pip install pillow)

Kullanım:
    python3 araclar/gorsel.py --limit 30000 --sure 60
"""
import argparse
import io
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ortak import Supabase, getir  # noqa: E402

try:
    from PIL import Image
except ImportError:
    raise SystemExit("Pillow gerekli: pip install pillow")

HATALI = "-"


def dhash(veri):
    im = Image.open(io.BytesIO(veri))
    im.draft("L", (64, 64))  # JPEG'i küçük çözerek hız kazan
    im = im.convert("L").resize((9, 8), Image.LANCZOS)
    px = list(im.getdata())
    bitler = 0
    for r in range(8):
        for c in range(8):
            bitler = (bitler << 1) | (px[r * 9 + c] > px[r * 9 + c + 1])
    # Neredeyse düz görseller (boş arka plan, yer tutucu) her şeyle eşleşir; onları dışarıda bırak.
    if not 6 <= bin(bitler).count("1") <= 58:
        return HATALI
    return f"{bitler:016x}"


def kucuk_adres(src):
    # Parmak izi için 200 piksel yeter; Shopify CDN width parametresini destekler.
    if "width=" in src:
        return re.sub(r"width=\d+", "width=200", src)
    return src


def isle(satir):
    try:
        y = getir(kucuk_adres(satir["gorsel"]), zaman_asimi=15, basliklar={"Accept": "image/jpeg,image/png,image/webp;q=0.8"})
        if y.durum != 200 or not y.govde:
            return {"id": satir["id"], "h": HATALI}
        return {"id": satir["id"], "h": dhash(y.govde)}
    except Exception:
        return {"id": satir["id"], "h": HATALI}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=30000, help="bu çalışmada en çok kaç görsel")
    ap.add_argument("--is", dest="isci", type=int, default=32)
    ap.add_argument("--sure", type=int, default=60, help="dakika cinsinden süre sınırı")
    a = ap.parse_args()

    sb = Supabase()
    bitis, toplam, eslesen = time.time() + a.sure * 60, 0, 0
    with ThreadPoolExecutor(a.isci) as havuz:
        while toplam < a.limit and time.time() < bitis:
            # En yeni ürünler önce: trendler yeni ürünlerden çıkar.
            parti = sb.sec("urunler", f"select=id,gorsel&gorsel_hash=is.null&gorsel=not.is.null&order=ilk_gorulme.desc&limit={min(1000, a.limit - toplam)}") or []
            if not parti:
                break
            sonuclar = list(havuz.map(isle, parti))
            sb.rpc("gorsel_hash_yaz", {"veri": sonuclar})
            toplam += len(sonuclar)
            eslesen += sum(1 for s in sonuclar if s["h"] != HATALI)
            print(f"  {toplam} görsel işlendi ({eslesen} parmak izi)")
    print(f"Görsel: {toplam} işlendi, {eslesen} parmak izi çıkarıldı.")
    try:
        print(f"Trend tablosu güncellendi: {sb.rpc('trend_guncelle')} ürün grubu en az 2 mağazada")
    except Exception as e:
        print(f"Trend güncellenemedi: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
