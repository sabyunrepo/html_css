#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const deckRoot = path.resolve(__dirname, "..");
const reportDir = path.join(deckRoot, ".deck-quality");
const reportJsonPath = path.join(reportDir, "improvement-loop-report.json");
const reportMdPath = path.join(reportDir, "improvement-loop-report.md");

function parseArgs(argv) {
  const options = {
    focus: "visual",
    maxIterations: 8,
    thresholdPercent: 10,
    keepWorkdir: false
  };

  argv.forEach((arg) => {
    if (arg.startsWith("--focus=")) {
      options.focus = arg.slice("--focus=".length);
    } else if (arg.startsWith("--max-iterations=")) {
      options.maxIterations = Number(arg.slice("--max-iterations=".length));
    } else if (arg.startsWith("--threshold-percent=")) {
      options.thresholdPercent = Number(arg.slice("--threshold-percent=".length));
    } else if (arg === "--keep-workdir") {
      options.keepWorkdir = true;
    }
  });

  if (!Number.isFinite(options.maxIterations) || options.maxIterations < 1) {
    throw new Error("--max-iterations must be a positive number");
  }
  if (!Number.isFinite(options.thresholdPercent) || options.thresholdPercent < 0) {
    throw new Error("--threshold-percent must be zero or greater");
  }
  if (!["visual", "motion"].includes(options.focus)) {
    throw new Error("--focus must be one of: visual, motion");
  }

  return options;
}

function copyDeck(sourceRoot, targetRoot) {
  fs.rmSync(targetRoot, { recursive: true, force: true });
  fs.cpSync(sourceRoot, targetRoot, {
    recursive: true,
    filter(source) {
      const relative = path.relative(sourceRoot, source);
      if (!relative) {
        return true;
      }
      const parts = relative.split(path.sep);
      return parts[0] !== ".deck-quality";
    }
  });
}

function removeMarkedBlock(text, marker) {
  const pattern = new RegExp(`\\/\\* improvement-loop-${marker}:start \\*\\/[\\s\\S]*?\\/\\* improvement-loop-${marker}:end \\*\\/\\n?`, "g");
  return text.replace(pattern, "");
}

function appendMarkedBlock(filePath, marker, body) {
  const current = fs.readFileSync(filePath, "utf8");
  const withoutOldBlock = removeMarkedBlock(current, marker).trimEnd();
  const block = [
    "",
    `/* improvement-loop-${marker}:start */`,
    body.trim(),
    `/* improvement-loop-${marker}:end */`,
    ""
  ].join("\n");
  fs.writeFileSync(filePath, `${withoutOldBlock}${block}`);
}

function getSpec(root) {
  return JSON.parse(fs.readFileSync(path.join(root, "slide-spec.json"), "utf8"));
}

function getVisualTargetSlide(root) {
  const spec = getSpec(root);
  const slides = Array.isArray(spec.slides) ? spec.slides : [];
  const preferred = slides.find((slide) => /origin|phishing|visual/i.test(`${slide.id} ${slide.title} ${slide.visual || ""}`));
  const fallback = slides.find((slide) => slide.file && !slide.motion) || slides[0];
  const target = preferred || fallback;
  if (!target?.file) {
    throw new Error("slide-spec.json does not include a target slide file for visual degradation");
  }
  return target;
}

function getMotionTargetSlide(root) {
  const spec = getSpec(root);
  const slides = Array.isArray(spec.slides) ? spec.slides : [];
  const target = slides.find((slide) => slide.file && slide.motion);
  if (!target?.file) {
    throw new Error("slide-spec.json does not include a motion slide for motion-focused degradation");
  }
  return target;
}

function sanitizeSelectorForCss(selector) {
  return String(selector || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/[{};]/.test(part));
}

function buildMotionFailureCss(root) {
  const spec = getSpec(root);
  const motionPlanSelectors = (Array.isArray(spec.slides) ? spec.slides : [])
    .filter((slide) => slide.motionDecision?.mode === "animated" && slide.motionPlan)
    .flatMap((slide) => Array.isArray(slide.motionPlan.targets) ? slide.motionPlan.targets : [])
    .flatMap((target) => sanitizeSelectorForCss(target.selector));

  const selectors = [...new Set([
    ...motionPlanSelectors,
    ".deck-frame.is-active .signin-slide .ceremony-step",
    ".deck-frame.is-active .signin-slide .ceremony-rail::before",
    ".deck-frame.is-active .motion-slide *"
  ])];

  if (selectors.length === 0) {
    throw new Error("No motion selectors found for motion-focused degradation");
  }

  return `
${selectors.join(",\n")} {
  animation: none !important;
}
`;
}

