const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "../..");
const deckSourceRoot = path.resolve(__dirname, "..");

function copyDeckFixture() {
  const deckRoot = fs.mkdtempSync(path.join(os.tmpdir(), "prepare-new-run-"));
  [
    "current-run.json"
  ].forEach((file) => fs.copyFileSync(path.join(deckSourceRoot, file), path.join(deckRoot, file)));
  fs.mkdirSync(path.join(deckRoot, "scripts"), { recursive: true });
  [
    "prepare-new-run.js",
    "workflow-trace.js"
  ].forEach((file) => {
    fs.copyFileSync(path.join(deckSourceRoot, "scripts", file), path.join(deckRoot, "scripts", file));
  });
  return deckRoot;
}

test("prepare-new-run updates runId, topic, audience, outcome, and writes trace", () => {
  const deckRoot = copyDeckFixture();
  const result = spawnSync(process.execPath, [
    "scripts/prepare-new-run.js",
    "--run-id=2026-05-26-omelet",
    "--topic=부드러운 오믈렛 만들기",
    "--audience=초보 요리자",
    "--outcome=달걀을 태우지 않고 부드러운 오믈렛을 완성한다"
  ], {
    cwd: deckRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: deckRoot
    }
  });

  assert.equal(result.status, 0);
  const run = JSON.parse(fs.readFileSync(path.join(deckRoot, "current-run.json"), "utf8"));
  assert.equal(run.runId, "2026-05-26-omelet");
  assert.equal(run.topic, "부드러운 오믈렛 만들기");
  assert.equal(run.audience, "초보 요리자");
  assert.equal(run.outcome, "달걀을 태우지 않고 부드러운 오믈렛을 완성한다");
  const trace = fs.readFileSync(path.join(deckRoot, ".deck-quality/workflow-trace.jsonl"), "utf8");
  assert.match(trace, /"event":"run_prepared"/);
  assert.match(trace, /"runId":"2026-05-26-omelet"/);
});
