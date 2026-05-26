#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = process.env.HTML_CSS_STOP_HOOK_ROOT
  ? path.resolve(process.env.HTML_CSS_STOP_HOOK_ROOT)
  : path.resolve(__dirname, "..", "..");

const statePath = path.join(repoRoot, ".codex", "stop-continuation-state.json");
const maxNoWorkCount = Number(process.env.HTML_CSS_STOP_HOOK_MAX_NO_WORK || 3);

const planPaths = [
  path.join(repoRoot, ".codex", "stop-continuation-plan.json"),
  path.join(repoRoot, "lecture-deck", ".deck-quality", "stop-continuation-plan.json")
];

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return {
      __invalidJson: true,
      filePath,
      error: error.message
    };
  }
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function nowIso() {
  return new Date().toISOString();
}

function readState() {
  const state = readJson(statePath);
  if (!state || state.__invalidJson) {
    return {
      schemaVersion: 1,
      noWorkCount: 0,
      updatedAt: null,
      lastDecision: null,
      history: []
    };
  }
  return {
    schemaVersion: 1,
    noWorkCount: Number.isInteger(state.noWorkCount) ? state.noWorkCount : 0,
    updatedAt: state.updatedAt || null,
    lastDecision: state.lastDecision || null,
    history: Array.isArray(state.history) ? state.history.slice(-20) : []
  };
}

function appendHistory(state, entry) {
  const history = Array.isArray(state.history) ? state.history : [];
  return [...history, entry].slice(-20);
}

function findPendingPlanItem() {
  for (const filePath of planPaths) {
    const plan = readJson(filePath);
    if (!plan) continue;
    if (plan.__invalidJson) {
      return {
        kind: "invalid-plan",
        source: path.relative(repoRoot, filePath),
        prompt: `Stop continuation plan JSON is invalid: ${plan.error}`,
        nextCommand: "node .codex/scripts/stop-continuation.js --status"
      };
    }
    const items = Array.isArray(plan.items) ? plan.items : [];
    const item = items.find((candidate) => {
      const status = String(candidate.status || "pending").toLowerCase();
      return !["done", "complete", "completed", "cancelled", "skipped"].includes(status);
    });
    if (item) {
      return {
        kind: "plan",
        source: path.relative(repoRoot, filePath),
        id: item.id || null,
        prompt: item.prompt || item.title || item.task || "다음 계획이 남아 있습니다.",
        nextCommand: item.nextCommand || null
      };
    }
  }
  return null;
}

function routeFailure() {
  const scriptPath = path.join(repoRoot, "lecture-deck", "scripts", "route-failure.js");
  if (!fs.existsSync(scriptPath)) return null;
  const result = spawnSync(process.execPath, [scriptPath, "--json"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
    timeout: 15000
  });
  if (result.error) {
    return {
      kind: "route-error",
      prompt: `route-failure.js could not run: ${result.error.message}`,
      nextCommand: "node lecture-deck/scripts/route-failure.js --json"
    };
  }
  try {
    const route = JSON.parse(result.stdout || "{}");
    if (route.status === "route-required") {
      return {
        kind: "route-required",
        source: "lecture-deck/scripts/route-failure.js",
        id: route.routingDecision || null,
        prompt: route.prompt || route.reason || "검증 실패 라우팅이 필요합니다.",
        nextCommand: route.nextCommand || null,
        recommendedAgent: route.recommendedAgent || null
      };
    }
  } catch (error) {
    return {
      kind: "route-error",
      prompt: `route-failure.js returned invalid JSON: ${error.message}`,
      nextCommand: "node lecture-deck/scripts/route-failure.js --json"
    };
  }
  return null;
}

function detectWork() {
  return routeFailure() || findPendingPlanItem();
}

function buildBlockOutput(work) {
  const lines = [
    "다음 계획 또는 라우팅 가능한 작업이 남아 있습니다.",
    "사용자가 '다음 계획 있으면 진행해'라고 요청한 것으로 간주하고, 중단하지 말고 다음 작업을 진행하세요.",
    `작업 출처: ${work.source || work.kind}`,
    work.recommendedAgent ? `권장 에이전트: ${work.recommendedAgent}` : null,
    work.nextCommand ? `다음 검증/명령: ${work.nextCommand}` : null,
    `지시: ${work.prompt}`
  ].filter(Boolean);

  const systemMessage = lines.join("\n");
  return {
    decision: "block",
    reason: systemMessage,
    systemMessage
  };
}

function updateForWork(state, work) {
  const nextState = {
    ...state,
    noWorkCount: 0,
    updatedAt: nowIso(),
    lastDecision: {
      status: "work-found",
      work
    }
  };
  nextState.history = appendHistory(nextState, {
    at: nextState.updatedAt,
    status: "work-found",
    work
  });
  writeJson(statePath, nextState);
}

function updateForNoWork(state) {
  const current = Number.isInteger(state.noWorkCount) ? state.noWorkCount : 0;
  const noWorkCount = Math.min(current + 1, maxNoWorkCount);
  const nextState = {
    ...state,
    noWorkCount,
    updatedAt: nowIso(),
    lastDecision: {
      status: noWorkCount >= maxNoWorkCount ? "suppressed" : "no-work",
      maxNoWorkCount
    }
  };
  nextState.history = appendHistory(nextState, {
    at: nextState.updatedAt,
    status: nextState.lastDecision.status,
    noWorkCount,
    maxNoWorkCount
  });
  writeJson(statePath, nextState);
  return nextState;
}

function run({ statusOnly = false } = {}) {
  const state = readState();
  const work = detectWork();
  if (work) {
    updateForWork(state, work);
    const output = buildBlockOutput(work);
    if (!statusOnly) process.stdout.write(`${JSON.stringify(output)}\n`);
    return { status: "work-found", output, state: readState() };
  }

  const nextState = updateForNoWork(state);
  return {
    status: nextState.noWorkCount >= maxNoWorkCount ? "suppressed" : "no-work",
    output: null,
    state: nextState
  };
}

if (require.main === module) {
  const statusOnly = process.argv.includes("--status");
  const result = run({ statusOnly });
  if (statusOnly) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }
}

module.exports = {
  buildBlockOutput,
  detectWork,
  run
};