function injectMotionFailure(root) {
  const visualCssPath = path.join(root, "assets/visuals.css");
  appendMarkedBlock(visualCssPath, "motion", buildMotionFailureCss(root));
}

function injectVisualFailure(root) {
  const visualCssPath = path.join(root, "assets/visuals.css");
  appendMarkedBlock(visualCssPath, "heading", `
.slide h1 {
  font-size: 28px !important;
}
`);
  injectMotionFailure(root);

  const targetSlide = getVisualTargetSlide(root);
  const slidePath = path.join(root, targetSlide.file);
  const degradedSlide = `<section class="slide layout-cols-2 motion-slide reduce-slide">
  <div class="copy">
    <p class="eyebrow">Controlled regression</p>
    <h1>${targetSlide.title || "Visual quality regression"}</h1>
    <p class="subtitle">${targetSlide.message || "The loop must detect and repair a weak placeholder visual."}</p>
    <p class="note">${targetSlide.speakerNote || "This temporary file is generated by the improvement loop and must never be used as final output."}</p>
  </div>
  <div class="visual loop-degraded-visual" aria-hidden="true">
    <div class="loop-placeholder">placeholder</div>
  </div>
</section>
`;
  fs.writeFileSync(slidePath, degradedSlide);
}

function injectInitialFailure(root, focus = "visual") {
  if (focus === "motion") {
    injectMotionFailure(root);
    return;
  }
  injectVisualFailure(root);
}

const visualRepairSteps = [
  {
    id: "heading-scale",
    label: "Restore presentation heading scale",
    apply(root) {
      const filePath = path.join(root, "assets/visuals.css");
      fs.writeFileSync(filePath, removeMarkedBlock(fs.readFileSync(filePath, "utf8"), "heading"));
    }
  },
  {
    id: "visual-density",
    label: "Restore slide-specific visual density",
    apply(root) {
      const targetSlide = getVisualTargetSlide(root);
      fs.copyFileSync(
        path.join(deckRoot, targetSlide.file),
        path.join(root, targetSlide.file)
      );
    }
  },
  {
    id: "motion-choreography",
    label: "Restore finite staggered motion choreography",
    apply(root) {
      const filePath = path.join(root, "assets/visuals.css");
      fs.writeFileSync(filePath, removeMarkedBlock(fs.readFileSync(filePath, "utf8"), "motion"));
    }
  },
  {
    id: "no-op-control",
    label: "No-op control pass to detect diminishing return",
    apply() {}
  }
];

const motionRepairSteps = [
  {
    id: "motion-choreography",
    label: "Restore finite staggered motion choreography",
    apply(root) {
      const filePath = path.join(root, "assets/visuals.css");
      fs.writeFileSync(filePath, removeMarkedBlock(fs.readFileSync(filePath, "utf8"), "motion"));
    }
  },
  {
    id: "no-op-control",
    label: "No-op control pass to detect diminishing return",
    apply() {}
  }
];

function getRepairSteps(focus = "visual") {
  return focus === "motion" ? motionRepairSteps : visualRepairSteps;
}

function runStopQuality(root) {
  const result = spawnSync(process.execPath, ["scripts/run-hook.js", "stop-quality"], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: root
    }
  });
  const planPath = path.join(root, ".deck-quality/quality-remediation-plan.json");
  const plan = fs.existsSync(planPath)
    ? JSON.parse(fs.readFileSync(planPath, "utf8"))
    : { status: "missing", issues: [] };
  return {
    exitCode: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    plan,
    issueCount: Array.isArray(plan.issues) ? plan.issues.length : 0,
    visualAverageScore: Number.isFinite(plan.visualQuality?.averageScore)
      ? plan.visualQuality.averageScore
      : null
  };
}

