#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { appendTrace } = require("./workflow-trace");
const { analyzeDeckState } = require("./deck-loop-state");

const deckRoot = process.env.DECK_ROOT
  ? path.resolve(process.env.DECK_ROOT)
  : path.resolve(__dirname, "..");
const repoRoot = process.env.REPO_ROOT
  ? path.resolve(process.env.REPO_ROOT)
  : path.resolve(deckRoot, "..");
const results = [];

function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
}

function fail(name, detail) {
  results.push({ ok: false, name, detail });
}

function readJson(relativePath) {
  const fullPath = path.join(deckRoot, relativePath);
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function existsDeck(relativePath) {
  return fs.existsSync(path.join(deckRoot, relativePath));
}

function existsRepo(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function readRepo(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function listFiles(dir, ext) {
  const fullDir = path.join(repoRoot, dir);
  if (!fs.existsSync(fullDir)) {
    return [];
  }
  return fs.readdirSync(fullDir)
    .filter((file) => file.endsWith(ext))
    .map((file) => path.join(dir, file));
}

function extractTomlString(text, key) {
  const match = text.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, "m"));
  return match ? match[1] : "";
}

function validateCurrentRun() {
  if (!existsDeck("current-run.json")) {
    fail("current run contract", "lecture-deck/current-run.json is missing");
    return;
  }
  const run = readJson("current-run.json");
  const required = [
    "schemaVersion",
    "runId",
    "topic",
    "audience",
    "outcome",
    "scope",
    "researchNeed",
    "outputReset",
    "visualPriority",
    "motionPriority",
    "validationMode",
    "requiredGates"
  ];
  const missing = required.filter((field) => run[field] === undefined);
  const invalid = [];
  if (run.schemaVersion !== 1) invalid.push("schemaVersion");
  if (typeof run.runId !== "string" || run.runId.length < 3) invalid.push("runId");
  if (!Array.isArray(run.scope?.include) || run.scope.include.length === 0) invalid.push("scope.include");
  if (!Array.isArray(run.scope?.exclude)) invalid.push("scope.exclude");
  if (run.researchNeed?.required && Number(run.researchNeed.minimumTrustedUrls || 0) < 8) invalid.push("researchNeed.minimumTrustedUrls");
  if (!Array.isArray(run.visualPriority) || run.visualPriority.length === 0) invalid.push("visualPriority");
  if (!Array.isArray(run.motionPriority)) invalid.push("motionPriority");
  if (!["deck-loop", "quality-loop"].includes(run.validationMode)) invalid.push("validationMode");
  if (!Array.isArray(run.requiredGates) || !run.requiredGates.includes("agent-contract-check")) invalid.push("requiredGates");
  if (run.orchestration !== undefined) {
    if (run.orchestration.mode !== "codex-native-phase-trace") invalid.push("orchestration.mode");
    if (run.orchestration.mainSessionRole !== "orchestrator") invalid.push("orchestration.mainSessionRole");
    if (run.orchestration.enforceAgentTrace !== true) invalid.push("orchestration.enforceAgentTrace");
  }
  if (run.requiredAgentPhases !== undefined) {
    if (!Array.isArray(run.requiredAgentPhases) || run.requiredAgentPhases.length === 0) {
      invalid.push("requiredAgentPhases");
    } else {
      run.requiredAgentPhases.forEach((phase, index) => {
        ["phase", "agent", "task", "nextGate"].forEach((field) => {
          if (!phase[field]) invalid.push(`requiredAgentPhases[${index}].${field}`);
        });
        if (phase.required !== true) invalid.push(`requiredAgentPhases[${index}].required`);
        if (!Array.isArray(phase.evidenceKinds) || phase.evidenceKinds.length === 0) {
          invalid.push(`requiredAgentPhases[${index}].evidenceKinds`);
        }
      });
    }
  }

  if (missing.length || invalid.length) {
    fail("current run contract", `missing=${missing.join(",") || "none"} invalid=${invalid.join(",") || "none"}`);
  } else {
    pass("current run contract", `${run.topic} / ${run.validationMode}`);
  }
}

function validateToolPolicy() {
  if (!existsDeck("tool-policy.json")) {
    fail("tool policy contract", "lecture-deck/tool-policy.json is missing");
    return;
  }
  const policy = readJson("tool-policy.json");
  const agents = policy.agents || {};
  const policyNames = Object.keys(agents);
  const missingFields = [];
  policyNames.forEach((name) => {
    const entry = agents[name];
    ["sandboxMode", "allowedActions", "allowedPaths", "requiredSkills", "requiredEvidence", "prohibitedActions"].forEach((field) => {
      if (entry[field] === undefined || (Array.isArray(entry[field]) && entry[field].length === 0)) {
        missingFields.push(`${name}.${field}`);
      }
    });
    (entry.requiredSkills || []).forEach((skillPath) => {
      if (!existsRepo(skillPath)) {
        missingFields.push(`${name}.missingSkill:${skillPath}`);
      }
    });
    if (!(entry.prohibitedActions || []).includes("weaken-gates")) {
      missingFields.push(`${name}.prohibitedActions.weaken-gates`);
    }
  });

  const tomlFiles = listFiles(".codex/agents", ".toml");
  const tomlIssues = [];
  tomlFiles.forEach((file) => {
    const text = readRepo(file);
    const name = extractTomlString(text, "name");
    const sandboxMode = extractTomlString(text, "sandbox_mode");
    if (!agents[name]) {
      tomlIssues.push(`${file}:missing-policy`);
      return;
    }
    if (agents[name].sandboxMode !== sandboxMode) {
      tomlIssues.push(`${file}:sandbox ${sandboxMode} != ${agents[name].sandboxMode}`);
    }
  });

  if (missingFields.length || tomlIssues.length) {
    fail("tool policy contract", [...missingFields, ...tomlIssues].join("; "));
  } else {
    pass("tool policy contract", `${policyNames.length} agent policy entries`);
  }
}

function validateRequiredAgentPhasePolicy() {
  if (!existsDeck("current-run.json") || !existsDeck("tool-policy.json")) {
    fail("required agent phase policy", "current-run.json or tool-policy.json is missing");
    return;
  }
  const run = readJson("current-run.json");
  const policy = readJson("tool-policy.json");
  const phases = run.requiredAgentPhases || [];
  if (!run.orchestration?.enforceAgentTrace || phases.length === 0) {
    pass("required agent phase policy", "not enforced for this run");
    return;
  }

  const canonicalFlow = policy.canonicalFlow || "";
  const issues = [];
  let lastIndex = -1;
  phases.forEach((phase) => {
    if (!policy.agents?.[phase.agent]) {
      issues.push(`${phase.phase}:unknown-agent:${phase.agent}`);
    }
    const phaseIndex = canonicalFlow.indexOf(phase.phase);
    if (phaseIndex === -1 && phase.phase !== "asset research") {
      issues.push(`${phase.phase}:not-in-canonical-flow`);
    }
    if (phaseIndex !== -1) {
      if (phaseIndex < lastIndex) {
        issues.push(`${phase.phase}:out-of-order`);
      }
      lastIndex = phaseIndex;
    }
  });

  if (issues.length) {
    fail("required agent phase policy", issues.join("; "));
  } else {
    pass("required agent phase policy", `${phases.length} phase(s) mapped to tool policy`);
  }
}

function validateHandoffSchema() {
  if (!existsDeck("agent-handoff.schema.json")) {
    fail("agent handoff schema", "lecture-deck/agent-handoff.schema.json is missing");
    return;
  }
  const schema = readJson("agent-handoff.schema.json");
  const required = schema.required || [];
  const expected = [
    "phase",
    "runId",
    "agent",
    "role",
    "delegatedBy",
    "handoffType",
    "task",
    "findings",
    "actions",
    "judgement",
    "openIssues",
    "evidence",
    "validationEvidence",
    "commandsRun",
    "filesTouched",
    "routingDecision",
    "nextGate"
  ];
  const missing = expected.filter((field) => !required.includes(field));
  const evidence = schema.properties?.evidence;
  const validationEvidence = schema.properties?.validationEvidence;
  const commandsRun = schema.properties?.commandsRun;
  const findings = schema.properties?.findings;
  const actions = schema.properties?.actions;
  const structureIssues = [];
  if (evidence?.minItems !== 1) structureIssues.push("evidence.minItems");
  if (validationEvidence?.minItems !== 1) structureIssues.push("validationEvidence.minItems");
  if (commandsRun?.minItems !== 1) structureIssues.push("commandsRun.minItems");
  if (findings?.minItems !== 1) structureIssues.push("findings.minItems");
  if (actions?.minItems !== 1) structureIssues.push("actions.minItems");
  ["kind", "pathOrUrl", "note"].forEach((field) => {
    if (!evidence?.items?.required?.includes(field)) structureIssues.push(`evidence.${field}`);
  });
  ["commandOrGate", "status", "note"].forEach((field) => {
    if (!validationEvidence?.items?.required?.includes(field)) structureIssues.push(`validationEvidence.${field}`);
  });
  ["command", "status", "note"].forEach((field) => {
    if (!commandsRun?.items?.required?.includes(field)) structureIssues.push(`commandsRun.${field}`);
  });
  if (!Array.isArray(schema.properties?.routingDecision?.enum)) {
    structureIssues.push("routingDecision.enum");
  }
  if (schema.type !== "object" || missing.length || structureIssues.length) {
    fail("agent handoff schema", [
      missing.length ? `missing required fields: ${missing.join(", ")}` : "",
      structureIssues.length ? `weak structure: ${structureIssues.join(", ")}` : ""
    ].filter(Boolean).join("; "));
  } else {
    pass("agent handoff schema", `${required.length} required field(s)`);
  }
}

function validateHandoffArtifact(handoff, expected) {
  const schema = readJson("agent-handoff.schema.json");
  const issues = [];
  const allowedRootFields = new Set(Object.keys(schema.properties || {}));
  Object.keys(handoff || {}).forEach((field) => {
    if (!allowedRootFields.has(field)) issues.push(`additional-${field}`);
  });
  (schema.required || []).forEach((field) => {
    if (handoff[field] === undefined) issues.push(`missing-${field}`);
  });
  if (handoff.schemaVersion !== 1) issues.push("schemaVersion");
  if (handoff.runId !== expected.runId) issues.push("runId");
  if (handoff.phase !== expected.phase) issues.push("phase");
  if (handoff.agent !== expected.agent) issues.push("agent");
  if (handoff.task !== expected.task) issues.push("task");
  if (handoff.nextGate !== expected.nextGate) issues.push("nextGate");
  ["role", "delegatedBy", "task", "nextGate"].forEach((field) => {
    if (typeof handoff[field] !== "string" || handoff[field].length === 0) issues.push(field);
  });
  if (!["agent-result", "agent-review", "agent-validation", "agent-fallback"].includes(handoff.handoffType)) {
    issues.push("handoffType");
  }
  if (!["pass", "fail", "blocked", "needs-orchestrator-decision"].includes(handoff.judgement)) {
    issues.push("judgement");
  }
  ["findings", "actions", "openIssues", "filesTouched", "commandsRun"].forEach((field) => {
    if (!Array.isArray(handoff[field])) issues.push(field);
  });
  if (!Array.isArray(handoff.findings) || handoff.findings.length === 0) {
    issues.push("findings-empty");
  }
  if (!Array.isArray(handoff.actions) || handoff.actions.length === 0) {
    issues.push("actions-empty");
  }
  if (!Array.isArray(handoff.evidence) || handoff.evidence.length === 0) {
    issues.push("evidence-empty");
  } else {
    handoff.evidence.forEach((item, index) => {
      ["kind", "pathOrUrl", "note"].forEach((field) => {
        if (typeof item?.[field] !== "string" || item[field].length === 0) {
          issues.push(`evidence[${index}].${field}`);
        }
      });
      Object.keys(item || {}).forEach((field) => {
        if (!["kind", "pathOrUrl", "note"].includes(field)) {
          issues.push(`evidence[${index}].additional-${field}`);
        }
      });
    });
  }
  const evidenceKinds = new Set((handoff.evidence || []).map((item) => item.kind));
  (expected.evidenceKinds || []).forEach((kind) => {
    if (!evidenceKinds.has(kind)) issues.push(`missing-evidence-kind-${kind}`);
  });
  if (!Array.isArray(handoff.validationEvidence) || handoff.validationEvidence.length === 0) {
    issues.push("validationEvidence-empty");
  } else {
    handoff.validationEvidence.forEach((item, index) => {
      ["commandOrGate", "status", "note"].forEach((field) => {
        if (typeof item?.[field] !== "string" || item[field].length === 0) {
          issues.push(`validationEvidence[${index}].${field}`);
        }
      });
      if (!["pass", "fail", "skipped", "not-run"].includes(item?.status)) {
        issues.push(`validationEvidence[${index}].status`);
      }
      Object.keys(item || {}).forEach((field) => {
        if (!["commandOrGate", "status", "note"].includes(field)) {
          issues.push(`validationEvidence[${index}].additional-${field}`);
        }
      });
    });
  }
  if (!Array.isArray(handoff.commandsRun) || handoff.commandsRun.length === 0) {
    issues.push("commandsRun-empty");
  } else {
    handoff.commandsRun.forEach((item, index) => {
      ["command", "status", "note"].forEach((field) => {
        if (typeof item?.[field] !== "string" || item[field].length === 0) {
          issues.push(`commandsRun[${index}].${field}`);
        }
      });
      if (!["pass", "fail", "skipped", "not-run"].includes(item?.status)) {
        issues.push(`commandsRun[${index}].status`);
      }
      Object.keys(item || {}).forEach((field) => {
        if (!["command", "status", "note"].includes(field)) {
          issues.push(`commandsRun[${index}].additional-${field}`);
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
    issues.push("routingDecision");
  }
  if (handoff.judgement === "pass") {
    const hasNotRun = [
      ...(handoff.validationEvidence || []),
      ...(handoff.commandsRun || [])
    ].some((item) => item.status === "not-run");
    if (hasNotRun) issues.push("pass-handoff-has-not-run-evidence");
  }
  if (handoff.handoffType === "agent-fallback" && handoff.routingDecision !== "fallback-to-main-session") {
    issues.push("fallback-routingDecision");
  }
  return issues;
}

function validateAgentFlowText() {
  const oldFlow = "source brief -> slide spec -> HTML/CSS deck -> presenter review -> verification -> handoff";
  const newFlow = "prompt contract -> optional output reset -> research/tool selection -> source brief -> spec -> slide output -> visual/motion polish -> screenshot review -> validation -> handoff";
  const files = [
    ...listFiles(".codex/agents", ".toml"),
    ...listFiles("lecture-deck/agents", ".md")
  ];
  const stale = [];
  const missing = [];
  files.forEach((file) => {
    const text = readRepo(file);
    if (text.includes(oldFlow)) {
      stale.push(file);
    }
    if (!text.includes(newFlow)) {
      missing.push(file);
    }
  });
  if (stale.length || missing.length) {
    fail("agent canonical flow", [
      stale.length ? `stale: ${stale.join(", ")}` : "",
      missing.length ? `missing new flow: ${missing.join(", ")}` : ""
    ].filter(Boolean).join("; "));
  } else {
    pass("agent canonical flow", `${files.length} agent file(s) aligned`);
  }
}

function validateHooks() {
  const codexHooksPath = path.join(repoRoot, ".codex/hooks.json");
  const hookPath = path.join(deckRoot, "hooks/agent-contract-check.json");
  const issues = [];
  if (!fs.existsSync(codexHooksPath)) {
    issues.push(".codex/hooks.json missing");
  } else {
    const hooks = JSON.parse(fs.readFileSync(codexHooksPath, "utf8"));
    const stopHooks = hooks.hooks && hooks.hooks.Stop;
    if (stopHooks !== undefined && !Array.isArray(stopHooks)) {
      issues.push("Configured Stop hook must be an array");
    } else if (Array.isArray(stopHooks)) {
      const stopText = JSON.stringify(stopHooks);
      const hasDeckLoopHook = stopText.includes("deck-loop");
      const hasContinuationHook = stopText.includes(".codex/scripts/stop-continuation.js")
        && fs.existsSync(path.join(repoRoot, ".codex/scripts/stop-continuation.js"));
      if (!hasDeckLoopHook && !hasContinuationHook) {
        issues.push("Configured Stop hook must run deck-loop or project stop-continuation.js");
      }
    }
  }
  if (!fs.existsSync(hookPath)) {
    issues.push("lecture-deck/hooks/agent-contract-check.json missing");
  } else {
    const hook = JSON.parse(fs.readFileSync(hookPath, "utf8"));
    if (!Array.isArray(hook.events) || !hook.events.includes("harness-check") || !hook.events.includes("pre-handoff")) {
      issues.push("agent-contract-check must run on harness-check and pre-handoff");
    }
  }
  if (issues.length) {
    fail("hook contract coverage", issues.join("; "));
  } else {
    pass("hook contract coverage", "project Stop hook optional; harness-check and pre-handoff contract gates configured");
  }
}

function validateScreenshotReviewArtifact() {
  const reportPath = path.join(deckRoot, ".deck-quality/visual-quality-report.md");
  const reviewPath = path.join(deckRoot, ".deck-quality/screenshot-review.json");
  if (!fs.existsSync(reportPath)) {
    pass("screenshot review artifact", "visual-quality-report.md not present yet");
    return;
  }
  if (!fs.existsSync(reviewPath)) {
    fail("screenshot review artifact", ".deck-quality/screenshot-review.json missing while visual-quality-report.md exists");
    return;
  }
  const review = JSON.parse(fs.readFileSync(reviewPath, "utf8"));
  const invalid = [];
  if (review.schemaVersion !== 1) invalid.push("schemaVersion");
  if (!["pass", "fail"].includes(review.status)) invalid.push("status");
  if (!Array.isArray(review.reviewedSlides) || review.reviewedSlides.length === 0) invalid.push("reviewedSlides");
  if (!Array.isArray(review.visibleFailures)) invalid.push("visibleFailures");
  if (typeof review.falsePass !== "boolean") invalid.push("falsePass");
  if (!review.routingDecision) invalid.push("routingDecision");
  if (invalid.length) {
    fail("screenshot review artifact", invalid.join(", "));
  } else {
    pass("screenshot review artifact", `${review.reviewedSlides.length} reviewed slide(s), status=${review.status}`);
  }
}

function validateTrace() {
  const tracePath = appendTrace(deckRoot, {
    event: "agent_contract_check",
    status: "started",
    source: "verify-agent-contracts.js"
  });
  const lines = fs.readFileSync(tracePath, "utf8").trim().split(/\n+/).filter(Boolean);
  const valid = lines.every((line) => {
    try {
      const item = JSON.parse(line);
      const isAgentPhase = String(item.event || "").startsWith("agent_phase_");
      return item.schemaVersion === 1 && item.timestamp && item.event && (!isAgentPhase || item.runId);
    } catch {
      return false;
    }
  });
  if (valid) {
    pass("workflow trace", `${lines.length} event(s) in ${path.relative(deckRoot, tracePath)}`);
  } else {
    fail("workflow trace", "workflow-trace.jsonl contains invalid event JSON");
  }
}

function readTraceEvents() {
  const tracePath = path.join(deckRoot, ".deck-quality/workflow-trace.jsonl");
  if (!fs.existsSync(tracePath)) {
    return [];
  }
  return fs.readFileSync(tracePath, "utf8")
    .trim()
    .split(/\n+/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function validateAgentPhaseTrace() {
  if (!existsDeck("current-run.json")) {
    fail("agent phase trace", "current-run.json is missing");
    return;
  }
  const run = readJson("current-run.json");
  const runId = run.runId;
  const requiredPhases = (run.requiredAgentPhases || []).filter((phase) => phase.required);
  if (!run.orchestration?.enforceAgentTrace || requiredPhases.length === 0) {
    pass("agent phase trace", "not enforced for this run");
    return;
  }

  const state = analyzeDeckState(deckRoot);
  if (state.status !== "handoff-ready") {
    pass("agent phase trace", `deferred until handoff-ready; current state=${state.status}`);
    return;
  }

  let events;
  try {
    events = readTraceEvents();
  } catch (error) {
    fail("agent phase trace", `workflow-trace parse failed: ${error.message}`);
    return;
  }

  const runEvents = events.filter((event) => event.runId === runId);
  const phaseEvents = runEvents.filter((event) => {
    return ["agent_phase_started", "agent_phase_finished", "agent_phase_fallback"].includes(event.event);
  });
  const completions = phaseEvents.filter((event) => {
    return ["agent_phase_finished", "agent_phase_fallback"].includes(event.event)
      && ["pass", "fallback"].includes(event.status);
  });
  const missing = [];
  const malformed = [];
  const incomplete = [];
  const outOfOrder = [];
  const handoffIssues = [];
  let lastCompletionIndex = -1;

  requiredPhases.forEach((requiredPhase) => {
    const reversedMatchIndex = [...phaseEvents].reverse().findIndex((event) => {
      return ["agent_phase_finished", "agent_phase_fallback"].includes(event.event)
        && ["pass", "fallback"].includes(event.status)
        && event.phase === requiredPhase.phase
        && event.agent === requiredPhase.agent;
    });
    const matchIndex = reversedMatchIndex === -1 ? -1 : phaseEvents.length - 1 - reversedMatchIndex;
    const match = matchIndex === -1 ? null : phaseEvents[matchIndex];
    const startedIndex = phaseEvents.findIndex((event) => {
      return event.event === "agent_phase_started"
        && event.phase === requiredPhase.phase
        && event.agent === requiredPhase.agent;
    });
    if (!match) {
      missing.push(`${requiredPhase.phase}:${requiredPhase.agent}`);
      return;
    }
    if (!match.task || !Array.isArray(match.evidence) || match.evidence.length === 0) {
      malformed.push(`${requiredPhase.phase}:${requiredPhase.agent}`);
    }
    if (match.event === "agent_phase_fallback") {
      if (match.handoffType !== "agent-fallback" || !match.note) {
        malformed.push(`${requiredPhase.phase}:${requiredPhase.agent}:fallback-reason`);
      }
    } else {
      if (startedIndex === -1 || startedIndex > matchIndex) {
        incomplete.push(`${requiredPhase.phase}:${requiredPhase.agent}`);
      }
    }
    if (matchIndex < lastCompletionIndex) {
      outOfOrder.push(`${requiredPhase.phase}:${requiredPhase.agent}`);
    }
    lastCompletionIndex = matchIndex;
    if (!match.handoffPath) {
      handoffIssues.push(`${requiredPhase.phase}:${requiredPhase.agent}:missing-handoffPath`);
    } else {
      const handoffPath = path.join(deckRoot, match.handoffPath);
      if (!fs.existsSync(handoffPath)) {
        handoffIssues.push(`${requiredPhase.phase}:${requiredPhase.agent}:missing-handoff-file`);
      } else {
        try {
          const handoff = JSON.parse(fs.readFileSync(handoffPath, "utf8"));
          const issues = validateHandoffArtifact(handoff, {
            runId,
            phase: requiredPhase.phase,
            agent: requiredPhase.agent,
            task: requiredPhase.task,
            nextGate: requiredPhase.nextGate,
            evidenceKinds: requiredPhase.evidenceKinds
          });
          if (issues.length) {
            handoffIssues.push(`${requiredPhase.phase}:${requiredPhase.agent}:handoff-invalid-${issues.join("+")}`);
          }
        } catch {
          handoffIssues.push(`${requiredPhase.phase}:${requiredPhase.agent}:invalid-handoff-json`);
        }
      }
    }
  });

  if (missing.length || malformed.length || incomplete.length || outOfOrder.length || handoffIssues.length) {
    fail("agent phase trace", [
      missing.length ? `missing=${missing.join(",")}` : "",
      malformed.length ? `malformed=${malformed.join(",")}` : "",
      incomplete.length ? `incomplete=${incomplete.join(",")}` : "",
      outOfOrder.length ? `out-of-order=${outOfOrder.join(",")}` : "",
      handoffIssues.length ? `handoff=${handoffIssues.join(",")}` : ""
    ].filter(Boolean).join("; "));
  } else {
    pass("agent phase trace", `${requiredPhases.length} required phase(s) recorded for ${runId}`);
  }
}

function validateResetBoundary() {
  const resetScript = path.join(repoRoot, ".codex/skills/deck-output-reset/scripts/reset-deck-output.js");
  if (!fs.existsSync(resetScript)) {
    fail("reset boundary", "deck-output-reset script is missing");
    return;
  }

  const result = spawnSync(process.execPath, [resetScript, "--dry-run", `--root=${repoRoot}`], {
    encoding: "utf8"
  });
  if (result.status !== 0) {
    fail("reset boundary", result.stderr || result.stdout || `dry-run exited ${result.status}`);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(result.stdout);
  } catch (error) {
    fail("reset boundary", `dry-run did not return JSON: ${error.message}`);
    return;
  }

  const deleted = new Set([...(payload.files || []), ...(payload.directories || [])]);
  const forbiddenPrefixes = [
    ".codex/agents/",
    ".codex/skills/",
    "lecture-deck/agents/",
    "lecture-deck/skills/",
    "lecture-deck/hooks/",
    "lecture-deck/scripts/"
  ];
  const forbiddenExact = [
    ".codex/hooks.json",
    "lecture-deck/AGENTS.md",
    "lecture-deck/CLAUDE.md",
    "lecture-deck/tool-layer.md",
    "lecture-deck/tool-policy.json",
    "lecture-deck/agent-handoff.schema.json",
    "lecture-deck/prompt-layer.md",
    "lecture-deck/screenshot-review.md",
    "lecture-deck/design.md",
    "lecture-deck/design-quality.md",
    "lecture-deck/motion.md",
    "lecture-deck/few-shots.md",
    "lecture-deck/evaluation-template.md",
    "lecture-deck/assets/style.css",
    "lecture-deck/assets/deck.js",
    "lecture-deck/assets/presenter-review.js",
    "lecture-deck/assets/illustrations/README.md",
    "lecture-deck/assets/illustrations/manifest.schema.json"
  ];
  const violations = [...deleted].filter((item) => {
    return forbiddenExact.includes(item) || forbiddenPrefixes.some((prefix) => item.startsWith(prefix));
  });

  const resetManifests = payload.resetManifests || [];
  if (!resetManifests.includes("lecture-deck/assets/illustrations/manifest.json")) {
    violations.push("manifest.json:not-reset-to-empty");
  }

  if (violations.length) {
    fail("reset boundary", violations.join(", "));
  } else {
    pass("reset boundary", `${deleted.size} generated output path(s); workflow files preserved`);
  }
}

function validateHarnessBacklog() {
  const result = spawnSync(process.execPath, ["scripts/verify-harness-backlog.js"], {
    cwd: deckRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: deckRoot,
      REPO_ROOT: repoRoot
    }
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.status === 0) {
    pass("harness improvement backlog", output.replace(/^PASS harness backlog -\s*/, ""));
  } else {
    fail("harness improvement backlog", output.replace(/^FAIL harness backlog -\s*/, "") || `exit ${result.status}`);
  }
}

function printResults() {
  results.forEach((result) => {
    const label = result.ok ? "PASS" : "FAIL";
    console.log(`${label} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
  });
}

function main() {
  validateCurrentRun();
  validateToolPolicy();
  validateRequiredAgentPhasePolicy();
  validateHandoffSchema();
  validateAgentFlowText();
  validateHooks();
  validateScreenshotReviewArtifact();
  validateTrace();
  validateAgentPhaseTrace();
  validateResetBoundary();
  validateHarnessBacklog();

  const failures = results.filter((result) => !result.ok);
  appendTrace(deckRoot, {
    event: "agent_contract_check",
    status: failures.length ? "fail" : "pass",
    source: "verify-agent-contracts.js",
    failures: failures.map((failure) => failure.name)
  });
  printResults();
  if (failures.length) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  fail("agent contract verifier", error.message);
  printResults();
  process.exitCode = 1;
}
