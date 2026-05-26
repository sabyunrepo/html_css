const fs = require("node:fs");
const path = require("node:path");

function classifyIssue(problem = "") {
  if (/sparse|placeholder/i.test(problem)) {
    return "visual-sparse";
  }
  if (/overlap/i.test(problem)) {
    return "layout-overlap";
  }
  if (/heading|subtitle/i.test(problem)) {
    return "message-hierarchy";
  }
  if (/motion|animation/i.test(problem)) {
    return "motion-runtime";
  }
  if (/presenter/i.test(problem)) {
    return "presenter-review";
  }
  return "quality";
}

function buildQualityCase({ deckTitle, issue, reportPath }) {
  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    caseType: "anti-pattern",
    deckTitle: deckTitle || "HTML/CSS deck",
    slideId: issue.slide || "deck",
    failureCategory: classifyIssue(issue.problem),
    problem: issue.problem,
    measuredEvidence: issue.measuredEvidence || null,
    recommendedRule: issue.feedback,
    sourceArtifact: reportPath
  };
}

function appendQualityCases(root, { deckTitle, issues, reportPath }) {
  if (!Array.isArray(issues) || issues.length === 0) {
    return 0;
  }

  const corpusDir = path.join(root, "eval-corpus");
  const corpusPath = path.join(corpusDir, "deck-quality-cases.jsonl");
  fs.mkdirSync(corpusDir, { recursive: true });

  const lines = issues.map((issue) => {
    return JSON.stringify(buildQualityCase({ deckTitle, issue, reportPath }));
  });
  fs.appendFileSync(corpusPath, `${lines.join("\n")}\n`);
  return lines.length;
}

module.exports = {
  appendQualityCases,
  buildQualityCase,
  classifyIssue
};
