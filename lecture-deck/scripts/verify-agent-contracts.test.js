const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "../..");
const deckSourceRoot = path.resolve(__dirname, "..");

function copyHarnessFixture() {
  const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), "agent-contracts-"));
  const deckRoot = path.join(tempRepo, "lecture-deck");
  fs.cpSync(deckSourceRoot, deckRoot, {
    recursive: true,
    filter(source) {
      const relative = path.relative(deckSourceRoot, source);
      if (!relative) return true;
      return !relative.split(path.sep).includes(".deck-quality");
    }
  });
  fs.mkdirSync(path.join(tempRepo, ".codex"), { recursive: true });
  fs.cpSync(path.join(repoRoot, ".codex/agents"), path.join(tempRepo, ".codex/agents"), { recursive: true });
  fs.cpSync(path.join(repoRoot, ".codex/skills"), path.join(tempRepo, ".codex/skills"), { recursive: true });
  fs.cpSync(path.join(repoRoot, ".codex/scripts"), path.join(tempRepo, ".codex/scripts"), { recursive: true });
  fs.copyFileSync(path.join(repoRoot, ".codex/hooks.json"), path.join(tempRepo, ".codex/hooks.json"));
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

function runVerifier(deckRoot) {
  return spawnSync(process.execPath, ["lecture-deck/scripts/verify-agent-contracts.js"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: deckRoot
    }
  });
}

function seedRequiredAgentPhaseTrace(deckRoot) {
  const run = JSON.parse(fs.readFileSync(path.join(deckRoot, "current-run.json"), "utf8"));
  const outputDir = path.join(deckRoot, ".deck-quality");
  const handoffDir = path.join(outputDir, "agent-handoffs", run.runId);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(handoffDir, { recursive: true });
  const lines = [];
  (run.requiredAgentPhases || []).forEach((phase, index) => {
    const handoffPath = `.deck-quality/agent-handoffs/${run.runId}/${String(index + 1).padStart(2, "0")}-${phase.agent}.json`;
    fs.writeFileSync(path.join(deckRoot, handoffPath), `${JSON.stringify({
      schemaVersion: 1,
      runId: run.runId,
      phase: phase.phase,
      agent: phase.agent,
      role: phase.agent,
      delegatedBy: "main-session",
      handoffType: "agent-result",
      task: phase.task,
      findings: ["ok"],
      actions: ["fixture phase accepted"],
      judgement: "pass",
      openIssues: [],
      evidence: phase.evidenceKinds.map((item) => ({ kind: item, pathOrUrl: item, note: "fixture evidence" })),
      validationEvidence: [{ commandOrGate: phase.nextGate, status: "skipped", note: "fixture" }],
      commandsRun: [{ command: phase.nextGate, status: "skipped", note: "fixture" }],
      filesTouched: [],
      routingDecision: "no-routing-needed",
      nextGate: phase.nextGate
    }, null, 2)}\n`);
    lines.push(JSON.stringify({
      schemaVersion: 1,
      runId: run.runId,
      timestamp: new Date(Date.now() + index * 2).toISOString(),
      event: "agent_phase_started",
      source: "agent-orchestration",
      phase: phase.phase,
      agent: phase.agent,
      task: phase.task,
      status: "started",
      delegatedBy: "main-session",
      handoffType: "agent-result",
      evidence: phase.evidenceKinds,
      nextGate: phase.nextGate
    }));
    lines.push(JSON.stringify({
      schemaVersion: 1,
      runId: run.runId,
      timestamp: new Date(Date.now() + index * 2 + 1).toISOString(),
      event: "agent_phase_finished",
      source: "agent-orchestration",
      phase: phase.phase,
      agent: phase.agent,
      task: phase.task,
      status: "pass",
      delegatedBy: "main-session",
      handoffType: "agent-result",
      evidence: phase.evidenceKinds,
      handoffPath,
      nextGate: phase.nextGate
    }));
  });
  fs.writeFileSync(path.join(outputDir, "workflow-trace.jsonl"), `${lines.join("\n")}\n`);
}

