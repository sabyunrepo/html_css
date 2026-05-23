const slides = window.DECK_SLIDES || [];
const review = document.querySelector("#review");

function listEvidence(items) {
  const list = document.createElement("ul");
  list.className = "evidence-list";

  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    list.append(li);
  });

  return list;
}

async function getSlideNote(slideInfo) {
  const response = await fetch(slideInfo.file, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${slideInfo.file} returned ${response.status}`);
  }

  const html = await response.text();
  const parsed = new DOMParser().parseFromString(html, "text/html");
  return parsed.querySelector(".note")?.textContent.trim() || slideInfo.speakerNote;
}

async function renderReview() {
  const cards = await Promise.all(slides.map(async (slideInfo, index) => {
    const card = document.createElement("article");
    card.className = "review-card";

    const heading = document.createElement("h2");
    heading.textContent = `${String(index + 1).padStart(2, "0")} · ${slideInfo.title}`;

    const script = document.createElement("p");
    script.className = "presenter-script";
    script.textContent = await getSlideNote(slideInfo);

    const evidenceHeading = document.createElement("strong");
    evidenceHeading.textContent = "Evidence";

    card.append(heading, script, evidenceHeading, listEvidence(slideInfo.evidence || []));
    return card;
  }));

  review.replaceChildren(...cards);
  window.PRESENTER_REVIEW_READY = true;
}

renderReview().catch((error) => {
  const message = document.createElement("p");
  message.className = "deck-error";
  message.textContent = `Presenter review failed: ${error.message}`;
  review.replaceChildren(message);
  throw error;
});