function qualityScore(issueCount, initialIssueCount) {
  if (initialIssueCount <= 0) {
    return issueCount === 0 ? 100 : 0;
  }
  return Math.max(0, Math.round((1 - issueCount / initialIssueCount) * 1000) / 10);
}

function evaluateGateHealth(report) {
  const baselineDetected = report.baseline.exitCode !== 0 && report.baseline.issueCount > 0;
  const realRepairIterations = report.iterations.filter((iteration) => {
    return !iteration.appliedStepIds.includes("no-op-control");
  });
  const lastRealRepair = realRepairIterations[realRepairIterations.length - 1] || null;
  const realRepairsImproved = Boolean(lastRealRepair && lastRealRepair.qualityScore > report.baseline.qualityScore);
  const noOpIterations = report.iterations.filter((iteration) => {
    return iteration.appliedStepIds.includes("no-op-control");
  });
  const noOpImproved = noOpIterations.some((iteration) => {
    return iteration.efficiencyGain >= report.thresholdPercent;
  });
  const failures = [];

  if (!baselineDetected) {
    failures.push({
      code: "controlled-failure-not-detected",
      owner: "workflow-improver",
      reason: "The injected controlled failure did not produce a failing stop-quality gate."
    });
  }

  if (!realRepairsImproved) {
    failures.push({
      code: "repair-sequence-not-effective",
      owner: "workflow-improver",
      reason: "The configured repair sequence did not improve the measured quality score."
    });
  }

  if (noOpImproved) {
    failures.push({
      code: "no-op-control-improved",
      owner: "workflow-improver",
      reason: "A no-op control produced threshold-level improvement, so the gate is unstable or nondeterministic."
    });
  }

  return {
    status: failures.length === 0 ? "passed" : "failed",
    baselineDetected,
    realRepairsImproved,
    noOpImproved,
    failures
  };
}

