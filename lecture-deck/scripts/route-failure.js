#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

const deckRoot = process.env.DECK_ROOT
  ? path.resolve(process.env.DECK_ROOT)
  : path.resolve(__dirname, "..");

const outputDir = path.join(deckRoot, ".deck-quality");

const ROUTES = {
  research: {
    phase: "research/tool selection",
    agent: "deck-researcher",
    routingDecision: "route-to-research",
    nextCommand: "node lecture-deck/scripts/run-hook.js harness-check"
  },
  asset: {
    phase: "asset research",
    agent: "deck-asset-researcher",
    routingDecision: "route-to-asset-research",
    nextCommand: "node lecture-deck/scripts/run-hook.js harness-check"
  },
  content: {
    phase: "slide output",
    agent: "deck-content-producer",
    routingDecision: "route-to-content",
    nextCommand: "node lecture-deck/scripts/run-hook.js harness-check"
  },
  visual: {
    phase: "visual/motion polish",
    agent: "deck-visual-reviewer",
    routingDecision: "route-to-visual-review",
    nextCommand: "node lecture-deck/scripts/run-hook.js render-check"
  },
  screenshot: {
    phase: "screenshot review",
    agent: "deck-screenshot-quality-reviewer",
    routingDecision: "route-to-screenshot-review",
    nextCommand: "node lecture-deck/scripts/run-hook.js stop-quality"
  },
  output: {
    phase: "slide output",
    agent: "deck-output-regenerator",
    routingDecision: "route-to-output-regeneration",
    nextCommand: "node lecture-deck/scripts/run-hook.js stop-quality"
  },
  workflow: {
    phase: "workflow improvement",
    agent: "deck-workflow-improver",
    routingDecision: "route-to-workflow-improvement",
    nextCommand: "node lecture-deck/scripts/run-hook.js quality-loop"
  },
  validation: {
    phase: "validation",
    agent: "deck-validation-runner",
    routingDecision: "route-to-validation",
    nextCommand: "node lecture-deck/scripts/run-hook.js pre-handoff"
  },
  contract: {
    phase: "validation",
    agent: "deck-contract-validator",
    routingDecision: "route-to-validation",
    nextCommand: "node lecture-deck/scripts/run-hook.js harness-check"
  }
};

function parseArgs(argv) {
  const args = { json: false };
  argv.forEach((arg) => {
    if (arg === "--json") args.json = true;
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (!match) return;
    const [, key, value] = match;
    args[key] = value;
  });
  return args;
}

function readJson(relativePath) {
  const fullPath = path.join(deckRoot, relativePath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, "utf8"));
}

function readText(relativePath) {
  const fullPath = path.join(deckRoot, relativePath);
  if (!fs.existsSync(fullPath)) return "";
  return fs.readFileSync(fullPath, "utf8");
}

function routeForValidationName(name = "") {
  if (/research source|slide evidence/i.test(name)) return "research";
  if (/image source|asset|raster|manifest|css-module/i.test(name)) return "asset";
  if (/slide count|slide spec|deck slides metadata|content depth|broken links|importance map|asset decision|visual archetype|visual form/i.test(name)) return "content";
  if (/motion|animation|reduced motion|finite/i.test(name)) return "visual";
  if (/desktop|mobile|overflow|note exposure|presenter|browser runtime/i.test(name)) return "visual";
  if (/current run|tool policy|agent handoff|agent phase|workflow trace|reset boundary|canonical flow|hook contract/i.test(name)) return "contract";
  return "validation";
}

function routeForVisualIssue(issue = {}) {
  const problem = `${issue.problem || ""} ${issue.failureCategory || ""}`;
  if (/false.?pass|harness|gate|workflow/i.test(problem)) return "workflow";
  if (/motion|animation/i.test(problem)) return "visual";
  if (/screenshot review|visible failure/i.test(problem)) return "screenshot";
  return "output";
}

function buildPrompt(route, evidence) {
  return [
    `You are ${route.agent}.`,
    "Work in `/Users/sabyun/goinfre/html_css`.",
    `Phase: ${route.phase}.`,
    `Routing reason: ${evidence.reason}.`,
    `Evidence: ${evidence.paths.join(", ") || "see latest hook output"}.`,
    "Do not weaken validation hooks, evidence requirements, screenshot gates, or workflow contracts.",
    "If this is a workflow or harness defect, do not repair generated slide HTML/CSS as the primary fix. Improve agents, skills, contracts, hooks, validators, design/motion rules, few-shots, or eval cases first; regenerate output only after the harness cause is addressed.",
    "Return pass/fail, exact files inspected or changed, commands run with exit status, and the next gate."
  ].join(" ");
}

function buildRoute(kind, reason, paths, issues = []) {
  const route = ROUTES[kind] || ROUTES.validation;
  const evidence = { reason, paths };
  return {
    schemaVersion: 1,
    status: "route-required",
    recommendedAgent: route.agent,
    phase: route.phase,
    routingDecision: route.routingDecision,
    reason,
    evidence: paths,
    issues,
    nextCommand: route.nextCommand,
    prompt: buildPrompt(route, evidence)
  };
}

