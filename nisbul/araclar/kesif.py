#!/usr/bin/env python3
"""Yeni açılan Shopify mağazalarını bulur ve veritabanına "yeni" olarak ekler.

Yöntem: whoisds.com her gün bir önceki gün kaydedilen alan adlarının ücretsiz listesini yayınlar
(.com, .shop, .store gibi genel uzantılar, günde ~70-150 bin alan adı). Her alan adının DNS kaydına
bakılır; Shopify'a bağlanan mağazalar 23.227.38.x IP'sine ya da shops.myshopify.com'a yönlenir.
Alan adı yeni alınmış + Shopify'a bağlanmış = yeni kurulan mağaza.

Alan adları bağlanmadan önce birkaç gün bekleyebildiği için son birkaç günün listesi tekrar taranır.

Kullanım:
    python3 araclar/kesif.py                 # son 3 günün listesi
    python3 araclar/kesif.py --gun 5
    python3 araclar/kesif.py --dosya alanlar.txt   # elle alan adı listesi ekle (DNS kontrolü yapılır)
"""
import argparse
import base64
import io
import socket
import sys
import time
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ortak import Supabase, alan_temizle, getir, tld_bul  # noqa: E402

SHOPIFY_AG = "23.227.38."


def nrd_indir(gun):
    """Belirtilen günün yeni kayıtlı alan adı listesini indirir. Bulamazsa boş liste döner."""
    ad = f"{gun.isoformat()}.zip"
    for parca in (base64.b64encode(ad.encode()).decode(), ad):
        try:
            y = getir(f"https://www.whoisds.com/whois-database/newly-registered-domains/{parca}/nrd", zaman_asimi=120)
        except Exception as e:
            print(f"  {gun}: indirilemedi ({type(e).__name__})", file=sys.stderr)
            continue
        if y.durum == 200 and y.govde[:2] == b"PK":
            with zipfile.ZipFile(io.BytesIO(y.govde)) as z:
                metin = z.read(z.namelist()[0]).decode("utf-8", "replace")
            return [a for a in (alan_temizle(s) for s in metin.splitlines()) if a]
    print(f"  {gun}: liste bulunamadı (henüz yayınlanmamış ya da adres değişmiş olabilir)", file=sys.stderr)
    return []


def shopify_mi(alan):
    """Kök alan ya da www alt alanı Shopify'a yönleniyorsa True."""
    for host in (alan, "www." + alan):
        try:
            ad, takma, ipler = socket.gethostbyname_ex(host)
        except (socket.gaierror, socket.herror, UnicodeError, OSError):
            continue
        if any(ip.startswith(SHOPIFY_AG) for ip in ipler) or any("myshopify.com" in h for h in [ad, *takma]):
            return True
    return False


def tara(alanlar, is_parcacigi):
    bulunan, baslangic = [], time.time()
    with ThreadPoolExecutor(is_parcacigi) as havuz:
        for i, (alan, evet) in enumerate(zip(alanlar, havuz.map(shopify_mi, alanlar, chunksize=64)), 1):
            if evet:
                bulunan.append(alan)
            if i % 20000 == 0:
                print(f"  {i}/{len(alanlar)} kontrol edildi, {len(bulunan)} Shopify ({time.time() - baslangic:.0f} sn)")
    return bulunan


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--gun", type=int, default=3, help="kaç günlük yeni alan adı listesi taransın")
    ap.add_argument("--dosya", help="her satırda bir alan adı olan dosya (NRD yerine)")
    ap.add_argument("--is", dest="isci", type=int, default=128, help="eş zamanlı DNS sorgusu")
    ap.add_argument("--kuru", action="store_true", help="veritabanına yazma, sadece say")
    a = ap.parse_args()
    socket.setdefaulttimeout(5)
    sb = None if a.kuru else Supabase()

    if a.dosya:
        kaynak = {"elle": sorted({x for x in (alan_temizle(s) for s in Path(a.dosya).read_text(encoding="utf-8").splitlines()) if x})}
    else:
        bugun = date.today()
        kaynak = {}
        for g in range(1, a.gun + 1):
            gun = bugun - timedelta(days=g)
            liste = nrd_indir(gun)
            print(f"{gun}: {len(liste)} yeni alan adı")
            if liste:
                kaynak[gun.isoformat()] = liste

    toplam_yeni = 0
    for etiket, alanlar in kaynak.items():
        bulunan = tara(alanlar, a.isci)
        print(f"{etiket}: {len(alanlar)} alan adından {len(bulunan)} tanesi Shopify'a bağlı")
        if sb and bulunan:
            satirlar = [{"alan": x, "tld": tld_bul(x), "kaynak": "elle" if etiket == "elle" else "nrd",
                         "alan_kayit": None if etiket == "elle" else etiket} for x in bulunan]
            sb.ekle("magazalar", satirlar, "alan", birlestir=False)
        toplam_yeni += len(bulunan)
    # Mağaza adlarını herkese açık Actions kayıtlarına yazmıyoruz; veri senin rekabet avantajın.
    print(f"Toplam {toplam_yeni} Shopify mağazası işlendi (zaten kayıtlı olanlar atlandı).")


if __name__ == "__main__":
    main()