test("verify-agent-contracts accepts aligned harness contracts", () => {
  const { deckRoot } = copyHarnessFixture();
  seedRequiredAgentPhaseTrace(deckRoot);

  const result = runVerifier(deckRoot);

  assert.equal(result.status, 0);
  assert.match(result.stdout, /PASS current run contract/);
  assert.match(result.stdout, /PASS tool policy contract/);
  assert.match(result.stdout, /PASS required agent phase policy/);
  assert.match(result.stdout, /PASS agent handoff schema/);
  assert.match(result.stdout, /PASS agent canonical flow/);
  assert.match(result.stdout, /PASS agent phase trace/);
  assert.match(result.stdout, /PASS reset boundary/);
  assert.match(result.stdout, /PASS workflow trace/);
});

test("verify-agent-contracts rejects incomplete current-run contract", () => {
  const { deckRoot } = copyHarnessFixture();
  const runPath = path.join(deckRoot, "current-run.json");
  const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
  delete run.visualPriority;
  fs.writeFileSync(runPath, `${JSON.stringify(run, null, 2)}\n`);

  const result = runVerifier(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL current run contract/);
  assert.match(result.stdout, /visualPriority/);
});

test("verify-agent-contracts rejects stale agent canonical flow text", () => {
  const { tempRepo, deckRoot } = copyHarnessFixture();
  seedRequiredAgentPhaseTrace(deckRoot);
  const agentPath = path.join(tempRepo, ".codex/agents/deck-researcher.toml");
  fs.appendFileSync(agentPath, "\n# stale: source brief -> slide spec -> HTML/CSS deck -> presenter review -> verification -> handoff\n");

  const result = runVerifier(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL agent canonical flow/);
  assert.match(result.stdout, /deck-researcher\.toml/);
});

test("verify-agent-contracts rejects reset plans that delete workflow files", () => {
  const { tempRepo, deckRoot } = copyHarnessFixture();
  seedRequiredAgentPhaseTrace(deckRoot);
  const resetPath = path.join(tempRepo, ".codex/skills/deck-output-reset/scripts/reset-deck-output.js");
  const original = fs.readFileSync(resetPath, "utf8");
  fs.writeFileSync(resetPath, original.replace(
    '"assets/visuals.css"',
    '"assets/visuals.css",\n    "scripts/run-hook.js"'
  ));

  const result = runVerifier(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL reset boundary/);
  assert.match(result.stdout, /lecture-deck\/scripts\/run-hook\.js/);
});

test("verify-agent-contracts rejects handoff-ready decks missing required agent phase trace", () => {
  const { deckRoot } = copyHarnessFixture();
  const outputDir = path.join(deckRoot, ".deck-quality");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "workflow-trace.jsonl"), `${JSON.stringify({
    schemaVersion: 1,
    runId: "not-current-run",
    timestamp: new Date().toISOString(),
    event: "hook_command_started",
    source: "test"
  })}\n`);

  const result = runVerifier(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL agent phase trace/);
  assert.match(result.stdout, /missing=research\/tool selection:deck-researcher/);
});

test("verify-agent-contracts rejects unknown agents in required phase policy", () => {
  const { deckRoot } = copyHarnessFixture();
  seedRequiredAgentPhaseTrace(deckRoot);
  const runPath = path.join(deckRoot, "current-run.json");
  const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
  run.requiredAgentPhases[0].agent = "deck-unknown-agent";
  fs.writeFileSync(runPath, `${JSON.stringify(run, null, 2)}\n`);

  const result = runVerifier(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL required agent phase policy/);
  assert.match(result.stdout, /unknown-agent:deck-unknown-agent/);
});

