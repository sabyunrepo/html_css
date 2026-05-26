#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");

const DEFAULT_EXCLUDE_SEGMENTS = new Set([
  ".git",
  ".agents",
  ".deck-quality",
  ".deck-quality-archive",
  ".playwright-mcp",
  "node_modules"
]);

const DEFAULT_EXCLUDE_PREFIXES = [
  "docs/superpowers",
  ".codex/agent-candidates",
  ".codex/agent-candidates-merged",
  ".codex/agents-archive",
  ".codex/skill-candidates",
  ".codex/skill-candidates-final",
  ".codex/skill-candidates-full",
  ".codex/skill-candidates-merged",
  ".codex/skills-archive"
];

const GENERATED_OUTPUT_FILES = new Set([
  ".codex/stop-continuation-state.json",
  "lecture-deck/current-run.json",
  "lecture-deck/source.md",
  "lecture-deck/slide-spec.json",
  "lecture-deck/HANDOFF.md",
  "lecture-deck/assets/slides.js",
  "lecture-deck/assets/visuals.css",
  "lecture-deck/assets/illustrations/manifest.json"
]);

const TOP_LEVEL_EXPERIMENT_PATTERNS = [
  /^agent-workflow-.*\.png$/i,
  /^canva-.*\.png$/i,
  /^claude-.*\.png$/i,
  /^passkeys-.*\.png$/i,
  /^slide\d.*\.png$/i
];

const STARTER_URLS = [
  "https://developer.mozilla.org/en-US/docs/Web/HTML",
  "https://developer.mozilla.org/en-US/docs/Web/CSS",
  "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
  "https://developer.mozilla.org/en-US/docs/Learn_web_development",
  "https://developer.mozilla.org/en-US/docs/Web/Accessibility",
  "https://www.w3.org/TR/html/",
  "https://www.w3.org/TR/CSS/",
  "https://www.w3.org/WAI/fundamentals/accessibility-intro/",
  "https://web.dev/learn/html/",
  "https://web.dev/learn/css/"
];

const STARTER_SLIDES = [
  ["slide-01", "Prompt contract", "Convert the topic request into a durable run contract before producing slides.", "contract checklist", "contract-card"],
  ["slide-02", "Research and assets", "Collect evidence and decide which visuals teach the topic instead of decorating it.", "source board", "source-board"],
  ["slide-03", "Source brief", "Map slide-visible claims to trusted sources before the slide spec is written.", "claim map", "claim-map"],
  ["slide-04", "Slide output", "Generate slide HTML, metadata, visual CSS, and notes from the approved spec.", "output stack", "output-stack"],
  ["slide-05", "Visual review", "Inspect hierarchy, responsive layout, motion intent, and asset fit before handoff.", "review grid", "review-grid"],
  ["slide-06", "Validation handoff", "Run gates, route failures, and hand off only after evidence is complete.", "gate timeline", "gate-timeline"]
];

function normalizePath(value) {
  return value.split(path.sep).join("/");
}

function parseArgs(argv) {
  const options = {
    out: null,
    dryRun: false,
    json: false,
    force: false
  };
  argv.forEach((arg) => {
    if (arg === "--dry-run") options.dryRun = true;
    if (arg === "--json") options.json = true;
    if (arg === "--force") options.force = true;
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) return;
    options[match[1]] = match[2];
  });
  return options;
}

function isGeneratedSlide(relativePath) {
  return /^lecture-deck\/slides\/.+\.html$/i.test(relativePath);
}

function isTopicSpecificIllustration(relativePath) {
  if (!relativePath.startsWith("lecture-deck/assets/illustrations/")) return false;
  return ![
    "lecture-deck/assets/illustrations/README.md",
    "lecture-deck/assets/illustrations/manifest.schema.json"
  ].includes(relativePath);
}

function shouldInclude(relativePath) {
  const normalized = normalizePath(relativePath);
  if (!normalized || normalized === ".") return true;
  const segments = normalized.split("/");
  if (segments.some((segment) => DEFAULT_EXCLUDE_SEGMENTS.has(segment))) return false;
  if (DEFAULT_EXCLUDE_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) return false;
  if (GENERATED_OUTPUT_FILES.has(normalized)) return false;
  if (isGeneratedSlide(normalized)) return false;
  if (isTopicSpecificIllustration(normalized)) return false;
  if (!normalized.includes("/") && TOP_LEVEL_EXPERIMENT_PATTERNS.some((pattern) => pattern.test(normalized))) return false;
  return true;
}

