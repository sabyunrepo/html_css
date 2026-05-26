const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { appendQualityCases } = require("./deck-eval-corpus");

test("appendQualityCases writes lightweight anti-pattern cases as jsonl", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deck-eval-corpus-"));
  const written = appendQualityCases(root, {
    deckTitle: "Fixture Deck",
    reportPath: ".deck-quality/visual-quality-report.md",
    issues: [
      {
        slide: "04-flag",
        problem: "visual appears too sparse or placeholder-like",
        feedback: "Regenerate a meaningful CSS information graphic with labels."
      }
    ]
  });

  assert.equal(written, 1);
  const corpusPath = path.join(root, "eval-corpus/deck-quality-cases.jsonl");
  const line = fs.readFileSync(corpusPath, "utf8").trim();
  const record = JSON.parse(line);

  assert.equal(record.caseType, "anti-pattern");
  assert.equal(record.deckTitle, "Fixture Deck");
  assert.equal(record.slideId, "04-flag");
  assert.equal(record.failureCategory, "visual-sparse");
  assert.match(record.recommendedRule, /labels/);
  assert.equal(record.sourceArtifact, ".deck-quality/visual-quality-report.md");
});
