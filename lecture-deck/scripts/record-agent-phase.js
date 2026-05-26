#!/usr/bin/env node
const path = require("node:path");
const fs = require("node:fs");
const { appendAgentPhaseTrace } = require("./workflow-trace");

const deckRoot = process.env.DECK_ROOT
  ? path.resolve(process.env.DECK_ROOT)
  : path.resolve(__dirname, "..");

function parseArgs(argv) {
  const parsed = {
    evidence: [],
    validationEvidence: [],
    commandsRun: [],
    filesTouched: [],
    openIssues: []
  };
  argv.forEach((arg) => {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) return;
    const [, key, value] = match;
    if (key === "evidence") {
      parsed.evidence.push(value);
    } else if (key === "validationEvidence") {
      parsed.validationEvidence.push(parseStatusRecord(value, "validationEvidence"));
    } else if (key === "commandsRun") {
      parsed.commandsRun.push(parseStatusRecord(value, "commandsRun"));
    } else if (key === "filesTouched") {
      parsed.filesTouched.push(value);
    } else if (key === "openIssues") {
      parsed.openIssues.push(value);
    } else {
      parsed[key] = value;
    }
  });
  return parsed;
}

function parseStatusRecord(value, label) {
  const [name, status, ...noteParts] = String(value || "").split("|");
  const note = noteParts.join("|");
  if (!name || !status || !note) {
    throw new Error(`${label} must use name|status|note`);
  }
  return { name, status, note };
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "phase";
}

function readRunId() {
  const runPath = path.join(deckRoot, "current-run.json");
  if (!fs.existsSync(runPath)) return "unknown-run";
  const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
  return run.runId || "unknown-run";
}

function normalizeEvidenceItem(item) {
  const raw = String(item || "").trim();
  if (!raw) {
    throw new Error("evidence item must not be empty");
  }
  if (raw.startsWith("{")) {
    const parsed = JSON.parse(raw);
    return {
      kind: parsed.kind,
      pathOrUrl: parsed.pathOrUrl,
      note: parsed.note
    };
  }
  return {
    kind: "path",
    pathOrUrl: raw,
    note: "agent phase evidence"
  };
}

function defaultRoutingDecision(status) {
  if (status === "fallback") return "fallback-to-main-session";
  if (status === "pass" || status === "started") return "no-routing-needed";
  if (status === "fail") return "route-to-validation";
  return "fallback-to-main-session";
}

function validationEvidenceFor(args, status) {
  if (args.validationEvidence.length) {
    return args.validationEvidence.map((item) => ({
      commandOrGate: item.name,
      status: item.status,
      note: item.note
    }));
  }
  return [{
    commandOrGate: args.nextGate || "deck-loop",
    status: status === "pass" ? "skipped" : "not-run",
    note: status === "pass"
      ? "phase accepted by orchestrator; next gate is recorded separately"
      : "recorded by record-agent-phase.js"
  }];
}

function commandsRunFor(args, status) {
  if (args.commandsRun.length) {
    return args.commandsRun.map((item) => ({
      command: item.name,
      status: item.status,
      note: item.note
    }));
  }
  return [{
    command: args.nextGate || "deck-loop",
    status: status === "pass" ? "skipped" : "not-run",
    note: status === "pass"
      ? "no direct command was run inside this phase handoff"
      : "recorded by record-agent-phase.js"
  }];
}