function walkFiles(root, current = root) {
  const entries = fs.readdirSync(current, { withFileTypes: true });
  const files = [];
  entries.forEach((entry) => {
    const fullPath = path.join(current, entry.name);
    const relativePath = normalizePath(path.relative(root, fullPath));
    if (!shouldInclude(relativePath)) return;
    if (entry.isDirectory()) {
      files.push(...walkFiles(root, fullPath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  });
  return files.sort();
}

function buildManifest(files) {
  const excludedExamples = [
    "lecture-deck/.deck-quality/",
    "lecture-deck/source.md",
    "lecture-deck/slide-spec.json",
    "lecture-deck/HANDOFF.md",
    "lecture-deck/slides/*.html",
    "lecture-deck/assets/slides.js",
    "lecture-deck/assets/visuals.css",
    "lecture-deck/current-run.json",
    "root experiment PNG files",
    ".codex/*candidates*",
    ".codex/*archive*"
  ];
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    purpose: "Educational starter export for the HTML/CSS deck automation harness.",
    fileCount: files.length,
    includedFiles: files,
    excludedGeneratedOutputs: excludedExamples,
    firstRun: [
      "Read AGENTS.md and lecture-deck/AGENTS.md.",
      "Choose a new topic.",
      "Run lecture-deck/scripts/prepare-new-run.js after reset or initialization.",
      "Follow the orchestrated workflow instead of editing generated slides directly."
    ]
  };
}

function copyFiles(files, outDir, options = {}) {
  const resolvedOut = path.resolve(outDir);
  if (resolvedOut === repoRoot || resolvedOut.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error("Output directory must be outside the repository root.");
  }
  if (fs.existsSync(resolvedOut)) {
    if (!options.force) {
      throw new Error(`Output directory already exists: ${resolvedOut}. Use --force to replace it.`);
    }
    fs.rmSync(resolvedOut, { recursive: true, force: true });
  }
  fs.mkdirSync(resolvedOut, { recursive: true });
  files.forEach((relativePath) => {
    const source = path.join(repoRoot, relativePath);
    const target = path.join(resolvedOut, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  });
  writeStarterStubs(resolvedOut);
  const manifest = buildManifest(files);
  fs.writeFileSync(path.join(resolvedOut, "STARTER-MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

function writeJson(outRoot, relativePath, payload) {
  const fullPath = path.join(outRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function writeText(outRoot, relativePath, text) {
  const fullPath = path.join(outRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, text.endsWith("\n") ? text : `${text}\n`);
}

function buildStarterCurrentRun() {
  return {
    schemaVersion: 1,
    runId: "starter-harness-example",
    topic: "Starter deck automation workflow",
    audience: "Students learning orchestrated agent workflows",
    outcome: "Explain the deck workflow phases and run the harness before creating a new topic.",
    scope: {
      include: [
        "prompt contract",
        "research and asset decisions",
        "source brief",
        "slide output",
        "visual review",
        "validation and handoff"
      ],
      exclude: [
        "topic-specific production content",
        "historical experiment screenshots",
        "runtime quality reports"
      ]
    },
    researchNeed: {
      required: false,
      minimumTrustedUrls: 8,
      minimumOfficialDocs: 5,
      trustedHosts: [
        "developer.mozilla.org",
        "www.w3.org",
        "web.dev"
      ],
      officialDocHosts: [
        "developer.mozilla.org",
        "www.w3.org",
        "web.dev"
      ],
      notes: "Starter evidence exists only to keep the harness check runnable before a student chooses a topic."
    },
    outputReset: {
      requiredBeforeNewTopic: true,
      preserveHarness: true
    },
    visualPriority: [
      "workflow phase order",
      "evidence before output",
      "failure routing",
      "validation before handoff"
    ],
    assetRequirements: {
      minimumRasterSlides: 0,
      maximumCssModuleShare: 1,
      requireManifestForRaster: false,
      requiredImageCandidateSection: false,
      topicRequiresRealImages: false,
      reason: "Starter deck uses CSS modules only so students can run the harness without downloaded assets."
    },
    motionPriority: [
      "phase sequence",
      "validation gate progression"
    ],
    validationMode: "deck-loop",
    harnessImprovementMode: "quality-loop",
    requiredGates: [
      "agent-contract-check",
      "harness-check",
      "render-check",
      "stop-quality",
      "pre-handoff"
    ]
  };
}

function buildStarterTeachingFields(title, message, visual, index) {
  const phase = index + 1;
  return {
    learningObjective: `Explain why ${title.toLowerCase()} is required before moving to the next deck workflow phase.`,
    audienceQuestion: `What decision does phase ${phase} help the deck team make?`,
    explanationBeats: [
      `${title} gives the team a clear checkpoint instead of a loose task label.`,
      `The phase output connects the visible slide claim to source, spec, visual, or validation evidence.`,
      `The next phase should start only after this checkpoint is explicit enough for another agent to inspect.`
    ],
    exampleOrScenario: `Starter scenario: a student tries to skip ${title.toLowerCase()} and then cannot explain why "${message}" is supported.`,
    misconceptionOrCaveat: "The phase label is not enough; the presenter must explain the evidence, decision, or risk that the phase controls.",
    takeaway: `Use ${title.toLowerCase()} as a teachable checkpoint with evidence, not as a summary-only slide.`,
    speakerNote: [
      `This starter slide teaches ${title.toLowerCase()} as a workflow checkpoint, not as a decorative heading.`,
      `The presenter should explain how the visible claim connects to the ${visual} visual and what evidence or decision the team must inspect before moving on.`,
      `For example, if a student skips this step, the next agent may receive a slide request without enough source, spec, or validation context to judge quality.`,
      "The caveat is that the starter deck is only scaffolding; in a real topic, replace this note with topic-specific explanation, example, caveat, and takeaway."
    ].join(" ")
  };
}

function buildStarterSpec() {
  const archetypes = ["contract", "source", "map", "stack", "review", "gate"];
  const forms = ["checklist", "board", "matrix", "stack", "grid", "timeline"];
  return {
    schemaVersion: 1,
    deckTitle: "Starter Deck Automation Workflow",
    slides: STARTER_SLIDES.map(([id, title, message, visual], index) => {
      const evidence = [STARTER_URLS[index], STARTER_URLS[index + 4]].filter(Boolean);
      return {
        id,
        file: `slides/${id}.html`,
        title,
        message,
        visual,
        ...buildStarterTeachingFields(title, message, visual, index),
        visualArchetype: archetypes[index],
        visualForm: forms[index],
        importanceMap: {
          primaryMessage: message,
          primaryEvidenceOrAction: visual,
          secondaryConstraints: ["starter-safe", "replace before production"],
          metadata: [`phase-${index + 1}`]
        },
        assetDecision: {
          mode: "css-module",
          reason: "Starter export must run without external or topic-specific assets.",
          source: "",
          assetRole: "semantic workflow diagram",
          placement: "right-side visual",
          cropIntent: "not applicable",
          fallback: "text checklist"
        },
        motionDecision: {
          mode: index < 3 ? "animated" : "static",
          reason: index < 3 ? "Introduce early workflow sequence." : "Keep later slides stable for starter review."
        },
        ...(index < 3 ? {
          motion: {
            type: "sequence",
            mood: "calm",
            sequence: ["headline", "visual", "detail"],
            loop: "none",
            reducedMotion: "show final state"
          },
          motionPlan: {
            targets: [
              { selector: ".copy", recipe: "ink-settle", delayStep: 0 },
              { selector: ".starter-panel", recipe: "card-place", delayStep: 0 },
              { selector: ".starter-chip", recipe: "passkey-step-in", delayStep: 0 },
              { selector: ".starter-rail", recipe: "rail-grow", delayStep: 1 },
              { selector: ".starter-node:nth-child(1)", recipe: "passkey-step-in", delayStep: 1 },
              { selector: ".starter-node:nth-child(2)", recipe: "passkey-step-in", delayStep: 2 },
              { selector: ".starter-node:nth-child(3)", recipe: "passkey-step-in", delayStep: 3 }
            ],
            mustNotAnimate: ["layout dimensions", "color"],
            reducedMotion: "Disable animation and show all elements."
          }
        } : {}),
        evidence
      };
    })
  };
}

function buildStarterSource(spec) {
  return [
    "# Starter source brief",
    "",
    "This starter source exists so the exported harness can run `harness-check` before students choose a real topic.",
    "Replace it through the normal orchestrated workflow before producing a real deck.",
    "",
    "## Evidence list",
    "",
    ...STARTER_URLS.map((url) => `- ${url} - general web platform documentation used as starter evidence.`),
    "",
    "## Research selection notes",
    "",
    "- Sources are stable web platform references from MDN, W3C, and web.dev.",
    "- They are placeholders for harness validation, not a final topic brief.",
    "",
    "## Image candidates",
    "",
    "- No raster image candidates are bundled in the starter export.",
    "",
    "## Image and asset decisions",
    "",
    "- Use CSS modules for the starter deck so export validation has no network or license dependency.",
    "",
    "## Slide-visible claims",
    "",
    ...spec.slides.map((slide) => `- ${slide.id}: ${slide.message} Evidence: ${slide.evidence.join(", ")}`),
    "",
    "## Speaker-note context",
    "",
    "- Speaker notes explain workflow phases only. Replace after topic research.",
    "",
    "## Unresolved risks",
    "",
    "- This is starter scaffolding. A real topic requires a new source brief and evidence map."
  ].join("\n");
}

function buildStarterSlidesJs(spec) {
  const slides = spec.slides.map((slide) => ({
    id: slide.id,
    file: slide.file,
    title: slide.title,
    speakerNote: slide.speakerNote,
    evidence: slide.evidence
  }));
  return `window.DECK_SLIDES = ${JSON.stringify(slides, null, 2)};\n`;
}

function buildStarterSlideHtml(slide, index) {
  return [
    `<section class="slide layout-wide-visual starter-slide ${slide.id}" data-slide-id="${slide.id}">`,
    "  <div class=\"copy\">",
    `    <p class="eyebrow">Starter ${String(index + 1).padStart(2, "0")}</p>`,
    `    <h1>${slide.title}</h1>`,
    `    <p class="subtitle">${slide.message}</p>`,
    "  </div>",
    `  <div class="visual starter-panel starter-panel-${index + 1}" aria-label="${slide.visual}">`,
    `    <span class="starter-chip">phase ${index + 1}</span>`,
    `    <strong>${slide.visual}</strong>`,
    "    <div class=\"starter-rail rail-line\" aria-hidden=\"true\"></div>",
    "    <div class=\"starter-node-row\">",
    "      <div class=\"starter-node visual-module workflow-step\"><span>plan</span></div>",
    "      <div class=\"starter-node visual-module workflow-step\"><span>agent</span></div>",
    "      <div class=\"starter-node visual-module workflow-step\"><span>gate</span></div>",
    "    </div>",
    "    <p>Replace this starter module after the source brief and slide spec are approved.</p>",
    "  </div>",
    `  <p class="note">${slide.speakerNote}</p>`,
    "</section>"
  ].join("\n");
}

function buildStarterVisualsCss() {
  return `
.starter-slide .starter-panel {
  min-height: 320px;
  border: 2px solid var(--line);
  border-radius: var(--radius-lg);
  padding: 28px;
  display: grid;
  align-content: center;
  gap: 18px;
  background: var(--card-strong);
}

.starter-slide .starter-panel strong {
  font-size: clamp(1.8rem, 4vw, 3.2rem);
  line-height: 1.14;
}

.starter-slide .starter-panel p {
  max-width: 34ch;
  margin: 0;
  color: var(--muted-ink);
}

.starter-chip {
  width: max-content;
  border: 1px solid var(--line);
  border-radius: var(--radius-pill);
  padding: 6px 12px;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  text-transform: uppercase;
}

.starter-rail {
  width: 100%;
  height: 3px;
  border-radius: var(--radius-pill);
  background: var(--line);
  transform-origin: left center;
}

.starter-node-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.starter-node {
  min-width: 0;
  min-height: 76px;
  border: 1px solid var(--line);
  border-radius: var(--radius-md);
  display: grid;
  place-items: center;
  padding: 12px;
  background: var(--card);
  text-align: center;
  font-family: var(--font-mono);
  font-size: 0.84rem;
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.slide-01 .copy,
.slide-02 .copy,
.slide-03 .copy {
  animation: ink-settle var(--motion-medium) var(--ease-calm) both;
}

.slide-01 .starter-panel,
.slide-02 .starter-panel,
.slide-03 .starter-panel {
  animation: card-place var(--motion-medium) var(--ease-calm) both;
}

.slide-01 .starter-chip,
.slide-02 .starter-chip,
.slide-03 .starter-chip {
  animation: passkey-step-in var(--motion-fast) var(--ease-calm) both;
}

.slide-01 .starter-rail,
.slide-02 .starter-rail,
.slide-03 .starter-rail {
  animation: rail-grow var(--motion-medium) var(--ease-calm) both;
  animation-delay: var(--delay-step);
}

.slide-01 .starter-node,
.slide-02 .starter-node,
.slide-03 .starter-node {
  animation: passkey-step-in var(--motion-fast) var(--ease-calm) both;
}

.slide-01 .starter-node:nth-child(1),
.slide-02 .starter-node:nth-child(1),
.slide-03 .starter-node:nth-child(1) {
  animation-delay: var(--delay-step);
}

.slide-01 .starter-node:nth-child(2),
.slide-02 .starter-node:nth-child(2),
.slide-03 .starter-node:nth-child(2) {
  animation-delay: calc(var(--delay-step) * 2);
}

.slide-01 .starter-node:nth-child(3),
.slide-02 .starter-node:nth-child(3),
.slide-03 .starter-node:nth-child(3) {
  animation-delay: calc(var(--delay-step) * 3);
}

@keyframes card-place {
  from { opacity: 0; transform: translateY(var(--motion-rise)); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes rail-grow {
  from { opacity: 0; transform: scaleX(var(--motion-scale-start)); }
  to { opacity: 1; transform: scaleX(1); }
}

@keyframes ink-settle {
  from { opacity: 0; transform: translateY(calc(var(--motion-rise) * -1)); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes passkey-step-in {
  from { opacity: 0; transform: translateX(calc(var(--motion-rise) * -1)); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes passkey-rail-in {
  from { opacity: 0; transform: scaleX(var(--motion-scale-start)); }
  to { opacity: 1; transform: scaleX(1); }
}

@media (prefers-reduced-motion: reduce) {
  .starter-slide .copy,
  .starter-slide .starter-panel,
  .starter-slide .starter-chip,
  .starter-slide .starter-rail,
  .starter-slide .starter-node {
    animation: none;
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 760px) {
  .starter-node-row {
    gap: 8px;
  }

  .starter-node {
    min-height: 64px;
    padding: 8px 6px;
    font-size: 0.68rem;
  }
}
`;
}

function writeStarterStubs(outRoot) {
  const spec = buildStarterSpec();
  writeJson(outRoot, "lecture-deck/current-run.json", buildStarterCurrentRun());
  writeJson(outRoot, "lecture-deck/slide-spec.json", spec);
  writeText(outRoot, "lecture-deck/source.md", buildStarterSource(spec));
  writeText(outRoot, "lecture-deck/assets/slides.js", buildStarterSlidesJs(spec));
  writeText(outRoot, "lecture-deck/assets/visuals.css", buildStarterVisualsCss());
  writeJson(outRoot, "lecture-deck/assets/illustrations/manifest.json", { schemaVersion: 1, assets: [] });
  writeText(outRoot, "lecture-deck/HANDOFF.md", [
    "# Starter Handoff",
    "",
    "This is a sanitized starter handoff. Replace it after running the full orchestrated workflow for a real topic.",
    "",
    "## Validation",
    "",
    "- Run `node lecture-deck/scripts/run-hook.js harness-check` after export.",
    "- Run the full `deck-loop` only after producing topic-specific output."
  ].join("\n"));
  spec.slides.forEach((slide, index) => {
    writeText(outRoot, slide.file.startsWith("slides/")
      ? `lecture-deck/${slide.file}`
      : `lecture-deck/slides/${slide.id}.html`, buildStarterSlideHtml(slide, index));
  });
}

function run(options = parseArgs(process.argv.slice(2))) {
  const files = walkFiles(repoRoot);
  const manifest = buildManifest(files);
  if (options.out && !options.dryRun) {
    return copyFiles(files, options.out, options);
  }
  return manifest;
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const manifest = run(options);
    if (options.json) {
      console.log(JSON.stringify(manifest, null, 2));
    } else if (options.out && !options.dryRun) {
      console.log(`PASS starter export - ${path.resolve(options.out)}`);
      console.log(`PASS starter manifest - ${manifest.fileCount} file(s)`);
    } else {
      console.log(`PASS starter export dry-run - ${manifest.fileCount} file(s)`);
    }
  } catch (error) {
    console.error(`FAIL starter export - ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildManifest,
  parseArgs,
  run,
  shouldInclude,
  walkFiles
};
