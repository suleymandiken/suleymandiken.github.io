#!/usr/bin/env python3
"""Taranma zamanı gelen mağazaların gerçek ürünlerini Shopify'dan çekip veritabanına yazar.

Her mağaza için:
  /products.json  → ürünler (herkese açık Shopify uç noktası, 250 ürün/sayfa)
  ana sayfa       → dil, para birimi, ülke, myshopify adresi
  /meta.json      → mağaza adı, ülke, para birimi (açıksa)

Durumlar:
  acik    ürünler görünüyor, her gün yeniden taranır (yeni eklenen ve kaldırılan ürünler yakalanır)
  sifreli şifre sayfası açık: mağaza kuruluyor, henüz açılmadı. Her gün bakılır, açıldığı gün yakalanır.
  kapali  art arda hata veriyor ya da Shopify değil; haftada bir bakılır.

Kullanım:
    python3 araclar/tara.py --limit 3000 --sure 240
"""
import argparse
import json
import re
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, unquote

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ortak import Supabase, anahtar, getir, siniflandirici, taksonomi_yukle, tl_kurlari  # noqa: E402

SIMDI = lambda: datetime.now(timezone.utc)  # noqa: E731


def sayi(v):
    try:
        f = float(v)
        return round(f, 2) if f > 0 else None
    except (TypeError, ValueError):
        return None


def vitrin_bilgisi(html):
    """Shopify temalarının sayfaya gömdüğü değişkenlerden mağaza bilgisi çıkarır."""
    b = {}
    if m := re.search(r'Shopify\.shop\s*=\s*"([a-z0-9-]+\.myshopify\.com)"', html):
        b["myshopify"] = m.group(1)
    if m := re.search(r'Shopify\.locale\s*=\s*"([a-zA-Z]{2})', html) or re.search(r'<html[^>]*\blang="([a-zA-Z]{2})', html):
        b["dil"] = m.group(1).lower()
    if m := re.search(r'Shopify\.currency\s*=\s*\{"active":"([A-Z]{3})"', html):
        b["para"] = m.group(1)
    if m := re.search(r'Shopify\.country\s*=\s*"([A-Z]{2})"', html):
        b["ulke"] = m.group(1)
    if m := re.search(r"<title[^>]*>\s*([^<]{1,120}?)\s*</title>", html, re.I):
        b["baslik"] = re.sub(r"\s+", " ", m.group(1)).strip()
    return b


def satis_sirasi(html, handle_id, en_cok=50):
    """"En çok satanlar" sayfasındaki ürün bağlantılarının sırası → shopify_id listesi.
    Shopify bu sıralamayı mağazanın gerçek satışlarına göre kendisi hesaplar."""
    sira, gorulen = [], set()
    for h in re.findall(r'href="(?:https?://[^"/]+)?(?:/[a-z]{2}(?:-[a-zA-Z]{2})?)?(?:/collections/[^"/]+)?/products/([^"?#/]+)', html):
        h = unquote(h).lower()
        if h in handle_id and h not in gorulen:
            gorulen.add(h)
            sira.append(handle_id[h])
            if len(sira) >= en_cok:
                break
    return sira


def gorsel_kucult(src):
    if not src:
        return None
    if "cdn.shopify.com" in src or "/cdn/shop/" in src:
        return src + ("&" if "?" in src else "?") + "width=500"
    return src


def urun_satiri(u, magaza_id, para, kurlar, siniflandir, simdi):
    varyantlar = u.get("variants") or [{}]
    # En ucuz varyant mağazanın vitrinde gösterdiği "başlayan fiyat"tır.
    v = min(varyantlar, key=lambda x: sayi(x.get("price")) or float("inf"))
    fiyat = sayi(v.get("price"))
    etiketler = u.get("tags") or []
    if isinstance(etiketler, str):
        etiketler = [t.strip() for t in etiketler.split(",")]
    tip = (u.get("product_type") or "").strip()
    nis, kat = siniflandir(" ".join([u.get("title") or "", tip, " ".join(etiketler)]))
    gorseller = u.get("images") or []
    return {
        "magaza_id": magaza_id,
        "shopify_id": int(u["id"]),
        "ad": (u.get("title") or "").strip()[:200] or "(adsız)",
        "handle": (u.get("handle") or "")[:200],
        "urun_tipi": tip[:100] or None,
        "etiketler": ", ".join(etiketler)[:300] or None,
        "fiyat": fiyat,
        "eski_fiyat": sayi(v.get("compare_at_price")),
        "para": para,
        "fiyat_tl": round(fiyat * kurlar.get(para, kurlar["USD"]), 2) if fiyat else None,
        "kategori": kat,
        "nis": nis,
        "gorsel": gorsel_kucult(gorseller[0].get("src") if gorseller else None),
        "anahtar": anahtar(u.get("title")),
        "yayin": u.get("published_at") or u.get("created_at"),
        "son_gorulme": simdi,
    }