function validateHandoffContract(handoff) {
  const schema = JSON.parse(fs.readFileSync(path.join(deckRoot, "agent-handoff.schema.json"), "utf8"));
  const issues = [];
  const allowedRootFields = new Set(Object.keys(schema.properties || {}));
  Object.keys(handoff || {}).forEach((field) => {
    if (!allowedRootFields.has(field)) issues.push(`additional field ${field}`);
  });
  (schema.required || []).forEach((field) => {
    if (handoff[field] === undefined) issues.push(`missing ${field}`);
  });
  ["schemaVersion", "runId", "phase", "agent", "role", "delegatedBy", "handoffType", "task", "judgement", "nextGate"].forEach((field) => {
    if (handoff[field] !== undefined && (typeof handoff[field] !== "string" || handoff[field].length === 0) && field !== "schemaVersion") {
      issues.push(`${field} must be a non-empty string`);
    }
  });
  if (handoff.schemaVersion !== 1) issues.push("schemaVersion must be 1");
  if (!["agent-result", "agent-review", "agent-validation", "agent-fallback"].includes(handoff.handoffType)) {
    issues.push("handoffType invalid");
  }
  if (!["pass", "fail", "blocked", "needs-orchestrator-decision"].includes(handoff.judgement)) {
    issues.push("judgement invalid");
  }
  ["findings", "actions", "openIssues", "filesTouched"].forEach((field) => {
    if (!Array.isArray(handoff[field])) issues.push(`${field} must be an array`);
  });
  if (!Array.isArray(handoff.findings) || handoff.findings.length === 0) {
    issues.push("findings requires at least one item");
  }
  if (!Array.isArray(handoff.actions) || handoff.actions.length === 0) {
    issues.push("actions requires at least one item");
  }
  if (!Array.isArray(handoff.evidence) || handoff.evidence.length === 0) {
    issues.push("evidence requires at least one structured item");
  } else {
    handoff.evidence.forEach((item, index) => {
      ["kind", "pathOrUrl", "note"].forEach((field) => {
        if (typeof item?.[field] !== "string" || item[field].length === 0) {
          issues.push(`evidence[${index}].${field} must be a non-empty string`);
        }
      });
      Object.keys(item || {}).forEach((field) => {
        if (!["kind", "pathOrUrl", "note"].includes(field)) {
          issues.push(`evidence[${index}] additional field ${field}`);
        }
      });
    });
  }
  if (!Array.isArray(handoff.validationEvidence) || handoff.validationEvidence.length === 0) {
    issues.push("validationEvidence requires at least one structured item");
  } else {
    handoff.validationEvidence.forEach((item, index) => {
      ["commandOrGate", "status", "note"].forEach((field) => {
        if (typeof item?.[field] !== "string" || item[field].length === 0) {
          issues.push(`validationEvidence[${index}].${field} must be a non-empty string`);
        }
      });
      if (!["pass", "fail", "skipped", "not-run"].includes(item?.status)) {
        issues.push(`validationEvidence[${index}].status invalid`);
      }
      Object.keys(item || {}).forEach((field) => {
        if (!["commandOrGate", "status", "note"].includes(field)) {
          issues.push(`validationEvidence[${index}] additional field ${field}`);
        }
      });
    });
  }
  if (!Array.isArray(handoff.commandsRun) || handoff.commandsRun.length === 0) {
    issues.push("commandsRun requires at least one structured item");
  } else {
    handoff.commandsRun.forEach((item, index) => {
      ["command", "status", "note"].forEach((field) => {
        if (typeof item?.[field] !== "string" || item[field].length === 0) {
          issues.push(`commandsRun[${index}].${field} must be a non-empty string`);
        }
      });
      if (!["pass", "fail", "skipped", "not-run"].includes(item?.status)) {
        issues.push(`commandsRun[${index}].status invalid`);
      }
      Object.keys(item || {}).forEach((field) => {
        if (!["command", "status", "note"].includes(field)) {
          issues.push(`commandsRun[${index}] additional field ${field}`);
        }
      });
    });
  }
  if (![
    "no-routing-needed",
    "route-to-research",
    "route-to-asset-research",
    "route-to-content",
    "route-to-visual-review",
    "route-to-screenshot-review",
    "route-to-validation",
    "route-to-output-regeneration",
    "route-to-workflow-improvement",
    "fallback-to-main-session"
  ].includes(handoff.routingDecision)) {
    issues.push("routingDecision invalid");
  }
  if (handoff.judgement === "pass") {
    const notRun = [
      ...(handoff.validationEvidence || []).filter((item) => item.status === "not-run"),
      ...(handoff.commandsRun || []).filter((item) => item.status === "not-run")
    ];
    if (notRun.length) {
      issues.push("pass handoff cannot include not-run validation or command evidence");
    }
  }
  return issues;
}

