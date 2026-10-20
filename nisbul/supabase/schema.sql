-- Nişbul veritabanı şeması.
-- Supabase panelinde SQL Editor'a yapıştırıp bir kez çalıştır. Tekrar çalıştırmak güvenlidir.
--
-- Erişim kuralı: veriyi sadece üyeliği süren kullanıcılar ve yöneticiler görür.
-- Üyelik süresini sadece yöneticiler değiştirebilir. Tarayıcı (GitHub Actions) service_role
-- anahtarıyla yazar; bu anahtar RLS'i atlar ve asla tarayıcıya/siteye konmaz.

create extension if not exists pg_trgm;

-- ============ Üyelik ============
create table if not exists public.profiller (
  id uuid primary key references auth.users(id) on delete cascade,
  eposta text not null,
  rol text not null default 'uye' check (rol in ('uye', 'admin')),
  uyelik_bitis timestamptz,
  olusturma timestamptz not null default now()
);
alter table public.profiller enable row level security;

create or replace function public.yeni_kullanici() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiller (id, eposta) values (new.id, coalesce(new.email, '')) on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists yeni_kullanici on auth.users;
create trigger yeni_kullanici after insert on auth.users for each row execute function public.yeni_kullanici();

create or replace function public.admin_mi() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiller where id = auth.uid() and rol = 'admin')
$$;

create or replace function public.aktif_uye() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiller where id = auth.uid() and (rol = 'admin' or uyelik_bitis > now()))
$$;

-- Kullanıcı kendi profilini, yönetici herkesinkini görür. Güncelleme politikası bilerek yok:
-- rol ve süre sadece aşağıdaki yönetici fonksiyonlarıyla değişir.
drop policy if exists profil_oku on public.profiller;
create policy profil_oku on public.profiller for select to authenticated
  using (id = auth.uid() or (select public.admin_mi()));

-- ============ Mağazalar ============
create table if not exists public.magazalar (
  id bigint generated always as identity primary key,
  alan text not null unique,
  ad text,
  myshopify text,
  ulke text,
  dil text,
  para text,
  tld text,
  kategori text not null default 'diger',
  nis text not null default 'diger',
  -- yeni: henüz taranmadı · sifreli: şifre sayfası açık, mağaza açılmamış · acik: ürünler görünüyor · kapali: erişilemiyor
  durum text not null default 'yeni' check (durum in ('yeni', 'sifreli', 'acik', 'kapali')),
  kaynak text not null default 'elle',
  alan_kayit date,
  ilk_gorulme timestamptz not null default now(),
  kesif_gun date generated always as ((ilk_gorulme at time zone 'Europe/Istanbul')::date) stored,
  acilis timestamptz,
  son_tarama timestamptz,
  sonraki_tarama timestamptz not null default now(),
  urun_sayisi int not null default 0,
  hata_sayisi int not null default 0
);
create index if not exists magazalar_sonraki on public.magazalar (sonraki_tarama) where durum <> 'kapali';
create index if not exists magazalar_kesif on public.magazalar (ilk_gorulme desc);
create index if not exists magazalar_kesif_gun on public.magazalar (kesif_gun);
create index if not exists magazalar_durum on public.magazalar (durum);
alter table public.magazalar enable row level security;
drop policy if exists magaza_oku on public.magazalar;
create policy magaza_oku on public.magazalar for select to authenticated using ((select public.aktif_uye()));

-- ============ Ürünler ============
create table if not exists public.urunler (
  id bigint generated always as identity primary key,
  magaza_id bigint not null references public.magazalar(id) on delete cascade,
  shopify_id bigint not null,
  ad text not null,
  handle text,
  urun_tipi text,
  etiketler text,
  fiyat numeric(12, 2),
  eski_fiyat numeric(12, 2),
  para text,
  fiyat_tl numeric(12, 2),
  kategori text not null default 'diger',
  nis text not null default 'diger',
  gorsel text,
  anahtar text,
  yayin timestamptz,
  ilk_gorulme timestamptz not null default now(),
  son_gorulme timestamptz not null default now(),
  -- Ürünün mağazada yayına girdiği an; Shopify bildirmezse ilk gördüğümüz an.
  eklenme timestamptz generated always as (coalesce(yayin, ilk_gorulme)) stored,
  eklenme_gun date generated always as ((coalesce(yayin, ilk_gorulme) at time zone 'Europe/Istanbul')::date) stored,
  unique (magaza_id, shopify_id)
);
create index if not exists urunler_eklenme on public.urunler (eklenme desc, id desc);
create index if not exists urunler_eklenme_gun on public.urunler (eklenme_gun);
create index if not exists urunler_kategori on public.urunler (kategori, eklenme desc);
create index if not exists urunler_fiyat on public.urunler (fiyat_tl);
-- Ücretsiz katmanda yer kazanmak için: trigram arama indeksi ürün başına en çok yer kaplayandı; anahtar araması grup üzerinden yapılıyor.
drop index if exists public.urunler_ad_trgm;
drop index if exists public.urunler_anahtar;
alter table public.urunler enable row level security;
drop policy if exists urun_oku on public.urunler;
create policy urun_oku on public.urunler for select to authenticated using ((select public.aktif_uye()));

