"use strict";

// Collection page: shop.html?c=<collection handle> (default: Shop all), or shop.html?q=<search>.
(() => {
  const params = new URLSearchParams(location.search);
  const query = (params.get("q") || "").trim();
  const handle = params.get("c") || "shop-all";

  const title = document.querySelector(".shop-page__title");
  const count = document.querySelector(".shop-page__count");
  const grid = document.querySelector(".shop-grid");
  const status = document.querySelector(".shop-page__status");
  const sort = document.querySelector(".sort select");
  const { img, money } = Store;

  // Highlight the collection being shown.
  for (const chip of document.querySelectorAll(".chips a")) {
    const chipHandle = new URL(chip.href).searchParams.get("c") || "shop-all";
    if (!query && chipHandle === handle) {
      chip.setAttribute("aria-current", "page");
      // On phones the chips scroll sideways: bring the current one into view.
      const row = chip.parentElement;
      row.scrollLeft = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
    }
  }
  if (query) document.querySelector("#q").value = query;

  // Placeholders while Shopify answers.
  grid.replaceChildren(...Array.from({ length: 6 }, () => {
    const li = document.createElement("li");
    li.className = "card is-loading";
    li.innerHTML = '<span class="card__media"></span><span class="card__text"><span>&nbsp;</span></span>';
    return li;
  }));

  function priceHTML(p) {
    if (p.compareAt > p.price) {
      return `<s><span class="visually-hidden">Was </span>${money(p.compareAt)}</s> <span class="price__now"><span class="visually-hidden">Now </span>${money(p.price)}</span>`;
    }
    return `<span>${money(p.price)}</span>`;
  }

  function card(p) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.className = "card";
    a.href = `product.html?p=${encodeURIComponent(p.handle)}`;
    const media = document.createElement("span");
    media.className = "card__media";
    p.images.slice(0, 2).forEach((src, i) => {
      const image = document.createElement("img");
      image.className = i ? "card__worn" : "card__flat";
      image.src = img(src, 600);
      image.srcset = [400, 600, 900].map((w) => `${img(src, w)} ${w}w`).join(", ");
      image.sizes = "(max-width: 699px) 50vw, 33vw";
      image.alt = i ? "" : p.title;
      image.loading = "lazy";
      image.decoding = "async";
      media.append(image);
    });
    if (!p.available || p.compareAt > p.price) {
      const tag = document.createElement("span");
      tag.className = p.available ? "tag tag--sale" : "tag";
      tag.textContent = p.available ? "Sale" : "Sold out";
      media.append(tag);
    }
    const text = document.createElement("span");
    text.className = "card__text";
    const name = document.createElement("span");
    name.textContent = p.title;
    const price = document.createElement("span");
    price.className = "price";
    price.innerHTML = priceHTML(p);
    text.append(name, price);
    a.append(media, text);
    li.append(a);
    return li;
  }

  const sorters = {
    featured: () => 0,
    "price-asc": (a, b) => a.price - b.price,
    "price-desc": (a, b) => b.price - a.price,
    "title-asc": (a, b) => a.title.localeCompare(b.title),
    "title-desc": (a, b) => b.title.localeCompare(a.title),
  };

  let products = [];

  // Pages: PAGE_SIZE products each (12 fills whole rows in both the 3 and 2 column grids).
  const PAGE_SIZE = 12;
  const pager = document.querySelector(".pager");
  const pageFromUrl = () => Math.max(1, Math.floor(Number(new URL(location.href).searchParams.get("page"))) || 1);
  let page = pageFromUrl();

  function pageUrl(n) {
    const url = new URL(location.href);
    if (n > 1) url.searchParams.set("page", n);
    else url.searchParams.delete("page");
    return url;
  }

  function pagerLink(n, label, current) {
    const a = document.createElement("a");
    a.href = pageUrl(n).search || location.pathname.split("/").pop();
    a.dataset.page = n;
    a.innerHTML = label;
    if (current) a.setAttribute("aria-current", "page");
    return a;
  }

  function renderPager(pages) {
    pager.hidden = pages < 2;
    if (pages < 2) { pager.replaceChildren(); return; }
    const parts = [];
    if (page > 1) {
      const prev = pagerLink(page - 1, '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>');
      prev.className = "pager__step";
      prev.setAttribute("aria-label", "Previous page");
      parts.push(prev);
    }
    for (let n = 1; n <= pages; n++) {
      const link = pagerLink(n, String(n), n === page);
      link.setAttribute("aria-label", `Page ${n}`);
      parts.push(link);
    }
    if (page < pages) {
      const next = pagerLink(page + 1, '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M9 5l7 7-7 7"/></svg>');
      next.className = "pager__step";
      next.setAttribute("aria-label", "Next page");
      parts.push(next);
    }
    pager.replaceChildren(...parts);
  }

  function render() {
    const list = [...products].sort(sorters[sort.value] || sorters.featured);
    const n = list.length;
    const pages = Math.max(1, Math.ceil(n / PAGE_SIZE));
    page = Math.min(page, pages);
    grid.replaceChildren(...list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map(card));
    grid.removeAttribute("aria-busy");
    renderPager(pages);
    count.textContent = query ? `${n} ${n === 1 ? "result" : "results"}` : `${n} ${n === 1 ? "product" : "products"}`;
    status.hidden = n > 0;
    if (!n) {
      status.innerHTML = '<p>No products found</p><a class="btn btn--ink" href="shop.html">Continue shopping</a>';
    }
  }

  // Changing page swaps the grid in place and keeps a history entry, so Back works.
  pager.addEventListener("click", (event) => {
    const link = event.target.closest("a[data-page]");
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    page = Number(link.dataset.page);
    history.pushState(null, "", pageUrl(page));
    render();
    document.querySelector(".shop-page__bar").scrollIntoView({ block: "start" });
    grid.querySelector("a")?.focus({ preventScroll: true });
  });
  window.addEventListener("popstate", () => {
    page = pageFromUrl();
    render();
  });

  sort.addEventListener("change", () => {
    page = 1;
    render();
    const url = pageUrl(1);
    if (sort.value === "featured") url.searchParams.delete("sort");
    else url.searchParams.set("sort", sort.value);
    history.replaceState(null, "", url);
  });
  if (sorters[params.get("sort")]) sort.value = params.get("sort");

  (query ? Store.getCollection("shop-all") : Store.getCollection(handle))
    .then((collection) => {
      if (query) {
        const words = query.toLowerCase().split(/\s+/);
        products = collection.products.filter((p) => {
          const haystack = `${p.title} ${p.type}`.toLowerCase();
          return words.every((w) => haystack.includes(w));
        });
        title.textContent = "Search results";
        document.title = `Search: ${query} – Mr. Sunshine’s`;
      } else {
        products = collection.products;
        title.textContent = collection.title || title.textContent;
        document.title = `${collection.title || "Shop all"} – Mr. Sunshine’s`;
      }
      render();
    })
    .catch(() => {
      grid.replaceChildren();
      grid.removeAttribute("aria-busy");
      status.hidden = false;
      status.innerHTML = `<p>No products found</p><a class="btn btn--ink" href="${Store.DOMAIN}/collections/${encodeURIComponent(handle)}">Shop all</a>`;
    });
})();
