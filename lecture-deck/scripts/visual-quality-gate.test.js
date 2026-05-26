const assert = require("node:assert/strict");
const test = require("node:test");

const {
  animationSettleMs,
  chooseSettledScreenshotDelay,
  buildRemediationPlan,
  isWorkflowRemediationIssue
} = require("./visual-quality-gate");

test("animationSettleMs includes delay, duration, iterations, and endDelay", () => {
  assert.equal(animationSettleMs({
    delay: 280,
    duration: 520,
    iterations: 2,
    endDelay: 40
  }), 1360);
});

test("chooseSettledScreenshotDelay waits beyond staggered CSS motion", () => {
  const delay = chooseSettledScreenshotDelay([
    { delay: 0, duration: 520, iterations: 1 },
    { delay: 840, duration: 780, iterations: 1 }
  ]);

  assert.equal(delay, 1860);
});

test("chooseSettledScreenshotDelay uses a floor for static slides", () => {
  assert.equal(chooseSettledScreenshotDelay([]), 900);
});

test("chooseSettledScreenshotDelay clamps infinite animations", () => {
  assert.equal(chooseSettledScreenshotDelay([
    { delay: 0, duration: 780, iterations: "Infinity" }
  ]), 3600);
});

test("buildRemediationPlan routes detected slide output failures to output regeneration", () => {
  const plan = buildRemediationPlan({
    spec: { deckTitle: "Test deck" },
    screenshots: [],
    issues: [{
      slide: "slide-06",
      problem: "compact visual labels wrap into broken fragments",
      feedback: "Widen compact badges."
    }]
  });

  assert.equal(plan.workflowIssues.length, 0);
  assert.equal(plan.outputIssues.length, 1);
  assert.equal(plan.workflowFirst, false);
  assert.deepEqual(plan.requiredOrder, ["deck-output-regenerator"]);
});

test("buildRemediationPlan keeps gate defects on the workflow-improver route", () => {
  const plan = buildRemediationPlan({
    spec: { deckTitle: "Test deck" },
    screenshots: [],
    issues: [{
      slide: "slide-01",
      problem: "false pass: screenshot gate allowed a visibly broken slide",
      feedback: "Strengthen the visual quality gate."
    }]
  });

  assert.equal(plan.workflowIssues.length, 1);
  assert.equal(plan.outputIssues.length, 0);
  assert.equal(plan.workflowFirst, true);
  assert.deepEqual(plan.requiredOrder, ["deck-workflow-improver"]);
});

test("isWorkflowRemediationIssue distinguishes workflow defects from output defects", () => {
  assert.equal(isWorkflowRemediationIssue({ problem: "compact visual labels wrap into broken fragments" }), false);
  assert.equal(isWorkflowRemediationIssue({ problem: "early motion capture before animation settled" }), true);
});