-- Sonradan eklenen sütunlar. "if not exists" sayesinde var olan kurulumda da tekrar çalıştırmak güvenli.
-- gorsel_hash: ürün görselinin 64 bitlik parmak izi (dHash). Farklı mağazalar aynı tedarikçi görselini
-- kullandığında başlık farklı olsa bile aynı ürün olarak eşleşir. Hesaplanamayanlar '-' ile işaretlenir.
alter table public.urunler add column if not exists gorsel_hash text;
-- satis_sira: mağazanın "en çok satanlar" listesindeki yeri (1 = en çok satan). Listede yoksa boş.
alter table public.urunler add column if not exists satis_sira int;
alter table public.urunler add column if not exists satis_sira_ilk int;
alter table public.urunler add column if not exists satis_takip_baslangic timestamptz;
-- Son 7 günde sıralamada yukarı çıkma sayısı; trend_guncelle her çalışmada yeniler.
alter table public.urunler add column if not exists satis_hareket_7g int not null default 0;
-- Aynı ürünü mağazalar arasında eşleştiren anahtar: görsel parmak izi varsa o, yoksa normalize başlık.
alter table public.urunler add column if not exists grup text generated always as (
  case when gorsel_hash ~ '^[0-9a-f]{16}$' then 'g' || gorsel_hash when anahtar is not null then 't' || anahtar end) stored;
create index if not exists urunler_grup on public.urunler (grup);
create index if not exists urunler_gorsel_bekleyen on public.urunler (ilk_gorulme desc) where gorsel_hash is null and gorsel is not null;
create index if not exists urunler_satis on public.urunler (satis_hareket_7g desc) where satis_hareket_7g > 0;
create index if not exists urunler_magaza on public.urunler (magaza_id);

-- ============ Satış hareketleri ============
-- Shopify satış adedini açıklamaz; ama "en çok satanlar" sıralamasını gerçek satışlara göre kendisi hesaplar.
-- Bir ürünün bu sıralamadaki her yer değiştirmesi burada saklanır. Yukarı çıkış = o ürün satıyor.
create table if not exists public.satis_olaylari (
  id bigint generated always as identity primary key,
  urun_id bigint not null references public.urunler(id) on delete cascade,
  zaman timestamptz not null default now(),
  eski_sira int,
  yeni_sira int
);
create index if not exists satis_olaylari_urun on public.satis_olaylari (urun_id, zaman);
create index if not exists satis_olaylari_zaman on public.satis_olaylari (zaman);
alter table public.satis_olaylari enable row level security;
drop policy if exists satis_oku on public.satis_olaylari;
create policy satis_oku on public.satis_olaylari for select to authenticated using ((select public.aktif_uye()));

