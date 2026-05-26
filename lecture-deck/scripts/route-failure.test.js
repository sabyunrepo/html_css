const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "../..");

function makeDeckRoot() {
  const deckRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-failure-"));
  fs.mkdirSync(path.join(deckRoot, ".deck-quality"), { recursive: true });
  return deckRoot;
}

function writeJson(deckRoot, relativePath, payload) {
  const fullPath = path.join(deckRoot, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function runRoute(deckRoot, args = []) {
  return spawnSync(process.execPath, ["lecture-deck/scripts/route-failure.js", "--json", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: deckRoot
    }
  });
}

function parseOutput(result) {
  return JSON.parse(result.stdout);
}

test("route-failure routes research validation failures to deck-researcher", () => {
  const deckRoot = makeDeckRoot();
  writeJson(deckRoot, ".deck-quality/validation-result.json", {
    schemaVersion: 1,
    status: "fail",
    results: [
      { ok: false, name: "research source depth", detail: "2 URL(s), expected at least 8" }
    ]
  });

  const result = runRoute(deckRoot);

  assert.equal(result.status, 2);
  const route = parseOutput(result);
  assert.equal(route.recommendedAgent, "deck-researcher");
  assert.equal(route.phase, "research/tool selection");
  assert.equal(route.routingDecision, "route-to-research");
});

test("route-failure routes asset validation failures to deck-asset-researcher", () => {
  const deckRoot = makeDeckRoot();
  writeJson(deckRoot, ".deck-quality/validation-result.json", {
    schemaVersion: 1,
    status: "fail",
    results: [
      { ok: false, name: "image source documentation", detail: "missing README source" }
    ]
  });

  const result = runRoute(deckRoot);

  assert.equal(result.status, 2);
  assert.equal(parseOutput(result).recommendedAgent, "deck-asset-researcher");
});

test("route-failure routes visual remediation output issues to output regenerator", () => {
  const deckRoot = makeDeckRoot();
  writeJson(deckRoot, ".deck-quality/quality-remediation-plan.json", {
    status: "fail",
    outputIssues: [
      { slide: "slide-01", problem: "text contrast is below readable threshold", failureCategory: "quality" }
    ],
    workflowIssues: []
  });

  const result = runRoute(deckRoot);

  assert.equal(result.status, 2);
  const route = parseOutput(result);
  assert.equal(route.recommendedAgent, "deck-output-regenerator");
  assert.equal(route.routingDecision, "route-to-output-regeneration");
});

test("route-failure routes mixed workflow and output remediation to workflow improver first", () => {
  const deckRoot = makeDeckRoot();
  writeJson(deckRoot, ".deck-quality/quality-remediation-plan.json", {
    status: "fail",
    workflowIssues: [
      { slide: "slide-01", problem: "gate allowed weak hierarchy", failureCategory: "harness" }
    ],
    outputIssues: [
      { slide: "slide-01", problem: "current slide hierarchy is weak", failureCategory: "quality" }
    ]
  });

  const result = runRoute(deckRoot);

  assert.equal(result.status, 2);
  const route = parseOutput(result);
  assert.equal(route.recommendedAgent, "deck-workflow-improver");
  assert.equal(route.routingDecision, "route-to-workflow-improvement");
  assert.equal(route.reason, "workflow issue must be resolved before output regeneration");
  assert.equal(route.issues.some((issue) => issue.blockedByWorkflowIssue), true);
});

test("route-failure routes screenshot false-pass to workflow improver", () => {
  const deckRoot = makeDeckRoot();
  writeJson(deckRoot, ".deck-quality/screenshot-review.json", {
    schemaVersion: 1,
    status: "pass",
    falsePass: true,
    visibleFailures: [
      { slide: "slide-02", problem: "visible failure passed the gate" }
    ]
  });

  const result = runRoute(deckRoot);

  assert.equal(result.status, 2);
  assert.equal(parseOutput(result).recommendedAgent, "deck-workflow-improver");
});

test("route-failure routes contract hook output to contract validator", () => {
  const deckRoot = makeDeckRoot();
  const result = runRoute(deckRoot, ["--hook-output=FAIL agent phase trace - missing=validation"]);

  assert.equal(result.status, 2);
  assert.equal(parseOutput(result).recommendedAgent, "deck-contract-validator");
});

test("route-failure routes motion mutation hook output to workflow improver", () => {
  const deckRoot = makeDeckRoot();
  const result = runRoute(deckRoot, ["--hook-output=FAIL motion mutation score - 6/7 killed"]);

  assert.equal(result.status, 2);
  assert.equal(parseOutput(result).recommendedAgent, "deck-workflow-improver");
});

test("route-failure routes regression gate hook output to workflow improver", () => {
  const deckRoot = makeDeckRoot();
  const result = runRoute(deckRoot, ["--hook-output=FAIL regression gate - route-policy-mixed-remediation"]);

  assert.equal(result.status, 2);
  assert.equal(parseOutput(result).recommendedAgent, "deck-workflow-improver");
});

test("route-failure routes failed improvement-loop gate health to workflow improver", () => {
  const deckRoot = makeDeckRoot();
  writeJson(deckRoot, ".deck-quality/improvement-loop-report.json", {
    schemaVersion: 1,
    gateHealth: {
      status: "failed",
      failures: [{ code: "controlled-failure-not-detected" }]
    }
  });
  writeJson(deckRoot, ".deck-quality/validation-result.json", {
    schemaVersion: 1,
    status: "pass",
    results: []
  });

  const result = runRoute(deckRoot);

  assert.equal(result.status, 2);
  const route = parseOutput(result);
  assert.equal(route.recommendedAgent, "deck-workflow-improver");
  assert.equal(route.reason, "improvement-loop gateHealth failed");
});

test("route-failure routes survived motion mutants to workflow improver", () => {
  const deckRoot = makeDeckRoot();
  writeJson(deckRoot, ".deck-quality/motion-mutation-report.json", {
    mutationScore: 50,
    total: 2,
    finalSmoke: { status: "passed" },
    cases: [
      { id: "no-animation", status: "killed" },
      { id: "no-stagger", status: "survived", expectedGate: "stop-quality" }
    ]
  });

  const result = runRoute(deckRoot);

  assert.equal(result.status, 2);
  const route = parseOutput(result);
  assert.equal(route.recommendedAgent, "deck-workflow-improver");
  assert.equal(route.reason, "motion-mutation-loop has survived mutants");
});

test("route-failure routes failed motion mutation final smoke to validation runner", () => {
  const deckRoot = makeDeckRoot();
  writeJson(deckRoot, ".deck-quality/motion-mutation-report.json", {
    mutationScore: 100,
    total: 1,
    finalSmoke: { status: "failed", evidence: "deck-loop failed" },
    cases: [
      { id: "no-animation", status: "killed" }
    ]
  });

  const result = runRoute(deckRoot);

  assert.equal(result.status, 2);
  assert.equal(parseOutput(result).recommendedAgent, "deck-validation-runner");
});

test("route-failure routes failed regression route-policy step to workflow improver", () => {
  const deckRoot = makeDeckRoot();
  writeJson(deckRoot, ".deck-quality/regression-gate-report.json", {
    schemaVersion: 1,
    status: "fail",
    steps: [
      {
        id: "route-policy-mixed-remediation",
        status: "fail",
        expectedReport: null
      }
    ]
  });

  const result = runRoute(deckRoot);

  assert.equal(result.status, 2);
  const route = parseOutput(result);
  assert.equal(route.recommendedAgent, "deck-workflow-improver");
  assert.equal(route.reason, "regression gate failed: route-policy-mixed-remediation");
});

test("route-failure routes failed regression orchestration step to contract validator", () => {
  const deckRoot = makeDeckRoot();
  writeJson(deckRoot, ".deck-quality/regression-gate-report.json", {
    schemaVersion: 1,
    status: "fail",
    steps: [
      {
        id: "orchestrated-runner-validate",
        status: "fail",
        expectedReport: ".deck-quality/orchestrated-runner-report.json"
      }
    ]
  });

  const result = runRoute(deckRoot);

  assert.equal(result.status, 2);
  assert.equal(parseOutput(result).recommendedAgent, "deck-contract-validator");
});

test("route-failure reports no route for passing artifacts", () => {
  const deckRoot = makeDeckRoot();
  writeJson(deckRoot, ".deck-quality/validation-result.json", {
    schemaVersion: 1,
    status: "pass",
    results: []
  });

  const result = runRoute(deckRoot);

  assert.equal(result.status, 0);
  const route = parseOutput(result);
  assert.equal(route.status, "no-route-needed");
  assert.equal(route.recommendedAgent, null);
});
