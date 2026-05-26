#!/usr/bin/env node
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const deckRoot = process.env.DECK_ROOT
  ? path.resolve(process.env.DECK_ROOT)
  : path.resolve(__dirname, "..");
const reportDir = path.join(deckRoot, ".deck-quality");
const reportJsonPath = path.join(reportDir, "motion-mutation-report.json");
const reportMdPath = path.join(reportDir, "motion-mutation-report.md");

function parseArgs(argv) {
  const options = {
    caseFilter: "all",
    maxMutants: Infinity,
    keepWorkdir: false,
    skipFinalSmoke: false
  };

  argv.forEach((arg) => {
    if (arg.startsWith("--case=")) {
      options.caseFilter = arg.slice("--case=".length);
    } else if (arg.startsWith("--max-mutants=")) {
      options.maxMutants = Number(arg.slice("--max-mutants=".length));
    } else if (arg === "--keep-workdir") {
      options.keepWorkdir = true;
    } else if (arg === "--skip-final-smoke") {
      options.skipFinalSmoke = true;
    }
  });

  if (options.caseFilter.length === 0) {
    throw new Error("--case must be a mutation id or all");
  }
  if (!Number.isFinite(options.maxMutants) && options.maxMutants !== Infinity) {
    throw new Error("--max-mutants must be a positive number");
  }
  if (options.maxMutants !== Infinity && options.maxMutants < 1) {
    throw new Error("--max-mutants must be a positive number");
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
      return !relative.split(path.sep).includes(".deck-quality");
    }
  });
}

function appendMutantCss(root, marker, body) {
  const visualCssPath = path.join(root, "assets/visuals.css");
  const current = fs.readFileSync(visualCssPath, "utf8").trimEnd();
  const block = [
    "",
    `/* motion-mutation-${marker}:start */`,
    body.trim(),
    `/* motion-mutation-${marker}:end */`,
    ""
  ].join("\n");
  fs.writeFileSync(visualCssPath, `${current}${block}`);
}

function readMotionPlanTargets(root) {
  const specPath = path.join(root, "slide-spec.json");
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  const animatedSlide = (spec.slides || []).find((slide) => {
    return slide.motionPlan && Array.isArray(slide.motionPlan.targets) && slide.motionPlan.targets.length >= 3;
  });

  if (!animatedSlide) {
    throw new Error("No animated slide with at least three motionPlan targets was found");
  }

  return animatedSlide.motionPlan.targets
    .map((target) => target.selector)
    .filter((selector) => typeof selector === "string" && selector.trim().length > 0);
}

function activeSelectors(root) {
  return readMotionPlanTargets(root).map((selector) => `.deck-frame.is-active ${selector}`);
}

function selectorList(root) {
  return activeSelectors(root).join(",\n  ");
}