-- Tarayıcı bir mağazanın güncel "en çok satanlar" listesini verir; değişenler olay olarak yazılır.
-- veri: {"magaza_id": 1, "siralar": [{"shopify_id": 123, "sira": 1}, ...]}
create or replace function public.satis_sira_yaz(veri jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare v_magaza bigint := (veri->>'magaza_id')::bigint; n int;
begin
  with yeni as (
    select (x->>'shopify_id')::bigint as sid, min((x->>'sira')::int) as sira
    from jsonb_array_elements(coalesce(veri->'siralar', '[]'::jsonb)) x group by 1
  ), mevcut as (
    select u.id, u.satis_sira, u.satis_takip_baslangic, y.sira as yeni_sira
    from urunler u left join yeni y on y.sid = u.shopify_id
    where u.magaza_id = v_magaza
  ), olay as (
    -- İlk ölçümde olay yazılmaz; sadece takip başladıktan sonraki değişimler sayılır.
    insert into satis_olaylari (urun_id, eski_sira, yeni_sira)
    select id, satis_sira, yeni_sira from mevcut
    where satis_takip_baslangic is not null and satis_sira is distinct from yeni_sira
    returning 1
  ), guncel as (
    update urunler u set satis_sira = m.yeni_sira,
                         -- İlk sıra: takibin başladığı andaki yer (o an listede değilse boş kalır).
                         satis_sira_ilk = case when u.satis_takip_baslangic is null then m.yeni_sira else u.satis_sira_ilk end,
                         satis_takip_baslangic = coalesce(u.satis_takip_baslangic, now())
    from mevcut m
    where u.id = m.id and (u.satis_sira is distinct from m.yeni_sira or u.satis_takip_baslangic is null)
    returning 1
  )
  select (select count(*) from olay) into n;
  return n;
end $$;

-- Tarayıcının hesapladığı görsel parmak izlerini toplu yazar. veri: [{"id": 1, "h": "a1b2..."}]
create or replace function public.gorsel_hash_yaz(veri jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update urunler u set gorsel_hash = x.h
  from jsonb_to_recordset(veri) as x(id bigint, h text)
  where u.id = x.id;
  get diagnostics n = row_count;
  return n;
end $$;

-- ============ Trendler ============
-- Aynı ürünü (normalize edilmiş başlık = anahtar) kaç farklı mağazanın sattığı.
-- Son 14 günde birden çok yeni mağaza ekliyorsa yükselen; toplam mağaza sayısı azsa henüz doymamış.
create table if not exists public.trendler (
  anahtar text primary key,
  ornek_ad text,
  ornek_gorsel text,
  kategori text,
  nis text,
  magaza_sayisi int not null,
  yeni_magaza_14g int not null,
  ilk_gorulme timestamptz,
  son_eklenme timestamptz,
  medyan_fiyat_tl numeric(12, 2)
);
alter table public.trendler enable row level security;
drop policy if exists trend_oku on public.trendler;
create policy trend_oku on public.trendler for select to authenticated using ((select public.aktif_uye()));
alter table public.trendler add column if not exists satis_hareket_7g int not null default 0;
alter table public.trendler add column if not exists gorsel_eslesme boolean not null default false;

create or replace function public.trend_guncelle() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  -- 180 günden eski satış hareketleri silinir; ücretsiz katmanda yer kalsın.
  delete from satis_olaylari where zaman < now() - interval '30 days';
  -- Son 7 günde sıralamada yukarı çıkış (ya da listeye giriş) sayısı.
  update urunler set satis_hareket_7g = 0 where satis_hareket_7g <> 0;
  update urunler u set satis_hareket_7g = x.n
  from (select urun_id, count(*)::int as n from satis_olaylari
        where zaman > now() - interval '7 days' and yeni_sira is not null and (eski_sira is null or yeni_sira < eski_sira)
        group by urun_id) x
  where u.id = x.urun_id;

  -- Supabase'in safeupdate eklentisi koşulsuz DELETE'i reddeder.
  delete from trendler where true;
  insert into trendler (anahtar, ornek_ad, ornek_gorsel, kategori, nis, magaza_sayisi, yeni_magaza_14g,
                        ilk_gorulme, son_eklenme, medyan_fiyat_tl, satis_hareket_7g, gorsel_eslesme)
  select u.grup,
         (array_agg(u.ad order by u.eklenme desc))[1],
         (array_agg(u.gorsel order by u.eklenme desc) filter (where u.gorsel is not null))[1],
         mode() within group (order by u.kategori),
         mode() within group (order by u.nis),
         count(distinct u.magaza_id),
         count(distinct u.magaza_id) filter (where u.eklenme > now() - interval '14 days'),
         min(u.eklenme),
         max(u.eklenme),
         percentile_cont(0.5) within group (order by u.fiyat_tl),
         sum(u.satis_hareket_7g),
         u.grup like 'g%'
  from urunler u
  where u.grup is not null
  group by u.grup
  having count(distinct u.magaza_id) >= 2;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.trend_guncelle() from public, anon, authenticated;

-- ============ Veri penceresi ============
-- Son "gun" günde keşfedilen mağazalar (ve ürünleri, satış geçmişleri) tutulur, daha eskiler silinir.
-- Toplam ürün "en_cok_urun"u aşarsa en eski mağazalar daha erken silinir; böylece ücretsiz katman dolmaz.
-- Bir üyenin kaydettiği ürünün ya da mağazanın mağazası silinmez.
-- Ürün bazında değil mağaza bazında silinir: aksi halde her gün yeniden taranan mağazanın ürünleri "yeni" diye geri gelirdi.
create or replace function public.eski_verileri_sil(gun int default 30, en_cok_urun bigint default 500000) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_gun int := 0; n_tavan int := 0;
begin
  with korunan as (
    select k.ref as magaza_id from kayitlar k where k.tur = 'm'
    union select u.magaza_id from kayitlar k join urunler u on u.id = k.ref where k.tur = 'u'
  ), sil as (
    delete from magazalar m where m.ilk_gorulme < now() - make_interval(days => gun)
      and m.id not in (select magaza_id from korunan)
    returning 1
  )
  select count(*) into n_gun from sil;

  if (select count(*) from urunler) > en_cok_urun then
    with korunan as (
      select k.ref as magaza_id from kayitlar k where k.tur = 'm'
      union select u.magaza_id from kayitlar k join urunler u on u.id = k.ref where k.tur = 'u'
    ), sayim as (
      select magaza_id, count(*) as n from urunler group by magaza_id
    ), kumulatif as (
      -- En yeniden eskiye ürünleri biriktir; tavanı aşan eski mağazalar silinir.
      select m.id, sum(coalesce(s.n, 0)) over (order by m.ilk_gorulme desc, m.id desc) as toplam
      from magazalar m left join sayim s on s.magaza_id = m.id
      where m.id not in (select magaza_id from korunan)
    ), sil as (
      delete from magazalar m using kumulatif k where m.id = k.id and k.toplam > en_cok_urun
      returning 1
    )
    select count(*) into n_tavan from sil;
  end if;
  return jsonb_build_object('gun_doldugu_icin', n_gun, 'tavan_icin', n_tavan, 'kalan_urun', (select count(*) from urunler));
end $$;

-- ============ Kaydedilenler ============
create table if not exists public.kayitlar (
  kullanici uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tur text not null check (tur in ('u', 'm')),
  ref bigint not null,
  olusturma timestamptz not null default now(),
  primary key (kullanici, tur, ref)
);
alter table public.kayitlar enable row level security;
drop policy if exists kayit_kendi on public.kayitlar;
create policy kayit_kendi on public.kayitlar for all to authenticated
  using (kullanici = auth.uid()) with check (kullanici = auth.uid() and (select public.aktif_uye()));

-- ============ Arama fonksiyonları ============
create or replace function public._dizi(j jsonb) returns text[]
language sql immutable as $$
  select coalesce(array(select jsonb_array_elements_text(case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end)), '{}')
$$;

create or replace function public.urun_ara(p jsonb) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_ara text := nullif(trim(p->>'ara'), '');
  v_gun date := nullif(p->>'gun', '')::date;
  v_kat text[] := _dizi(p->'kategoriler');
  v_nis text := nullif(p->>'nis', '');
  v_fmin numeric := nullif(p->>'fmin', '')::numeric;
  v_fmax numeric := nullif(p->>'fmax', '')::numeric;
  v_ulke text[] := _dizi(p->'ulkeler');
  v_para text[] := _dizi(p->'paralar');
  v_dil text[] := _dizi(p->'diller');
  v_tld text[] := _dizi(p->'tldler');
  v_indirim boolean := coalesce((p->>'indirim')::boolean, false);
  v_kesif int := nullif(p->>'kesif_gun', '')::int;
  v_magaza bigint := nullif(p->>'magaza_id', '')::bigint;
  v_anahtar text := nullif(p->>'anahtar', '');
  v_mb int := nullif(p->>'magaza_basi', '')::int;
  v_sirala text := coalesce(p->>'sirala', 'yeni');
  v_limit int := least(greatest(coalesce((p->>'limit')::int, 48), 1), 200);
  v_offset int := greatest(coalesce((p->>'offset')::int, 0), 0);
  v_tohum text := coalesce(p->>'tohum', '');
  v_tr boolean := coalesce((p->>'tr_agirlik')::boolean, false);
  v_satista boolean := coalesce((p->>'satista')::boolean, false);
  sonuc jsonb;
begin
  if not aktif_uye() then raise exception 'uyelik_yok' using errcode = '42501'; end if;
  with suz as (
    select u.id, u.magaza_id, u.ad, u.handle, u.fiyat, u.eski_fiyat, u.para, u.fiyat_tl, u.kategori, u.nis,
           u.gorsel, u.anahtar, u.grup, u.eklenme, u.ilk_gorulme, u.son_gorulme, u.satis_sira, u.satis_hareket_7g,
           m.alan, m.ad as magaza_ad, m.ulke, m.dil, m.tld, m.ilk_gorulme as magaza_kesif,
           (m.ulke = 'TR' or m.para = 'TRY' or m.dil = 'tr' or m.tld like '%.tr') as turkiye,
           (m.son_tarama is not null and u.son_gorulme < m.son_tarama - interval '1 hour') as kaldirildi,
           case when u.eski_fiyat > u.fiyat and u.eski_fiyat > 0 then 1 - u.fiyat / u.eski_fiyat else 0 end as indirim_orani
    from urunler u join magazalar m on m.id = u.magaza_id
    where (cardinality(v_kat) = 0 or u.kategori = any(v_kat))
      and (v_nis is null or u.nis = v_nis)
      and (v_gun is null or u.eklenme_gun = v_gun)
      and (v_fmin is null or u.fiyat_tl >= v_fmin)
      and (v_fmax is null or u.fiyat_tl <= v_fmax)
      and (not v_indirim or u.eski_fiyat > u.fiyat)
      and (cardinality(v_ulke) = 0 or m.ulke = any(v_ulke))
      and (cardinality(v_para) = 0 or m.para = any(v_para))
      and (cardinality(v_dil) = 0 or m.dil = any(v_dil))
      and (cardinality(v_tld) = 0 or m.tld = any(v_tld))
      and (v_kesif is null or m.ilk_gorulme > now() - make_interval(days => v_kesif))
      and (v_magaza is null or u.magaza_id = v_magaza)
      and (v_anahtar is null or u.grup = v_anahtar or u.anahtar = v_anahtar)
      and (not v_satista or u.satis_hareket_7g > 0)
      and (v_ara is null or u.ad ilike '%' || v_ara || '%' or m.alan ilike '%' || v_ara || '%')
  ), sinirli as (
    select s.* from (
      select s.*, row_number() over (partition by s.magaza_id order by s.eklenme desc, s.id desc) as sira from suz s
    ) s where v_mb is null or s.sira <= v_mb
  )
  select jsonb_build_object(
    'toplam', (select count(*) from sinirli),
    'magaza', (select count(distinct magaza_id) from sinirli),
    'satirlar', coalesce((select jsonb_agg(to_jsonb(x) - 'sira') from (
      select * from sinirli
      order by
        case when v_sirala = 'fiyat-a' then fiyat_tl end asc nulls last,
        case when v_sirala = 'fiyat-z' then fiyat_tl end desc nulls last,
        case when v_sirala = 'indirim' then indirim_orani end desc nulls last,
        case when v_sirala = 'satis' then satis_hareket_7g end desc nulls last,
        case when v_sirala in ('satis', 'satis-sira') then satis_sira end asc nulls last,
        -- Bulucu: rastgele sıra; Türkiye ağırlığı açıksa Türk mağazalarının ürünleri ~5 kat öne gelir.
        case when v_sirala = 'rastgele' then (abs(hashtext(id::text || v_tohum))::float8 / 2147483647)
                                             * (case when v_tr and turkiye then 0.2 else 1 end) end,
        eklenme desc, id desc
      limit v_limit offset v_offset) x), '[]'::jsonb)
  ) into sonuc;
  return sonuc;
end $$;

create or replace function public.magaza_ara(p jsonb) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_ara text := nullif(trim(p->>'ara'), '');
  v_gun date := nullif(p->>'gun', '')::date;
  v_kat text[] := _dizi(p->'kategoriler');
  v_nis text := nullif(p->>'nis', '');
  v_ulke text[] := _dizi(p->'ulkeler');
  v_para text[] := _dizi(p->'paralar');
  v_dil text[] := _dizi(p->'diller');
  v_tld text[] := _dizi(p->'tldler');
  v_durum text[] := _dizi(p->'durumlar');
  v_kesif int := nullif(p->>'kesif_gun', '')::int;
  v_amin int := nullif(p->>'amin', '')::int;
  v_amax int := nullif(p->>'amax', '')::int;
  v_id bigint := nullif(p->>'id', '')::bigint;
  v_sirala text := coalesce(p->>'sirala', 'yeni');
  v_limit int := least(greatest(coalesce((p->>'limit')::int, 48), 1), 200);
  v_offset int := greatest(coalesce((p->>'offset')::int, 0), 0);
  sonuc jsonb;
begin
  if not aktif_uye() then raise exception 'uyelik_yok' using errcode = '42501'; end if;
  with suz as (
    select m.id, m.alan, m.ad, m.ulke, m.dil, m.para, m.tld, m.kategori, m.nis, m.durum, m.ilk_gorulme, m.acilis,
           m.son_tarama, m.urun_sayisi, m.alan_kayit,
           (select percentile_cont(0.5) within group (order by u.fiyat) from urunler u where u.magaza_id = m.id) as ortanca_fiyat
    from magazalar m
    where m.durum <> 'yeni'
      and (cardinality(v_durum) = 0 or m.durum = any(v_durum))
      and (cardinality(v_kat) = 0 or m.kategori = any(v_kat))
      and (v_nis is null or m.nis = v_nis)
      and (v_gun is null or m.kesif_gun = v_gun)
      and (cardinality(v_ulke) = 0 or m.ulke = any(v_ulke))
      and (cardinality(v_para) = 0 or m.para = any(v_para))
      and (cardinality(v_dil) = 0 or m.dil = any(v_dil))
      and (cardinality(v_tld) = 0 or m.tld = any(v_tld))
      and (v_kesif is null or m.ilk_gorulme > now() - make_interval(days => v_kesif))
      and (v_amin is null or m.urun_sayisi >= v_amin)
      and (v_amax is null or m.urun_sayisi <= v_amax)
      and (v_id is null or m.id = v_id)
      and (v_ara is null or m.alan ilike '%' || v_ara || '%' or m.ad ilike '%' || v_ara || '%')
  )
  select jsonb_build_object(
    'toplam', (select count(*) from suz),
    'satirlar', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from suz
      order by
        case when v_sirala = 'urun-cok' then urun_sayisi end desc nulls last,
        case when v_sirala = 'urun-az' then urun_sayisi end asc nulls last,
        case when v_sirala = 'ad' then coalesce(ad, alan) end asc,
        ilk_gorulme desc, id desc
      limit v_limit offset v_offset) x), '[]'::jsonb)
  ) into sonuc;
  return sonuc;
