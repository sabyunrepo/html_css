#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const RESET_TITLE = "HTML/CSS Deck Automation Harness";
const RESET_CACHE_KEY = "harness";
const EMPTY_MANIFEST = {
  schemaVersion: 1,
  generatedAt: "reset",
  assets: []
};

function readRunId(deckRoot) {
  const runPath = path.join(deckRoot, "current-run.json");
  if (!fs.existsSync(runPath)) return "unknown-run";
  try {
    const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
    return run.runId || "unknown-run";
  } catch {
    return "unknown-run";
  }
}

function parseArgs(argv) {
  const apply = argv.includes("--apply");
  const dryRun = argv.includes("--dry-run") || !apply;
  const rootArg = argv.find((arg) => arg.startsWith("--root="));
  return {
    apply,
    dryRun,
    root: rootArg ? path.resolve(rootArg.slice("--root=".length)) : process.cwd()
  };
}

function assertDeckRoot(root) {
  const deckRoot = path.join(root, "lecture-deck");
  const required = [
    "deck.html",
    "presenter-review.html",
    "scripts/run-hook.js",
    "assets/style.css",
    "design.md",
    "motion.md"
  ];
  const missing = required.filter((item) => !fs.existsSync(path.join(deckRoot, item)));
  if (missing.length) {
    throw new Error(`Not a lecture-deck harness root. Missing: ${missing.join(", ")}`);
  }
  return deckRoot;
}

function listHtmlSlides(deckRoot) {
  const slidesDir = path.join(deckRoot, "slides");
  if (!fs.existsSync(slidesDir)) {
    return [];
  }
  return fs.readdirSync(slidesDir)
    .filter((name) => name.endsWith(".html"))
    .map((name) => path.join(slidesDir, name));
}

function listIllustrationOutputs(deckRoot) {
  const illustrationsDir = path.join(deckRoot, "assets/illustrations");
  if (!fs.existsSync(illustrationsDir)) {
    return [];
  }
  return fs.readdirSync(illustrationsDir)
    .filter((name) => !["README.md", ".gitkeep", "manifest.schema.json", "manifest.json"].includes(name))
    .map((name) => path.join(illustrationsDir, name));
}

function buildResetPlan(deckRoot) {
  const explicit = [
    "source.md",
    "slide-spec.json",
    "HANDOFF.md",
    "assets/slides.js",
    "assets/visuals.css"
  ].map((item) => path.join(deckRoot, item));

  const files = [
    ...explicit,
    ...listHtmlSlides(deckRoot),
    ...listIllustrationOutputs(deckRoot)
  ].filter((filePath) => fs.existsSync(filePath));

  const directories = [
    path.join(deckRoot, ".deck-quality")
  ].filter((dirPath) => fs.existsSync(dirPath));

  return { files, directories };
}

function removePlan(plan) {
  plan.files.forEach((filePath) => fs.rmSync(filePath, { force: true }));
  plan.directories.forEach((dirPath) => fs.rmSync(dirPath, { recursive: true, force: true }));
}

function archiveWorkflowTrace(deckRoot) {
  const tracePath = path.join(deckRoot, ".deck-quality/workflow-trace.jsonl");
  if (!fs.existsSync(tracePath)) {
    return "";
  }
  const runId = readRunId(deckRoot);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archiveDir = path.join(deckRoot, ".deck-quality-archive", `${runId}-${stamp}`);
  fs.mkdirSync(archiveDir, { recursive: true });
  const archivePath = path.join(archiveDir, "workflow-trace.jsonl");
  fs.copyFileSync(tracePath, archivePath);
  return archivePath;
}

function normalizeAssetQuery(html) {
  return html
    .replace(/assets\/style\.css\?v=[^"]+/g, `assets/style.css?v=${RESET_CACHE_KEY}`)
    .replace(/assets\/slides\.js\?v=[^"]+/g, `assets/slides.js?v=${RESET_CACHE_KEY}`)
    .replace(/assets\/deck\.js\?v=[^"]+/g, `assets/deck.js?v=${RESET_CACHE_KEY}`)
    .replace(/assets\/presenter-review\.js\?v=[^"]+/g, `assets/presenter-review.js?v=${RESET_CACHE_KEY}`);
}

function resetShellMetadata(deckRoot) {
  const deckPath = path.join(deckRoot, "deck.html");
  const reviewPath = path.join(deckRoot, "presenter-review.html");

  let deckHtml = fs.readFileSync(deckPath, "utf8");
  deckHtml = normalizeAssetQuery(deckHtml)
    .replace(/<title>.*?<\/title>/, `<title>${RESET_TITLE}</title>`)
    .replace(/<strong>.*?<\/strong>/, `<strong>${RESET_TITLE}</strong>`);
  fs.writeFileSync(deckPath, deckHtml);

  let reviewHtml = fs.readFileSync(reviewPath, "utf8");
  reviewHtml = normalizeAssetQuery(reviewHtml)
    .replace(/<title>.*?<\/title>/, `<title>Presenter Review - ${RESET_TITLE}</title>`)
    .replace(/<h1>.*?<\/h1>/, `<h1>${RESET_TITLE}</h1>`);
  fs.writeFileSync(reviewPath, reviewHtml);

  return [deckPath, reviewPath];
}

function resetAssetManifest(deckRoot) {
  const manifestPath = path.join(deckRoot, "assets/illustrations/manifest.json");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(EMPTY_MANIFEST, null, 2)}\n`);
  return manifestPath;
}

function formatRelative(root, paths) {
  return paths.map((item) => path.relative(root, item)).sort();
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const deckRoot = assertDeckRoot(options.root);
  const plan = buildResetPlan(deckRoot);
  const shellFiles = [
    path.join(deckRoot, "deck.html"),
    path.join(deckRoot, "presenter-review.html")
  ];

  if (options.apply) {
    archiveWorkflowTrace(deckRoot);
    removePlan(plan);
    resetShellMetadata(deckRoot);
    resetAssetManifest(deckRoot);
  }

  const payload = {
    mode: options.apply ? "apply" : "dry-run",
    root: options.root,
    files: formatRelative(options.root, plan.files),
    directories: formatRelative(options.root, plan.directories),
    neutralizedShellMetadata: formatRelative(options.root, shellFiles),
    resetManifests: formatRelative(options.root, [
      path.join(deckRoot, "assets/illustrations/manifest.json")
    ]),
    traceBoundary: {
      currentRunId: readRunId(deckRoot),
      workflowTraceReset: formatRelative(options.root, [
        path.join(deckRoot, ".deck-quality/workflow-trace.jsonl")
      ])[0],
      archiveDirectory: formatRelative(options.root, [
        path.join(deckRoot, ".deck-quality-archive")
      ])[0]
    },
    preserved: [
      ".codex/skills",
      ".codex/agents",
      "lecture-deck/agents",
      "lecture-deck/skills",
      "lecture-deck/scripts",
      "lecture-deck/hooks",
      "lecture-deck/assets/style.css",
      "lecture-deck/assets/deck.js",
      "lecture-deck/assets/presenter-review.js",
      "lecture-deck/assets/illustrations/manifest.schema.json",
      "lecture-deck/deck.html",
      "lecture-deck/presenter-review.html",
      "lecture-deck/design.md",
      "lecture-deck/motion.md",
      "lecture-deck/few-shots.md"
    ]
  };

  console.log(JSON.stringify(payload, null, 2));
}

main();
