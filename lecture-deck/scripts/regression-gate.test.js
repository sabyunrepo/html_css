const assert = require("node:assert/strict");
const test = require("node:test");

const { buildMarkdown, getSteps, parseArgs } = require("./regression-gate");

test("parseArgs supports full and quality-loop modes", () => {
  assert.deepEqual(parseArgs([]), {
    mode: "full",
    skipOrchestration: false,
    includeQualityLoop: true,
    includeMotionMutation: true,
    includeOrchestratedRunner: true,
    maxMutants: 7
  });
  assert.deepEqual(parseArgs(["--mode=quality-loop", "--skip-orchestration", "--max-mutants=3"]), {
    mode: "quality-loop",
    skipOrchestration: true,
    includeQualityLoop: true,
    includeMotionMutation: true,
    includeOrchestratedRunner: false,
    maxMutants: 3
  });
});

test("getSteps bundles quality gates and orchestration validation", () => {
  const steps = getSteps({
    mode: "full",
    skipOrchestration: false,
    includeQualityLoop: true,
    includeMotionMutation: true,
    includeOrchestratedRunner: true,
    maxMutants: 7
  });
  const commands = steps.map((step) => step.command);

  assert.ok(commands.includes("node scripts/route-failure-policy-check.js --case=mixed-remediation"));
  assert.ok(commands.includes("node scripts/improvement-loop.js --max-iterations=8 --threshold-percent=10"));
  assert.ok(commands.includes("node scripts/improvement-loop.js --focus=motion --max-iterations=4 --threshold-percent=10"));
  assert.ok(commands.includes("node scripts/motion-mutation-loop.js --max-mutants=7"));
  assert.ok(commands.includes("node scripts/orchestrated-runner.js --validate"));
});

test("getSteps can run quality-loop compatible subset without orchestration", () => {
  const steps = getSteps({
    mode: "quality-loop",
    skipOrchestration: false,
    includeQualityLoop: true,
    includeMotionMutation: true,
    includeOrchestratedRunner: false,
    maxMutants: 7
  });

  assert.equal(steps.some((step) => step.id === "orchestrated-runner-validate"), false);
  assert.equal(steps.some((step) => step.id === "route-policy-mixed-remediation"), true);
  assert.equal(steps.some((step) => step.id === "motion-mutation-loop"), true);
});

test("buildMarkdown summarizes step status and expected reports", () => {
  const markdown = buildMarkdown({
    generatedAt: "2026-05-26T00:00:00.000Z",
    status: "pass",
    mode: "full",
    steps: [
      {
        id: "motion-mutation-loop",
        status: "pass",
        command: "node scripts/motion-mutation-loop.js --max-mutants=7",
        exitCode: 0,
        expectedReport: ".deck-quality/motion-mutation-report.json",
        snapshotReports: [".deck-quality/regression-gate/motion-mutation-loop.json"]
      }
    ]
  });

  assert.match(markdown, /Regression Gate Report/);
  assert.match(markdown, /motion-mutation-loop/);
  assert.match(markdown, /motion-mutation-report\.json/);
});
