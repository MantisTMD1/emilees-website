"use strict";

const nav = document.querySelector(".nav");
const menuButton = document.querySelector(".menu-button");

function setMenu(open) {
  nav.classList.toggle("is-open", open);
  // Fit the drawer under the header, which sits lower while the announcement bar is showing.
  const headerBottom = document.querySelector(".header").getBoundingClientRect().bottom;
  nav.style.height = open ? `calc(100dvh - ${headerBottom}px)` : "";
  menuButton.setAttribute("aria-expanded", String(open));
  menuButton.setAttribute("aria-label", open ? "Close menu" : "Menu");
  if (open) closeDetails();
  document.body.style.overflow = open ? "hidden" : "";
}

// Shop dropdown and search: close on outside click, Escape, or when the other opens.
const shop = document.querySelector(".shop");
const search = document.querySelector(".search");

function closeDetails(except) {
  for (const item of [shop, search]) if (item !== except) item.open = false;
}

for (const item of [shop, search]) {
  item.addEventListener("toggle", () => {
    if (!item.open) return;
    closeDetails(item);
    if (item === search) {
      setMenu(false);
      item.querySelector("input").focus();
    }
  });
}

document.addEventListener("click", (event) => {
  if (!event.target.closest(".shop, .search")) closeDetails();
});

document.addEventListener("keydown", (event) => {
  const open = [shop, search].find((item) => item.open);
  if (event.key !== "Escape" || !open) return;
  open.open = false;
  open.querySelector("summary").focus();
  event.stopImmediatePropagation();
});

menuButton.addEventListener("click", () => {
  setMenu(menuButton.getAttribute("aria-expanded") !== "true");
});

nav.addEventListener("click", (event) => {
  if (event.target.closest("a")) setMenu(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && nav.classList.contains("is-open")) {
    setMenu(false);
    menuButton.focus();
  }
});

// Leaving the mobile layout with the menu open would lock page scroll.
window.matchMedia("(min-width: 1024px)").addEventListener("change", () => setMenu(false));

// Back to top: show it once the hero is out of view, and go to the very top of the page.
// On phones it only shows while scrolling up, so it stays off the products.
const toTop = document.querySelector(".to-top");

const phone = window.matchMedia("(max-width: 699px)");
let pastHero = false;
let scrollingUp = false;
let lastScroll = window.scrollY;

function updateToTop() {
  toTop.classList.toggle("is-visible", pastHero && (!phone.matches || scrollingUp));
}

const hero = document.querySelector("#top");
if (hero) {
  new IntersectionObserver(([entry]) => {
    pastHero = !entry.isIntersecting;
    updateToTop();
  }).observe(hero);
}

window.addEventListener("scroll", () => {
  const moved = window.scrollY - lastScroll;
  if (Math.abs(moved) < 8) return; // ignore tiny jitters
  scrollingUp = moved < 0;
  lastScroll = window.scrollY;
  updateToTop();
}, { passive: true });

phone.addEventListener("change", updateToTop);

toTop.addEventListener("click", (event) => {
  event.preventDefault();
  window.scrollTo(0, 0);
  document.querySelector(".header__logo").focus({ preventScroll: true });
});

// Only the home page has reviews.
if (document.querySelector(".reviews__list")) startReviews();