function noRoute(reason, paths = []) {
  return {
    schemaVersion: 1,
    status: "no-route-needed",
    recommendedAgent: null,
    phase: null,
    routingDecision: "no-routing-needed",
    reason,
    evidence: paths,
    issues: [],
    nextCommand: "node lecture-deck/scripts/run-hook.js deck-loop",
    prompt: ""
  };
}

function routeFromRemediationPlan(plan) {
  if (!plan) return null;
  if (plan.status === "pass" && !plan.issues?.length) {
    return noRoute("quality remediation plan is pass", [".deck-quality/quality-remediation-plan.json"]);
  }
  const workflowIssues = plan.workflowIssues || [];
  const outputIssues = plan.outputIssues || [];
  if (workflowIssues.length) {
    return buildRoute(
      "workflow",
      outputIssues.length
        ? "workflow issue must be resolved before output regeneration"
        : "workflow quality issue reported by remediation plan",
      [".deck-quality/quality-remediation-plan.json", ".deck-quality/visual-quality-report.md"],
      [...workflowIssues, ...outputIssues.map((issue) => ({ ...issue, blockedByWorkflowIssue: true }))]
    );
  }
  if (outputIssues.length) {
    const firstRoute = routeForVisualIssue(outputIssues[0]);
    return buildRoute(firstRoute, "visual output issue reported by remediation plan", [".deck-quality/quality-remediation-plan.json", ".deck-quality/visual-quality-report.md"], outputIssues);
  }
  if (plan.status === "fail") {
    return buildRoute("screenshot", "screenshot quality failed without classified output issue", [".deck-quality/quality-remediation-plan.json"], plan.issues || []);
  }
  return null;
}

function routeFromScreenshotReview(review) {
  if (!review) return null;
  if (review.falsePass) {
    return buildRoute("workflow", "screenshot review marked a false pass", [".deck-quality/screenshot-review.json"], review.visibleFailures || []);
  }
  if (review.status === "pass") {
    return noRoute("screenshot review is pass", [".deck-quality/screenshot-review.json"]);
  }
  const failures = review.visibleFailures || [];
  const route = failures.length ? routeForVisualIssue(failures[0]) : "screenshot";
  return buildRoute(route, "screenshot review reported visible failures", [".deck-quality/screenshot-review.json"], failures);
}

function routeFromValidationResult(result) {
  if (!result) return null;
  if (result.status === "pass") {
    return noRoute("validation result is pass", [".deck-quality/validation-result.json"]);
  }
  const failures = (result.results || []).filter((item) => item.ok === false);
  const first = failures[0] || { name: "validation", detail: "validation failed" };
  const route = routeForValidationName(first.name);
  return buildRoute(route, `validation failed: ${first.name}`, [".deck-quality/validation-result.json"], failures);
}

function routeFromImprovementLoop(report) {
  if (!report) return null;
  if (report.gateHealth?.status === "failed") {
    return buildRoute(
      "workflow",
      "improvement-loop gateHealth failed",
      [".deck-quality/improvement-loop-report.json"],
      report.gateHealth.failures || []
    );
  }
  if (report.gateHealth?.status === "passed") {
    return noRoute("improvement-loop gateHealth passed", [".deck-quality/improvement-loop-report.json"]);
  }
  return null;
}

function routeFromFinalSmokePlan(plan, paths, fallbackIssues = []) {
  const planRoute = routeFromRemediationPlan(plan);
  if (planRoute && planRoute.status === "route-required") {
    return {
      ...planRoute,
      reason: `final deck-loop smoke failed; ${planRoute.reason}`,
      evidence: Array.from(new Set([...paths, ...planRoute.evidence]))
    };
  }
  return buildRoute(
    "validation",
    "final deck-loop smoke failed",
    paths,
    fallbackIssues
  );
}

function routeFromMotionMutation(report, plan = null) {
  if (!report) return null;
  const survivedCases = (report.cases || []).filter((item) => item.status === "survived");
  if (survivedCases.length) {
    return buildRoute(
      "workflow",
      "motion-mutation-loop has survived mutants",
      [".deck-quality/motion-mutation-report.json"],
      survivedCases
    );
  }
  if (report.finalSmoke?.status === "failed") {
    return routeFromFinalSmokePlan(plan, [".deck-quality/motion-mutation-report.json"], [report.finalSmoke]);
  }
  if (report.total !== undefined) {
    return noRoute("motion-mutation-loop killed all mutants", [".deck-quality/motion-mutation-report.json"]);
  }
  return null;
}

