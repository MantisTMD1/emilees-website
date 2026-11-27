"use strict";

/*
  Store: products, collections and the cart.

  Products come live from Emilee's Shopify store, so anything she changes in Shopify
  (new products, prices, sizes, photos, sold out) shows on this site with no code changes.
  It reads the public catalog every Shopify store publishes (/products/…, /collections/…).

  Checkout happens on Shopify: the cart here is kept in the browser and "Check out" sends
  it to Shopify's checkout as a cart link (mrsunshines.shop/cart/VARIANT:QTY,…).

  Later, moving to Shopify's Storefront API (a real Shopify cart, discounts at checkout)
  only means replacing getJSON()/normalize below and the cart's checkoutUrl(); the pages
  use the plain shapes returned here and won't need to change.
*/
const Store = (() => {
  const DOMAIN = "https://mrsunshines.shop";

  async function getJSON(path) {
    const response = await fetch(DOMAIN + path, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`${response.status} ${path}`);
    return response.json();
  }

  const absolute = (src) => (src && src.startsWith("//") ? `https:${src}` : src);

  // Shopify's image CDN resizes on request.
  function img(src, width) {
    if (!src) return "";
    const url = new URL(absolute(src));
    url.searchParams.set("width", width);
    return url.href;
  }

  function money(amount) {
    const n = Number(amount);
    return `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
  }

  // One product shape for the whole site, from either catalog endpoint.
  // The .js endpoint gives prices in cents; the .json listing gives "35.00" strings.
  function normalize(p, cents) {
    const amount = (v) => (v == null || v === "" ? null : cents ? v / 100 : Number(v));
    const variants = p.variants.map((v) => ({
      id: v.id,
      title: v.title,
      options: [v.option1, v.option2, v.option3].filter((o) => o != null),
      price: amount(v.price),
      compareAt: amount(v.compare_at_price),
      available: v.available !== false,
      image: absolute(v.featured_image?.src) || null,
    }));
    // Size charts on tees are wide images uploaded with the photos. They're shown as real tables on the
    // product page (js/size-charts.js), so they're kept out of the photos. The women's crop tee is a
    // different brand with its own chart, so its image stays.
    const fileName = (src) => src.split("/").pop().split("?")[0];
    const sizes = new Map((p.media || []).map((m) => [fileName(m.src), m]));
    const type = p.product_type || p.type || "";
    const tableCharts = type === "T-Shirt" && !/women/i.test(p.title);
    const isChart = (i) => {
      const src = typeof i === "string" ? i : i.src;
      const dims = typeof i === "string" ? sizes.get(fileName(src)) : i;
      return tableCharts && dims?.width / dims?.height >= 1.75;
    };
    const images = p.images.filter((i) => !isChart(i)).map((i) => absolute(typeof i === "string" ? i : i.src));
    const prices = variants.map((v) => v.price);
    const onSale = variants.filter((v) => v.compareAt > v.price);
    return {
      handle: p.handle,
      title: p.title,
      type,
      description: p.body_html ?? p.description ?? "",
      images,
      options: p.options.map((o) => (typeof o === "string" ? { name: o, values: [] } : { name: o.name, values: o.values })),
      variants,
      price: Math.min(...prices),
      compareAt: onSale.length ? Math.max(...onSale.map((v) => v.compareAt)) : null,
      available: variants.some((v) => v.available),
    };
  }

  async function getCollection(handle = "shop-all") {
    const [info, list] = await Promise.all([
      getJSON(`/collections/${encodeURIComponent(handle)}.json`).catch(() => null),
      getJSON(`/collections/${encodeURIComponent(handle)}/products.json?limit=250`),
    ]);
    return {
      handle,
      title: info?.collection?.title || "",
      products: list.products.map((p) => normalize(p, false)),
    };
  }

  async function getProduct(handle) {
    return normalize(await getJSON(`/products/${encodeURIComponent(handle)}.js`), true);
  }

  /* ---------- Cart (kept in this browser until checkout) ---------- */
  const CART_KEY = "cart";
  const listeners = new Set();

  function read() {
    try {
      const items = JSON.parse(localStorage.getItem(CART_KEY));
      return Array.isArray(items) ? items : [];
    } catch {
      return [];
    }
  }

  function write(items) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch { /* storage blocked: cart lasts this page only */ }
    memory = items;
    listeners.forEach((fn) => fn(items));
  }

  let memory = read();

  const cart = {
    items: () => memory,
    count: () => memory.reduce((n, i) => n + i.qty, 0),
    total: () => memory.reduce((n, i) => n + i.qty * i.price, 0),
    add(product, variant, qty = 1) {
      const items = memory.map((i) => ({ ...i }));
      const found = items.find((i) => i.id === variant.id);
      if (found) found.qty += qty;
      else items.push({
        id: variant.id,
        qty,
        handle: product.handle,
        title: product.title,
        variant: product.variants.length > 1 ? variant.title : "",
        price: variant.price,
        image: variant.image || product.images[0] || "",
      });
      write(items);
    },
    setQty(id, qty) {
      write(memory.map((i) => (i.id === id ? { ...i, qty } : i)).filter((i) => i.qty > 0));
    },
    remove(id) { write(memory.filter((i) => i.id !== id)); },
    checkoutUrl: () => `${DOMAIN}/cart/${memory.map((i) => `${i.id}:${i.qty}`).join(",")}`,
    onChange(fn) { listeners.add(fn); },
  };

  // Another tab changed the cart.
  window.addEventListener("storage", (event) => {
    if (event.key !== CART_KEY) return;
    memory = read();
    listeners.forEach((fn) => fn(memory));
  });

  return { DOMAIN, img, money, getCollection, getProduct, cart };
})();

/* ---------- Cart drawer, on every page ---------- */
(() => {
  const link = document.querySelector(".cart-link");
  if (!link) return;

  const badge = document.createElement("span");
  badge.className = "cart-link__count";
  link.append(badge);

  const drawer = document.createElement("dialog");
  drawer.className = "cart";
  drawer.setAttribute("aria-labelledby", "cart-title");
  drawer.innerHTML = `
    <div class="cart__head">
      <h2 id="cart-title">Your cart</h2>
      <form method="dialog"><button class="cart__close" aria-label="Close"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></form>
    </div>
    <ul class="cart__items"></ul>
    <div class="cart__empty">
      <p>Your cart is empty</p>
      <a class="btn btn--ink" href="shop.html">Continue shopping</a>
    </div>
    <div class="cart__foot">
      <p class="cart__total"><span>Estimated total</span> <strong></strong></p>
      <p class="cart__note">Taxes, discounts and shipping calculated at checkout.</p>
      <a class="btn btn--lime cart__checkout" href="#">Check out</a>
    </div>`;
  document.body.append(drawer);

  const list = drawer.querySelector(".cart__items");
  const { cart, money, img } = Store;

  function row(item) {
    const li = document.createElement("li");
    li.className = "cart__item";
    li.innerHTML = `
      <a class="cart__img" href=""><img alt="" width="80" height="100" loading="lazy"></a>
      <div class="cart__info">
        <a class="cart__name" href=""></a>
        <p class="cart__variant"></p>
        <p class="cart__price"></p>
        <div class="cart__row">
          <div class="qty">
            <button type="button" data-step="-1"><span class="visually-hidden">Decrease quantity for </span><span aria-hidden="true">−</span></button>
            <input type="number" min="0" inputmode="numeric">
            <button type="button" data-step="1"><span class="visually-hidden">Increase quantity for </span><span aria-hidden="true">+</span></button>
          </div>
          <button class="cart__remove" type="button">Remove</button>
        </div>
      </div>`;
    const href = `product.html?p=${encodeURIComponent(item.handle)}&variant=${item.id}`;
    li.querySelectorAll("a").forEach((a) => { a.href = href; });
    li.querySelector("img").src = img(item.image, 200);
    li.querySelector(".cart__name").textContent = item.title;
    li.querySelector(".cart__variant").textContent = item.variant;
    li.querySelector(".cart__price").textContent = money(item.price * item.qty);
    const input = li.querySelector("input");
    input.value = item.qty;
    input.setAttribute("aria-label", `Quantity for ${item.title}`);
    li.querySelectorAll("[data-step] .visually-hidden").forEach((s) => s.append(item.title));
    li.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => cart.setQty(item.id, item.qty + Number(b.dataset.step))));
    input.addEventListener("change", () => cart.setQty(item.id, Math.max(0, Math.floor(Number(input.value) || 0))));
    li.querySelector(".cart__remove").addEventListener("click", () => cart.remove(item.id));
    li.querySelector(".cart__remove").setAttribute("aria-label", `Remove ${item.title}`);
    return li;
  }

  function render() {
    const items = cart.items();
    const count = cart.count();
    badge.textContent = count ? String(count) : "";
    badge.hidden = !count;
    link.setAttribute("aria-label", count ? `Cart, ${count} ${count === 1 ? "item" : "items"}` : "Cart");
    // Keep focus on the same control when a row re-renders.
    const active = document.activeElement;
    const focusKey = active && list.contains(active)
      ? { id: active.closest(".cart__item")?.dataset.id, sel: active.dataset.step ? `[data-step="${active.dataset.step}"]` : active.matches("input") ? "input" : ".cart__remove" }
      : null;
    list.replaceChildren(...items.map((item) => {
      const li = row(item);
      li.dataset.id = item.id;
      return li;
    }));
    drawer.classList.toggle("is-empty", !items.length);
    drawer.querySelector(".cart__total strong").textContent = money(cart.total());
    drawer.querySelector(".cart__checkout").href = items.length ? cart.checkoutUrl() : "#";
    if (focusKey) {
      const li = list.querySelector(`[data-id="${focusKey.id}"]`);
      const target = li?.querySelector(focusKey.sel);
      (target || drawer.querySelector(".cart__close")).focus();
    }
  }

  link.addEventListener("click", (event) => {
    event.preventDefault();
    drawer.showModal();
  });
  drawer.addEventListener("click", (event) => {
    if (event.target === drawer) drawer.close();
  });
  cart.onChange(render);
  render();

  // Product pages open the drawer after adding.
  window.openCart = () => drawer.showModal();
})();
