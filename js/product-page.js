"use strict";

// Product page: product.html?p=<product handle>&variant=<variant id>
(() => {
  const params = new URLSearchParams(location.search);
  const handle = params.get("p");

  const section = document.querySelector(".product");
  const mainImg = document.querySelector(".product__main img");
  const thumbs = document.querySelector(".product__thumbs");
  const titleEl = document.querySelector(".product__title");
  const priceEl = document.querySelector(".product__price");
  const optionsEl = document.querySelector(".product__options");
  const form = document.querySelector(".product__form");
  const qty = document.querySelector("#qty");
  const addButton = document.querySelector(".product__add");
  const desc = document.querySelector(".product__desc");
  const status = document.querySelector(".product__status");
  const slides = document.querySelector(".product__slides");
  const dots = document.querySelector(".product__dots");
  const buybar = document.querySelector(".buybar");
  const buyButton = document.querySelector(".buybar__add");
  let images = [];
  const { img, money } = Store;

  // Only simple formatting from the Shopify description is kept.
  function cleanHTML(html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const allowed = new Set(["P", "BR", "STRONG", "B", "EM", "I", "UL", "OL", "LI", "A"]);
    const walk = (node) => {
      for (const child of [...node.children]) {
        walk(child);
        if (!allowed.has(child.tagName)) { child.replaceWith(...child.childNodes); continue; }
        for (const attr of [...child.attributes]) if (!(child.tagName === "A" && attr.name === "href")) child.removeAttribute(attr.name);
        if (child.tagName === "A" && !/^https?:/i.test(child.getAttribute("href") || "")) child.removeAttribute("href");
      }
    };
    walk(doc.body);
    return doc.body.innerHTML;
  }

  function showImage(src) {
    mainImg.src = img(src, 1200);
    mainImg.srcset = [600, 900, 1200, 1800].map((w) => `${img(src, w)} ${w}w`).join(", ");
    mainImg.sizes = "(max-width: 899px) 100vw, 55vw";
    for (const button of thumbs.querySelectorAll("button")) {
      button.setAttribute("aria-current", String(button.dataset.src === src));
    }
    // Phones: swipe to the same photo.
    const index = images.indexOf(src);
    if (index >= 0 && slides.clientWidth) slides.scrollTo({ left: index * slides.clientWidth, behavior: "smooth" });
  }

  // Phones swipe through full-width photos, with a dot for each.
  function buildSlides(product) {
    slides.replaceChildren(...product.images.map((src, i) => {
      const li = document.createElement("li");
      const image = document.createElement("img");
      image.src = img(src, 900);
      image.srcset = [600, 900, 1200].map((w) => `${img(src, w)} ${w}w`).join(", ");
      image.sizes = "100vw";
      image.alt = i ? "" : product.title;
      image.width = 4;
      image.height = 5;
      if (i) image.loading = "lazy";
      li.append(image);
      return li;
    }));
    dots.replaceChildren(...product.images.map((src, i) => {
      const dot = document.createElement("button");
      dot.type = "button";
      dot.setAttribute("aria-label", `Show image ${i + 1} of ${product.images.length}`);
      dot.addEventListener("click", () => slides.scrollTo({ left: i * slides.clientWidth, behavior: "smooth" }));
      return dot;
    }));
    dots.hidden = product.images.length < 2;
    let queued = false;
    const markDot = () => {
      queued = false;
      const current = Math.round(slides.scrollLeft / (slides.clientWidth || 1));
      [...dots.children].forEach((dot, i) => dot.setAttribute("aria-current", String(i === current)));
    };
    slides.addEventListener("scroll", () => {
      if (!queued) { queued = true; requestAnimationFrame(markDot); }
    }, { passive: true });
    markDot();
  }

  // Phones: a bar with Add to cart stays at the bottom while the main button is off screen.
  function watchBuybar(product) {
    document.querySelector(".buybar__title").textContent = product.title;
    buyButton.addEventListener("click", () => {
      if (addButton.disabled) document.querySelector(".product__options").scrollIntoView({ behavior: "smooth", block: "center" });
      else form.requestSubmit();
    });
    const phone = matchMedia("(max-width: 899px)");
    let offscreen = false;
    const set = () => {
      const show = offscreen && phone.matches;
      buybar.classList.toggle("is-visible", show);
      buybar.toggleAttribute("inert", !show);
      buybar.setAttribute("aria-hidden", String(!show));
      buyButton.tabIndex = show ? 0 : -1;
      document.body.classList.toggle("has-buybar", show);
    };
    new IntersectionObserver(([entry]) => { offscreen = !entry.isIntersecting; set(); }).observe(addButton);
    phone.addEventListener("change", set);
  }

  function fail() {
    section.removeAttribute("aria-busy");
    section.classList.add("is-missing");
    status.hidden = false;
    status.innerHTML = '<h1>Page not found</h1><a class="btn btn--ink" href="shop.html">Continue shopping</a>';
    document.title = "Page not found – Mr. Sunshine’s";
  }

  if (!handle) { fail(); return; }

  Store.getProduct(handle).then((product) => {
    document.title = `${product.title} – Mr. Sunshine’s`;
    titleEl.textContent = product.title;
    desc.innerHTML = cleanHTML(product.description);
    // Size charts become tables; chart pictures without a table go back at the end of the photos.
    const { charts, leftover } = sizeChartsFor(product);
    document.querySelector(".product__charts").replaceChildren(...charts.map(sizeChartTable));
    product.images = [...product.images, ...leftover];
    mainImg.alt = product.title;

    // Gallery
    thumbs.replaceChildren(...product.images.map((src, i) => {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.src = src;
      button.setAttribute("aria-label", `Show image ${i + 1} of ${product.images.length}`);
      const image = document.createElement("img");
      image.src = img(src, 200);
      image.alt = "";
      image.loading = "lazy";
      button.append(image);
      button.addEventListener("click", () => showImage(src));
      li.append(button);
      return li;
    }));
    thumbs.hidden = product.images.length < 2;
    images = product.images;
    buildSlides(product);
    watchBuybar(product);

    // Options: one row of buttons per option (Size, Color, …). Shopify's "Default Title" means no choice.
    const hasChoice = !(product.variants.length === 1 && product.variants[0].title === "Default Title");
    const fromUrl = product.variants.find((v) => String(v.id) === params.get("variant"));
    let selected = [...(fromUrl || product.variants.find((v) => v.available) || product.variants[0]).options];

    const fieldsets = hasChoice ? product.options.map((option, index) => {
      const fieldset = document.createElement("fieldset");
      fieldset.className = "picker";
      const legend = document.createElement("legend");
      legend.textContent = option.name;
      const values = document.createElement("div");
      values.className = "picker__values";
      const names = option.values.length ? option.values : [...new Set(product.variants.map((v) => v.options[index]))];
      for (const value of names) {
        const label = document.createElement("label");
        const input = document.createElement("input");
        input.type = "radio";
        input.name = `option-${index}`;
        input.value = value;
        input.addEventListener("change", () => { selected[index] = value; update(true); });
        const span = document.createElement("span");
        span.textContent = value;
        label.append(input, span);
        values.append(label);
      }
      fieldset.append(legend, values);
      return fieldset;
    }) : [];
    optionsEl.replaceChildren(...fieldsets);

    const current = () => product.variants.find((v) => v.options.every((o, i) => o === selected[i]));

    function update(fromChoice) {
      const variant = current();
      // Mark values that would be sold out or don't exist with the other choices kept.
      fieldsets.forEach((fieldset, index) => {
        for (const input of fieldset.querySelectorAll("input")) {
          input.checked = input.value === selected[index];
          const match = product.variants.find((v) => v.options.every((o, i) => (i === index ? o === input.value : o === selected[i])));
          input.parentElement.classList.toggle("is-unavailable", !match || !match.available);
        }
      });
      const shown = variant || { price: product.price, compareAt: product.compareAt };
      priceEl.innerHTML = shown.compareAt > shown.price
        ? `<s><span class="visually-hidden">Regular price </span>${money(shown.compareAt)}</s> <span class="price__now"><span class="visually-hidden">Sale price </span>${money(shown.price)}</span>`
        : `<span>${money(shown.price)}</span>`;
      addButton.disabled = !variant || !variant.available;
      addButton.textContent = !variant ? "Unavailable" : variant.available ? "Add to cart" : "Sold out";
      buyButton.textContent = addButton.textContent;
      buyButton.classList.toggle("is-off", addButton.disabled);
      document.querySelector(".buybar__price").innerHTML = priceEl.innerHTML;
      if (variant?.image) showImage(variant.image);
      else if (!fromChoice) showImage(product.images[0]);
      if (fromChoice && variant) {
        const url = new URL(location.href);
        url.searchParams.set("variant", variant.id);
        history.replaceState(null, "", url);
      }
    }

    update(false);
    if (!mainImg.getAttribute("src") && product.images[0]) showImage(product.images[0]);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const variant = current();
      if (!variant || !variant.available) return;
      Store.cart.add(product, variant, Math.max(1, Math.floor(Number(qty.value) || 1)));
      qty.value = 1;
      window.openCart?.();
    });

    section.removeAttribute("aria-busy");
  }).catch(fail);

  for (const button of document.querySelectorAll(".product__qty [data-step]")) {
    button.addEventListener("click", () => {
      qty.value = Math.max(1, (Math.floor(Number(qty.value)) || 1) + Number(button.dataset.step));
    });
  }
})();