function buildMarkdown(report) {
  const lines = [
    "# Improvement Loop Report",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- thresholdPercent: ${report.thresholdPercent}`,
    `- focus: ${report.focus}`,
    `- stoppedBecause: ${report.stoppedBecause}`,
    `- gateHealth: ${report.gateHealth?.status || "unknown"}`,
    `- targetSlide: ${report.targetSlide?.file || "unknown"}`,
    `- workRoot: ${report.workRoot}`,
    `- cleanup: ${report.cleanupNote || "workRoot retained"}`,
    "",
    "## Baseline",
    "",
    `- issueCount: ${report.baseline.issueCount}`,
    `- qualityScore: ${report.baseline.qualityScore}`,
    `- visualAverageScore: ${report.baseline.visualAverageScore}`,
    "",
    "## Iterations",
    "",
    "| Iteration | Applied steps | Issues | Score | Visual avg | Efficiency gain | Exit |",
    "|---:|---|---:|---:|---:|---:|---:|"
  ];

  report.iterations.forEach((iteration) => {
    lines.push(
      `| ${iteration.iteration} | ${iteration.appliedStepIds.join(", ") || "none"} | ${iteration.issueCount} | ${iteration.qualityScore} | ${iteration.visualAverageScore} | ${iteration.efficiencyGain} | ${iteration.exitCode} |`
    );
  });

  lines.push(
    "",
    "## Gate Health",
    "",
    `- status: ${report.gateHealth?.status || "unknown"}`,
    `- baselineDetected: ${report.gateHealth?.baselineDetected ? "yes" : "no"}`,
    `- realRepairsImproved: ${report.gateHealth?.realRepairsImproved ? "yes" : "no"}`,
    `- noOpImproved: ${report.gateHealth?.noOpImproved ? "yes" : "no"}`
  );

  if (report.gateHealth?.failures?.length) {
    lines.push("", "| Code | Owner | Reason |", "|---|---|---|");
    report.gateHealth.failures.forEach((failure) => {
      lines.push(`| ${failure.code} | ${failure.owner} | ${failure.reason} |`);
    });
  }

  lines.push(
    "",
    "## Notes",
    "",
    "- Each iteration started from the same injected initial failure state.",
    "- Repair steps were cumulative inside each fresh iteration root.",
    "- The loop stops after an iteration whose efficiency gain is below the configured threshold."
  );

  return `${lines.join("\n")}\n`;
}

function runLoop(options = parseArgs(process.argv.slice(2))) {
  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), "deck-improvement-loop-"));
  const generatedAt = new Date().toISOString();
  const baselineRoot = path.join(workRoot, "baseline");
  const targetSlide = options.focus === "motion"
    ? getMotionTargetSlide(deckRoot)
    : getVisualTargetSlide(deckRoot);
  const repairSteps = getRepairSteps(options.focus);

  copyDeck(deckRoot, baselineRoot);
  injectInitialFailure(baselineRoot, options.focus);
  const baselineRun = runStopQuality(baselineRoot);
  const initialIssueCount = baselineRun.issueCount;
  const baselineScore = qualityScore(initialIssueCount, initialIssueCount);

  const iterations = [];
  let previousScore = baselineScore;
  let stoppedBecause = "max-iterations";

  for (let index = 0; index < options.maxIterations; index += 1) {
    const iterationNumber = index + 1;
    const iterationRoot = path.join(workRoot, `iteration-${iterationNumber}`);
    copyDeck(deckRoot, iterationRoot);
    injectInitialFailure(iterationRoot, options.focus);

    const stepsToApply = repairSteps.slice(0, Math.min(iterationNumber, repairSteps.length));
    stepsToApply.forEach((step) => step.apply(iterationRoot));

    const run = runStopQuality(iterationRoot);
    const score = qualityScore(run.issueCount, initialIssueCount);
    const efficiencyGain = Math.round((score - previousScore) * 10) / 10;
    const iteration = {
      iteration: iterationNumber,
      root: iterationRoot,
      appliedStepIds: stepsToApply.map((step) => step.id),
      appliedStepLabels: stepsToApply.map((step) => step.label),
      exitCode: run.exitCode,
      issueCount: run.issueCount,
      qualityScore: score,
      visualAverageScore: run.visualAverageScore,
      efficiencyGain,
      status: run.plan.status,
      issues: run.plan.issues || []
    };
    iterations.push(iteration);
    previousScore = score;

    if (efficiencyGain < options.thresholdPercent) {
      stoppedBecause = `efficiency ${efficiencyGain}% below ${options.thresholdPercent}% threshold`;
      break;
    }

    if (run.issueCount === 0 && iterationNumber >= repairSteps.length) {
      stoppedBecause = "all repairs exhausted with passing quality";
      break;
    }
  }

  const report = {
    schemaVersion: 1,
    generatedAt,
    focus: options.focus,
    thresholdPercent: options.thresholdPercent,
    maxIterations: options.maxIterations,
    workRoot,
    targetSlide: {
      id: targetSlide.id,
      file: targetSlide.file,
      title: targetSlide.title
    },
    stoppedBecause,
    baseline: {
      root: baselineRoot,
      exitCode: baselineRun.exitCode,
      issueCount: initialIssueCount,
      qualityScore: baselineScore,
      visualAverageScore: baselineRun.visualAverageScore,
      status: baselineRun.plan.status,
      issues: baselineRun.plan.issues || []
    },
    iterations
  };
  report.gateHealth = evaluateGateHealth(report);

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(reportMdPath, buildMarkdown(report));

  const gateHealthPrefix = report.gateHealth.status === "passed" ? "PASS" : "FAIL";
  console.log(`${gateHealthPrefix} improvement loop report - ${path.relative(deckRoot, reportJsonPath)}`);
  console.log(`${gateHealthPrefix} improvement loop markdown - ${path.relative(deckRoot, reportMdPath)}`);
  console.log(`${gateHealthPrefix} improvement loop gate health - ${report.gateHealth.status}`);
  console.log(`${gateHealthPrefix} improvement loop stopped - ${stoppedBecause}`);

  if (!options.keepWorkdir) {
    report.cleanupNote = "workRoot was removed after report generation";
    fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(reportMdPath, buildMarkdown(report));
    fs.rmSync(workRoot, { recursive: true, force: true });
  }

  if (report.gateHealth.status !== "passed") {
    process.exitCode = 1;
  }

  return report;
}

if (require.main === module) {
  try {
    runLoop();
  } catch (error) {
    console.error(`FAIL improvement loop - ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  buildMotionFailureCss,
  evaluateGateHealth,
  parseArgs,
  qualityScore,
  runLoop
};
