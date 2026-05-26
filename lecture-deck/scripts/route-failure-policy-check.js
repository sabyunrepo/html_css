#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const deckRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const options = { case: "mixed-remediation" };
  argv.forEach((arg) => {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) options[match[1]] = match[2];
  });
  if (options.case !== "mixed-remediation") {
    throw new Error("--case must be mixed-remediation");
  }
  return options;
}

function writeMixedRemediation(tempRoot) {
  const outputDir = path.join(tempRoot, ".deck-quality");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(
    path.join(outputDir, "quality-remediation-plan.json"),
    `${JSON.stringify({
      status: "fail",
      issues: [
        {
          slide: "slide-01",
          problem: "visible hierarchy failure passed a previous review",
          feedback: "tighten visual hierarchy gate"
        }
      ],
      workflowIssues: [
        {
          slide: "slide-01",
          problem: "visible hierarchy failure passed a previous review",
          owner: "deck-workflow-improver"
        }
      ],
      outputIssues: [
        {
          slide: "slide-01",
          problem: "current slide hierarchy is weak",
          owner: "deck-output-regenerator"
        }
      ]
    }, null, 2)}\n`
  );
}

function run(options = parseArgs(process.argv.slice(2))) {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "route-policy-"));
  try {
    if (options.case === "mixed-remediation") writeMixedRemediation(tempRoot);
    const result = spawnSync(
      process.execPath,
      [path.join(deckRoot, "scripts/route-failure.js"), "--json"],
      {
        cwd: path.resolve(deckRoot, ".."),
        encoding: "utf8",
        env: {
          ...process.env,
          DECK_ROOT: tempRoot
        }
      }
    );
    const route = JSON.parse(result.stdout || "{}");
    if (result.status !== 2) {
      throw new Error(`expected route-required exit 2, got ${result.status}`);
    }
    if (route.recommendedAgent !== "deck-workflow-improver") {
      throw new Error(`expected deck-workflow-improver, got ${route.recommendedAgent || "none"}`);
    }
    if (route.routingDecision !== "route-to-workflow-improvement") {
      throw new Error(`expected route-to-workflow-improvement, got ${route.routingDecision || "none"}`);
    }
    console.log(`PASS route policy ${options.case} -> ${route.recommendedAgent}`);
    return { status: "pass", route };
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(`FAIL route policy - ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  run
};