end $$;

create or replace function public.trend_ara(p jsonb) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  v_kat text[] := _dizi(p->'kategoriler');
  v_ara text := nullif(trim(p->>'ara'), '');
  v_max int := nullif(p->>'max_magaza', '')::int;
  v_sirala text := coalesce(p->>'sirala', 'yukselen');
  v_limit int := least(greatest(coalesce((p->>'limit')::int, 48), 1), 200);
  v_offset int := greatest(coalesce((p->>'offset')::int, 0), 0);
  sonuc jsonb;
begin
  if not aktif_uye() then raise exception 'uyelik_yok' using errcode = '42501'; end if;
  with suz as (
    select t.* from trendler t
    where (cardinality(v_kat) = 0 or t.kategori = any(v_kat))
      and (v_max is null or t.magaza_sayisi <= v_max)
      and (v_ara is null or t.ornek_ad ilike '%' || v_ara || '%')
      and (v_sirala <> 'doymamis' or t.yeni_magaza_14g >= 2)
  )
  select jsonb_build_object(
    'toplam', (select count(*) from suz),
    'satirlar', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from suz
      order by
        case when v_sirala = 'yukselen' then yeni_magaza_14g end desc,
        case when v_sirala = 'doymamis' then yeni_magaza_14g::numeric / magaza_sayisi end desc,
        case when v_sirala = 'yaygin' then magaza_sayisi end desc,
        case when v_sirala = 'satan' then satis_hareket_7g end desc,
        case when v_sirala = 'yeni' then ilk_gorulme end desc,
        son_eklenme desc
      limit v_limit offset v_offset) x), '[]'::jsonb)
  ) into sonuc;
  return sonuc;
