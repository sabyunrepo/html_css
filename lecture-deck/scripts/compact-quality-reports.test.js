const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const scriptPath = path.resolve(__dirname, "compact-quality-reports.js");

function makeDeckRoot() {
  const deckRoot = fs.mkdtempSync(path.join(os.tmpdir(), "quality-compact-"));
  const quality = path.join(deckRoot, ".deck-quality");
  fs.mkdirSync(path.join(quality, "screenshots"), { recursive: true });
  fs.mkdirSync(path.join(quality, "regression-gate"), { recursive: true });
  fs.writeFileSync(path.join(quality, "validation-result.json"), "{}\n");
  fs.writeFileSync(path.join(quality, "visual-quality-report.md"), "PASS\n");
  fs.writeFileSync(path.join(quality, "workflow-trace.jsonl"), "{}\n");
  fs.writeFileSync(path.join(quality, "screenshots/slide-01.png"), "png\n");
  fs.writeFileSync(path.join(quality, "regression-gate/motion-mutation-loop.json"), "{}\n");
  fs.writeFileSync(path.join(quality, "improvement-loop-report.json"), "{}\n");
  return deckRoot;
}

function runCompactor(deckRoot, args = []) {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: deckRoot
    }
  });
}

test("compact-quality-reports dry-run plans to keep proof files and move heavy artifacts", () => {
  const deckRoot = makeDeckRoot();
  const result = runCompactor(deckRoot, ["--json"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.applied, false);
  assert.ok(report.kept.includes("validation-result.json"));
  assert.ok(report.moved.includes("screenshots/slide-01.png"));
  assert.ok(report.moved.includes("regression-gate/motion-mutation-loop.json"));
  assert.equal(fs.existsSync(path.join(deckRoot, ".deck-quality/screenshots/slide-01.png")), true);
});

test("compact-quality-reports apply moves artifacts into archive", () => {
  const deckRoot = makeDeckRoot();
  const result = runCompactor(deckRoot, ["--apply", "--archive-name=test-archive", "--json"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.applied, true);
  assert.equal(report.archivePath, ".deck-quality-archive/test-archive");
  assert.equal(fs.existsSync(path.join(deckRoot, ".deck-quality/validation-result.json")), true);
  assert.equal(fs.existsSync(path.join(deckRoot, ".deck-quality/screenshots/slide-01.png")), false);
  assert.equal(fs.existsSync(path.join(deckRoot, ".deck-quality-archive/test-archive/screenshots/slide-01.png")), true);
});
