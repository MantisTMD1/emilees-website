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

new IntersectionObserver(([entry]) => {
  pastHero = !entry.isIntersecting;
  updateToTop();
}).observe(document.querySelector("#top"));

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
