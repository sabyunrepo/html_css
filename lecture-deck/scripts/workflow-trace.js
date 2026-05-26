const fs = require("node:fs");
const path = require("node:path");

function readRunId(root) {
  const runPath = path.join(root, "current-run.json");
  if (!fs.existsSync(runPath)) {
    return "unknown-run";
  }
  try {
    const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
    return run.runId || "unknown-run";
  } catch {
    return "unknown-run";
  }
}

function appendTrace(root, event) {
  const outputDir = path.join(root, ".deck-quality");
  const tracePath = path.join(outputDir, "workflow-trace.jsonl");
  fs.mkdirSync(outputDir, { recursive: true });
  const payload = {
    schemaVersion: 1,
    runId: event.runId || readRunId(root),
    timestamp: new Date().toISOString(),
    ...event
  };
  fs.appendFileSync(tracePath, `${JSON.stringify(payload)}\n`);
  return tracePath;
}

function appendAgentPhaseTrace(root, event) {
  const required = ["phase", "agent", "task", "status", "evidence", "nextGate"];
  const missing = required.filter((field) => event[field] === undefined);
  if (missing.length) {
    throw new Error(`agent phase trace missing field(s): ${missing.join(", ")}`);
  }
  if (!Array.isArray(event.evidence) || event.evidence.length === 0) {
    throw new Error("agent phase trace requires at least one evidence item");
  }
  if (!["started", "pass", "fail", "blocked", "fallback"].includes(event.status)) {
    throw new Error(`unsupported agent phase status: ${event.status}`);
  }

  const eventNameByStatus = {
    started: "agent_phase_started",
    pass: "agent_phase_finished",
    fail: "agent_phase_finished",
    blocked: "agent_phase_finished",
    fallback: "agent_phase_fallback"
  };

  return appendTrace(root, {
    event: eventNameByStatus[event.status],
    source: "agent-orchestration",
    ...event
  });
}

module.exports = { appendTrace, appendAgentPhaseTrace };
