const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..", "..");

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stop-continuation-"));
  fs.mkdirSync(path.join(root, ".codex", "scripts"), { recursive: true });
  fs.mkdirSync(path.join(root, "lecture-deck", "scripts"), { recursive: true });
  fs.copyFileSync(
    path.join(repoRoot, ".codex", "scripts", "stop-continuation.js"),
    path.join(root, ".codex", "scripts", "stop-continuation.js")
  );
  return root;
}

function runHook(root, args = []) {
  return spawnSync(process.execPath, [".codex/scripts/stop-continuation.js", ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      HTML_CSS_STOP_HOOK_ROOT: root
    }
  });
}

function readState(root) {
  return JSON.parse(fs.readFileSync(path.join(root, ".codex", "stop-continuation-state.json"), "utf8"));
}

test("stop continuation increments no-work count and suppresses after three", () => {
  const root = makeRoot();

  for (let index = 1; index <= 4; index += 1) {
    const result = runHook(root);
    assert.equal(result.status, 0);
    assert.equal(result.stdout, "");
    assert.equal(readState(root).noWorkCount, Math.min(index, 3));
  }

  assert.equal(readState(root).lastDecision.status, "suppressed");
});

test("stop continuation resets no-work count when a pending plan exists", () => {
  const root = makeRoot();
  runHook(root);
  runHook(root);
  fs.writeFileSync(
    path.join(root, ".codex", "stop-continuation-plan.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      items: [
        {
          id: "next-regression-gate",
          status: "pending",
          prompt: "Run the longer regression gate.",
          nextCommand: "node lecture-deck/scripts/run-hook.js quality-loop"
        }
      ]
    })}\n`
  );

  const result = runHook(root);

  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.decision, "block");
  assert.match(output.systemMessage, /Run the longer regression gate/);
  assert.equal(readState(root).noWorkCount, 0);
});

test("stop continuation routes failure output before plan files", () => {
  const root = makeRoot();
  fs.writeFileSync(
    path.join(root, "lecture-deck", "scripts", "route-failure.js"),
    [
      "#!/usr/bin/env node",
      "console.log(JSON.stringify({",
      "  status: 'route-required',",
      "  recommendedAgent: 'deck-workflow-improver',",
      "  routingDecision: 'route-to-workflow-improvement',",
      "  reason: 'controlled failure',",
      "  prompt: 'Fix the workflow gate.',",
      "  nextCommand: 'node lecture-deck/scripts/run-hook.js quality-loop'",
      "}));",
      "process.exitCode = 2;"
    ].join("\n")
  );

  const result = runHook(root);

  assert.equal(result.status, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.decision, "block");
  assert.match(output.systemMessage, /deck-workflow-improver/);
  assert.match(output.systemMessage, /Fix the workflow gate/);
  assert.equal(readState(root).noWorkCount, 0);
});
