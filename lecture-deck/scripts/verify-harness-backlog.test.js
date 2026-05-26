const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { parseItems, validateBacklog } = require("./verify-harness-backlog");

const schema = {
  requiredSections: ["## Open Items", "## Completed Items"],
  requiredOpenFields: ["Status", "Priority", "Problem", "Desired improvement", "Harness layer", "Suggested files", "Validation"],
  requiredCompletedFields: ["Status", "Priority", "Problem", "Desired improvement", "Harness layer", "Changed files", "Validation"],
  allowedStatus: ["open", "in-progress", "blocked", "done", "deferred"],
  allowedPriority: ["high", "medium", "low"]
};

function validBacklog() {
  return `# Harness Improvement Backlog

## Open Items

### HIB-101 Example Open

- Status: open
- Priority: high
- Problem: A reusable harness issue exists.
- Desired improvement: Add a reusable validation guard.
- Harness layer: validation
- Suggested files:
  - \`lecture-deck/scripts/example.js\`
- Validation:
  - \`node --test lecture-deck/scripts/example.test.js\`

## Completed Items

### HIB-100 Example Done

- Status: done
- Priority: medium
- Problem: A previous reusable issue existed.
- Desired improvement: Preserve the lesson after implementation.
- Harness layer: routing
- Changed files:
  - \`lecture-deck/scripts/done.js\`
- Validation:
  - \`node --test lecture-deck/scripts/done.test.js\`
`;
}

test("parseItems extracts open and completed HIB items", () => {
  const items = parseItems(validBacklog());

  assert.equal(items.length, 2);
  assert.equal(items[0].id, "HIB-101");
  assert.equal(items[0].section, "open");
  assert.equal(items[1].section, "completed");
});

test("validateBacklog accepts required fields and completed changed files", () => {
  const result = validateBacklog(validBacklog(), schema);

  assert.equal(result.ok, true);
});

test("validateBacklog rejects done items in Open Items", () => {
  const result = validateBacklog(validBacklog().replace("- Status: open", "- Status: done"), schema);

  assert.equal(result.ok, false);
  assert.ok(result.issues.includes("HIB-101:done-in-open-items"));
});

test("validateBacklog rejects duplicate ids and similar open items", () => {
  const duplicate = validBacklog().replace("### HIB-100 Example Done", "### HIB-101 Example Done");
  const result = validateBacklog(duplicate, schema);

  assert.equal(result.ok, false);
  assert.ok(result.issues.includes("HIB-101:duplicate-id"));
});

test("validateBacklog rejects placeholder validation bullets", () => {
  const result = validateBacklog(validBacklog().replace("`node --test lecture-deck/scripts/example.test.js`", "TBD"), schema);

  assert.equal(result.ok, false);
  assert.ok(result.issues.includes("HIB-101:missing-Validation"));
});

test("verify-harness-backlog CLI reads DECK_ROOT", () => {
  const deckRoot = fs.mkdtempSync(path.join(os.tmpdir(), "backlog-"));
  fs.writeFileSync(path.join(deckRoot, "HARNESS-IMPROVEMENT-BACKLOG.md"), validBacklog());
  fs.writeFileSync(path.join(deckRoot, "harness-improvement.schema.json"), `${JSON.stringify(schema, null, 2)}\n`);

  const result = spawnSync(process.execPath, [path.resolve(__dirname, "verify-harness-backlog.js")], {
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: deckRoot
    }
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /PASS harness backlog/);
});