function runHook(root, gate) {
  const args = gate === "harness-check"
    ? ["scripts/verify-deck.js", "--mode=harness"]
    : ["scripts/run-hook.js", gate];
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: root,
      REPO_ROOT: path.resolve(deckRoot, "..")
    }
  });

  return {
    gate,
    exitCode: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function readQualityPlan(root) {
  const planPath = path.join(root, ".deck-quality/quality-remediation-plan.json");
  if (!fs.existsSync(planPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(planPath, "utf8"));
}

function outputForMatch(result, root) {
  const plan = readQualityPlan(root);
  const issueText = plan?.issues
    ?.map((issue) => `${issue.problem} ${JSON.stringify(issue.measuredEvidence || {})}`)
    .join("\n") || "";
  return [result.stdout, result.stderr, issueText].join("\n");
}

function mutationScore(killed, total) {
  if (total === 0) {
    return 100;
  }
  return Math.round((killed / total) * 1000) / 10;
}

function getMutationCases() {
  return [
    {
      id: "no-animation",
      expectedGate: "stop-quality",
      expectedPattern: /motion is declared but no active animation was detected|motion quality is too thin for a declared motion slide|motion plan does not match rendered animation/i,
      mutate(root) {
        appendMutantCss(root, "no-animation", `
@media (prefers-reduced-motion: no-preference) {
  ${selectorList(root)} {
    animation: none !important;
  }
}
`);
      }
    },
    {
      id: "single-target-fade",
      expectedGate: "stop-quality",
      expectedPattern: /motion quality is too thin for a declared motion slide|motion plan does not match rendered animation/i,
      mutate(root) {
        const selectors = activeSelectors(root);
        appendMutantCss(root, "single-target-fade", `
@media (prefers-reduced-motion: no-preference) {
  ${selectors.join(",\n  ")} {
    animation: none !important;
  }

  ${selectors[0]} {
    animation: passkey-step-in var(--motion-medium) var(--ease-calm) both !important;
  }
}
`);
      }
    },
    {
      id: "no-stagger",
      expectedGate: "stop-quality",
      expectedPattern: /motion lacks staggered sequence/i,
      mutate(root) {
        appendMutantCss(root, "no-stagger", `
@media (prefers-reduced-motion: no-preference) {
  ${selectorList(root)} {
    animation-delay: var(--delay-step) !important;
  }
}
`);
      }
    },
    {
      id: "infinite-or-long",
      expectedGate: "stop-quality",
      expectedPattern: /motion timing is not presentation-safe/i,
      mutate(root) {
        appendMutantCss(root, "infinite-or-long", `
@media (prefers-reduced-motion: no-preference) {
  ${selectorList(root)} {
    animation-iteration-count: infinite !important;
  }
}
`);
      }
    },
    {
      id: "missing-reduced-motion",
      expectedGate: "render-check",
      expectedPattern: /reduced motion/i,
      mutate(root) {
        const firstSelector = activeSelectors(root)[0];
        appendMutantCss(root, "missing-reduced-motion", `
@media (prefers-reduced-motion: reduce) {
  ${firstSelector} {
    animation: passkey-step-in var(--motion-medium) var(--ease-calm) both !important;
  }
}
`);
      }
    },
    {
      id: "raw-timing-token",
      expectedGate: "harness-check",
      expectedPattern: /motion token usage/i,
      mutate(root) {
        appendMutantCss(root, "raw-timing-token", `
.motion-token-regression {
  animation-delay: 120ms;
}
`);
      }
    },
    {
      id: "unsafe-keyframe-property",
      expectedGate: "harness-check",
      expectedPattern: /animation keyframe safety/i,
      mutate(root) {
        appendMutantCss(root, "unsafe-keyframe-property", `
@keyframes unsafe-motion-mutant {
  from {
    opacity: 0;
    width: 10px;
  }
  to {
    opacity: 1;
    width: 20px;
  }
}

.unsafe-motion-mutant {
  animation: unsafe-motion-mutant var(--motion-fast) var(--ease-calm) both;
}
`);
      }
    }
  ];
}

function selectCases(options) {
  let cases = getMutationCases();
  if (options.caseFilter !== "all") {
    cases = cases.filter((item) => item.id === options.caseFilter);
    if (cases.length === 0) {
      throw new Error(`Unknown mutation case: ${options.caseFilter}`);
    }
  }
  return cases.slice(0, options.maxMutants);
}

function runMutationCase(item, options) {
  const workRoot = fs.mkdtempSync(path.join(os.tmpdir(), `motion-mutant-${item.id}-`));
  copyDeck(deckRoot, workRoot);
  item.mutate(workRoot);

  const result = runHook(workRoot, item.expectedGate);
  const matchText = outputForMatch(result, workRoot);
  const matched = item.expectedPattern.test(matchText);
  const killed = result.exitCode !== 0 && matched;

  if (!options.keepWorkdir) {
    fs.rmSync(workRoot, { recursive: true, force: true });
  }

  return {
    id: item.id,
    expectedGate: item.expectedGate,
    expectedPattern: String(item.expectedPattern),
    status: killed ? "killed" : "survived",
    matched,
    exitCode: result.exitCode,
    evidence: summarizeEvidence(matchText, item.expectedPattern),
    workRoot: options.keepWorkdir ? workRoot : null
  };
}

function summarizeEvidence(text, pattern) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const matchedLine = lines.find((line) => pattern.test(line));
  if (matchedLine) {
    return matchedLine.slice(0, 260);
  }
  return (lines[lines.length - 1] || "no command output").slice(0, 260);
}

function runFinalSmoke(skipFinalSmoke) {
  if (skipFinalSmoke) {
    return { status: "skipped" };
  }
  const result = runHook(deckRoot, "deck-loop");
  return {
    status: result.exitCode === 0 ? "passed" : "failed",
    exitCode: result.exitCode,
    evidence: summarizeEvidence([result.stdout, result.stderr].join("\n"), /PASS|FAIL|failed|passed/i)
  };
}

function buildMarkdown(report) {
  const lines = [
    "# Motion Mutation Report",
    "",
    `- generatedAt: ${report.generatedAt}`,
    `- mutationScore: ${report.mutationScore}`,
    `- killed: ${report.killed}`,
    `- survived: ${report.survived}`,
    `- total: ${report.total}`,
    `- finalSmoke: ${report.finalSmoke.status}`,
    "",
    "## Cases",
    "",
    "| Case | Gate | Status | Exit | Matched | Evidence |",
    "|---|---|---|---:|---|---|"
  ];

  report.cases.forEach((item) => {
    lines.push(`| ${item.id} | ${item.expectedGate} | ${item.status} | ${item.exitCode} | ${item.matched ? "yes" : "no"} | ${escapeMarkdownCell(item.evidence)} |`);
  });

  return `${lines.join("\n")}\n`;
}

function escapeMarkdownCell(value) {
  return String(value || "").replaceAll("|", "\\|").replace(/\s+/g, " ");
}

function writeReports(report) {
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(reportMdPath, buildMarkdown(report));
}

function run(options = parseArgs(process.argv.slice(2))) {
  const selectedCases = selectCases(options);
  const cases = selectedCases.map((item) => runMutationCase(item, options));
  const killed = cases.filter((item) => item.status === "killed").length;
  const survived = cases.length - killed;
  const finalSmoke = runFinalSmoke(options.skipFinalSmoke);
  const report = {
    generatedAt: new Date().toISOString(),
    mutationScore: mutationScore(killed, cases.length),
    killed,
    survived,
    total: cases.length,
    options,
    finalSmoke,
    cases
  };
  writeReports(report);

  console.log(`PASS motion mutation report - ${path.relative(deckRoot, reportJsonPath)}`);
  if (survived === 0 && finalSmoke.status !== "failed") {
    console.log(`PASS motion mutation score - ${killed}/${cases.length} killed (${report.mutationScore}%)`);
    return report;
  }

  console.error(`FAIL motion mutation score - ${killed}/${cases.length} killed (${report.mutationScore}%)`);
  if (finalSmoke.status === "failed") {
    console.error("FAIL final deck-loop smoke");
  }
  process.exitCode = 1;
  return report;
}

if (require.main === module) {
  run();
}

module.exports = {
  buildMarkdown,
  getMutationCases,
  mutationScore,
  parseArgs,
  run,
  selectCases
};
