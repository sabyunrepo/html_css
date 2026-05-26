const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "../..");
const deckSourceRoot = path.resolve(__dirname, "..");

function copyDeckFixture() {
  const deckRoot = fs.mkdtempSync(path.join(os.tmpdir(), "motion-contract-"));
  fs.cpSync(deckSourceRoot, deckRoot, {
    recursive: true,
    filter(source) {
      const relative = path.relative(deckSourceRoot, source);
      if (!relative) {
        return true;
      }
      return !relative.split(path.sep).includes(".deck-quality");
    }
  });
  ensureGeneratedFixtureFiles(deckRoot);
  return deckRoot;
}

function ensureGeneratedFixtureFiles(deckRoot) {
  const specPath = path.join(deckRoot, "slide-spec.json");

  const urls = [
    "https://docs.anthropic.com/en/docs/claude-code/overview",
    "https://docs.anthropic.com/en/docs/claude-code/getting-started",
    "https://docs.anthropic.com/en/docs/claude-code/common-workflows",
    "https://docs.anthropic.com/en/docs/claude-code/memory",
    "https://docs.anthropic.com/en/docs/claude-code/settings",
    "https://www.anthropic.com/news/claude-code",
    "https://support.claude.com/en/articles/11145838-using-claude-code",
    "https://code.claude.com/docs"
  ];
  const slides = [
    {
      id: "what-is-claude-design",
      file: "slides/01-what-is-claude-design.html",
      title: "Claude Design",
      message: "Claude Design turns a prompt and context into a usable design draft.",
      visual: "Official product proof image",
      speakerNote: "Explain the official product context.",
      evidence: [urls[0]],
      visualArchetype: "official-product-proof",
      visualForm: "evidence-image",
      motionDecision: { mode: "static", reason: "The official proof image should stay readable." }
    },
    {
      id: "chat-canvas",
      file: "slides/02-chat-canvas.html",
      title: "Chat to canvas",
      message: "The workflow starts from a request and becomes an editable canvas.",
      visual: "Three-step prompt to canvas path",
      speakerNote: "Show the sequence from input to output.",
      evidence: [urls[1]],
      visualArchetype: "interface-split",
      visualForm: "step-path",
      motionDecision: { mode: "animated", reason: "Motion explains the input-output sequence." },
      motion: {
        type: "step-path",
        mood: "calm sequence",
        sequence: ["prompt", "canvas", "result"],
        loop: "none",
        reducedMotion: "show final state"
      }
    },
    {
      id: "source-intake",
      file: "slides/03-source-intake.html",
      title: "Source intake",
      message: "Good output starts with grounded context.",
      visual: "Research intake funnel",
      speakerNote: "Separate source gathering from slide writing.",
      evidence: [urls[2]],
      visualArchetype: "context-intake-board",
      visualForm: "funnel",
      motionDecision: { mode: "static", reason: "The funnel is a reference structure." }
    },
    {
      id: "review-gate",
      file: "slides/04-review-gate.html",
      title: "Review gate",
      message: "The spec catches missing evidence before HTML is written.",
      visual: "Triage table",
      speakerNote: "Explain why gates come before generation.",
      evidence: [urls[3]],
      visualArchetype: "triage-board",
      visualForm: "triage-table",
      motionDecision: { mode: "static", reason: "The table should stay scannable." }
    },
    {
      id: "handoff-map",
      file: "slides/05-handoff-map.html",
      title: "Handoff map",
      message: "A handoff records decisions, risks, and next actions.",
      visual: "Hub and branch map",
      speakerNote: "Close with the handoff habit.",
      evidence: [urls[4]],
      visualArchetype: "export-handoff-map",
      visualForm: "hub-map",
      motionDecision: { mode: "static", reason: "The map is a static summary." }
    }
  ];

  fs.rmSync(path.join(deckRoot, "slides"), { recursive: true, force: true });
  fs.mkdirSync(path.join(deckRoot, "slides"), { recursive: true });
  fs.mkdirSync(path.join(deckRoot, "assets"), { recursive: true });
  fs.mkdirSync(path.join(deckRoot, "assets/illustrations"), { recursive: true });

  fs.writeFileSync(path.join(deckRoot, "source.md"), [
    "# Claude Design source fixture",
    "",
    "## Evidence list",
    "",
    ...urls.map((url) => `- Fixture source: ${url}`),
    "",
    "## Research selection notes",
    "",
    "- Fixture uses official and trusted Claude sources.",
    "",
    "## Image candidates",
    "",
    "- Accepted fixture image: claude-design-announcement.png from https://www.anthropic.com/news/claude-code.",
    "",
    "## Image and asset decisions",
    "",
    "- claude-design-announcement.png uses local fixture documentation.",
    "",
    "## Slide-visible claims",
    "",
    ...slides.map((slide) => `- ${slide.id}: ${slide.message} (${slide.evidence[0]})`),
    "",
    "## Speaker-note context",
    "",
    "- Presenter notes contain extra context only.",
    "",
    "## Unresolved risks",
    "",
    "- Fixture only; not a real deck research brief."
  ].join("\n"));

  fs.writeFileSync(specPath, `${JSON.stringify({ slides }, null, 2)}\n`);
  fs.writeFileSync(path.join(deckRoot, "current-run.json"), `${JSON.stringify({
    schemaVersion: 1,
    topic: "Claude Design fixture",
    researchNeed: {
      required: true,
      minimumTrustedUrls: 8,
      minimumOfficialDocs: 5,
      trustedHosts: [
        "docs.anthropic.com",
        "www.anthropic.com",
        "support.claude.com",
        "code.claude.com"
      ],
      officialDocHosts: ["docs.anthropic.com", "support.claude.com", "code.claude.com"]
    },
    assetRequirements: {
      minimumRasterSlides: 1,
      maximumCssModuleShare: 0.8,
      requireManifestForRaster: true
    }
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(deckRoot, "HANDOFF.md"), "# Fixture handoff\n");
  fs.writeFileSync(path.join(deckRoot, "assets/slides.js"), "window.DECK_SLIDES = [];\n");
  fs.writeFileSync(path.join(deckRoot, "assets/illustrations/claude-design-announcement.png"), "");
  fs.writeFileSync(path.join(deckRoot, "assets/illustrations/manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    generatedAt: "2026-05-25",
    assets: [
      {
        file: "claude-design-announcement.png",
        sourceUrl: "https://www.anthropic.com/news/claude-code",
        publisher: "Anthropic",
        author: "Anthropic",
        license: "Fixture source check",
        licenseUrl: "https://www.anthropic.com/news/claude-code",
        checkedDate: "2026-05-25",
        edits: "placeholder test file",
        role: "fixture evidence image",
        slideIds: ["what-is-claude-design"]
      }
    ]
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(deckRoot, "assets/illustrations/README.md"), [
    "# Illustrations",
    "",
    "- claude-design-announcement.png",
    "  - Source: https://www.anthropic.com/news/claude-code",
    "  - License/source check: fixture source checked for validation tests.",
    "  - Edits: placeholder test file."
  ].join("\n"));
  fs.writeFileSync(path.join(deckRoot, "assets/visuals.css"), [
    "@keyframes card-place { from { opacity: 0; transform: translateY(var(--motion-rise)); } to { opacity: 1; transform: translateY(0); } }",
    "@keyframes rail-grow { from { opacity: 0; transform: scaleX(0); } to { opacity: 1; transform: scaleX(1); } }",
    "@keyframes ink-settle { from { opacity: 0; transform: scale(var(--motion-scale-start)); } to { opacity: 1; transform: scale(1); } }",
    "@keyframes passkey-step-in { from { opacity: 0; transform: translateY(var(--motion-rise)); } to { opacity: 1; transform: translateY(0); } }",
    "@keyframes passkey-rail-in { from { opacity: 0; transform: scaleX(0); } to { opacity: 1; transform: scaleX(1); } }",
    ".motion-target-a, .motion-target-b, .motion-target-c { animation: passkey-step-in var(--motion-medium) var(--ease-calm) both; }",
    "@media (prefers-reduced-motion: reduce) { .motion-target-a, .motion-target-b, .motion-target-c { animation: none; } }"
  ].join("\n"));

  slides.forEach((slide, index) => {
    const image = index === 0
      ? '<img src="../assets/illustrations/claude-design-announcement.png" alt="Claude Design announcement">'
      : "";
    fs.writeFileSync(path.join(deckRoot, slide.file), [
      `<section class="slide" data-slide-id="${slide.id}">`,
      `<h1>${slide.title}</h1>`,
      `<p>${slide.message}</p>`,
      image,
      '<div class="motion-target-a">A</div><div class="motion-target-b">B</div><div class="motion-target-c">C</div>',
      `<p class="note">${slide.speakerNote}</p>`,
      "</section>"
    ].join("\n"));
  });
}

function withSpecContracts(deckRoot) {
  const specPath = path.join(deckRoot, "slide-spec.json");
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  spec.slides = spec.slides.map((slide) => {
    const mode = slide.motionDecision && slide.motionDecision.mode;
    const contractSlide = {
      ...slide,
      importanceMap: {
        primaryMessage: slide.message,
        primaryEvidenceOrAction: slide.visual,
        secondaryConstraints: ["Keep supporting details visually subordinate."],
        metadata: ["Source-backed lecture slide."]
      },
      assetDecision: {
        mode: slide.id === "what-is-claude-design" ? "local-raster" : "css-module",
        reason: "Matches the declared visual form and teaches the slide without decorative imagery.",
        source: slide.id === "what-is-claude-design" ? "assets/illustrations/claude-design-announcement.png" : "",
        assetRole: slide.id === "what-is-claude-design" ? "primary evidence/action" : "primary action",
        placement: slide.id === "what-is-claude-design" ? "large evidence image" : "structured module",
        cropIntent: slide.id === "what-is-claude-design" ? "keep the announcement surface visible" : "not applicable",
        fallback: "Use a structured HTML/CSS visual module."
      }
    };

    if (mode === "animated") {
      contractSlide.motionPlan = {
        purpose: slide.motion.reason || slide.motion.mood,
        recipe: "step-path",
        targets: [
          { selector: ".motion-target-a", effect: "enter", delayStep: 0 },
          { selector: ".motion-target-b", effect: "enter", delayStep: 1 },
          { selector: ".motion-target-c", effect: "settle", delayStep: 2 }
        ],
        mustNotAnimate: [".copy", "h1", ".subtitle"],
        reducedMotion: "show final state"
      };
    }

    return contractSlide;
  });
  fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);
  return deckRoot;
}

function runVerify(deckRoot) {
  return spawnSync(process.execPath, ["lecture-deck/scripts/verify-deck.js", "--mode=harness"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: deckRoot
    }
  });
}

test("verify-deck persists machine-readable validation results on failure", () => {
  const deckRoot = fs.mkdtempSync(path.join(os.tmpdir(), "validation-result-"));
  const qualityDir = path.join(deckRoot, ".deck-quality");
  const resultPath = path.join(qualityDir, "validation-result.json");
  fs.rmSync(qualityDir, { recursive: true, force: true });

  const result = spawnSync(process.execPath, ["lecture-deck/scripts/verify-deck.js", "--mode=harness"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: deckRoot
    }
  });

  assert.equal(result.status, 1);
  assert.equal(fs.existsSync(resultPath), true);

  const payload = JSON.parse(fs.readFileSync(resultPath, "utf8"));
  assert.equal(payload.mode, "harness");
  assert.equal(payload.status, "fail");
  assert.equal(payload.summary.failures, 1);
  assert.equal(payload.results[0].name, "verify-deck");
  assert.match(payload.results[0].detail, /slide-spec\.json is missing/);
});

test("verify-deck enforces reusable motion contract artifacts", () => {
  const deckRoot = withSpecContracts(copyDeckFixture());
  const result = runVerify(deckRoot);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /PASS prompt layer contract/);
  assert.match(result.stdout, /PASS tool layer contract/);
  assert.match(result.stdout, /PASS screenshot review contract/);
  assert.match(result.stdout, /PASS motion contract artifacts/);
  assert.match(result.stdout, /PASS motion tokens/);
  assert.match(result.stdout, /PASS motion recipes/);
});

test("verify-deck rejects missing harness layer contracts", () => {
  const deckRoot = withSpecContracts(copyDeckFixture());
  fs.rmSync(path.join(deckRoot, "tool-layer.md"), { force: true });

  const result = runVerify(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL missing files/);
  assert.match(result.stdout, /tool-layer\.md/);
  assert.match(result.stdout, /FAIL tool layer contract/);
});

test("verify-deck enforces tokenized animation timing declarations", () => {
  const deckRoot = withSpecContracts(copyDeckFixture());
  const result = runVerify(deckRoot);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /PASS research source sections/);
  assert.match(result.stdout, /PASS research source depth/);
  assert.match(result.stdout, /PASS slide evidence quality/);
  assert.match(result.stdout, /PASS slide evidence in source/);
  assert.match(result.stdout, /PASS image source documentation/);
  assert.match(result.stdout, /PASS motion token usage/);
});

test("verify-deck rejects thin research briefs", () => {
  const deckRoot = withSpecContracts(copyDeckFixture());
  fs.writeFileSync(path.join(deckRoot, "source.md"), [
    "# Thin source",
    "",
    "## Evidence list",
    "",
    "- https://example.com",
    "",
    "## Slide-visible claims",
    "",
    "- Unsupported claim"
  ].join("\n"));

  const result = runVerify(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL research source sections/);
  assert.match(result.stdout, /FAIL research source depth/);
  assert.match(result.stdout, /FAIL slide evidence in source/);
});

test("verify-deck rejects undocumented local image assets", () => {
  const deckRoot = withSpecContracts(copyDeckFixture());
  const readmePath = path.join(deckRoot, "assets/illustrations/README.md");
  fs.writeFileSync(readmePath, "# Illustrations\n\n- claude-design-announcement.png\n");

  const result = runVerify(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL image source documentation/);
  assert.match(result.stdout, /claude-design-announcement\.png/);
});

test("verify-deck rejects raw animation timing values in visual CSS", () => {
  const deckRoot = withSpecContracts(copyDeckFixture());
  const visualCssPath = path.join(deckRoot, "assets/visuals.css");
  fs.appendFileSync(visualCssPath, "\n.raw-motion-regression { animation-delay: 120ms; }\n");

  const result = runVerify(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL motion token usage/);
  assert.match(result.stdout, /animation-delay: 120ms/);
});

test("verify-deck rejects slides missing importanceMap", () => {
  const deckRoot = withSpecContracts(copyDeckFixture());
  const specPath = path.join(deckRoot, "slide-spec.json");
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  delete spec.slides[0].importanceMap;
  fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);

  const result = runVerify(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL importance map coverage/);
  assert.match(result.stdout, /what-is-claude-design:missing-map/);
});

test("verify-deck rejects slides missing assetDecision", () => {
  const deckRoot = withSpecContracts(copyDeckFixture());
  const specPath = path.join(deckRoot, "slide-spec.json");
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  delete spec.slides[0].assetDecision;
  fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);

  const result = runVerify(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL asset decision coverage/);
  assert.match(result.stdout, /what-is-claude-design:missing-decision/);
});

test("verify-deck rejects animated slides missing motionPlan", () => {
  const deckRoot = withSpecContracts(copyDeckFixture());
  const specPath = path.join(deckRoot, "slide-spec.json");
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  delete spec.slides.find((slide) => slide.motionDecision.mode === "animated").motionPlan;
  fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);

  const result = runVerify(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL motion plan coverage/);
  assert.match(result.stdout, /chat-canvas:missing-plan/);
});

test("verify-deck rejects static slides with motionPlan", () => {
  const deckRoot = withSpecContracts(copyDeckFixture());
  const specPath = path.join(deckRoot, "slide-spec.json");
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  spec.slides[0].motionPlan = {
    purpose: "Decorative motion should not be present.",
    recipe: "step-path",
    targets: [
      { selector: ".motion-target-a", effect: "enter", delayStep: 0 },
      { selector: ".motion-target-b", effect: "enter", delayStep: 1 },
      { selector: ".motion-target-c", effect: "settle", delayStep: 2 }
    ],
    mustNotAnimate: [".copy"],
    reducedMotion: "show final state"
  };
  fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);

  const result = runVerify(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL motion plan coverage/);
  assert.match(result.stdout, /what-is-claude-design:static-with-plan/);
});

test("verify-deck rejects motionPlan targets with fewer than three targets for multi-object visual forms", () => {
  const deckRoot = withSpecContracts(copyDeckFixture());
  const specPath = path.join(deckRoot, "slide-spec.json");
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const slide = spec.slides.find((candidate) => candidate.id === "chat-canvas");
  slide.motionPlan.targets = [
    { selector: ".motion-target-a", effect: "enter", delayStep: 0 },
    { selector: ".motion-target-b", effect: "enter", delayStep: 1 }
  ];
  fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`);

  const result = runVerify(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL motion plan coverage/);
  assert.match(result.stdout, /chat-canvas:too-few-targets/);
});
