const assert = require("node:assert/strict");
const test = require("node:test");

const { buildMotionFailureCss, evaluateGateHealth, parseArgs, qualityScore } = require("./improvement-loop");

test("qualityScore maps issue reduction to a percentage score", () => {
  assert.equal(qualityScore(7, 7), 0);
  assert.equal(qualityScore(2, 7), 71.4);
  assert.equal(qualityScore(1, 7), 85.7);
  assert.equal(qualityScore(0, 7), 100);
});

test("qualityScore handles a clean baseline", () => {
  assert.equal(qualityScore(0, 0), 100);
  assert.equal(qualityScore(1, 0), 0);
});

test("parseArgs supports motion-only improvement focus", () => {
  assert.deepEqual(parseArgs(["--focus=motion", "--max-iterations=3", "--threshold-percent=5"]), {
    focus: "motion",
    maxIterations: 3,
    thresholdPercent: 5,
    keepWorkdir: false
  });
});

test("buildMotionFailureCss targets selectors declared in motionPlan", () => {
  const css = buildMotionFailureCss(__dirname + "/..");

  assert.match(css, /\.axis-main|\.normal-rail \.rail-line/);
  assert.match(css, /\.axis-cross|\.agent-map \.dest-research/);
  assert.match(css, /\.basis-token|\.improve-path \.path-four/);
  assert.match(css, /animation: none !important/);
});

test("evaluateGateHealth passes when controlled failure is detected and real repair improves", () => {
  const result = evaluateGateHealth({
    thresholdPercent: 10,
    baseline: { exitCode: 1, issueCount: 4, qualityScore: 0 },
    iterations: [
      { appliedStepIds: ["motion-choreography"], qualityScore: 75, efficiencyGain: 75 },
      { appliedStepIds: ["motion-choreography", "no-op-control"], qualityScore: 75, efficiencyGain: 0 }
    ]
  });

  assert.equal(result.status, "passed");
  assert.equal(result.failures.length, 0);
});

test("evaluateGateHealth fails when injected failure is not caught", () => {
  const result = evaluateGateHealth({
    thresholdPercent: 10,
    baseline: { exitCode: 0, issueCount: 0, qualityScore: 100 },
    iterations: [
      { appliedStepIds: ["motion-choreography"], qualityScore: 100, efficiencyGain: 0 }
    ]
  });

  assert.equal(result.status, "failed");
  assert.ok(result.failures.some((failure) => failure.code === "controlled-failure-not-detected"));
});

test("evaluateGateHealth fails when no-op control improves above threshold", () => {
  const result = evaluateGateHealth({
    thresholdPercent: 10,
    baseline: { exitCode: 1, issueCount: 4, qualityScore: 0 },
    iterations: [
      { appliedStepIds: ["motion-choreography"], qualityScore: 40, efficiencyGain: 40 },
      { appliedStepIds: ["motion-choreography", "no-op-control"], qualityScore: 65, efficiencyGain: 25 }
    ]
  });

  assert.equal(result.status, "failed");
  assert.ok(result.failures.some((failure) => failure.code === "no-op-control-improved"));
});