function routeFromRegressionGate(report, plan = null) {
  if (!report) return null;
  const failedSteps = (report.steps || []).filter((step) => step.status === "fail");
  if (failedSteps.length) {
    const first = failedSteps[0];
    const paths = [".deck-quality/regression-gate-report.json", first.expectedReport].filter(Boolean);
    if (/final deck-loop smoke/i.test(`${first.stderrExcerpt || ""} ${first.stdoutExcerpt || ""}`)) {
      return routeFromFinalSmokePlan(plan, paths, failedSteps);
    }
    if (/route-policy|improvement-loop|motion-mutation-loop/i.test(first.id || "")) {
      return buildRoute("workflow", `regression gate failed: ${first.id}`, paths, failedSteps);
    }
    if (/orchestrated-runner/i.test(first.id || "")) {
      return buildRoute("contract", `regression gate failed: ${first.id}`, paths, failedSteps);
    }
    return buildRoute("validation", `regression gate failed: ${first.id || "unknown step"}`, paths, failedSteps);
  }
  if (report.status === "pass") {
    return noRoute("regression gate passed", [".deck-quality/regression-gate-report.json"]);
  }
  return null;
}

function routeFromHookOutput(text) {
  if (!text) return null;
  if (/FAIL regression gate|regression-gate.*fail|regression gate.*fail/i.test(text)) {
    return buildRoute("workflow", "hook output indicates regression-gate failure", ["hook-output"], []);
  }
  if (/FAIL motion mutation score|survived mutants?|mutationScore/i.test(text)) {
    return buildRoute("workflow", "hook output indicates motion mutation gate failure", ["hook-output"], []);
  }
  if (/FAIL improvement loop|gate health - failed|controlled-failure-not-detected|no-op-control-improved/i.test(text)) {
    return buildRoute("workflow", "hook output indicates improvement-loop gate failure", ["hook-output"], []);
  }
  if (/FAIL agent phase trace|FAIL agent handoff schema|FAIL current run contract|FAIL tool policy|FAIL reset boundary/i.test(text)) {
    return buildRoute("contract", "hook output indicates contract or trace failure", ["hook-output"], []);
  }
  if (/FAIL research source|FAIL slide evidence/i.test(text)) {
    return buildRoute("research", "hook output indicates research or evidence failure", ["hook-output"], []);
  }
  if (/FAIL image source|FAIL asset|FAIL css-module|FAIL raster|FAIL manifest/i.test(text)) {
    return buildRoute("asset", "hook output indicates asset failure", ["hook-output"], []);
  }
  if (/FAIL screenshot quality|visible failure|quality status: FAIL/i.test(text)) {
    return buildRoute("screenshot", "hook output indicates screenshot quality failure", ["hook-output"], []);
  }
  if (/FAIL motion|FAIL animation|FAIL reduced motion|FAIL finite/i.test(text)) {
    return buildRoute("visual", "hook output indicates motion or visual runtime failure", ["hook-output"], []);
  }
  if (/FAIL/i.test(text)) {
    return buildRoute("validation", "hook output contains an unclassified failure", ["hook-output"], []);
  }
  return noRoute("hook output has no FAIL marker", ["hook-output"]);
}

function routeFailure(args = {}) {
  if (args["hook-output"]) {
    const hookText = fs.existsSync(args["hook-output"])
      ? fs.readFileSync(args["hook-output"], "utf8")
      : args["hook-output"];
    return routeFromHookOutput(hookText);
  }

  const plan = readJson(".deck-quality/quality-remediation-plan.json");
  const review = readJson(".deck-quality/screenshot-review.json");
  const validation = readJson(".deck-quality/validation-result.json");
  const improvement = readJson(".deck-quality/improvement-loop-report.json");
  const mutation = readJson(".deck-quality/motion-mutation-report.json");
  const regression = readJson(".deck-quality/regression-gate-report.json");

  const improvementRoute = routeFromImprovementLoop(improvement);
  if (improvementRoute && improvementRoute.status === "route-required") return improvementRoute;
  const mutationRoute = routeFromMotionMutation(mutation, plan);
  if (mutationRoute && mutationRoute.status === "route-required") return mutationRoute;
  const regressionRoute = routeFromRegressionGate(regression, plan);
  if (regressionRoute && regressionRoute.status === "route-required") return regressionRoute;

  const planRoute = routeFromRemediationPlan(plan);
  if (planRoute && planRoute.status === "route-required") return planRoute;
  const reviewRoute = routeFromScreenshotReview(review);
  if (reviewRoute && reviewRoute.status === "route-required") return reviewRoute;
  const validationRoute = routeFromValidationResult(validation);
  if (validationRoute) return validationRoute;
  return improvementRoute || mutationRoute || regressionRoute || planRoute || reviewRoute || noRoute("no failure artifacts found", []);
}

function printHuman(result) {
  console.log(`status: ${result.status}`);
  console.log(`routingDecision: ${result.routingDecision}`);
  console.log(`agent: ${result.recommendedAgent || "none"}`);
  console.log(`phase: ${result.phase || "none"}`);
  console.log(`reason: ${result.reason}`);
  console.log(`nextCommand: ${result.nextCommand}`);
  if (result.prompt) {
    console.log("");
    console.log(result.prompt);
  }
}

if (require.main === module) {
  const args = parseArgs(process.argv.slice(2));
  const result = routeFailure(args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }
  if (result.status === "route-required") {
    process.exitCode = 2;
  }
}

module.exports = {
  routeFailure,
  routeForValidationName,
  routeForVisualIssue
};
