#!/usr/bin/env node
const fs = require("node:fs");

function readStdin() {
  return fs.readFileSync(0, "utf8");
}

function main() {
  const input = JSON.parse(readStdin() || "{}");
  const phase = process.env.DECK_AGENT_PHASE || input.phase?.phase || "unknown phase";
  const agent = process.env.DECK_AGENT_NAME || input.phase?.agent || "unknown-agent";
  const runId = process.env.DECK_AGENT_RUN_ID || input.run?.runId || "unknown-run";
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];

  const handoff = {
    schemaVersion: 1,
    runId,
    phase,
    agent,
    role: agent,
    delegatedBy: "mock-agent-adapter",
    handoffType: "agent-result",
    task: input.phase?.task || process.env.DECK_AGENT_TASK || "Mock phase task",
    findings: [
      "Mock adapter received the phase contract.",
      "Replace this script with a real agent, CLI, or API call for production."
    ],
    actions: [
      "Read JSON contract from stdin.",
      "Returned a valid demonstration handoff payload on stdout."
    ],
    judgement: "pass",
    openIssues: [],
    evidence: evidence.map((item) => ({
      kind: "path",
      pathOrUrl: item,
      note: "Evidence path supplied by orchestrated-runner."
    })),
    validationEvidence: [{
      commandOrGate: input.phase?.nextGate || "not-run",
      status: "skipped",
      note: "Mock adapter does not run gates; orchestrated-runner owns validation."
    }],
    commandsRun: [{
      command: "node lecture-deck/examples/agent-adapter/mock-agent.js",
      status: "pass",
      note: "Mock adapter execution completed."
    }],
    filesTouched: [],
    routingDecision: "no-routing-needed",
    nextGate: input.phase?.nextGate || "harness-check"
  };

  process.stdout.write(`${JSON.stringify(handoff, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  console.error(`mock-agent failed: ${error.message}`);
  process.exitCode = 1;
}
