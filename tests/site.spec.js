const { test, expect } = require("@playwright/test");

const PAGES = ["/index.html", "/about.html"];
const isPhone = (page) => page.viewportSize().width < 700;

// A small stand-in catalog, shaped like Shopify's public endpoints, so shop tests never call the live store.
const CDN = "//cdn.shopify.com/s/files/1/0549/8870/1912/files/";
const IMG = { frog: CDN + "6E92E993-E5F3-442D-93E3-AB4C2B211885.jpg", frogGray: CDN + "2BC8E7D4-6539-459D-8DD7-0D0CCFC663C0.jpg", bug: CDN + "15538023-FD88-40B1-B4E5-90A467FD202B.jpg", mick: CDN + "912565B7-B589-45A5-B0F0-2E2E535611D5.jpg", chart: CDN + "C05D9E52-5DE4-4CA4-8FC8-ECCF7ED37A1A.jpg" };
const DIMS = { [IMG.chart]: [1444, 753] }; // size chart images are wide
const dims = (src) => DIMS[src] || [800, 1000];
const CATALOG = [
  { handle: "tipper-frog-tee", title: "Tipper Frog Tee", product_type: "T-Shirt", body_html: "<p>A relaxed fit t-shirt.</p><script>bad()</script><p onclick=\"bad()\">100% cotton.</p>",
    images: [IMG.frog, IMG.frogGray, IMG.chart], options: [{ name: "Size", values: ["Small", "Medium"] }, { name: "Color", values: ["Black", "Gray"] }],
    variants: [
      { id: 101, title: "Small / Black", option1: "Small", option2: "Black", price: 35, available: true },
      { id: 102, title: "Medium / Black", option1: "Medium", option2: "Black", price: 35, available: true },
      { id: 103, title: "Small / Gray", option1: "Small", option2: "Gray", price: 35, available: false, image: IMG.frogGray },
      { id: 104, title: "Medium / Gray", option1: "Medium", option2: "Gray", price: 35, available: true, image: IMG.frogGray },
    ] },
  { handle: "bug-off-tee", title: "Bug Off Tee", product_type: "T-Shirt", body_html: "<p>Bug off.</p>", images: [IMG.bug],
    options: [{ name: "Title", values: ["Default Title"] }], variants: [{ id: 201, title: "Default Title", option1: "Default Title", price: 25, compare: 35, available: true }] },
  { handle: "1-800-mickman-tee", title: "1-800-MICK-MAN Tee", product_type: "T-Shirt", body_html: "", images: [IMG.mick],
    options: [{ name: "Title", values: ["Default Title"] }], variants: [{ id: 301, title: "Default Title", option1: "Default Title", price: 35, available: false }] },
];
const listing = (p) => ({ ...p, images: p.images.map((src) => ({ src: "https:" + src, width: dims(src)[0], height: dims(src)[1] })),
  variants: p.variants.map((v) => ({ ...v, option2: v.option2 ?? null, option3: null, price: v.price.toFixed(2), compare_at_price: v.compare ? v.compare.toFixed(2) : null, featured_image: v.image ? { src: "https:" + v.image } : null })) });
const productJs = (p) => ({ handle: p.handle, title: p.title, type: p.product_type, description: p.body_html, images: p.images, options: p.options,
  media: p.images.map((src) => ({ src: "https:" + src, width: dims(src)[0], height: dims(src)[1] })),
  variants: p.variants.map((v) => ({ ...v, option2: v.option2 ?? null, option3: null, price: v.price * 100, compare_at_price: v.compare ? v.compare * 100 : null, featured_image: v.image ? { src: v.image } : null })) });