function writeHandoffArtifact(args, status) {
  if (status === "started") {
    return { handoffPath: args.handoffPath || "", evidence: args.evidence };
  }
  if (args.handoffPath) {
    const handoff = validateExistingHandoff(args.handoffPath, args);
    return { handoffPath: args.handoffPath, evidence: handoff.evidence };
  }
  const evidence = args.evidence.map(normalizeEvidenceItem);
  if (evidence.length === 0) {
    throw new Error("passing, failing, blocked, and fallback phase records require at least one evidence item");
  }
  const runId = readRunId();
  const dir = path.join(deckRoot, ".deck-quality/agent-handoffs", runId);
  fs.mkdirSync(dir, { recursive: true });
  const relativePath = `.deck-quality/agent-handoffs/${runId}/${slugify(args.phase)}-${slugify(args.agent)}.json`;
  const fullPath = path.join(deckRoot, relativePath);
  const payload = {
    schemaVersion: 1,
    runId,
    phase: args.phase,
    agent: args.agent,
    role: args.role || args.agent,
    delegatedBy: args.delegatedBy || "main-session",
    handoffType: args.handoffType || (status === "fallback" ? "agent-fallback" : "agent-result"),
    task: args.task,
    findings: args.findings ? [args.findings] : [`${args.agent} completed ${args.phase} with ${status} status.`],
    actions: args.actions ? [args.actions] : ["orchestrator should run the next gate"],
    judgement: status === "pass" || status === "fallback" ? "pass" : status === "fail" ? "fail" : "blocked",
    openIssues: args.openIssues,
    evidence,
    validationEvidence: validationEvidenceFor(args, status),
    commandsRun: commandsRunFor(args, status),
    filesTouched: args.filesTouched,
    routingDecision: args.routingDecision || defaultRoutingDecision(status),
    nextGate: args.nextGate || "deck-loop"
  };
  const issues = validateHandoffContract(payload);
  if (issues.length) {
    throw new Error(`generated handoff artifact is invalid: ${issues.join("; ")}`);
  }
  fs.writeFileSync(fullPath, `${JSON.stringify(payload, null, 2)}\n`);
  return { handoffPath: relativePath, evidence };
}

function validateExistingHandoff(relativePath, args) {
  const fullPath = path.join(deckRoot, relativePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`handoff artifact does not exist: ${relativePath}`);
  }
  const handoff = JSON.parse(fs.readFileSync(fullPath, "utf8"));
  const issues = validateHandoffContract(handoff);
  if (issues.length) {
    throw new Error(`handoff artifact violates contract: ${issues.join("; ")}`);
  }
  const runId = readRunId();
  if (handoff.runId !== runId || handoff.phase !== args.phase || handoff.agent !== args.agent) {
    throw new Error("handoff artifact runId/phase/agent does not match trace arguments");
  }
  return handoff;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const status = args.status || "pass";
  const handoff = writeHandoffArtifact(args, status);
  const tracePath = appendAgentPhaseTrace(deckRoot, {
    phase: args.phase,
    agent: args.agent,
    task: args.task,
    status,
    delegatedBy: args.delegatedBy || "main-session",
    handoffType: args.handoffType || (status === "fallback" ? "agent-fallback" : "agent-result"),
    evidence: handoff.evidence,
    handoffPath: handoff.handoffPath,
    nextGate: args.nextGate || "deck-loop",
    note: args.note || ""
  });
  console.log(JSON.stringify({ ok: true, tracePath }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
