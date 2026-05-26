#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

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

function main() {
  const run = readJson("current-run.json");
  const events = readTraceEvents().filter((event) => event.runId === run.runId);
  const phases = (run.requiredAgentPhases || []).map((phase) => {
    const started = events.find((event) => {
      return event.event === "agent_phase_started" && event.phase === phase.phase && event.agent === phase.agent;
    });
    const finished = [...events].reverse().find((event) => {
      return ["agent_phase_finished", "agent_phase_fallback"].includes(event.event)
        && event.phase === phase.phase
        && event.agent === phase.agent;
    });
    return {
      phase: phase.phase,
      agent: phase.agent,
      status: finished?.status || (started ? "started" : "missing"),
      handoffPath: finished?.handoffPath || "",
      nextGate: phase.nextGate,
      evidence: finished?.evidence || []
    };
  });

  const payload = {
    schemaVersion: 1,
    runId: run.runId,
    topic: run.topic,
    phases
  };

  if (process.argv.includes("--markdown")) {
    console.log(`Agent phases for ${run.runId}`);
    console.log("");
    phases.forEach((phase) => {
      console.log(`- ${phase.phase}: ${phase.agent} -> ${phase.status}${phase.handoffPath ? ` (${phase.handoffPath})` : ""}`);
    });
    return;
  }

  console.log(JSON.stringify(payload, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
