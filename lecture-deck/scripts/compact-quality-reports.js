#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const deckRoot = process.env.DECK_ROOT
  ? path.resolve(process.env.DECK_ROOT)
  : path.resolve(__dirname, "..");
const qualityDir = path.join(deckRoot, ".deck-quality");
const archiveRoot = path.join(deckRoot, ".deck-quality-archive");

const KEEP_FILES = new Set([
  "validation-result.json",
  "screenshot-review.json",
  "visual-quality-report.md",
  "quality-remediation-plan.json",
  "visual-rubric-scores.json",
  "workflow-trace.jsonl",
  "orchestrated-runner-report.json",
  "regression-gate-report.json",
  "regression-gate-report.md"
]);

function parseArgs(argv) {
  const options = { apply: false, keepScreenshots: 0, archiveName: null, json: false };
  argv.forEach((arg) => {
    if (arg === "--apply") options.apply = true;
    if (arg === "--json") options.json = true;
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) return;
    if (match[1] === "keep-screenshots") options.keepScreenshots = Number(match[2]);
    if (match[1] === "archive-name") options.archiveName = match[2];
  });
  if (!Number.isInteger(options.keepScreenshots) || options.keepScreenshots < 0) {
    throw new Error("--keep-screenshots must be a non-negative integer");
  }
  return options;
}

function safeArchiveName(value = new Date().toISOString()) {
  return String(value)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "quality-archive";
}

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  fs.readdirSync(root, { withFileTypes: true }).forEach((entry) => {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  });
  return files;
}

function relativeQuality(filePath) {
  return path.relative(qualityDir, filePath).replace(/\\/g, "/");
}

function planCompaction(options = {}) {
  const files = walkFiles(qualityDir);
  const screenshotFiles = files
    .filter((file) => relativeQuality(file).startsWith("screenshots/"))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const keepScreenshots = new Set(screenshotFiles.slice(0, options.keepScreenshots || 0).map(relativeQuality));
  const move = [];
  const keep = [];

  files.forEach((file) => {
    const relative = relativeQuality(file);
    if (KEEP_FILES.has(relative) || keepScreenshots.has(relative)) {
      keep.push(relative);
      return;
    }
    move.push(relative);
  });

  return { keep: keep.sort(), move: move.sort() };
}

function applyCompaction(plan, options = {}) {
  const archiveName = safeArchiveName(options.archiveName);
  const archiveDir = path.join(archiveRoot, archiveName);
  fs.mkdirSync(archiveDir, { recursive: true });
  plan.move.forEach((relative) => {
    const source = path.join(qualityDir, relative);
    if (!fs.existsSync(source)) return;
    const target = path.join(archiveDir, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(source, target);
  });
  removeEmptyDirectories(qualityDir);
  return path.relative(deckRoot, archiveDir).replace(/\\/g, "/");
}

function removeEmptyDirectories(root) {
  if (!fs.existsSync(root)) return;
  fs.readdirSync(root, { withFileTypes: true }).forEach((entry) => {
    if (entry.isDirectory()) removeEmptyDirectories(path.join(root, entry.name));
  });
  if (root !== qualityDir && fs.readdirSync(root).length === 0) {
    fs.rmdirSync(root);
  }
}

function run(options = parseArgs(process.argv.slice(2))) {
  const plan = planCompaction(options);
  const result = {
    schemaVersion: 1,
    status: "pass",
    applied: Boolean(options.apply),
    kept: plan.keep,
    moved: plan.move,
    archivePath: null
  };
  if (options.apply && plan.move.length) {
    result.archivePath = applyCompaction(plan, options);
  }
  return result;
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = run(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`PASS quality report compaction - ${result.moved.length} file(s) ${result.applied ? "moved" : "planned"}`);
      if (result.archivePath) console.log(`PASS quality report archive - ${result.archivePath}`);
    }
  } catch (error) {
    console.error(`FAIL quality report compaction - ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  KEEP_FILES,
  parseArgs,
  planCompaction,
  run
};
