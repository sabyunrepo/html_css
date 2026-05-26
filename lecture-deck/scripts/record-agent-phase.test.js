const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "../..");
const deckSourceRoot = path.resolve(__dirname, "..");

function makeDeckFixture() {
  const deckRoot = fs.mkdtempSync(path.join(os.tmpdir(), "record-agent-phase-"));
  fs.copyFileSync(path.join(deckSourceRoot, "agent-handoff.schema.json"), path.join(deckRoot, "agent-handoff.schema.json"));
  fs.writeFileSync(path.join(deckRoot, "current-run.json"), `${JSON.stringify({
    schemaVersion: 1,
    runId: "record-agent-phase-test"
  }, null, 2)}\n`);
  return deckRoot;
}

function runRecorder(deckRoot, args) {
  return spawnSync(process.execPath, ["lecture-deck/scripts/record-agent-phase.js", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: deckRoot
    }
  });
}

function readTrace(deckRoot) {
  return fs.readFileSync(path.join(deckRoot, ".deck-quality/workflow-trace.jsonl"), "utf8")
    .trim()
    .split(/\n+/)
    .map((line) => JSON.parse(line));
}

test("record-agent-phase writes generated handoff and structured evidence into trace", () => {
  const deckRoot = makeDeckFixture();

  const result = runRecorder(deckRoot, [
    "--phase=validation",
    "--agent=deck-validation-runner",
    "--task=Run focused validation",
    "--status=pass",
    "--evidence=source.md",
    "--nextGate=pre-handoff"
  ]);

  assert.equal(result.status, 0);
  const trace = readTrace(deckRoot);
  const finished = trace.find((event) => event.event === "agent_phase_finished");
  assert.equal(finished.status, "pass");
  assert.equal(finished.evidence[0].kind, "path");
  assert.equal(finished.evidence[0].pathOrUrl, "source.md");
  assert.match(finished.handoffPath, /agent-handoffs\/record-agent-phase-test\/validation-deck-validation-runner\.json$/);
});

test("record-agent-phase accepts existing structured handoff without manual trace evidence", () => {
  const deckRoot = makeDeckFixture();
  const handoffPath = ".deck-quality/agent-handoffs/record-agent-phase-test/research.json";
  fs.mkdirSync(path.dirname(path.join(deckRoot, handoffPath)), { recursive: true });
  fs.writeFileSync(path.join(deckRoot, handoffPath), `${JSON.stringify({
    schemaVersion: 1,
    runId: "record-agent-phase-test",
    phase: "research/tool selection",
    agent: "deck-researcher",
    role: "deck-researcher",
    delegatedBy: "main-session",
    handoffType: "agent-result",
    task: "Collect evidence",
    findings: ["Source brief checked."],
    actions: ["Recorded source evidence."],
    judgement: "pass",
    openIssues: [],
    evidence: [{ kind: "source", pathOrUrl: "source.md", note: "source brief evidence" }],
    validationEvidence: [{ commandOrGate: "harness-check", status: "pass", note: "harness check passed" }],
    commandsRun: [{ command: "node scripts/run-hook.js harness-check", status: "pass", note: "harness check passed" }],
    filesTouched: ["source.md"],
    routingDecision: "no-routing-needed",
    nextGate: "harness-check"
  }, null, 2)}\n`);

  const result = runRecorder(deckRoot, [
    "--phase=research/tool selection",
    "--agent=deck-researcher",
    "--task=Collect evidence",
    "--status=pass",
    `--handoffPath=${handoffPath}`,
    "--nextGate=harness-check"
  ]);

  assert.equal(result.status, 0);
  const trace = readTrace(deckRoot);
  const finished = trace.find((event) => event.event === "agent_phase_finished");
  assert.deepEqual(finished.evidence, [{ kind: "source", pathOrUrl: "source.md", note: "source brief evidence" }]);
});

test("record-agent-phase rejects existing handoff with empty validation evidence", () => {
  const deckRoot = makeDeckFixture();
  const handoffPath = ".deck-quality/agent-handoffs/record-agent-phase-test/research.json";
  fs.mkdirSync(path.dirname(path.join(deckRoot, handoffPath)), { recursive: true });
  fs.writeFileSync(path.join(deckRoot, handoffPath), `${JSON.stringify({
    schemaVersion: 1,
    runId: "record-agent-phase-test",
    phase: "research/tool selection",
    agent: "deck-researcher",
    role: "deck-researcher",
    delegatedBy: "main-session",
    handoffType: "agent-result",
    task: "Collect evidence",
    findings: ["Source brief checked."],
    actions: ["Recorded source evidence."],
    judgement: "pass",
    openIssues: [],
    evidence: [{ kind: "source", pathOrUrl: "source.md", note: "source brief evidence" }],
    validationEvidence: [],
    commandsRun: [{ command: "node scripts/run-hook.js harness-check", status: "pass", note: "harness check passed" }],
    filesTouched: ["source.md"],
    routingDecision: "no-routing-needed",
    nextGate: "harness-check"
  }, null, 2)}\n`);

  const result = runRecorder(deckRoot, [
    "--phase=research/tool selection",
    "--agent=deck-researcher",
    "--task=Collect evidence",
    "--status=pass",
    `--handoffPath=${handoffPath}`,
    "--nextGate=harness-check"
  ]);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /validationEvidence requires at least one structured item/);
});