test("verify-agent-contracts rejects finished agent phases without started pair", () => {
  const { deckRoot } = copyHarnessFixture();
  seedRequiredAgentPhaseTrace(deckRoot);
  const tracePath = path.join(deckRoot, ".deck-quality/workflow-trace.jsonl");
  const lines = fs.readFileSync(tracePath, "utf8")
    .trim()
    .split(/\n+/)
    .filter((line) => !line.includes('"event":"agent_phase_started"') && !line.includes('"event": "agent_phase_started"'));
  fs.writeFileSync(tracePath, `${lines.join("\n")}\n`);

  const result = runVerifier(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL agent phase trace/);
  assert.match(result.stdout, /incomplete=research\/tool selection:deck-researcher/);
});

test("verify-agent-contracts rejects out-of-order agent phase completions", () => {
  const { deckRoot } = copyHarnessFixture();
  seedRequiredAgentPhaseTrace(deckRoot);
  const tracePath = path.join(deckRoot, ".deck-quality/workflow-trace.jsonl");
  const lines = fs.readFileSync(tracePath, "utf8").trim().split(/\n+/);
  const firstPair = lines.splice(0, 2);
  lines.push(...firstPair);
  fs.writeFileSync(tracePath, `${lines.join("\n")}\n`);

  const result = runVerifier(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL agent phase trace/);
  assert.match(result.stdout, /out-of-order=asset research:deck-asset-researcher/);
});

test("verify-agent-contracts rejects missing handoff artifacts", () => {
  const { deckRoot } = copyHarnessFixture();
  seedRequiredAgentPhaseTrace(deckRoot);
  fs.rmSync(path.join(deckRoot, ".deck-quality/agent-handoffs"), { recursive: true, force: true });

  const result = runVerifier(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL agent phase trace/);
  assert.match(result.stdout, /missing-handoff-file/);
});

test("verify-agent-contracts rejects handoff artifacts without structured evidence", () => {
  const { deckRoot } = copyHarnessFixture();
  seedRequiredAgentPhaseTrace(deckRoot);
  const run = JSON.parse(fs.readFileSync(path.join(deckRoot, "current-run.json"), "utf8"));
  const handoffPath = path.join(deckRoot, ".deck-quality/agent-handoffs", run.runId, "01-deck-researcher.json");
  const handoff = JSON.parse(fs.readFileSync(handoffPath, "utf8"));
  handoff.evidence = ["source.md"];
  fs.writeFileSync(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`);

  const result = runVerifier(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL agent phase trace/);
  assert.match(result.stdout, /handoff-invalid-evidence\[0\]\.kind/);
});

test("verify-agent-contracts rejects handoff artifacts without validation evidence", () => {
  const { deckRoot } = copyHarnessFixture();
  seedRequiredAgentPhaseTrace(deckRoot);
  const run = JSON.parse(fs.readFileSync(path.join(deckRoot, "current-run.json"), "utf8"));
  const handoffPath = path.join(deckRoot, ".deck-quality/agent-handoffs", run.runId, "01-deck-researcher.json");
  const handoff = JSON.parse(fs.readFileSync(handoffPath, "utf8"));
  handoff.validationEvidence = [];
  fs.writeFileSync(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`);

  const result = runVerifier(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL agent phase trace/);
  assert.match(result.stdout, /handoff-invalid-validationEvidence-empty/);
});

test("verify-agent-contracts ignores stale phase trace from another runId", () => {
  const { deckRoot } = copyHarnessFixture();
  seedRequiredAgentPhaseTrace(deckRoot);
  const runPath = path.join(deckRoot, "current-run.json");
  const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
  run.runId = "different-run";
  fs.writeFileSync(runPath, `${JSON.stringify(run, null, 2)}\n`);

  const result = runVerifier(deckRoot);

  assert.equal(result.status, 1);
  assert.match(result.stdout, /FAIL agent phase trace/);
  assert.match(result.stdout, /missing=research\/tool selection:deck-researcher/);
});