async function stubCatalog(page) {
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(body) });
  await page.route(/^https:\/\/mrsunshines\.shop\/collections\/([\w-]+)\.json/, (route) => json(route, { collection: { title: route.request().url().includes("/tees") ? "Tees" : "Shop all" } }));
  await page.route(/^https:\/\/mrsunshines\.shop\/collections\/[\w-]+\/products\.json/, (route) => json(route, { products: CATALOG.map(listing) }));
  await page.route(/^https:\/\/mrsunshines\.shop\/products\/([\w-]+)\.js/, (route) => {
    const handle = route.request().url().match(/products\/([\w-]+)\.js/)[1];
    const p = CATALOG.find((x) => x.handle === handle);
    return p ? json(route, productJs(p)) : json(route, { error: "not found" }, 404);
  });
}

let errors;
test.beforeEach(async ({ page }, info) => {
  errors = [];
  // The pop-up opens by itself on a first visit; every test but its own starts as a returning visitor.
  if (!info.title.includes("opens by itself")) await page.addInitScript(() => localStorage.setItem("popup-shown", "1"));
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  // Never touch the live store: links and forms that lead there stop here.
  await page.route(/^https:\/\/mrsunshines\.shop\//, (route) => route.fulfill({ contentType: "text/html", body: "store" }));
  await stubCatalog(page);
});

async function loadImages(page) {
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    document.querySelectorAll("img").forEach((i) => { i.loading = "eager"; });
  });
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 40000 });
}

async function scrollThrough(page) {
  await loadImages(page);
  await page.evaluate(async () => {
    for (let y = 0; y <= document.documentElement.scrollHeight; y += 300) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 120));
    }
  });
  await page.waitForTimeout(2500);
}

const SHOP_PAGES = ["/shop.html?c=tees", "/product.html?p=tipper-frog-tee"];
for (const url of [...PAGES, ...SHOP_PAGES]) {
  test.describe(url, () => {
    test("loads with no errors and every image", async ({ page }) => {
      await page.goto(url);
      if (SHOP_PAGES.includes(url)) await page.locator(".shop-grid a.card, .picker").first().waitFor();
      await loadImages(page);
      const broken = await page.evaluate(() => [...document.images].filter((i) => !i.naturalWidth).map((i) => i.src));
      expect(broken).toEqual([]);
      expect(errors).toEqual([]);
    });

    test("no sideways scroll at any width", async ({ page }) => {
      await page.goto(url);
      for (const width of [320, 375, 430, 600, 699, 700, 768, 820, 899, 900, 1023, 1024, 1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: 800 });
        await page.waitForTimeout(60);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(over, `at ${width}px`).toBeLessThanOrEqual(0);
      }
    });

    test("basic structure and accessible names", async ({ page }) => {
      await page.goto(url);
      await expect(page.locator("h1")).toHaveCount(1);
      const bad = await page.evaluate(() => {
        const out = [];
        document.querySelectorAll("img:not([alt])").forEach((i) => out.push("no alt " + i.src));
        document.querySelectorAll("a, button, summary").forEach((e) => {
          const name = e.getAttribute("aria-label") || e.textContent.trim() || e.querySelector("img")?.alt;
          if (!name) out.push("no name " + e.outerHTML.slice(0, 100));
        });
        const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
        ids.filter((id, i) => ids.indexOf(id) !== i).forEach((id) => out.push("duplicate id " + id));
        document.querySelectorAll('a[href^="#"]').forEach((a) => {
          if (a.hash && !document.querySelector(a.hash)) out.push("dead anchor " + a.hash);
        });
        return out;
      });
      expect(bad).toEqual([]);
    });

    test("shop menu opens and closes", async ({ page }) => {
      await page.goto(url);
      if (page.viewportSize().width < 1024) {
        const button = page.locator(".menu-button");
        await button.click();
        await expect(button).toHaveAttribute("aria-expanded", "true");
        await page.locator(".shop summary").click();
        await expect(page.locator(".shop__menu a").first()).toBeVisible();
        await page.waitForTimeout(500);
        const login = await page.locator(".nav__login").boundingBox();
        expect(login.y + login.height).toBeLessThanOrEqual(page.viewportSize().height + 1);
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await expect(button).toHaveAttribute("aria-expanded", "false");
      } else {
        await page.locator(".shop summary").click();
        await expect(page.locator(".shop__menu a")).toHaveCount(5);
        await expect(page.locator(".shop__menu a").last()).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(page.locator(".shop__menu a").first()).toBeHidden();
      }
    });

    test("search opens, focuses and searches the shop", async ({ page }) => {
      await page.goto(url);
      await page.locator(".search summary").click();
      await expect(page.locator("#q")).toBeFocused();
      await page.locator("#q").fill("tee");
      await page.keyboard.press("Enter");
      await page.waitForURL(/\/shop\.html\?q=tee$/);
      await expect(page.locator(".shop-page__title")).toHaveText("Search results");
    });

    test("back to top", async ({ page }) => {
      test.skip(SHOP_PAGES.includes(url), "shop pages are too short with the test catalog");
      await page.goto(url);
      await loadImages(page);
      const top = page.locator(".to-top");
      await expect(top).not.toHaveClass(/is-visible/);
      await page.evaluate(() => scrollTo(0, 2200));
      await page.waitForTimeout(400);
      if (isPhone(page)) {
        await expect(top).not.toHaveClass(/is-visible/);
        await page.evaluate(() => scrollTo(0, 2000));
      }
      await expect(top).toHaveClass(/is-visible/);
      await top.click();
      await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
    });
  });
}

