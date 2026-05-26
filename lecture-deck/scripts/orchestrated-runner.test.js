const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const deckSourceRoot = path.resolve(__dirname, "..");

function copyDeckFixture() {
  const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrated-runner-"));
  const deckRoot = path.join(tempRepo, "lecture-deck");
  fs.cpSync(deckSourceRoot, deckRoot, {
    recursive: true,
    filter(source) {
      const relative = path.relative(deckSourceRoot, source);
      if (!relative) return true;
      return !relative.split(path.sep).includes(".deck-quality");
    }
  });
  ensureRequiredPhases(deckRoot);
  return { tempRepo, deckRoot };
}

function ensureRequiredPhases(deckRoot) {
  const runPath = path.join(deckRoot, "current-run.json");
  const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
  if (Array.isArray(run.requiredAgentPhases) && run.requiredAgentPhases.length > 0) return;
  run.orchestration = {
    mode: "codex-native-phase-trace",
    mainSessionRole: "orchestrator",
    enforceAgentTrace: true
  };
  run.requiredAgentPhases = [
    { phase: "research/tool selection", agent: "deck-researcher", required: true, task: "Collect trusted sources.", nextGate: "harness-check", evidenceKinds: ["source", "claim-map"] },
    { phase: "asset research", agent: "deck-asset-researcher", required: true, task: "Classify assets.", nextGate: "harness-check", evidenceKinds: ["asset-manifest", "image-source"] },
    { phase: "slide output", agent: "deck-content-producer", required: true, task: "Generate slide output.", nextGate: "harness-check", evidenceKinds: ["source", "slide-spec", "slides", "handoff"] },
    { phase: "visual/motion polish", agent: "deck-visual-reviewer", required: true, task: "Review visuals.", nextGate: "render-check", evidenceKinds: ["visual-review", "motion-review"] },
    { phase: "screenshot review", agent: "deck-screenshot-quality-reviewer", required: true, task: "Review screenshots.", nextGate: "stop-quality", evidenceKinds: ["screenshot-review", "quality-report"] },
    { phase: "validation", agent: "deck-validation-runner", required: true, task: "Run validation.", nextGate: "pre-handoff", evidenceKinds: ["validation-result", "command-output"] }
  ];
  fs.writeFileSync(runPath, `${JSON.stringify(run, null, 2)}\n`);
}

function seedFinalEvidence(deckRoot) {
  const qualityDir = path.join(deckRoot, ".deck-quality");
  fs.mkdirSync(qualityDir, { recursive: true });
  fs.writeFileSync(path.join(qualityDir, "screenshot-review.json"), `${JSON.stringify({
    schemaVersion: 1,
    status: "pass",
    reviewedSlides: ["slide-01"],
    visibleFailures: []
  }, null, 2)}\n`);
  fs.writeFileSync(path.join(qualityDir, "visual-quality-report.md"), "# Visual Quality Report\n\nPASS\n");
  fs.writeFileSync(path.join(qualityDir, "validation-result.json"), `${JSON.stringify({
    schemaVersion: 1,
    status: "pass"
  }, null, 2)}\n`);
}

function runRunner(deckRoot, args = [], extraEnv = {}) {
  return spawnSync(process.execPath, ["scripts/orchestrated-runner.js", ...args], {
    cwd: deckRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: deckRoot,
      REPO_ROOT: path.dirname(deckRoot),
      ...extraEnv
    }
  });
}

test("orchestrated-runner blocks fallback when required evidence is missing", () => {
  const { deckRoot } = copyDeckFixture();
  fs.rmSync(path.join(deckRoot, "source.md"), { force: true });

  const result = runRunner(deckRoot, ["--gate-policy=none"]);

  assert.equal(result.status, 1);
  assert.match(fs.readFileSync(path.join(deckRoot, ".deck-quality/orchestrated-runner-report.json"), "utf8"), /"status": "blocked"/);
  assert.match(result.stderr + result.stdout, /missing evidence|Blocked/);
});

test("orchestrated-runner records fallback phases only after evidence exists", () => {
  const { deckRoot } = copyDeckFixture();
  seedFinalEvidence(deckRoot);

  const result = runRunner(deckRoot, ["--gate-policy=none"]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(fs.readFileSync(path.join(deckRoot, ".deck-quality/orchestrated-runner-report.json"), "utf8"));
  assert.equal(report.status, "pass");
  assert.equal(report.phases.filter((phase) => phase.status === "fallback").length, 6);
  const trace = fs.readFileSync(path.join(deckRoot, ".deck-quality/workflow-trace.jsonl"), "utf8");
  assert.match(trace, /"event":"agent_phase_fallback"/);
  assert.match(trace, /No DECK_AGENT_COMMAND configured/);
});

test("orchestrated-runner invokes configured agent command with phase environment", () => {
  const { tempRepo, deckRoot } = copyDeckFixture();
  seedFinalEvidence(deckRoot);
  const logPath = path.join(tempRepo, "agent-env.jsonl");
  const agentPath = path.join(tempRepo, "agent-stub.js");
  fs.writeFileSync(agentPath, `
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(logPath)}, JSON.stringify({
  phase: process.env.DECK_AGENT_PHASE,
  agent: process.env.DECK_AGENT_NAME,
  runId: process.env.DECK_AGENT_RUN_ID
}) + "\\n");
fs.readFileSync(0, "utf8");
`);

  const result = runRunner(deckRoot, ["--gate-policy=none"], {
    DECK_AGENT_COMMAND: `${process.execPath} ${agentPath}`
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const calls = fs.readFileSync(logPath, "utf8").trim().split(/\n+/).map((line) => JSON.parse(line));
  assert.equal(calls.length, 6);
  assert.equal(calls[0].phase, "research/tool selection");
  assert.equal(calls[0].agent, "deck-researcher");
});

test("orchestrated-runner works with bundled mock agent adapter", () => {
  const { deckRoot } = copyDeckFixture();
  seedFinalEvidence(deckRoot);

  const result = runRunner(deckRoot, ["--gate-policy=none"], {
    DECK_AGENT_COMMAND: `${process.execPath} lecture-deck/examples/agent-adapter/mock-agent.js`
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(fs.readFileSync(path.join(deckRoot, ".deck-quality/orchestrated-runner-report.json"), "utf8"));
  assert.equal(report.status, "pass");
  assert.equal(report.phases.every((phase) => phase.status === "pass"), true);
});