function startReviews() {
  // Reviews drift sideways in an endless loop. They wait while someone hovers, focuses,
  // swipes or uses the arrows, and while the section is off screen.
  const reviews = document.querySelector(".reviews__list");
  const pauseButton = document.querySelector(".reviews__pause");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reviewSpeed = () => (phone.matches ? 40 : 65); // pixels per second

  // A hidden second copy of the cards makes the loop seamless.
  const firstReview = reviews.firstElementChild;
  const reviewCopies = [...reviews.children].map((card) => {
    const copy = card.cloneNode(true);
    copy.setAttribute("aria-hidden", "true");
    copy.inert = true;
    return copy;
  });
  reviews.append(...reviewCopies);

  let reviewsPaused = reducedMotion.matches;
  let reviewsHovered = false;
  let reviewsVisible = false;
  let reviewsHeldUntil = 0;
  let reviewsPosition = 0;
  let reviewsFrame = 0;
  let reviewsLast = 0;

  const loopWidth = () => reviewCopies[0].offsetLeft - firstReview.offsetLeft;
  const holdReviews = () => { reviewsHeldUntil = performance.now() + 2500; };

  function driftReviews(now) {
    const elapsed = Math.min(0.05, (now - reviewsLast) / 1000);
    reviewsLast = now;
    const waiting = reviewsHovered || now < reviewsHeldUntil || reviews.contains(document.activeElement);
    if (waiting) {
      reviewsPosition = reviews.scrollLeft;
    } else {
      reviewsPosition += reviewSpeed() * elapsed;
      if (reviewsPosition >= loopWidth()) reviewsPosition -= loopWidth();
      reviews.scrollLeft = reviewsPosition;
    }
    reviewsFrame = requestAnimationFrame(driftReviews);
  }

  function runReviews() {
    cancelAnimationFrame(reviewsFrame);
    if (reviewsPaused || !reviewsVisible) return;
    reviewsPosition = reviews.scrollLeft;
    reviewsLast = performance.now();
    reviewsFrame = requestAnimationFrame(driftReviews);
  }

  function setReviewsPaused(paused) {
    reviewsPaused = paused;
    pauseButton.classList.toggle("is-paused", paused);
    pauseButton.setAttribute("aria-label", paused ? "Play reviews" : "Pause reviews");
    runReviews();
  }

  reviews.addEventListener("pointerenter", (event) => { reviewsHovered = event.pointerType === "mouse"; });
  reviews.addEventListener("pointerleave", () => { reviewsHovered = false; });
  for (const type of ["wheel", "touchstart", "touchmove", "touchend"]) {
    reviews.addEventListener(type, holdReviews, { passive: true });
  }

  document.querySelectorAll(".reviews__nav [data-step]").forEach((button) => {
    button.addEventListener("click", () => {
      holdReviews();
      const distance = Number(button.dataset.step) * Math.min(reviews.clientWidth, loopWidth()) * 0.8;
      // Step to the matching spot in the other copy first if there is no room to move.
      if (distance < 0 && reviews.scrollLeft + distance < 0) reviews.scrollLeft += loopWidth();
      if (distance > 0 && reviews.scrollLeft >= loopWidth()) reviews.scrollLeft -= loopWidth();
      reviews.scrollBy({ left: distance, behavior: reducedMotion.matches ? "auto" : "smooth" });
    });
  });

  pauseButton.addEventListener("click", () => setReviewsPaused(!reviewsPaused));
  reducedMotion.addEventListener("change", () => setReviewsPaused(reducedMotion.matches));
  new IntersectionObserver(([entry]) => {
    reviewsVisible = entry.isIntersecting;
    runReviews();
  }).observe(reviews);
  pauseButton.hidden = false;
  setReviewsPaused(reviewsPaused);
}

// Phones: the hero photos scroll sideways. A bar under them shows where you are, and the row
// nudges left once so it's clear it moves.
const lineup = document.querySelector(".lineup");
if (lineup) {
  const phoneLayout = window.matchMedia("(max-width: 699px)");
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
  const bar = document.createElement("div");
  bar.className = "lineup-bar";
  bar.setAttribute("aria-hidden", "true");
  bar.innerHTML = "<span></span>";
  lineup.after(bar);
  const thumb = bar.firstChild;

  let queued = false;
  const drawBar = () => {
    queued = false;
    const room = lineup.scrollWidth - lineup.clientWidth;
    const share = lineup.clientWidth / (lineup.scrollWidth || 1);
    thumb.style.width = `${share * 100}%`;
    thumb.style.translate = `${room > 0 ? (lineup.scrollLeft / room) * ((1 - share) / share) * 100 : 0}% 0`;
  };
  const queueBar = () => { if (!queued) { queued = true; requestAnimationFrame(drawBar); } };
  lineup.addEventListener("scroll", queueBar, { passive: true });
  window.addEventListener("resize", queueBar);
  drawBar();

  let touched = false;
  const stop = () => { touched = true; lineup.classList.remove("is-nudging"); };
  lineup.addEventListener("pointerdown", stop, { passive: true });
  lineup.addEventListener("scroll", () => { if (lineup.scrollLeft > 4) stop(); }, { passive: true });
  lineup.addEventListener("animationend", (event) => {
    if (event.animationName === "lineup-nudge") lineup.classList.remove("is-nudging");
  });
  setTimeout(() => {
    if (touched || calm.matches || !phoneLayout.matches || lineup.scrollLeft > 4) return;
    lineup.classList.add("is-nudging");
  }, 1400);
}

// Safari can run this before the stylesheet is in, when nothing has its real position yet.
function whenStyled(callback) {
  const styled = getComputedStyle(document.documentElement).getPropertyValue("--bone");
  if (styled) callback();
  else requestAnimationFrame(() => whenStyled(callback));
}

whenStyled(startReveals);