test("home and about link to each other", async ({ page }) => {
  await page.goto("/index.html");
  if (page.viewportSize().width < 1024) await page.locator(".menu-button").click();
  await page.locator(".nav__list").getByRole("link", { name: "About", exact: true }).click();
  await expect(page).toHaveURL(/about\.html$/);
  await page.locator(".header__logo").click();
  await expect(page).toHaveURL(/index\.html$/);
});

test("about photo is not cropped", async ({ page }) => {
  await page.goto("/about.html");
  await loadImages(page);
  const r = await page.locator(".story-hero img").evaluate((i) => {
    const b = i.getBoundingClientRect();
    return [b.width / b.height, i.naturalWidth / i.naturalHeight, b.height, innerHeight];
  });
  expect(Math.abs(r[0] - r[1])).toBeLessThan(0.02);
  expect(r[2]).toBeLessThanOrEqual(r[3]);
});

test("sign-up needs a valid email and posts the right fields", async ({ page }) => {
  await page.goto("/index.html");
  let post = null;
  await page.route(/mrsunshines\.shop\/contact/, (route) => {
    post = route.request().postData();
    route.fulfill({ contentType: "text/html", body: "stopped" });
  });
  await page.locator("#email").fill("not-an-email");
  await page.getByRole("button", { name: "Subscribe" }).click();
  await page.waitForTimeout(300);
  expect(post).toBeNull();
  await page.locator("#email").fill("test@example.com");
  await page.getByRole("button", { name: "Subscribe" }).click();
  await expect.poll(() => post).not.toBeNull();
  const fields = new URLSearchParams(post);
  expect(fields.get("contact[email]")).toBe("test@example.com");
  expect(fields.get("form_type")).toBe("customer");
});

test("reviews drift, pause and play", async ({ page }) => {
  await page.goto("/index.html");
  await loadImages(page);
  const list = page.locator(".reviews__list");
  await list.evaluate((e) => e.scrollIntoView({ block: "center" }));
  await page.mouse.move(2, 2);
  const left = () => list.evaluate((e) => e.scrollLeft);
  await page.waitForTimeout(800);
  const a = await left();
  await page.waitForTimeout(3000);
  const speed = ((await left()) - a) / 3;
  console.log(test.info().project.name, "review speed", speed.toFixed(1), "px/s");
  const want = isPhone(page) ? 40 : 65;
  expect(speed).toBeGreaterThan(want * 0.6);
  expect(speed).toBeLessThan(want * 1.25);
  await page.locator(".reviews__pause").click();
  await page.mouse.move(2, 2);
  const p = await left();
  await page.waitForTimeout(1000);
  expect(Math.abs((await left()) - p)).toBeLessThan(2);
  await expect(page.locator(".reviews__pause")).toHaveAttribute("aria-label", "Play reviews");
});

