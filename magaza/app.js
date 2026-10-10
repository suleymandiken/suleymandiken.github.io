(() => {
  const S = window.SHOP, P = window.PRODUCTS;
  const $ = (s, r = document) => r.querySelector(s);
  const view = $("#view");
  const fmt = new Intl.NumberFormat("tr-TR", { style: "currency", currency: S.currency, maximumFractionDigits: 0 });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const CATS = [["all", "Tümü"], ["kadin", "Kadın"], ["erkek", "Erkek"], ["aksesuar", "Aksesuar"]];
  const PAGE = 8;

  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  let cart = load("cart", []), favs = load("favs", []), code = load("code", "");

  const ic = {
    arrow: '<svg viewBox="0 0 24 24"><path d="M7 17 17 7M8 7h9v9"/></svg>',
    plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    x: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
    heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
  };

  $("#brand").textContent = S.brand; $("#tagline").textContent = S.tagline;
  document.title = S.brand + " · Mağaza";

  const byId = id => P.find(p => p.id === id);
  const photo = (p, v = 1) => `<div class="ph${v > 1 ? " v" + v : ""}">${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy">` : `<span>${esc(p.kind)}</span>`}</div>`;
  const toast = (() => { let t; return m => { const e = $("#toast"); e.textContent = m; e.classList.add("show"); clearTimeout(t); t = setTimeout(() => e.classList.remove("show"), 1800); }; })();

  function card(p) {
    const on = favs.includes(p.id);
    return `<article class="card">
      ${p.isNew ? '<span class="tag">YENİ</span>' : ""}
      <button class="fav" data-fav="${p.id}" aria-pressed="${on}" aria-label="${esc(p.name)} favorilere ${on ? "çıkar" : "ekle"}">${ic.heart}</button>
      <a href="#/p/${p.id}" aria-label="${esc(p.name)}, ${fmt.format(p.price)}">${photo(p)}
        <div class="meta"><div><div class="nm">${esc(p.name)}</div><div class="pr">${fmt.format(p.price)}</div></div><span class="go">${ic.arrow}</span></div></a>
    </article>`;
  }

  const seg = cur => `<nav class="seg" aria-label="Kategori">${CATS.map(([k, n]) => `<a href="${k === "all" ? "#/shop" : "#/shop?cat=" + k}" ${k === cur ? 'class="on" aria-current="page"' : ""}>${n}</a>`).join("")}</nav>`;

  /* --- görünümler --- */
  function home() {
    const fresh = P.filter(p => p.isNew).slice(0, 4);
    return `<section class="hero"><h1 class="d"><span>Keşfet.</span><span>Seç.</span><span>Giy.</span></h1>
      <div class="side"><span>SEÇİLMİŞ<br>SOKAK<br>GİYİM</span><a class="arrow" href="#/shop" aria-label="Mağazaya git">${ic.arrow}</a></div></section>
      <div style="height:16px"></div>${seg("")}
      <div class="sec-head"><h2>Yeni gelenler</h2><a href="#/shop">Tümünü gör</a></div>
      <div class="grid">${fresh.map(card).join("")}</div>
      <div class="promos"><a class="promo a" href="#/cart" data-code="ILK10">İlk siparişe %10<br>kod: ILK10 ${ic.arrow}</a>
      <a class="promo b" href="#/shop?sort=pop">Bu hafta<br>çok satanlar ${ic.plus}</a></div>`;
  }

  function shop(q) {
    const cat = q.get("cat") || "all", sort = q.get("sort") || "new", term = (q.get("q") || "").toLocaleLowerCase("tr"), n = +q.get("n") || PAGE;
    let list = P.filter(p => (cat === "all" || p.cat === cat) && p.name.toLocaleLowerCase("tr").includes(term));
    const sorters = { new: (a, b) => b.isNew - a.isNew, low: (a, b) => a.price - b.price, high: (a, b) => b.price - a.price, pop: (a, b) => b.reviews - a.reviews };
    list = list.sort(sorters[sort] || sorters.new);
    const shown = list.slice(0, n);
    const link = (extra) => { const u = new URLSearchParams({ ...(cat !== "all" && { cat }), ...(term && { q: q.get("q") }), sort, ...extra }); return "#/shop?" + u; };
    return `<div class="pad" style="padding-bottom:0"><h1 class="d" style="font-size:44px">Mağaza</h1></div><div style="height:12px"></div>${seg(cat)}
      <div class="tools"><label>Sırala <select id="sort">${[["new", "En yeni"], ["low", "Fiyat: artan"], ["high", "Fiyat: azalan"], ["pop", "Çok satan"]].map(([k, t]) => `<option value="${k}" ${k === sort ? "selected" : ""}>${t}</option>`).join("")}</select></label><span>${list.length} ürün</span></div>
      ${shown.length ? `<div class="grid">${shown.map(card).join("")}</div>` : `<div class="empty"><h2 class="d">Sonuç yok</h2><p>“${esc(q.get("q") || "")}” için ürün bulunamadı. Başka bir kelime dene.</p><a class="btn" href="#/shop">Tüm ürünler</a></div>`}
      ${list.length > shown.length ? `<div class="more"><a class="btn ghost" href="${link({ n: n + PAGE })}">Daha fazla göster</a></div>` : ""}`;
  }

  function product(id) {
    const p = byId(id);
    if (!p) return notFound();
    const on = favs.includes(p.id);
    return `<p class="crumb"><a href="#/shop">Mağaza</a> / ${esc(CATS.find(c => c[0] === p.cat)[1])}</p>
    <div class="pdp" data-id="${p.id}">
      <div class="gal"><div class="main" id="mainph">${p.isNew ? '<span class="tag">YENİ</span>' : ""}${photo(p, 1)}</div>
        <div class="thumbs">${[1, 2, 3].map(v => `<button data-v="${v}" aria-label="Görsel ${v}" ${v === 1 ? 'aria-current="true"' : ""}>${photo(p, v)}</button>`).join("")}</div></div>
      <div class="buy">
        <div class="row"><h1 class="d">${esc(p.name)}</h1><div class="price">${fmt.format(p.price)}</div></div>
        <div class="stars" aria-label="${p.rating} üzerinden 5">${"★".repeat(Math.round(p.rating))}${"☆".repeat(5 - Math.round(p.rating))} <small>(${p.reviews})</small></div>
        <p class="desc">${esc(p.desc)}</p>
        <div class="opt"><h3>Renk: <b id="colName">${esc(p.colors[0].name)}</b></h3><div class="sw" id="sw">${p.colors.map((c, i) => `<button style="background:${c.hex}" data-c="${i}" aria-pressed="${i === 0}" aria-label="${esc(c.name)}"></button>`).join("")}</div></div>
        <div class="opt"><h3>Beden</h3><div class="sz" id="sz">${p.sizes.map(s => `<button data-s="${esc(s)}" aria-pressed="false">${esc(s)}</button>`).join("")}</div><div class="err" id="err" role="alert"></div></div>
        <div class="addrow"><div class="qty"><button data-q="-1" aria-label="Azalt">−</button><output id="q">1</output><button data-q="1" aria-label="Artır">+</button></div>
          <button class="btn" id="add">Sepete ekle</button></div>
        <div style="margin-top:10px"><button class="btn ghost" data-fav="${p.id}" aria-pressed="${on}" style="font-size:15px;min-height:44px">${on ? "Favorilerde" : "Favorilere ekle"}</button></div>
      </div></div>`;
  }

  const lineKey = l => [l.id, l.size, l.color].join("|");
  function totals() {
    const sub = cart.reduce((a, l) => a + byId(l.id).price * l.qty, 0);
    const rate = S.discountCodes[code] || 0, disc = Math.round(sub * rate);
    const ship = !cart.length || sub - disc >= S.freeShippingFrom ? 0 : S.shippingFee;
    return { sub, disc, ship, total: sub - disc + ship, left: Math.max(0, S.freeShippingFrom - (sub - disc)) };
  }

  function cartView() {
    const n = cart.reduce((a, l) => a + l.qty, 0);
    if (!cart.length) return `<div class="empty"><h1 class="d">Sepet boş</h1><p>Henüz bir şey eklemedin.</p><a class="btn" href="#/shop">Alışverişe başla</a></div>`;
    const t = totals(), pct = Math.min(100, Math.round(((t.sub - t.disc) / S.freeShippingFrom) * 100));
    return `<div class="cartwrap"><div class="cart-head"><h1 class="d">Sepet (${n})</h1></div>
      <div class="ship">${t.left ? `Ücretsiz kargoya ${fmt.format(t.left)} kaldı` : "Kargo ücretsiz"}<div class="bar"><i style="width:${pct}%"></i></div></div>
      <div><div class="lines">${cart.map((l, i) => { const p = byId(l.id); return `<div class="line">${photo(p)}<div><h2>${esc(p.name)}</h2><button class="rm" data-rm="${i}" aria-label="${esc(p.name)} sepetten çıkar">${ic.x}</button>
        <small>Beden: ${esc(l.size)} · Renk: ${esc(l.color)}</small>
        <div class="bot"><div class="qty"><button data-ln="${i}" data-d="-1" aria-label="Azalt">−</button><output>${l.qty}</output><button data-ln="${i}" data-d="1" aria-label="Artır">+</button></div><b>${fmt.format(p.price * l.qty)}</b></div></div></div>`; }).join("")}</div></div>
      <aside><form class="code" id="codeForm"><input id="codeIn" placeholder="İndirim kodu" aria-label="İndirim kodu" value="${esc(code)}"><button>Uygula</button></form>
      <div class="codemsg" id="codeMsg" role="status">${code && S.discountCodes[code] ? `Kod uygulandı: %${S.discountCodes[code] * 100}` : ""}</div>
      <div class="sum"><div class="r"><span>Ara toplam</span><span>${fmt.format(t.sub)}</span></div><div class="r"><span>Kargo</span><span>${t.ship ? fmt.format(t.ship) : "Ücretsiz"}</span></div>
      ${t.disc ? `<div class="r off"><span>İndirim</span><span>−${fmt.format(t.disc)}</span></div>` : ""}
      <div class="r t"><span>Toplam</span><span>${fmt.format(t.total)}</span></div></div>
      <div class="checkout"><button class="btn violet" id="checkout">Siparişi WhatsApp'tan gönder ${ic.right}</button></div>
      <p class="note" id="payNote">Sipariş WhatsApp'a mesaj olarak gider, ödeme ve teslimat orada netleşir. Kart ile ödeme bu sürümde yok.</p></aside></div>`;
  }

  function favView() {
    const l = P.filter(p => favs.includes(p.id));
    return `<div class="pad" style="padding-bottom:12px"><h1 class="d" style="font-size:44px">Favoriler</h1></div>` +
      (l.length ? `<div class="grid">${l.map(card).join("")}</div>` : `<div class="empty"><h2 class="d">Liste boş</h2><p>Beğendiğin ürünlerin kalbine dokun, burada toplansın.</p><a class="btn" href="#/shop">Ürünlere bak</a></div>`);
  }
  const notFound = () => `<div class="empty"><h1 class="d">Bulunamadı</h1><p>Aradığın sayfa yok ya da kaldırılmış.</p><a class="btn" href="#/shop">Mağazaya dön</a></div>`;

  /* --- yönlendirme --- */
  function render() {
    const [path, qs] = (location.hash.slice(1) || "/").split("?");
    const q = new URLSearchParams(qs || ""), seg = path.split("/");
    let html, nav = "home";
    if (path === "/" || path === "") html = home();
    else if (seg[1] === "shop") { html = shop(q); nav = "shop"; }
    else if (seg[1] === "p") { html = product(seg[2]); nav = "shop"; }
    else if (seg[1] === "cart") { html = cartView(); nav = "cart"; }
    else if (seg[1] === "fav") { html = favView(); nav = "fav"; }
    else html = notFound();
    view.innerHTML = html;
    document.querySelectorAll("[data-nav]").forEach(a => a.classList.toggle("on", a.dataset.nav === nav));
    const count = cart.reduce((a, l) => a + l.qty, 0), b = $("#bagCount");
    b.hidden = !count; b.textContent = count;
    bind(seg);
  }

  function bind(seg) {
    const sort = $("#sort");
    if (sort) sort.onchange = () => { const q = new URLSearchParams(location.hash.split("?")[1] || ""); q.set("sort", sort.value); q.delete("n"); location.hash = "/shop?" + q; };
    if (seg[1] === "p") bindProduct(byId(seg[2]));
    if (seg[1] === "cart") bindCart();
  }

  function bindProduct(p) {
    if (!p) return;
    let size = p.sizes.length === 1 ? p.sizes[0] : "", ci = 0, qty = 1;
    const sz = $("#sz"), err = $("#err");
    if (size) sz.querySelector("button").setAttribute("aria-pressed", "true");
    sz.onclick = e => { const b = e.target.closest("button"); if (!b) return; size = b.dataset.s; err.textContent = ""; sz.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); };
    $("#sw").onclick = e => { const b = e.target.closest("button"); if (!b) return; ci = +b.dataset.c; $("#colName").textContent = p.colors[ci].name; $("#sw").querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b)); };
    document.querySelector(".thumbs").onclick = e => { const b = e.target.closest("button"); if (!b) return; $("#mainph").querySelector(".ph").outerHTML = photo(p, +b.dataset.v); document.querySelectorAll(".thumbs button").forEach(x => x.setAttribute("aria-current", x === b)); };
    document.querySelectorAll("[data-q]").forEach(b => b.onclick = () => { qty = Math.min(9, Math.max(1, qty + +b.dataset.q)); $("#q").textContent = qty; });
    $("#add").onclick = () => {
      if (!size) { err.textContent = "Önce bir beden seç."; sz.querySelector("button").focus(); return; }
      const l = { id: p.id, size, color: p.colors[ci].name, qty }, k = lineKey(l), ex = cart.find(x => lineKey(x) === k);
      ex ? ex.qty = Math.min(9, ex.qty + qty) : cart.push(l);
      save("cart", cart); toast("Sepete eklendi"); updateBadge();
    };
  }

  function bindCart() {
    view.querySelectorAll("[data-ln]").forEach(b => b.onclick = () => { const l = cart[+b.dataset.ln]; l.qty = Math.min(9, Math.max(1, l.qty + +b.dataset.d)); save("cart", cart); render(); });
    view.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { cart.splice(+b.dataset.rm, 1); save("cart", cart); render(); });
    const f = $("#codeForm");
    if (f) f.onsubmit = e => {
      e.preventDefault(); const v = $("#codeIn").value.trim().toUpperCase();
      if (!v) { code = ""; save("code", ""); render(); return; }
      if (!S.discountCodes[v]) { $("#codeMsg").textContent = "Bu kod geçerli değil."; return; }
      code = v; save("code", v); render();
    };
    const co = $("#checkout");
    if (co) co.onclick = () => {
      if (!S.whatsapp) { $("#payNote").textContent = "Sipariş numarası ayarlanmamış. config.js içindeki whatsapp alanına numaranı yaz."; $("#payNote").style.color = "#b00020"; return; }
      const t = totals();
      const lines = cart.map(l => { const p = byId(l.id); return `• ${p.name} (${l.size}, ${l.color}) x${l.qty} — ${fmt.format(p.price * l.qty)}`; });
      const msg = [`${S.brand} siparişi`, "", ...lines, "", t.disc ? `İndirim (${code}): −${fmt.format(t.disc)}` : null, `Kargo: ${t.ship ? fmt.format(t.ship) : "Ücretsiz"}`, `Toplam: ${fmt.format(t.total)}`].filter(x => x !== null).join("\n");
      window.open(`https://wa.me/${S.whatsapp}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
    };
  }

  function updateBadge() { const c = cart.reduce((a, l) => a + l.qty, 0), b = $("#bagCount"); b.hidden = !c; b.textContent = c; }

  /* favori kalbi, tüm sayfalarda */
  document.addEventListener("click", e => {
    const pc = e.target.closest("[data-code]");
    if (pc) { code = pc.dataset.code; save("code", code); return; }
    const b = e.target.closest("[data-fav]"); if (!b) return;
    e.preventDefault();
    const id = b.dataset.fav; favs = favs.includes(id) ? favs.filter(x => x !== id) : [...favs, id]; save("favs", favs);
    toast(favs.includes(id) ? "Favorilere eklendi" : "Favorilerden çıkarıldı"); render();
  });

  /* arama */
  const sb = $("#searchBar"), si = $("#searchInput");
  $("#searchBtn").onclick = () => { sb.hidden = !sb.hidden; if (!sb.hidden) si.focus(); };
  sb.onsubmit = e => { e.preventDefault(); location.hash = "/shop?q=" + encodeURIComponent(si.value.trim()); sb.hidden = true; };

  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });
  render();
})();
