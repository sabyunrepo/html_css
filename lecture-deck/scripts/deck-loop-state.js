const fs = require("node:fs");
const path = require("node:path");

function fileExists(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function readSpec(root) {
  const specPath = path.join(root, "slide-spec.json");
  if (!fs.existsSync(specPath)) {
    return { spec: null, error: null };
  }

  try {
    return { spec: JSON.parse(fs.readFileSync(specPath, "utf8")), error: null };
  } catch (error) {
    return { spec: null, error: error.message };
  }
}

function getSpecSlides(spec) {
  return Array.isArray(spec?.slides) ? spec.slides : [];
}

function analyzeDeckState(root) {
  const missingInputs = ["source.md", "slide-spec.json"].filter((file) => !fileExists(root, file));
  const { spec, error: specError } = readSpec(root);
  const slides = getSpecSlides(spec);
  const missingSlideFiles = slides
    .map((slide) => slide.file)
    .filter(Boolean)
    .filter((file) => !fileExists(root, file));
  const hasHandoff = fileExists(root, "HANDOFF.md");

  if (missingInputs.length > 0) {
    return {
      status: "uninitialized",
      readyForFinalGate: false,
      missingInputs,
      missingSlideFiles: [],
      slideCount: 0,
      specError
    };
  }

  if (specError || slides.length === 0) {
    return {
      status: "spec-invalid",
      readyForFinalGate: false,
      missingInputs: [],
      missingSlideFiles: [],
      slideCount: slides.length,
      specError: specError || "slide-spec.json must include a non-empty slides array"
    };
  }

  if (missingSlideFiles.length > 0) {
    return {
      status: "spec-ready",
      readyForFinalGate: false,
      missingInputs: [],
      missingSlideFiles,
      slideCount: slides.length,
      specError: null
    };
  }

  if (!hasHandoff) {
    return {
      status: "output-ready",
      readyForFinalGate: false,
      missingInputs: [],
      missingSlideFiles: [],
      slideCount: slides.length,
      specError: null
    };
  }

  return {
    status: "handoff-ready",
    readyForFinalGate: true,
    missingInputs: [],
    missingSlideFiles: [],
    slideCount: slides.length,
    specError: null
  };
}

function shouldSkipFinalGate(state) {
  return !state.readyForFinalGate;
}

function formatStateSummary(state) {
  const details = [];
  if (state.missingInputs?.length) {
    details.push(`missing inputs: ${state.missingInputs.join(", ")}`);
  }
  if (state.missingSlideFiles?.length) {
    details.push(`missing slide files: ${state.missingSlideFiles.join(", ")}`);
  }
  if (state.specError) {
    details.push(`spec error: ${state.specError}`);
  }
  if (state.status === "output-ready") {
    details.push("HANDOFF.md is not present yet");
  }
  return details.length ? `${state.status} (${details.join("; ")})` : state.status;
}

module.exports = {
  analyzeDeckState,
  formatStateSummary,
  shouldSkipFinalGate
};
