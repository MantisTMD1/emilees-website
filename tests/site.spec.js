const { test, expect } = require("@playwright/test");

const PAGES = ["/index.html", "/about.html"];
const isPhone = (page) => page.viewportSize().width < 700;

let errors;
test.beforeEach(async ({ page }) => {
  errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  // Never touch the live store: links and forms that lead there stop here.
  await page.route(/^https:\/\/mrsunshines\.shop\//, (route) => route.fulfill({ contentType: "text/html", body: "store" }));
});

async function loadImages(page) {
  await page.evaluate(() => {
    document.documentElement.style.scrollBehavior = "auto";
    document.querySelectorAll("img").forEach((i) => { i.loading = "eager"; });
  });
  await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 40000 });
}

for (const url of PAGES) {
  test.describe(url, () => {
    test("loads with no errors and every image", async ({ page }) => {
      await page.goto(url);
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

    test("search opens, focuses and searches the store", async ({ page }) => {
      await page.goto(url);
      await page.locator(".search summary").click();
      await expect(page.locator("#q")).toBeFocused();
      await page.locator("#q").fill("tee");
      await page.keyboard.press("Enter");
      await page.waitForURL("https://mrsunshines.shop/search?q=tee");
    });

    test("back to top", async ({ page }) => {
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

test("screenshots", async ({ page }, info) => {
  for (const url of PAGES) {
    await page.goto(url);
    await loadImages(page);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `test-results/shots/${info.project.name}${url.replace(".html", "")}.png`, fullPage: true, scale: "css" });
    if (url === "/index.html") for (const s of [".prints", ".blanket", ".collections__head", ".signup"]) {
      await page.locator(s).evaluate((e) => scrollTo(0, e.getBoundingClientRect().top + scrollY - 450));
      await page.waitForTimeout(500);
      await page.screenshot({ path: `test-results/shots/${info.project.name}-${s.slice(1)}.png`, scale: "css" });
    }
  }
});