end $$;

-- Özet sayılar ve filtre listelerindeki adetler.
create or replace function public.ozet() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  if not aktif_uye() then raise exception 'uyelik_yok' using errcode = '42501'; end if;
  return jsonb_build_object(
    'magaza', (select count(*) from magazalar where durum in ('acik', 'sifreli')),
    'acik', (select count(*) from magazalar where durum = 'acik'),
    'sifreli', (select count(*) from magazalar where durum = 'sifreli'),
    'urun', (select count(*) from urunler),
    'yeni_24s', (select count(*) from magazalar where durum <> 'yeni' and durum <> 'kapali' and ilk_gorulme > now() - interval '24 hours'),
    'yeni_7g', (select count(*) from magazalar where durum <> 'yeni' and durum <> 'kapali' and ilk_gorulme > now() - interval '7 days'),
    'trend', (select count(*) from trendler where yeni_magaza_14g >= 2),
    'veri_gun', (select ceil(extract(epoch from now() - min(ilk_gorulme)) / 86400)::int from magazalar),
    'son_tarama', (select max(son_tarama) from magazalar),
    'ulkeler', (select coalesce(jsonb_object_agg(ulke, n), '{}') from (select ulke, count(*) n from magazalar where ulke is not null and durum <> 'yeni' group by ulke) x),
    'paralar', (select coalesce(jsonb_object_agg(para, n), '{}') from (select para, count(*) n from magazalar where para is not null and durum <> 'yeni' group by para) x),
    'diller', (select coalesce(jsonb_object_agg(dil, n), '{}') from (select dil, count(*) n from magazalar where dil is not null and durum <> 'yeni' group by dil) x),
    'tldler', (select coalesce(jsonb_object_agg(tld, n), '{}') from (select tld, count(*) n from magazalar where tld is not null and durum <> 'yeni' group by tld) x),
    'kategoriler', (select coalesce(jsonb_object_agg(kategori, n), '{}') from (select kategori, count(*) n from urunler group by kategori) x),
    'gunler', (select coalesce(jsonb_agg(g), '[]') from (
      select distinct eklenme_gun g from urunler where eklenme > now() - interval '200 days'
      union select distinct kesif_gun from magazalar where ilk_gorulme > now() - interval '200 days' and durum <> 'yeni') x)
  );
