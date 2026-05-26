const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { buildManifest, run, shouldInclude } = require("./export-starter");

test("shouldInclude excludes generated deck outputs and runtime artifacts", () => {
  [
    "lecture-deck/.deck-quality/visual-quality-report.md",
    "lecture-deck/.deck-quality-archive/old/report.md",
    "lecture-deck/source.md",
    "lecture-deck/slide-spec.json",
    "lecture-deck/HANDOFF.md",
    "lecture-deck/current-run.json",
    "lecture-deck/slides/slide-01.html",
    "lecture-deck/assets/slides.js",
    "lecture-deck/assets/visuals.css",
    "lecture-deck/assets/illustrations/manifest.json",
    ".codex/stop-continuation-state.json",
    ".codex/skill-candidates/deck-production-loop/SKILL.md",
    "passkeys-final-slide1.png"
  ].forEach((relativePath) => {
    assert.equal(shouldInclude(relativePath), false, relativePath);
  });
});

test("shouldInclude preserves harness, skills, agents, scripts, and neutral placeholders", () => {
  [
    "AGENTS.md",
    "README.md",
    ".codex/hooks.json",
    ".codex/agents/deck-workflow-improver.toml",
    ".codex/skills/deck-builder/SKILL.md",
    ".codex/scripts/stop-continuation.js",
    "lecture-deck/AGENTS.md",
    "lecture-deck/HARNESS-IMPROVEMENT-BACKLOG.md",
    "lecture-deck/scripts/run-hook.js",
    "lecture-deck/scripts/export-starter.js",
    "lecture-deck/hooks/harness-check.json",
    "lecture-deck/assets/style.css",
    "lecture-deck/assets/deck.js",
    "lecture-deck/assets/illustrations/README.md",
    "lecture-deck/assets/illustrations/manifest.schema.json",
    "lecture-deck/slides/.gitkeep"
  ].forEach((relativePath) => {
    assert.equal(shouldInclude(relativePath), true, relativePath);
  });
});

test("buildManifest records starter purpose and excluded output classes", () => {
  const manifest = buildManifest(["AGENTS.md", "lecture-deck/AGENTS.md"]);

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.fileCount, 2);
  assert.match(manifest.purpose, /Educational starter export/);
  assert.ok(manifest.excludedGeneratedOutputs.includes("lecture-deck/slides/*.html"));
});

test("run exports a starter copy and manifest without generated outputs", () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "starter-export-")), "starter");

  const manifest = run({ out, force: false, dryRun: false, json: false });

  assert.ok(fs.existsSync(path.join(out, "STARTER-MANIFEST.json")));
  assert.equal(fs.existsSync(path.join(out, "lecture-deck/scripts/export-starter.js")), true);
  assert.equal(fs.existsSync(path.join(out, "lecture-deck/source.md")), true);
  assert.equal(fs.readFileSync(path.join(out, "lecture-deck/current-run.json"), "utf8").includes("2026-05-26-css-flexbox"), false);
  assert.equal(fs.existsSync(path.join(out, "lecture-deck/.deck-quality")), false);
  assert.equal(fs.existsSync(path.join(out, "passkeys-final-slide1.png")), false);
  assert.equal(manifest.includedFiles.includes("lecture-deck/scripts/export-starter.js"), true);
  assert.equal(manifest.includedFiles.includes("lecture-deck/source.md"), false);
});

test("exported starter passes harness-check with sanitized stubs", () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "starter-export-")), "starter");
  run({ out, force: false, dryRun: false, json: false });

  const result = spawnSync(process.execPath, ["lecture-deck/scripts/run-hook.js", "harness-check"], {
    cwd: out,
    encoding: "utf8"
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
