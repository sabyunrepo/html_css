const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildMarkdown,
  getMutationCases,
  mutationScore,
  parseArgs
} = require("./motion-mutation-loop");

test("motion mutation cases cover independent gate failure modes", () => {
  const cases = getMutationCases();
  const ids = cases.map((item) => item.id);

  assert.deepEqual(new Set(ids).size, ids.length);
  assert.ok(ids.includes("no-animation"));
  assert.ok(ids.includes("single-target-fade"));
  assert.ok(ids.includes("no-stagger"));
  assert.ok(ids.includes("infinite-or-long"));
  assert.ok(ids.includes("missing-reduced-motion"));
  assert.ok(ids.includes("raw-timing-token"));
  assert.ok(ids.includes("unsafe-keyframe-property"));

  cases.forEach((item) => {
    assert.equal(typeof item.expectedGate, "string");
    assert.equal(typeof item.expectedPattern, "object");
    assert.equal(typeof item.mutate, "function");
  });
});

test("mutationScore reports killed percentage with clean zero-total behavior", () => {
  assert.equal(mutationScore(8, 8), 100);
  assert.equal(mutationScore(7, 8), 87.5);
  assert.equal(mutationScore(0, 0), 100);
});

test("parseArgs supports case filtering and smoke-only mode", () => {
  assert.deepEqual(parseArgs(["--case=no-animation", "--max-mutants=2", "--skip-final-smoke"]), {
    caseFilter: "no-animation",
    maxMutants: 2,
    keepWorkdir: false,
    skipFinalSmoke: true
  });
});

test("buildMarkdown exposes killed and survived mutants", () => {
  const markdown = buildMarkdown({
    generatedAt: "2026-05-25T00:00:00.000Z",
    mutationScore: 50,
    killed: 1,
    survived: 1,
    total: 2,
    finalSmoke: { status: "skipped" },
    cases: [
      {
        id: "no-animation",
        expectedGate: "stop-quality",
        status: "killed",
        matched: true,
        exitCode: 1,
        evidence: "motion is declared but no active animation was detected"
      },
      {
        id: "no-stagger",
        expectedGate: "stop-quality",
        status: "survived",
        matched: false,
        exitCode: 0,
        evidence: "command passed"
      }
    ]
  });

  assert.match(markdown, /mutationScore: 50/);
  assert.match(markdown, /no-animation/);
  assert.match(markdown, /survived/);
});