function startReveals() {
  // Content below the fold animates in once as it is scrolled to. Without JavaScript, or with
  // reduced motion, nothing is ever hidden.
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const groups = {
    pull: "main h2, .story__pull, .cheers__line",
    photo: ".blanket__photo, .about__photo, .craft__photo, .dreary__photos li",
    float: ".friday__art",
    grow: ".print--wilted",
    rise: ".deals li, .friday__body > .btn, .section-head .btn, .cards > li, .blanket__body > :not(h2), .tiles li, .about__body > :not(h2), .reviews__head p, .reviews__nav, .reviews__list, .signup > p, .signup form, .story__text > p:not(.story__pull), .dreary__body p, .craft__body p, .cheers__goal",
  };

  // The huge top margin also catches content that a jump down the page skips over.
  const observer = new IntersectionObserver((entries) => {
    let order = 0;
    for (const entry of entries) {
      const passed = entry.boundingClientRect.bottom < 0; // jumped straight past it
      if (!entry.isIntersecting && !passed) continue;
      observer.unobserve(entry.target);
      if (passed) {
        entry.target.classList.remove("will-reveal");
        continue;
      }
      // Things that arrive together follow one another.
      entry.target.style.setProperty("--reveal-delay", `${Math.min(order++, 6) * 0.08}s`);
      entry.target.classList.add("is-revealed");
    }
  }, { rootMargin: "100000px 0px -8% 0px" });

  for (const [kind, selector] of Object.entries(groups)) {
    for (const element of document.querySelectorAll(selector)) {
      if (element.getBoundingClientRect().top < window.innerHeight) continue;
      element.classList.add("will-reveal", `will-reveal--${kind}`);
      observer.observe(element);
    }
  }

  // Clean up afterwards so nothing lingers on the finished page.
  document.addEventListener("animationend", (event) => {
    const { target } = event;
    if (!target.classList.contains("is-revealed") || !event.animationName.startsWith("reveal-")) return;
    // A photo's frame finishes before the photo inside it settles.
    const inner = target.classList.contains("will-reveal--photo") ? 400 : 0;
    setTimeout(() => {
      target.classList.remove("will-reveal", "is-revealed", ...Object.keys(groups).map((kind) => `will-reveal--${kind}`));
      target.style.removeProperty("--reveal-delay");
    }, inner);
  });
}

// Shipping banner: its × hides it for the rest of this visit (this tab, until the browser is closed),
// the way most shops do it. It shows again on the next visit.
document.querySelector(".notice__close")?.addEventListener("click", () => {
  document.documentElement.classList.add("no-notice");
  try { sessionStorage.setItem("notice-dismissed", "1"); } catch { /* storage blocked: hidden on this page only */ }
});
try { localStorage.removeItem("notice-dismissed"); } catch { /* left over from when closing it was permanent */ }

// "Don't miss out!" sign-up pop-up. Like the store's, it opens by itself a few seconds after the
// first visit; after that the tab at the bottom left brings it back. Dismissing the tab keeps both away.
const teaser = document.querySelector(".teaser");
const popup = document.querySelector(".popup");
const TEASER_KEY = "teaser-dismissed";
const SHOWN_KEY = "popup-shown";
const AUTO_OPEN_DELAY = 3000;

function remember(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    return null; // private windows can block storage; the tab just shows again
  }
}

if (teaser && popup && typeof popup.showModal === "function") {
  teaser.hidden = remember(TEASER_KEY) === "1";
  teaser.querySelector(".teaser__open").addEventListener("click", () => popup.showModal());
  teaser.querySelector(".teaser__close").addEventListener("click", () => {
    teaser.hidden = true;
    remember(TEASER_KEY, "1");
  });
  // A click on the dimmed backdrop closes the pop-up.
  popup.addEventListener("click", (event) => {
    if (event.target === popup) popup.close();
  });
  let fromTab = false;
  teaser.querySelector(".teaser__open").addEventListener("click", () => { fromTab = true; });
  popup.addEventListener("close", () => {
    if (fromTab && !teaser.hidden) teaser.querySelector(".teaser__open").focus();
    fromTab = false;
  });

  if (!teaser.hidden && remember(SHOWN_KEY) !== "1") {
    setTimeout(() => {
      // Don't interrupt someone typing or with a menu open, and don't stack on another dialog.
      const busy = document.activeElement?.matches("input, textarea, select") || document.querySelector("dialog[open], [aria-expanded='true']");
      if (busy || popup.open || teaser.hidden) return;
      remember(SHOWN_KEY, "1");
      popup.showModal();
    }, AUTO_OPEN_DELAY);
  }
}