def magaza_isle(m, siniflandir, kurlar, en_cok_sayfa):
    """Ağ işlerini yapar, veritabanına yazılacakları döndürür. Veritabanına dokunmaz."""
    alan, taban, simdi = m["alan"], "https://" + m["alan"], SIMDI()
    ham, sifreli, hata, siralar = [], False, None, None
    for sayfa in range(1, en_cok_sayfa + 1):
        try:
            y = getir(f"{taban}/products.json?limit=250&page={sayfa}")
            if y.durum == 429:
                time.sleep(20)
                y = getir(f"{taban}/products.json?limit=250&page={sayfa}")
        except Exception as e:
            hata = type(e).__name__
            break
        if "/password" in y.url or y.durum == 401:
            sifreli = True
            break
        if y.durum != 200:
            hata = f"HTTP {y.durum}"
            break
        try:
            urunler = y.json().get("products")
        except (ValueError, AttributeError):
            urunler = None
        if not isinstance(urunler, list):
            hata = "products.json yok"
            break
        ham.extend(urunler)
        if len(urunler) < 250:
            break
        time.sleep(1)

    bilgi = {}
    if not m.get("myshopify") or m.get("durum") in ("yeni", "sifreli") or sifreli or ham:
        try:
            ana = getir(taban + "/", zaman_asimi=20)
            bilgi = vitrin_bilgisi(ana.metin()) if ana.durum in (200, 401) else {}
            if "/password" in ana.url:
                sifreli = True
        except Exception:
            pass
        if ham:
            try:
                meta = getir(taban + "/meta.json", zaman_asimi=15)
                if meta.durum == 200:
                    mj = meta.json()
                    bilgi.setdefault("ad", (mj.get("name") or "").strip()[:100] or None)
                    if mj.get("currency"):
                        bilgi.setdefault("para", mj["currency"])
                    if mj.get("country"):
                        bilgi["ulke"] = str(mj["country"]).upper()[:2]
                    if mj.get("myshopify_domain"):
                        bilgi.setdefault("myshopify", mj["myshopify_domain"])
            except Exception:
                pass

    g = {"son_tarama": simdi.isoformat()}
    for k in ("myshopify", "dil", "para", "ulke"):
        if bilgi.get(k):
            g[k] = bilgi[k]
    # Şifre sayfasının başlığı ("Opening soon" vb.) mağaza adı değildir.
    if bilgi.get("baslik") and re.search(r"opening soon|coming soon|password|enter (the )?store|launching soon", bilgi["baslik"], re.I):
        bilgi.pop("baslik")
    if bilgi.get("ad") or (not m.get("ad") and bilgi.get("baslik")):
        g["ad"] = bilgi.get("ad") or bilgi["baslik"][:100]

    satirlar = []
    if ham:
        para = g.get("para") or m.get("para") or "USD"
        satirlar = [urun_satiri(u, m["id"], para, kurlar, siniflandir, simdi.isoformat()) for u in ham if u.get("id")]
        nisler = Counter(s["nis"] for s in satirlar if s["nis"] != "diger")
        if nisler:
            g["nis"] = nisler.most_common(1)[0][0]
            g["kategori"] = next(s["kategori"] for s in satirlar if s["nis"] == g["nis"])
        g.update(durum="acik", urun_sayisi=len(satirlar), hata_sayisi=0, sonraki_tarama=(simdi + timedelta(hours=10)).isoformat())
        if not m.get("acilis"):
            g["acilis"] = simdi.isoformat()
        # Satış sinyali: mağazanın "en çok satanlar" sıralaması. Okunamazsa None; eski sıralama silinmez.
        handle_id = {(u.get("handle") or "").lower(): int(u["id"]) for u in ham if u.get("id") and u.get("handle")}
        try:
            y = getir(f"{taban}/collections/all?sort_by=best-selling", zaman_asimi=20)
            if y.durum == 200:
                liste = satis_sirasi(y.metin(), handle_id)
                if len(liste) >= 2 or len(handle_id) == 1:
                    siralar = [{"shopify_id": sid, "sira": i + 1} for i, sid in enumerate(liste)]
        except Exception:
            pass
    elif sifreli:
        yas = (simdi - datetime.fromisoformat(m["ilk_gorulme"].replace("Z", "+00:00"))).days if m.get("ilk_gorulme") else 0
        g.update(durum="sifreli", hata_sayisi=0, sonraki_tarama=(simdi + timedelta(hours=10 if yas < 30 else 72)).isoformat())
    elif bilgi.get("myshopify") and hata == "HTTP 404":
        # Mağaza açık ama ürün listesini kapatmış; elimizdeki bilgiyle tutarız.
        g.update(durum="acik", hata_sayisi=0, sonraki_tarama=(simdi + timedelta(days=3)).isoformat())
    else:
        h = (m.get("hata_sayisi") or 0) + 1
        g.update(hata_sayisi=h, durum="kapali" if h >= 5 or (m.get("durum") == "yeni" and h >= 3) else m.get("durum") or "yeni",
                 sonraki_tarama=(simdi + timedelta(days=7 if h >= 5 else 2 ** min(h - 1, 3))).isoformat())
    return m, g, satirlar, siralar


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--limit", type=int, default=3000, help="bu çalışmada en çok kaç mağaza taransın")
    ap.add_argument("--sayfa", type=int, default=4, help="mağaza başına en çok kaç sayfa (250 ürün/sayfa)")
    ap.add_argument("--is", dest="isci", type=int, default=16, help="aynı anda taranan mağaza sayısı")
    ap.add_argument("--sure", type=int, default=240, help="dakika cinsinden süre sınırı")
    a = ap.parse_args()

    sb = Supabase()
    siniflandir = siniflandirici(taksonomi_yukle())
    kurlar = tl_kurlari()
    bitis = time.time() + a.sure * 60
    zaman = quote(SIMDI().isoformat())
    alanlar = "select=id,alan,ad,durum,para,myshopify,acilis,hata_sayisi,ilk_gorulme"
    # Türkiye'ye satan mağazalar (ülke, para, dil ya da .tr uzantısı) her çalışmada sıranın başına alınır.
    oncelikli = sb.sec_hepsi("magazalar", f"{alanlar}&sonraki_tarama=lte.{zaman}"
                                          f"&or=(ulke.eq.TR,para.eq.TRY,dil.eq.tr,tld.like.*.tr)&order=sonraki_tarama.asc,id.asc", a.limit)
    digerleri = sb.sec_hepsi("magazalar", f"{alanlar}&sonraki_tarama=lte.{zaman}&order=sonraki_tarama.asc,id.asc", a.limit)
    gorulen = {m["id"] for m in oncelikli}
    sirada = (oncelikli + [m for m in digerleri if m["id"] not in gorulen])[:a.limit]
    print(f"Türkiye öncelikli: {len(oncelikli)}")
    print(f"Taranacak mağaza: {len(sirada)}")

    sayac, urun_toplam = Counter(), 0
    with ThreadPoolExecutor(a.isci) as havuz:
        isler = {havuz.submit(magaza_isle, m, siniflandir, kurlar, a.sayfa): m for m in sirada}
        for is_ in as_completed(isler):
            if time.time() > bitis:
                print("Süre doldu, kalan mağazalar bir sonraki çalışmaya kaldı.")
                havuz.shutdown(wait=False, cancel_futures=True)
                break
            try:
                m, g, satirlar, siralar = is_.result()
                if satirlar:
                    sb.ekle("urunler", satirlar, "magaza_id,shopify_id")
                    urun_toplam += len(satirlar)
                sb.guncelle("magazalar", f"id=eq.{m['id']}", g)
                if siralar is not None:
                    sayac["satis_olayi"] += sb.rpc("satis_sira_yaz", {"veri": {"magaza_id": m["id"], "siralar": siralar}}) or 0
                sayac[g.get("durum", "?")] += 1
            except Exception as e:
                sayac["yazma_hatasi"] += 1
                print(f"  yazma hatası: {str(e)[:200]}", file=sys.stderr)

    # Trendler görsel eşleştirmeden sonra gorsel.py içinde hesaplanır.
    print("Sonuç:", json.dumps(dict(sayac), ensure_ascii=False), f"· {urun_toplam} ürün yazıldı")


if __name__ == "__main__":
    main()
