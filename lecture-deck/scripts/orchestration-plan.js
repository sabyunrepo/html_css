#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { analyzeDeckState } = require("./deck-loop-state");

const deckRoot = process.env.DECK_ROOT
  ? path.resolve(process.env.DECK_ROOT)
  : path.resolve(__dirname, "..");

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(deckRoot, relativePath), "utf8"));
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

function completedPhaseKeys(events, runId) {
  return new Set(events
    .filter((event) => event.runId === runId)
    .filter((event) => ["agent_phase_finished", "agent_phase_fallback"].includes(event.event))
    .filter((event) => ["pass", "fallback"].includes(event.status))
    .map((event) => `${event.phase}:${event.agent}`));
}

function buildPrompt(run, phase) {
  return [
    `Project: ${deckRoot}`,
    `Topic: ${run.topic}`,
    `Audience: ${run.audience}`,
    `Canonical flow: prompt contract -> optional output reset -> research/tool selection -> source brief -> spec -> slide output -> visual/motion polish -> screenshot review -> validation -> handoff`,
    `Phase: ${phase.phase}`,
    `Agent: ${phase.agent}`,
    `Task: ${phase.task}`,
    `Next gate: ${phase.nextGate}`,
    "Return bounded findings, evidence, files touched, open issues, and the next gate. Do not weaken validation gates."
  ].join("\n");
}

function main() {
  const run = readJson("current-run.json");
  const state = analyzeDeckState(deckRoot);
  const phases = run.requiredAgentPhases || [];
  const completed = completedPhaseKeys(readTraceEvents(), run.runId);
  const nextPhase = phases.find((phase) => {
    return phase.required && !completed.has(`${phase.phase}:${phase.agent}`);
  });

  const result = {
    schemaVersion: 1,
    currentState: state.status,
    runId: run.runId || "unknown-run",
    orchestrationMode: run.orchestration?.mode || "unspecified",
    mainSessionRole: run.orchestration?.mainSessionRole || "unspecified",
    requiredPhaseCount: phases.filter((phase) => phase.required).length,
    completedPhaseCount: phases.filter((phase) => completed.has(`${phase.phase}:${phase.agent}`)).length,
    nextPhase: nextPhase || null,
    prompt: nextPhase ? buildPrompt(run, nextPhase) : null,
    finalGate: nextPhase ? nextPhase.nextGate : run.validationMode
  };

  console.log(JSON.stringify(result, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