end $$;

create or replace function public.kayitlarim() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
begin
  if not aktif_uye() then raise exception 'uyelik_yok' using errcode = '42501'; end if;
  return jsonb_build_object(
    'urunler', coalesce((select jsonb_agg(to_jsonb(x) order by x.kayit desc) from (
      select u.id, u.magaza_id, u.ad, u.handle, u.fiyat, u.eski_fiyat, u.para, u.fiyat_tl, u.kategori, u.nis, u.gorsel, u.eklenme,
             m.alan, m.ad as magaza_ad, m.ulke, k.olusturma as kayit,
             (m.son_tarama is not null and u.son_gorulme < m.son_tarama - interval '1 hour') as kaldirildi
      from kayitlar k join urunler u on u.id = k.ref join magazalar m on m.id = u.magaza_id
      where k.kullanici = auth.uid() and k.tur = 'u') x), '[]'),
    'magazalar', coalesce((select jsonb_agg(to_jsonb(x) order by x.kayit desc) from (
      select m.id, m.alan, m.ad, m.ulke, m.dil, m.para, m.tld, m.kategori, m.nis, m.durum, m.ilk_gorulme, m.urun_sayisi, k.olusturma as kayit
      from kayitlar k join magazalar m on m.id = k.ref
      where k.kullanici = auth.uid() and k.tur = 'm') x), '[]')
  );
