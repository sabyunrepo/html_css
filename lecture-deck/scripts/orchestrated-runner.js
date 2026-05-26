#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { appendTrace, appendAgentPhaseTrace } = require("./workflow-trace");

const deckRoot = process.env.DECK_ROOT
  ? path.resolve(process.env.DECK_ROOT)
  : path.resolve(__dirname, "..");
const repoRoot = process.env.REPO_ROOT
  ? path.resolve(process.env.REPO_ROOT)
  : path.resolve(deckRoot, "..");
const reportPath = path.join(deckRoot, ".deck-quality/orchestrated-runner-report.json");

const CANONICAL_FLOW = "prompt contract -> optional output reset -> research/tool selection -> source brief -> spec -> slide output -> visual/motion polish -> screenshot review -> validation -> handoff";

function parseArgs(argv) {
  const args = {
    validate: false,
    reset: false,
    allowFallback: true,
    gatePolicy: "final"
  };
  argv.forEach((arg) => {
    if (arg === "--validate") args.validate = true;
    if (arg === "--reset") args.reset = true;
    if (arg === "--no-fallback") args.allowFallback = false;
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) return;
    const [, key, value] = match;
    if (key === "agent-command") args.agentCommand = value;
    if (key === "topic") args.topic = value;
    if (key === "run-id") args.runId = value;
    if (key === "audience") args.audience = value;
    if (key === "outcome") args.outcome = value;
    if (key === "gate-policy") args.gatePolicy = value;
  });
  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readRun() {
  return readJson(path.join(deckRoot, "current-run.json"));
}

function relativeDeck(filePath) {
  return path.relative(deckRoot, filePath).replace(/\\/g, "/");
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(deckRoot, relativePath));
}

function globSlideFiles() {
  const slidesDir = path.join(deckRoot, "slides");
  if (!fs.existsSync(slidesDir)) return [];
  return fs.readdirSync(slidesDir)
    .filter((file) => /^slide-.+\.html$/.test(file))
    .sort()
    .map((file) => `slides/${file}`);
}

function evidencePathsForKind(kind) {
  const map = {
    source: ["source.md"],
    "claim-map": ["source.md"],
    "asset-manifest": ["assets/illustrations/manifest.json"],
    "image-source": ["assets/illustrations/README.md"],
    "slide-spec": ["slide-spec.json"],
    slides: globSlideFiles(),
    handoff: ["HANDOFF.md"],
    "visual-review": ["assets/visuals.css"],
    "motion-review": ["slide-spec.json", "assets/visuals.css"],
    "screenshot-review": [".deck-quality/screenshot-review.json"],
    "quality-report": [".deck-quality/visual-quality-report.md"],
    "validation-result": [".deck-quality/validation-result.json"],
    "command-output": [".deck-quality/validation-result.json"]
  };
  return map[kind] || [kind];
}

function evidenceForPhase(phase) {
  const paths = (phase.evidenceKinds || []).flatMap(evidencePathsForKind);
  return [...new Set(paths)].filter(Boolean);
}

function missingEvidence(phase) {
  return evidenceForPhase(phase).filter((item) => !fileExists(item));
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "phase";
}