test("reviews and animation hold still with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/index.html");
  await expect(page.locator(".reviews__pause")).toHaveAttribute("aria-label", "Play reviews");
});

test("drawings clear the text around them", async ({ page }) => {
  await page.goto("/index.html");
  await loadImages(page);
  for (const width of [375, 600, 768, 900, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(150);
    const hits = await page.evaluate(() => {
      const text = (sel) => [...document.querySelectorAll(sel)].flatMap((e) => {
        const r = document.createRange(); r.selectNodeContents(e); return [...r.getClientRects()].map((b) => [sel, b]);
      });
      const boxes = text(".signup h2, .signup p, .signup label, .collections__head h2, .card__text, .blanket h2, .section-head h2");
      return [...document.querySelectorAll(".print")].flatMap((p) => {
        const a = p.getBoundingClientRect();
        return boxes.filter(([, b]) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom)
          .map(([, b]) => `${p.className} over text at y ${Math.round(b.top - a.top)}`);
      });
    });
    expect(hits, `at ${width}px`).toEqual([]);
  }
});

for (const url of PAGES) {
  test(`scroll animations finish and leave nothing hidden ${url}`, async ({ page }) => {
    await page.goto(url);
    await expect.poll(() => page.locator(".will-reveal").count()).toBeGreaterThan(5);
    await scrollThrough(page);
    expect(await page.locator(".will-reveal").count()).toBe(0);
    expect(errors).toEqual([]);
  });

  test(`reduced motion hides nothing ${url}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(url);
    expect(await page.locator(".will-reveal").count()).toBe(0);
  });

  test(`jumping to the bottom leaves nothing hidden ${url}`, async ({ page }) => {
    await page.goto(url);
    await loadImages(page);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(2500);
    expect(await page.locator(".will-reveal").count()).toBe(0);
  });
}

for (const url of PAGES) {
  test(`link preview ${url}`, async ({ page, request }) => {
    await page.goto(url);
    const meta = (name) => page.locator(`meta[property="${name}"]`).getAttribute("content");
    expect(await meta("og:title")).toBe(await page.title());
    expect(await meta("og:description")).toBeTruthy();
    const image = new URL(await meta("og:image"));
    expect(image.protocol).toBe("https:");
    const file = await request.get(image.pathname.replace("/emilees-website", ""));
    expect(file.headers()["content-type"]).toBe("image/png");
  });
}

for (const url of PAGES) {
  test(`don't miss out tab opens the sign-up ${url}`, async ({ page }) => {
    await page.goto(url);
    const open = page.getByRole("button", { name: "Don’t miss out!" });
    await expect(open).toBeVisible();
    const popup = page.getByRole("dialog");
    await open.click();
    await expect(popup).toBeVisible();
    await expect(page.locator("#popup-email")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(popup).toBeHidden();
    await expect(open).toBeFocused();
    await open.click();
    await popup.getByRole("button", { name: "Close" }).click();
    await expect(popup).toBeHidden();
    await open.click();
    await page.mouse.click(5, 5); // backdrop
    await expect(popup).toBeHidden();
    // The tab must not cover the back to top button or the footer on any width.
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(600);
    const tab = await page.locator(".teaser").boundingBox();
    for (const sel of [".to-top", ".footer p"]) {
      const b = await page.locator(sel).boundingBox();
      if (!b || !(await page.locator(sel).isVisible())) continue;
      const overlap = tab.x < b.x + b.width && b.x < tab.x + tab.width && tab.y < b.y + b.height && b.y < tab.y + tab.height;
      expect(overlap, sel).toBe(false);
    }
  });

  test(`dismissing the tab is remembered ${url}`, async ({ page }) => {
    await page.goto(url);
    await page.getByRole("button", { name: "Dismiss" }).click();
    await expect(page.locator(".teaser")).toBeHidden();
    await page.reload();
    await expect(page.locator(".teaser")).toBeHidden();
  });
}

test("pop-up opens by itself on the first visit only", async ({ page }) => {
  await page.goto("/index.html");
  const popup = page.getByRole("dialog");
  await expect(popup).toBeHidden();
  await expect(popup).toBeVisible({ timeout: 6000 });
  await expect(popup.getByRole("heading")).toHaveText("Mr. Sunshine’s");
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await page.reload();
  await page.waitForTimeout(4500);
  await expect(popup).toBeHidden();
  await page.goto("/about.html");
  await page.waitForTimeout(4500);
  await expect(popup).toBeHidden();
});

test("pop-up stays away once the tab is dismissed (opens by itself)", async ({ page }) => {
  await page.goto("/index.html");
  await page.getByRole("button", { name: "Dismiss" }).click();
  await page.waitForTimeout(4500);
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("pop-up subscribes to the newsletter", async ({ page }) => {
  await page.goto("/index.html");
  let post = null;
  await page.route(/mrsunshines\.shop\/contact/, (route) => {
    post = route.request().postData();
    route.fulfill({ contentType: "text/html", body: "stopped" });
  });
  await page.getByRole("button", { name: "Don’t miss out!" }).click();
  const popup = page.getByRole("dialog");
  await popup.getByRole("button", { name: "Subscribe" }).click();
  await page.waitForTimeout(300);
  expect(post).toBeNull();
  await page.locator("#popup-email").fill("test@example.com");
  await popup.getByRole("button", { name: "Subscribe" }).click();
  await expect.poll(() => post).not.toBeNull();
  const fields = new URLSearchParams(post);
  expect(fields.get("contact[email]")).toBe("test@example.com");
  expect(fields.get("contact[tags]")).toBe("newsletter");
});

test("shop page lists a collection from Shopify", async ({ page }) => {
  await page.goto("/shop.html?c=tees");
  await expect(page.locator(".shop-page__title")).toHaveText("Tees");
  await expect(page).toHaveTitle("Tees – Mr. Sunshine’s");
  await expect(page.locator(".shop-page__count")).toHaveText("3 products");
  const cards = page.locator(".shop-grid a.card");
  await expect(cards).toHaveCount(3);
  await expect(cards.first()).toHaveAttribute("href", "product.html?p=tipper-frog-tee");
  await expect(page.locator('.chips a[aria-current="page"]')).toHaveText("Tees");
  await expect(cards.nth(1).locator(".tag")).toHaveText("Sale");
  await expect(cards.nth(1).locator(".price")).toContainText("$35");
  await expect(cards.nth(1).locator(".price__now")).toContainText("$25");
  await expect(cards.nth(2).locator(".tag")).toHaveText("Sold out");
  await page.locator(".sort select").selectOption("price-asc");
  await expect(cards.first().locator(".card__text > span").first()).toHaveText("Bug Off Tee");
  await expect(page).toHaveURL(/sort=price-asc/);
  await page.reload();
  await expect(page.locator(".sort select")).toHaveValue("price-asc");
  await expect(cards.first().locator(".card__text > span").first()).toHaveText("Bug Off Tee");
});

test("shop pages split long collections", async ({ page }) => {
  const many = Array.from({ length: 27 }, (_, i) => ({ ...CATALOG[1], handle: `tee-${i + 1}`, title: `Tee ${String(i + 1).padStart(2, "0")}`,
    variants: [{ ...CATALOG[1].variants[0], id: 900 + i, price: 10 + i, compare: null }] }));
  await page.route(/^https:\/\/mrsunshines\.shop\/collections\/[\w-]+\/products\.json/, (route) =>
    route.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ products: many.map(listing) }) }));
  await page.goto("/shop.html?c=tees");
  const cards = page.locator(".shop-grid a.card");
  const pager = page.getByRole("navigation", { name: "Pagination" });
  await expect(page.locator(".shop-page__count")).toHaveText("27 products");
  await expect(cards).toHaveCount(12);
  await expect(pager.getByRole("link", { name: "Page 1" })).toHaveAttribute("aria-current", "page");
  await expect(pager.getByRole("link", { name: "Previous page" })).toHaveCount(0);
  await pager.getByRole("link", { name: "Next page" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(cards.first().locator(".card__text > span").first()).toHaveText("Tee 13");
  await pager.getByRole("link", { name: "Page 3" }).click();
  await expect(cards).toHaveCount(3);
  await expect(pager.getByRole("link", { name: "Next page" })).toHaveCount(0);
  await page.goBack();
  await expect(cards.first().locator(".card__text > span").first()).toHaveText("Tee 13");
  await page.reload();
  await expect(cards.first().locator(".card__text > span").first()).toHaveText("Tee 13");
  // Sorting starts again from page 1.
  await page.locator(".sort select").selectOption("price-desc");
  await expect(page).not.toHaveURL(/page=/);
  await expect(cards.first().locator(".card__text > span").first()).toHaveText("Tee 27");
});

test("shop search filters by name", async ({ page }) => {
  await page.goto("/shop.html?q=frog");
  await expect(page.locator(".shop-page__count")).toHaveText("1 result");
  await expect(page.locator(".shop-grid a.card")).toHaveCount(1);
  await expect(page.locator("#q")).toHaveValue("frog");
  await page.goto("/shop.html?q=zzzz");
  await expect(page.locator(".shop-page__status")).toContainText("No products found");
});

test("product page: options, sold out sizes and the cart", async ({ page }) => {
  await page.goto("/product.html?p=tipper-frog-tee");
  await expect(page.locator("h1")).toHaveText("Tipper Frog Tee");
  await expect(page).toHaveTitle("Tipper Frog Tee – Mr. Sunshine’s");
  // Shopify description keeps text but drops scripts and attributes.
  await expect(page.locator(".product__desc p")).toHaveCount(2);
  expect(await page.locator(".product__desc").innerHTML()).not.toMatch(/script|onclick/);
  const add = page.locator(".product__add");
  await expect(add).toHaveText("Add to cart");
  await page.locator(".picker label", { hasText: "Gray" }).click();
  await expect(add).toHaveText("Sold out");
  await expect(add).toBeDisabled();
  await expect(page.locator(".picker label", { hasText: "Small" })).toHaveClass(/is-unavailable/);
  await expect(page.locator(".product__main img")).toHaveAttribute("src", /2BC8E7D4/);
  await page.locator(".picker label", { hasText: "Medium" }).click();
  await expect(add).toHaveText("Add to cart");
  await expect(page).toHaveURL(/variant=104/);
  await page.getByRole("button", { name: "Increase quantity" }).click();
  await expect(page.locator("#qty")).toHaveValue("2");
  await add.click();
  const cart = page.getByRole("dialog", { name: "Your cart" });
  await expect(cart).toBeVisible();
  await expect(cart.locator(".cart__item")).toHaveCount(1);
  await expect(cart.locator(".cart__variant")).toHaveText("Medium / Gray");
  await expect(cart.locator(".cart__total strong")).toHaveText("$70");
  await expect(cart.locator(".cart__checkout")).toHaveAttribute("href", "https://mrsunshines.shop/cart/104:2");
  // Keyboard users keep their place when the row re-renders.
  await cart.getByRole("button", { name: "Increase quantity for Tipper Frog Tee" }).focus();
  await page.keyboard.press("Enter");
  await expect(cart.locator(".cart__checkout")).toHaveAttribute("href", "https://mrsunshines.shop/cart/104:3");
  await expect(cart.getByRole("button", { name: "Increase quantity for Tipper Frog Tee" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".cart-link")).toHaveAttribute("aria-label", "Cart, 3 items");
  // The cart follows to other pages.
  await page.goto("/index.html");
  await expect(page.locator(".cart-link__count")).toHaveText("3");
  await page.locator(".cart-link").click();
  await cart.getByRole("button", { name: "Remove Tipper Frog Tee" }).click();
  await expect(cart.getByText("Your cart is empty")).toBeVisible();
  await expect(page.locator(".cart-link__count")).toBeHidden();
});

test("tees show size chart tables instead of chart images", async ({ page }) => {
  await page.goto("/product.html?p=tipper-frog-tee");
  await expect(page.locator(".product__thumbs li")).toHaveCount(2);
  expect(await page.locator(".product__thumbs img").evaluateAll((imgs) => imgs.map((i) => i.src).join(" "))).not.toContain("C05D9E52");
  const chart = page.getByRole("region", { name: "Standard Tee Size Chart" });
  await expect(chart.locator("thead th")).toHaveText(["S", "M", "L", "XL", "2XL", "3XL", "4XL"]);
  await expect(chart.getByRole("row", { name: /Chest Width/ }).locator("td")).toHaveText(["18 1/4", "20 1/4", "22", "24", "26", "27 3/4", "29 3/4"]);
  await expect(page.getByRole("heading", { name: "Cropped Tee Size Chart" })).toHaveCount(0);
  // Long collection names wrap instead of pushing the page sideways.
  await page.setViewportSize({ width: 320, height: 700 });
  await page.route(/^https:\/\/mrsunshines\.shop\/collections\/[\w-]+\.json/, (route) => route.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify({ collection: { title: "BLACK FRIDAY DEALS" } }) }));
  await page.goto("/shop.html?c=black-friday-deals");
  await expect(page.locator(".shop-page__title")).toHaveText("BLACK FRIDAY DEALS");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await page.goto("/shop.html?c=tees");
  expect(await page.locator(".shop-grid img").evaluateAll((imgs) => imgs.map((i) => i.src).join(" "))).not.toContain("C05D9E52");
});