end $$;

-- Bir ürünün satış hareketi: takip başlangıcından bugüne ve verilen tarihten bugüne.
create or replace function public.satis_takip(urun bigint, baslangic timestamptz default null) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare r record; b_sira int; b_var boolean := false;
begin
  if not aktif_uye() then raise exception 'uyelik_yok' using errcode = '42501'; end if;
  select id, satis_sira, satis_sira_ilk, satis_takip_baslangic into r from urunler where id = urun;
  if not found then return null; end if;
  if baslangic is not null and r.satis_takip_baslangic is not null and r.satis_takip_baslangic <= baslangic then
    b_var := true;
    select o.yeni_sira into b_sira from satis_olaylari o where o.urun_id = urun and o.zaman <= baslangic order by o.zaman desc limit 1;
    if not found then b_sira := r.satis_sira_ilk; end if;
  end if;
  return jsonb_build_object(
    'takip_baslangic', r.satis_takip_baslangic,
    'ilk_sira', r.satis_sira_ilk,
    'simdi_sira', r.satis_sira,
    'toplam_yukselis', (select count(*) from satis_olaylari o where o.urun_id = urun and o.yeni_sira is not null and (o.eski_sira is null or o.yeni_sira < o.eski_sira)),
    'baslangic', baslangic,
    'baslangic_biliniyor', b_var,
    'baslangic_sira', b_sira,
    'yukselis_baslangictan', case when baslangic is null then null else (select count(*) from satis_olaylari o where o.urun_id = urun and o.zaman > baslangic and o.yeni_sira is not null and (o.eski_sira is null or o.yeni_sira < o.eski_sira)) end,
    'olaylar', coalesce((select jsonb_agg(jsonb_build_object('zaman', o.zaman, 'eski', o.eski_sira, 'yeni', o.yeni_sira) order by o.zaman) from satis_olaylari o where o.urun_id = urun), '[]'::jsonb)
  );
