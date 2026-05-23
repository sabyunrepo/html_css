const slides = window.DECK_SLIDES || [];
const deck = document.querySelector("#deck");
const status = document.querySelector("#deckStatus");
const previousButton = document.querySelector("#previousSlide");
const nextButton = document.querySelector("#nextSlide");
const printButton = document.querySelector("#printDeck");

let frames = [];
let currentIndex = 0;

function getHashIndex() {
  const match = window.location.hash.match(/^#slide-(\d+)$/);
  if (!match) {
    return 0;
  }

  const index = Number(match[1]) - 1;
  return Number.isInteger(index) && index >= 0 && index < slides.length ? index : 0;
}

function slideNumber(index) {
  return `${String(index + 1).padStart(2, "0")} / ${slides.length}`;
}

async function loadSlide(slideInfo, index) {
  const response = await fetch(slideInfo.file, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${slideInfo.file} returned ${response.status}`);
  }

  const html = await response.text();
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const slide = parsed.querySelector(".slide");

  if (!slide) {
    throw new Error(`${slideInfo.file} does not include .slide`);
  }

  slide.querySelectorAll(".note").forEach((note) => note.remove());

  const frame = document.createElement("article");
  frame.className = "deck-frame";
  frame.dataset.slideId = slideInfo.id;
  frame.dataset.source = slideInfo.file;
  frame.setAttribute("aria-label", slideInfo.title);
  frame.append(slide);

  return frame;
}

function setActiveSlide(index, options = {}) {
  if (!frames.length) {
    return;
  }

  currentIndex = Math.min(Math.max(index, 0), frames.length - 1);

  frames.forEach((frame, frameIndex) => {
    const active = frameIndex === currentIndex;
    frame.classList.toggle("is-active", active);
    frame.setAttribute("aria-hidden", String(!active));
  });

  previousButton.disabled = currentIndex === 0;
  nextButton.disabled = currentIndex === frames.length - 1;
  status.textContent = `${slideNumber(currentIndex)} · ${slides[currentIndex].title}`;

  if (options.updateHash !== false) {
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}#slide-${currentIndex + 1}`);
  }
}

function moveSlide(delta) {
  setActiveSlide(currentIndex + delta);
}

function isTypingTarget(target) {
  return target?.closest?.("input, textarea, select, [contenteditable='true']");
}

async function renderDeck() {
  deck.replaceChildren();

  try {
    frames = await Promise.all(slides.map(loadSlide));
    deck.append(...frames);
    setActiveSlide(getHashIndex(), { updateHash: !window.location.hash });
    window.DECK_READY = true;
  } catch (error) {
    const message = document.createElement("p");
    message.textContent = `Deck render failed: ${error.message}`;
    message.className = "deck-error";
    deck.append(message);
    throw error;
  }
}

previousButton.addEventListener("click", () => moveSlide(-1));
nextButton.addEventListener("click", () => moveSlide(1));
printButton.addEventListener("click", () => window.print());

window.addEventListener("hashchange", () => setActiveSlide(getHashIndex(), { updateHash: false }));
window.addEventListener("keydown", (event) => {
  if (isTypingTarget(event.target)) {
    return;
  }

  if (["ArrowRight", "PageDown", " "].includes(event.key)) {
    event.preventDefault();
    moveSlide(1);
  } else if (["ArrowLeft", "PageUp", "Backspace"].includes(event.key)) {
    event.preventDefault();
    moveSlide(-1);
  } else if (event.key === "Home") {
    event.preventDefault();
    setActiveSlide(0);
  } else if (event.key === "End") {
    event.preventDefault();
    setActiveSlide(frames.length - 1);
  }
});

window.DECK_API = {
  goTo: setActiveSlide,
  getCurrentIndex: () => currentIndex,
  getSlides: () => slides.slice()
};

renderDeck();
