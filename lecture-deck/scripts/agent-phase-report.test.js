const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const deckSourceRoot = path.resolve(__dirname, "..");

function copyDeckFixture() {
  const deckRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-phase-report-"));
  ["current-run.json"].forEach((file) => fs.copyFileSync(path.join(deckSourceRoot, file), path.join(deckRoot, file)));
  fs.mkdirSync(path.join(deckRoot, "scripts"), { recursive: true });
  fs.copyFileSync(path.join(deckSourceRoot, "scripts/agent-phase-report.js"), path.join(deckRoot, "scripts/agent-phase-report.js"));
  return deckRoot;
}

test("agent-phase-report summarizes missing phases", () => {
  const deckRoot = copyDeckFixture();
  const result = spawnSync(process.execPath, ["scripts/agent-phase-report.js"], {
    cwd: deckRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: deckRoot
    }
  });

  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout);
  const run = JSON.parse(fs.readFileSync(path.join(deckRoot, "current-run.json"), "utf8"));
  assert.equal(payload.runId, run.runId);
  assert.equal(payload.phases.length, 6);
  assert.equal(payload.phases[0].status, "missing");
});