end $$;

-- ============ Yönetici fonksiyonları ============
create or replace function public.uyeler() returns setof public.profiller
language plpgsql stable security definer set search_path = public as $$
begin
  if not admin_mi() then raise exception 'yetki_yok' using errcode = '42501'; end if;
  return query select * from profiller order by olusturma desc;
end $$;

-- Süre, kalan sürenin üstüne eklenir; süresi dolmuşsa bugünden başlar.
create or replace function public.uyelik_ver(kullanici uuid, gun int) returns public.profiller
language plpgsql security definer set search_path = public as $$
declare r profiller;
begin
  if not admin_mi() then raise exception 'yetki_yok' using errcode = '42501'; end if;
  if gun < 1 or gun > 3650 then raise exception 'gecersiz_gun'; end if;
  update profiller set uyelik_bitis = greatest(coalesce(uyelik_bitis, now()), now()) + make_interval(days => gun)
  where id = kullanici returning * into r;
  return r;
end $$;

-- Bitiş tarihini doğrudan ayarlar; null verilirse üyelik hemen biter.
create or replace function public.uyelik_bitis_ayarla(kullanici uuid, bitis timestamptz) returns public.profiller
language plpgsql security definer set search_path = public as $$
declare r profiller;
begin
  if not admin_mi() then raise exception 'yetki_yok' using errcode = '42501'; end if;
  update profiller set uyelik_bitis = bitis where id = kullanici returning * into r;
  return r;
end $$;

create or replace function public.rol_ata(kullanici uuid, yeni_rol text) returns public.profiller
language plpgsql security definer set search_path = public as $$
declare r profiller;
begin
  if not admin_mi() then raise exception 'yetki_yok' using errcode = '42501'; end if;
  if kullanici = auth.uid() and yeni_rol <> 'admin' then raise exception 'kendini_dusuremezsin'; end if;
  update profiller set rol = yeni_rol where id = kullanici returning * into r;
  return r;
end $$;

-- ============ Yetkiler ============
revoke all on public.profiller, public.magazalar, public.urunler, public.trendler, public.kayitlar from anon;
revoke insert, update, delete on public.profiller, public.magazalar, public.urunler, public.trendler from authenticated;
grant select on public.profiller, public.magazalar, public.urunler, public.trendler to authenticated;
grant select, insert, delete on public.kayitlar to authenticated;
revoke all on function public.urun_ara(jsonb), public.magaza_ara(jsonb), public.trend_ara(jsonb), public.ozet(), public.kayitlarim(),
  public.uyeler(), public.uyelik_ver(uuid, int), public.uyelik_bitis_ayarla(uuid, timestamptz), public.rol_ata(uuid, text) from public, anon;
grant execute on function public.urun_ara(jsonb), public.magaza_ara(jsonb), public.trend_ara(jsonb), public.ozet(), public.kayitlarim(),
  public.uyeler(), public.uyelik_ver(uuid, int), public.uyelik_bitis_ayarla(uuid, timestamptz), public.rol_ata(uuid, text),
  public.admin_mi(), public.aktif_uye() to authenticated;
grant execute on function public.trend_guncelle() to service_role;
revoke all on function public.eski_verileri_sil(int, bigint) from public, anon, authenticated;
grant execute on function public.eski_verileri_sil(int, bigint) to service_role;
grant select on public.satis_olaylari to authenticated;
revoke insert, update, delete on public.satis_olaylari from authenticated;
revoke all on public.satis_olaylari from anon;
revoke all on function public.satis_sira_yaz(jsonb), public.gorsel_hash_yaz(jsonb) from public, anon, authenticated;
grant execute on function public.satis_sira_yaz(jsonb), public.gorsel_hash_yaz(jsonb) to service_role;
revoke all on function public.satis_takip(bigint, timestamptz) from public, anon;
grant execute on function public.satis_takip(bigint, timestamptz) to authenticated;