test("single-option product and sold out product", async ({ page }) => {
  await page.goto("/product.html?p=bug-off-tee");
  await expect(page.locator(".picker")).toHaveCount(0);
  await expect(page.locator(".product__price s")).toContainText("$35");
  await expect(page.locator(".product__price .price__now")).toContainText("$25");
  await page.goto("/product.html?p=1-800-mickman-tee");
  await expect(page.locator(".product__add")).toHaveText("Sold out");
});

test("unknown product shows page not found", async ({ page }) => {
  await page.goto("/product.html?p=nope");
  await expect(page.locator("h1:visible")).toHaveText("Page not found");
  await page.goto("/product.html");
  await expect(page.locator("h1:visible")).toHaveText("Page not found");
});

test("product links stay on this site", async ({ page }) => {
  for (const url of PAGES) {
    await page.goto(url);
    const external = await page.evaluate(() => [...document.querySelectorAll("a[href*='mrsunshines.shop/products'], a[href*='mrsunshines.shop/collections']")].map((a) => a.href));
    expect(external).toEqual([]);
  }
});

test("screenshots", async ({ page }, info) => {
  for (const url of PAGES) {
    await page.goto(url);
    await scrollThrough(page);
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `test-results/shots/${info.project.name}${url.replace(".html", "")}.png`, fullPage: true, scale: "css" });
    if (url === "/index.html") for (const s of [".prints", ".blanket", ".collections__head", ".signup"]) {
      await page.locator(s).evaluate((e) => scrollTo(0, e.getBoundingClientRect().top + scrollY - 450));
      await page.waitForTimeout(500);
      await page.screenshot({ path: `test-results/shots/${info.project.name}-${s.slice(1)}.png`, scale: "css" });
    }
    if (url === "/index.html") {
      await page.getByRole("button", { name: "Don’t miss out!" }).click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: `test-results/shots/${info.project.name}-popup.png`, scale: "css" });
      await page.keyboard.press("Escape");
    }
  }
});