function readTraceEvents() {
  const tracePath = path.join(deckRoot, ".deck-quality/workflow-trace.jsonl");
  if (!fs.existsSync(tracePath)) return [];
  return fs.readFileSync(tracePath, "utf8")
    .trim()
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function isPhaseComplete(events, runId, phase) {
  return events.some((event) => {
    return event.runId === runId
      && ["agent_phase_finished", "agent_phase_fallback"].includes(event.event)
      && ["pass", "fallback"].includes(event.status)
      && event.phase === phase.phase
      && event.agent === phase.agent;
  });
}

function buildPhasePrompt(run, phase, evidence) {
  return [
    `Project: ${deckRoot}`,
    `Run ID: ${run.runId}`,
    `Topic: ${run.topic}`,
    `Audience: ${run.audience}`,
    `Outcome: ${run.outcome}`,
    `Canonical flow: ${CANONICAL_FLOW}`,
    `Phase: ${phase.phase}`,
    `Agent: ${phase.agent}`,
    `Task: ${phase.task}`,
    `Expected evidence: ${evidence.join(", ")}`,
    `Next gate: ${phase.nextGate}`,
    "Return or write a handoff artifact that matches lecture-deck/agent-handoff.schema.json. Do not weaken validation gates."
  ].join("\n");
}

function writeHandoffArtifact({ run, phase, status, handoffType, findings, actions, evidence, validationStatus, note }) {
  const dir = path.join(deckRoot, ".deck-quality/agent-handoffs", run.runId);
  fs.mkdirSync(dir, { recursive: true });
  const relativePath = `.deck-quality/agent-handoffs/${run.runId}/${slugify(phase.phase)}-${slugify(phase.agent)}.json`;
  const fullPath = path.join(deckRoot, relativePath);
  const payload = {
    schemaVersion: 1,
    runId: run.runId,
    phase: phase.phase,
    agent: phase.agent,
    role: phase.agent,
    delegatedBy: "orchestrated-runner",
    handoffType,
    task: phase.task,
    findings,
    actions,
    judgement: status === "pass" || status === "fallback" ? "pass" : status,
    openIssues: [],
    evidence: evidence.map((item) => ({
      kind: "path",
      pathOrUrl: item,
      note: note || "orchestrated runner evidence"
    })),
    validationEvidence: [{
      commandOrGate: phase.nextGate,
      status: validationStatus,
      note: "recorded by orchestrated-runner.js"
    }],
    filesTouched: evidence.filter((item) => !item.startsWith(".deck-quality/")),
    nextGate: phase.nextGate
  };
  fs.writeFileSync(fullPath, `${JSON.stringify(payload, null, 2)}\n`);
  return relativePath;
}

function recordStarted(run, phase, evidence, prompt) {
  appendAgentPhaseTrace(deckRoot, {
    phase: phase.phase,
    agent: phase.agent,
    task: phase.task,
    status: "started",
    delegatedBy: "orchestrated-runner",
    handoffType: "agent-result",
    evidence,
    handoffPath: "",
    nextGate: phase.nextGate,
    note: `Prompt prepared for ${phase.agent}.`,
    prompt
  });
}

function recordCompletion(run, phase, status, evidence, note, handoffType = "agent-result") {
  const handoffPath = writeHandoffArtifact({
    run,
    phase,
    status,
    handoffType,
    findings: [note],
    actions: status === "fallback" ? ["Main session or external process must ensure phase evidence is reviewed."] : ["Agent command completed."],
    evidence,
    validationStatus: "not-run",
    note
  });
  appendAgentPhaseTrace(deckRoot, {
    phase: phase.phase,
    agent: phase.agent,
    task: phase.task,
    status,
    delegatedBy: "orchestrated-runner",
    handoffType,
    evidence,
    handoffPath,
    nextGate: phase.nextGate,
    note
  });
  return handoffPath;
}

function runCommand(command, input, env) {
  return spawnSync(command, {
    cwd: repoRoot,
    shell: true,
    input: `${JSON.stringify(input, null, 2)}\n`,
    encoding: "utf8",
    env: {
      ...process.env,
      ...env
    }
  });
}

function runReset() {
  const resetScript = path.join(repoRoot, ".codex/skills/deck-output-reset/scripts/reset-deck-output.js");
  const result = spawnSync(process.execPath, [resetScript, "--apply", `--root=${repoRoot}`], {
    cwd: repoRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "output reset failed");
  }
  return result.stdout.trim();
}

function runPrepare(args) {
  if (!args.topic) return null;
  const commandArgs = ["scripts/prepare-new-run.js", `--topic=${args.topic}`];
  if (args.runId) commandArgs.push(`--run-id=${args.runId}`);
  if (args.audience) commandArgs.push(`--audience=${args.audience}`);
  if (args.outcome) commandArgs.push(`--outcome=${args.outcome}`);
  const result = spawnSync(process.execPath, commandArgs, {
    cwd: deckRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "prepare-new-run failed");
  }
  return result.stdout.trim();
}

function runGate(gateName) {
  const result = spawnSync(process.execPath, ["scripts/run-hook.js", gateName], {
    cwd: deckRoot,
    encoding: "utf8"
  });
  return {
    gateName,
    status: result.status === 0 ? "pass" : "fail",
    stdout: result.stdout,
    stderr: result.stderr
  };
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status: "running",
    phases: [],
    gates: [],
    reset: null,
    prepare: null
  };

  if (args.reset) {
    report.reset = runReset();
  }
  report.prepare = runPrepare(args);

  appendTrace(deckRoot, {
    event: "orchestrated_runner_started",
    source: "orchestrated-runner.js",
    status: "started",
    gatePolicy: args.gatePolicy,
    hasAgentCommand: Boolean(args.agentCommand || process.env.DECK_AGENT_COMMAND)
  });

  const run = readRun();
  const events = readTraceEvents();
  const phases = (run.requiredAgentPhases || []).filter((phase) => phase.required);
  const agentCommand = args.agentCommand || process.env.DECK_AGENT_COMMAND || "";

  for (const phase of phases) {
    const evidence = evidenceForPhase(phase);
    if (isPhaseComplete(events, run.runId, phase)) {
      report.phases.push({ phase: phase.phase, agent: phase.agent, status: "skipped-complete", evidence });
      continue;
    }

    const prompt = buildPhasePrompt(run, phase, evidence);
    recordStarted(run, phase, evidence.length ? evidence : phase.evidenceKinds, prompt);

    if (agentCommand) {
      const input = { run, phase, prompt, evidence, deckRoot, repoRoot, canonicalFlow: CANONICAL_FLOW };
      const result = runCommand(agentCommand, input, {
        DECK_ROOT: deckRoot,
        REPO_ROOT: repoRoot,
        DECK_AGENT_PHASE: phase.phase,
        DECK_AGENT_NAME: phase.agent,
        DECK_AGENT_TASK: phase.task,
        DECK_AGENT_PROMPT: prompt,
        DECK_AGENT_RUN_ID: run.runId
      });
      if (result.status !== 0) {
        recordCompletion(run, phase, "fail", evidence.length ? evidence : phase.evidenceKinds, result.stderr || result.stdout || "agent command failed");
        report.phases.push({ phase: phase.phase, agent: phase.agent, status: "fail", stdout: result.stdout, stderr: result.stderr });
        report.status = "fail";
        writeReport(report);
        console.error(`Agent command failed for ${phase.phase}:${phase.agent}`);
        process.exitCode = 1;
        return;
      }
      const missing = missingEvidence(phase);
      if (missing.length) {
        recordCompletion(run, phase, "blocked", evidence.length ? evidence : phase.evidenceKinds, `Agent command finished but evidence is missing: ${missing.join(", ")}`);
        report.phases.push({ phase: phase.phase, agent: phase.agent, status: "blocked", missingEvidence: missing, stdout: result.stdout });
        report.status = "blocked";
        writeReport(report);
        console.error(`Blocked ${phase.phase}:${phase.agent}; missing evidence: ${missing.join(", ")}`);
        process.exitCode = 1;
        return;
      }
      recordCompletion(run, phase, "pass", evidence.length ? evidence : phase.evidenceKinds, "Agent command completed.", "agent-result");
      report.phases.push({ phase: phase.phase, agent: phase.agent, status: "pass", stdout: result.stdout });
    } else if (args.allowFallback) {
      const missing = missingEvidence(phase);
      if (missing.length) {
        recordCompletion(run, phase, "blocked", evidence.length ? evidence : phase.evidenceKinds, `Missing evidence for fallback: ${missing.join(", ")}`);
        report.phases.push({ phase: phase.phase, agent: phase.agent, status: "blocked", missingEvidence: missing, prompt });
        report.status = "blocked";
        writeReport(report);
        console.error(`Blocked ${phase.phase}:${phase.agent}; missing evidence: ${missing.join(", ")}`);
        process.exitCode = 1;
        return;
      }
      recordCompletion(run, phase, "fallback", evidence, "No DECK_AGENT_COMMAND configured; runner recorded fallback only after required evidence files existed.", "agent-fallback");
      report.phases.push({ phase: phase.phase, agent: phase.agent, status: "fallback", evidence });
    } else {
      recordCompletion(run, phase, "blocked", evidence.length ? evidence : phase.evidenceKinds, "No agent command configured and fallback is disabled.");
      report.phases.push({ phase: phase.phase, agent: phase.agent, status: "blocked", prompt });
      report.status = "blocked";
      writeReport(report);
      console.error(`Blocked ${phase.phase}:${phase.agent}; no agent command configured and fallback is disabled.`);
      process.exitCode = 1;
      return;
    }

    if (args.gatePolicy === "phase") {
      const gate = runGate(phase.nextGate);
      report.gates.push(gate);
      if (gate.status !== "pass") {
        report.status = "fail";
        writeReport(report);
        process.exitCode = 1;
        return;
      }
    }
  }

  if (process.exitCode) return;

  if (args.validate || args.gatePolicy === "final") {
    const gate = runGate(run.validationMode || "deck-loop");
    report.gates.push(gate);
    if (gate.status !== "pass") {
      report.status = "fail";
      writeReport(report);
      process.exitCode = 1;
      return;
    }
  }

  report.status = "pass";
  writeReport(report);
  appendTrace(deckRoot, {
    event: "orchestrated_runner_finished",
    source: "orchestrated-runner.js",
    status: "pass",
    reportPath: relativeDeck(reportPath)
  });
  console.log(JSON.stringify({
    ok: true,
    reportPath: relativeDeck(reportPath),
    phases: report.phases.map((phase) => ({ phase: phase.phase, agent: phase.agent, status: phase.status })),
    gates: report.gates.map((gate) => ({ gate: gate.gateName, status: gate.status }))
  }, null, 2));
}

try {
  main();
} catch (error) {
  appendTrace(deckRoot, {
    event: "orchestrated_runner_finished",
    source: "orchestrated-runner.js",
    status: "fail",
    error: error.message
  });
  console.error(error.message);
  process.exitCode = 1;
}
