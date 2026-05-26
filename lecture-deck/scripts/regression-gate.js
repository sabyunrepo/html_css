#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const deckRoot = process.env.DECK_ROOT
  ? path.resolve(process.env.DECK_ROOT)
  : path.resolve(__dirname, "..");
const reportDir = path.join(deckRoot, ".deck-quality");
const reportJsonPath = path.join(reportDir, "regression-gate-report.json");
const reportMdPath = path.join(reportDir, "regression-gate-report.md");
const snapshotDir = path.join(reportDir, "regression-gate");

function parseArgs(argv) {
  const options = {
    mode: "full",
    skipOrchestration: false,
    includeQualityLoop: true,
    includeMotionMutation: true,
    includeOrchestratedRunner: true,
    maxMutants: 7
  };
  argv.forEach((arg) => {
    if (arg.startsWith("--mode=")) {
      options.mode = arg.slice("--mode=".length);
    } else if (arg === "--skip-orchestration") {
      options.skipOrchestration = true;
      options.includeOrchestratedRunner = false;
    } else if (arg === "--include-quality-loop") {
      options.includeQualityLoop = true;
    } else if (arg === "--no-quality-loop") {
      options.includeQualityLoop = false;
    } else if (arg === "--include-motion-mutation") {
      options.includeMotionMutation = true;
    } else if (arg === "--no-motion-mutation") {
      options.includeMotionMutation = false;
    } else if (arg === "--include-orchestrated-runner") {
      options.includeOrchestratedRunner = true;
    } else if (arg === "--no-orchestrated-runner") {
      options.includeOrchestratedRunner = false;
    } else if (arg.startsWith("--max-mutants=")) {
      options.maxMutants = Number(arg.slice("--max-mutants=".length));
    }
  });
  if (!["full", "quality-loop"].includes(options.mode)) {
    throw new Error("--mode must be one of: full, quality-loop");
  }
  if (!Number.isFinite(options.maxMutants) || options.maxMutants < 1) {
    throw new Error("--max-mutants must be a positive number");
  }
  if (options.mode === "quality-loop") {
    options.includeOrchestratedRunner = false;
  }
  return options;
}

function excerpt(text, maxLength = 4000) {
  const value = String(text || "");
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}\n[truncated ${value.length - maxLength} chars]`;
}

function getSteps(options) {
  const steps = [];

  steps.push({
    id: "route-policy-mixed-remediation",
    command: "node scripts/route-failure-policy-check.js --case=mixed-remediation"
  });

  if (options.includeQualityLoop) {
    steps.push({
      id: "improvement-loop-visual",
      command: "node scripts/improvement-loop.js --max-iterations=8 --threshold-percent=10",
      report: ".deck-quality/improvement-loop-report.json",
      markdownReport: ".deck-quality/improvement-loop-report.md"
    });
    steps.push({
      id: "improvement-loop-motion",
      command: "node scripts/improvement-loop.js --focus=motion --max-iterations=4 --threshold-percent=10",
      report: ".deck-quality/improvement-loop-report.json",
      markdownReport: ".deck-quality/improvement-loop-report.md"
    });
  }

  if (options.includeMotionMutation) {
    steps.push({
      id: "motion-mutation-loop",
      command: `node scripts/motion-mutation-loop.js --max-mutants=${options.maxMutants}`,
      report: ".deck-quality/motion-mutation-report.json",
      markdownReport: ".deck-quality/motion-mutation-report.md"
    });
  }

  if (options.mode === "full" && options.includeOrchestratedRunner && !options.skipOrchestration) {
    steps.push({
      id: "orchestrated-runner-validate",
      command: "node scripts/orchestrated-runner.js --validate",
      report: ".deck-quality/orchestrated-runner-report.json"
    });
  }

  return steps;
}

function absoluteReportPath(relativePath) {
  return relativePath ? path.join(deckRoot, relativePath) : null;
}

function removeStaleReport(step) {
  [step.report, step.markdownReport].filter(Boolean).forEach((relativePath) => {
    fs.rmSync(absoluteReportPath(relativePath), { force: true });
  });
}

function snapshotReport(step) {
  const snapshots = [];
  fs.mkdirSync(snapshotDir, { recursive: true });
  [
    { relativePath: step.report, extension: ".json" },
    { relativePath: step.markdownReport, extension: ".md" }
  ].forEach(({ relativePath, extension }) => {
    if (!relativePath) return;
    const fullPath = absoluteReportPath(relativePath);
    if (!fs.existsSync(fullPath)) return;
    const target = path.join(snapshotDir, `${step.id}${extension}`);
    fs.copyFileSync(fullPath, target);
    snapshots.push(path.relative(deckRoot, target));
  });
  return snapshots;
}

function runStep(step) {
  const startedAt = new Date().toISOString();
  console.log(`[regression-gate] ${step.id}: ${step.command}`);
  removeStaleReport(step);
  const result = spawnSync(step.command, {
    cwd: deckRoot,
    shell: true,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    env: {
      ...process.env,
      DECK_ROOT: deckRoot,
      REPO_ROOT: path.resolve(deckRoot, "..")
    }
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const finishedAt = new Date().toISOString();
  const snapshots = snapshotReport(step);
  return {
    id: step.id,
    command: step.command,
    expectedReport: step.report,
    snapshotReports: snapshots,
    status: result.status === 0 ? "pass" : "fail",
    exitCode: result.status ?? 1,
    signal: result.signal || null,
    startedAt,
    finishedAt,
    stdoutExcerpt: excerpt(result.stdout),
    stderrExcerpt: excerpt(result.stderr),
    error: result.error ? result.error.message : null
  };
}

function buildMarkdown(report) {
  const lines = [
    "# Regression Gate Report",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- status: ${report.status}`,
    `- mode: ${report.mode}`,
    "",
    "## Steps",
    ""
  ];
  report.steps.forEach((step) => {
    lines.push(`- ${step.status.toUpperCase()} ${step.id}`);
    lines.push(`  - command: \`${step.command}\``);
    lines.push(`  - exitCode: ${step.exitCode}`);
    lines.push(`  - expectedReport: ${step.expectedReport}`);
    if (step.snapshotReports?.length) {
      lines.push(`  - snapshots: ${step.snapshotReports.join(", ")}`);
    }
  });
  return `${lines.join("\n")}\n`;
}

function writeReport(report) {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(reportMdPath, buildMarkdown(report));
}

function run(options = parseArgs(process.argv.slice(2))) {
  fs.rmSync(snapshotDir, { recursive: true, force: true });
  const steps = getSteps(options);
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    mode: options.mode,
    status: "running",
    steps: []
  };

  for (const step of steps) {
    const result = runStep(step);
    report.steps.push(result);
    if (result.status !== "pass") {
      report.status = "fail";
      writeReport(report);
      return report;
    }
  }

  report.status = "pass";
  writeReport(report);
  return report;
}

if (require.main === module) {
  try {
    const report = run();
    console.log(`PASS regression gate report - ${path.relative(deckRoot, reportJsonPath)}`);
    console.log(`PASS regression gate markdown - ${path.relative(deckRoot, reportMdPath)}`);
    if (report.status !== "pass") {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  buildMarkdown,
  getSteps,
  parseArgs,
  run
};
