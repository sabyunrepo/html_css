#!/usr/bin/env node
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { appendQualityCases, classifyIssue } = require("./deck-eval-corpus");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, ".deck-quality");
const screenshotDir = path.join(outputDir, "screenshots");
const reportPath = path.join(outputDir, "visual-quality-report.md");
const remediationPlanPath = path.join(outputDir, "quality-remediation-plan.json");
const rubricPath = path.join(outputDir, "visual-rubric-scores.json");
const screenshotReviewPath = path.join(outputDir, "screenshot-review.json");
const { appendTrace } = require("./workflow-trace");
const VISUAL_SCORE_PASS = 82;
const SCREENSHOT_TIMING = {
  initialDelayMs: 80,
  minimumSettledDelayMs: 900,
  settledBufferMs: 240,
  maximumSettledDelayMs: 3600
};
const visualFormRequirements = {
  funnel: [".funnel-source", ".funnel-neck", ".funnel-result"],
  "document-template": [".sheet-header", ".sheet-row"],
  "process-rail": [".rail-line", ".workflow-step"],
  "hub-map": [".handoff-hub", ".export-destination"],
  "triage-table": [".triage-row"],
  "step-path": [".recipe-path", ".recipe-step"],
  "interface-mock": [".chat-bubble", ".canvas-wireframe"]
};

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function getSpec() {
  const specPath = path.join(root, "slide-spec.json");
  if (!fs.existsSync(specPath)) {
    throw new Error("slide-spec.json is missing");
  }
  const spec = JSON.parse(fs.readFileSync(specPath, "utf8"));
  if (!Array.isArray(spec.slides) || spec.slides.length === 0) {
    throw new Error("slide-spec.json must include a non-empty slides array");
  }
  return spec;
}

function findChrome() {
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function serveStatic() {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const decodedPath = decodeURIComponent(url.pathname);
    const requested = decodedPath === "/" ? "/deck.html" : decodedPath;
    const filePath = path.normalize(path.join(root, requested));

    if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    fs.readFile(filePath, (error, body) => {
      if (error) {
        response.writeHead(404);
        response.end("Not found");
        return;
      }

      const ext = path.extname(filePath);
      const contentType = {
        ".html": "text/html; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8"
      }[ext] || "application/octet-stream";

      response.writeHead(200, { "content-type": contentType });
      response.end(body);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        origin: `http://127.0.0.1:${server.address().port}`
      });
    });
  });
}

function launchChrome(chromePath) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deck-quality-"));
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "--disable-component-update",
    "--disable-sync",
    "--disable-features=MediaRouter",
    "--metrics-recording-only",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "about:blank"
  ], { stdio: ["ignore", "ignore", "pipe"] });

  const exitPromise = new Promise((resolve) => chrome.once("exit", resolve));
  const wsPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Chrome did not expose a DevTools endpoint")), 10000);
    chrome.stderr.on("data", (chunk) => {
      const match = chunk.toString().match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
    chrome.on("exit", (code) => {
      reject(new Error(`Chrome exited early with code ${code}`));
    });
  });

  return { chrome, userDataDir, wsPromise, exitPromise };
}

async function createPage(browserWs, url) {
  const endpoint = new URL(browserWs);
  const targetUrl = `http://${endpoint.host}/json/new?${encodeURIComponent(url)}`;
  const response = await fetch(targetUrl, { method: "PUT" });
  if (!response.ok) {
    throw new Error(`Unable to create Chrome target: ${response.status}`);
  }
  const target = await response.json();
  return target.webSocketDebuggerUrl;
}

function cdpClient(pageWs) {
  const socket = new WebSocket(pageWs);
  let nextId = 1;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) {
      return;
    }
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(message.error.message));
    } else {
      resolve(message.result);
    }
  });

  return new Promise((resolve, reject) => {
    socket.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((commandResolve, commandReject) => {
            pending.set(id, { resolve: commandResolve, reject: commandReject });
          });
        },
        close() {
          socket.close();
        }
      });
    });
    socket.addEventListener("error", () => reject(new Error("Chrome WebSocket failed")));
  });
}

async function waitForExpression(client, expression, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const result = await client.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (result.result.value) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function navigate(client, url, viewport) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile
  });
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Page.navigate", { url });
  await waitForExpression(client, "document.readyState === 'complete'");
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  return result.result.value;
}

async function capturePng(client, outputPath) {
  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false
  });
  fs.writeFileSync(outputPath, Buffer.from(screenshot.data, "base64"));
}

function animationSettleMs(animation) {
  const delay = Math.max(0, Number(animation.delay || 0));
  const endDelay = Math.max(0, Number(animation.endDelay || 0));
  const duration = Math.max(0, Number(animation.duration || 0));
  const iterations = animation.iterations === "Infinity" ? Infinity : Math.max(0, Number(animation.iterations || 1));
  if (!Number.isFinite(iterations)) {
    return Infinity;
  }
  return delay + (duration * iterations) + endDelay;
}

function chooseSettledScreenshotDelay(animationDetails, options = {}) {
  const timing = { ...SCREENSHOT_TIMING, ...options };
  const maxSettleMs = (animationDetails || []).reduce((max, animation) => {
    const settleMs = animationSettleMs(animation);
    if (!Number.isFinite(settleMs)) {
      return timing.maximumSettledDelayMs;
    }
    return Math.max(max, settleMs);
  }, 0);
  const requestedDelay = Math.ceil(Math.max(
    timing.minimumSettledDelayMs,
    maxSettleMs + timing.settledBufferMs
  ));
  return Math.min(requestedDelay, timing.maximumSettledDelayMs);
}

async function collectAnimationDetails(client) {
  return evaluate(client, `
    (() => {
      const active = document.querySelector(".deck-frame.is-active .slide");
      return active ? active.getAnimations({ subtree: true }).map((animation) => {
        const timing = animation.effect?.getTiming?.() || {};
        const target = animation.effect?.target;
        return {
          delay: Number(timing.delay || 0),
          endDelay: Number(timing.endDelay || 0),
          duration: Number(timing.duration || 0),
          iterations: timing.iterations === Infinity ? "Infinity" : Number(timing.iterations || 0),
          fill: timing.fill || "",
          easing: timing.easing || "",
          playState: animation.playState || "",
          targetClass: typeof target?.className === "string" ? target.className : ""
        };
      }) : [];
    })()
  `);
}

function formatIssue(issue) {
  return `- ${issue.slide || "deck"}: ${issue.problem} -> ${issue.feedback}`;
}

function buildReport({ spec, screenshots, issues, motionObservations = [], visualScores = [] }) {
  const lines = [
    "# Visual Quality Report",
    "",
    "## Summary",
    "",
    `- slide count: ${spec.slides.length}`,
    `- screenshot count: ${screenshots.length}`,
    `- quality status: ${issues.length ? "FAIL" : "PASS"}`,
    "",
    "## Screenshots",
    "",
    ...screenshots.map((file) => `- ${path.relative(root, file)}`),
    "",
    "## Screenshot Review Contract",
    "",
    "- Review contract: screenshot-review.md",
    "- Required set: desktop initial, desktop settled, mobile, presenter review",
    "- False-pass rule: if screenshots are visibly broken but this report passes, treat it as a harness defect and route to deck-workflow-improver.",
    "",
    "## Motion Quality",
    "",
    ...(motionObservations.length
      ? motionObservations.map((item) => `- ${item.slide}: animations=${item.animations}, targets=${item.animatedTargets}, staggeredDelays=${item.staggeredDelays}, maxDelayMs=${item.maxDelayMs}, maxDurationMs=${item.maxDurationMs}, maxSettleMs=${item.maxSettleMs}, screenshotDelayMs=${item.screenshotDelayMs}`)
      : ["- No declared motion slides detected."]),
    "",
    "## Visual Rubric Scores",
    "",
    ...(visualScores.length
      ? visualScores.map((item) => `- ${item.slide}: score=${item.score}, deductions=${item.deductions.length}`)
      : ["- No visual rubric scores recorded."]),
    "",
    "## Findings",
    ""
  ];

  if (issues.length) {
    lines.push(...issues.map(formatIssue));
    lines.push(
      "",
      "## Regeneration Feedback",
      "",
      "Use `.codex/skills/deck-screenshot-quality/SKILL.md` and fix the listed slides before final handoff."
    );
  } else {
    lines.push("- No blocking screenshot quality issues detected by the stop gate.");
  }

  lines.push("");
  return lines.join("\n");
}

function isWorkflowRemediationIssue(issue = {}) {
  const problem = `${issue.problem || ""} ${issue.failureCategory || ""} ${issue.routingDecision || ""}`;
  return /false.?pass|harness|gate|workflow|contract|missing screenshot review|early motion capture|missing settled timing|fixed timestamp/i.test(problem);
}

function buildRemediationPlan({ spec, screenshots, issues, motionObservations = [], visualScores = [] }) {
  const relativeScreenshots = screenshots.map((file) => path.relative(root, file));
  const outputIssues = issues
    .filter((issue) => !isWorkflowRemediationIssue(issue))
    .map((issue) => ({
      ...issue,
      failureCategory: classifyIssue(issue.problem),
      owner: "deck-output-regenerator"
    }));
  const workflowIssues = issues
    .filter(isWorkflowRemediationIssue)
    .map((issue) => ({
      slide: issue.slide || "deck",
      failureCategory: classifyIssue(issue.problem),
      owner: "deck-workflow-improver",
      recommendedRule: issue.feedback,
      targetFiles: [
        "lecture-deck/design.md",
        "lecture-deck/few-shots.md",
        ".codex/skills/deck-screenshot-quality/SKILL.md",
        "lecture-deck/scripts/visual-quality-gate.js"
      ]
    }));
  const workflowPrompt = [
    "You are deck-workflow-improver.",
    "Read `.codex/agents/deck-workflow-improver.toml` and `.codex/skills/deck-screenshot-quality/SKILL.md`.",
    "Use `lecture-deck/.deck-quality/visual-quality-report.md` and `lecture-deck/.deck-quality/quality-remediation-plan.json`.",
    "Improve generation rules, skills, design guidance, few-shots, hooks, or quality gate logic so these visual failures are less likely to recur.",
    "Do not edit current slide HTML or `assets/visuals.css`."
  ].join(" ");
  const outputPrompt = [
    "You are deck-output-regenerator.",
    "Read `.codex/agents/deck-output-regenerator.toml` and `.codex/skills/deck-screenshot-quality/SKILL.md`.",
    "Use the screenshots and `lecture-deck/.deck-quality/visual-quality-report.md`.",
    "Fix the current deck output in `lecture-deck/slides/*.html` and `lecture-deck/assets/visuals.css` so screenshot quality passes.",
    "Do not edit hooks, validation scripts, skills, or design rules."
  ].join(" ");

  return {
    status: issues.length ? "fail" : "pass",
    deckTitle: spec.deckTitle || "HTML/CSS deck",
    screenshots: relativeScreenshots,
    motionQuality: motionObservations,
    visualQuality: {
      passThreshold: VISUAL_SCORE_PASS,
      averageScore: visualScores.length
        ? Math.round((visualScores.reduce((sum, item) => sum + item.score, 0) / visualScores.length) * 10) / 10
        : null,
      slides: visualScores
    },
    issues,
    workflowIssues,
    outputIssues,
    workflowFirst: workflowIssues.length > 0,
    requiredOrder: workflowIssues.length > 0
      ? outputIssues.length > 0
        ? ["deck-workflow-improver", "deck-output-regenerator"]
        : ["deck-workflow-improver"]
      : outputIssues.length > 0
        ? ["deck-output-regenerator"]
        : [],
    agents: {
      orchestrator: ".codex/agents/deck-screenshot-quality-reviewer.toml",
      workflow: {
        config: ".codex/agents/deck-workflow-improver.toml",
        prompt: workflowPrompt
      },
      output: {
        config: ".codex/agents/deck-output-regenerator.toml",
        prompt: outputPrompt
      }
    },
    rerun: [
      "node lecture-deck/scripts/run-hook.js stop-quality",
      "node lecture-deck/scripts/run-hook.js pre-handoff"
    ]
  };
}

function buildScreenshotReview({ spec, screenshots, issues, motionObservations = [], visualScores = [] }) {
  const reviewedSlides = spec.slides.map((slide) => slide.id);
  const visibleFailures = issues.map((issue) => ({
    slide: issue.slide || "deck",
    problem: issue.problem,
    feedback: issue.feedback,
    failureCategory: classifyIssue(issue.problem)
  }));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    reviewer: "visual-quality-gate",
    status: issues.length ? "fail" : "pass",
    reviewedSlides,
    screenshots: screenshots.map((file) => path.relative(root, file)),
    visibleFailures,
    falsePass: false,
    routingDecision: issues.length ? "route-to-remediation-plan" : "no-blocking-visual-issues",
    evidence: {
      visualQualityReport: path.relative(root, reportPath),
      remediationPlan: path.relative(root, remediationPlanPath),
      rubricScores: path.relative(root, rubricPath),
      motionQuality: motionObservations,
      averageScore: visualScores.length
        ? Math.round((visualScores.reduce((sum, item) => sum + item.score, 0) / visualScores.length) * 10) / 10
        : null
    }
  };
}

function ensureOutputDirs() {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.rmSync(screenshotDir, { recursive: true, force: true });
  fs.mkdirSync(screenshotDir, { recursive: true });
}

function scoreVisual(slideReport) {
  const deductions = [];
  const deduct = (points, reason, evidence = {}) => {
    deductions.push({ points, reason, evidence });
  };

  if (slideReport.headingFontSize < 36) {
    deduct(8, "weak heading hierarchy", { headingFontSize: slideReport.headingFontSize });
  }
  if (slideReport.headingWrap && slideReport.headingWrap.overwrapped) {
    deduct(16, "heading wraps too aggressively", slideReport.headingWrap);
  }
  if (slideReport.visualChildren < 3 || slideReport.visualAreaRatio < 0.08) {
    deduct(16, "visual too sparse or too small", {
      visualChildren: slideReport.visualChildren,
      visualAreaRatio: slideReport.visualAreaRatio
    });
  }
  if (slideReport.legacyMarkerCount > 0) {
    deduct(36, "legacy placeholder markers remain in deck visuals", {
      legacyMarkerCount: slideReport.legacyMarkerCount
    });
  }
  if (slideReport.nonLucideSvgCount > 0) {
    deduct(40, "custom drawing svg remains in deck visuals", {
      nonLucideSvgCount: slideReport.nonLucideSvgCount
    });
  }
  if (slideReport.visualChildren > 0 && slideReport.semanticVisualModules < 2) {
    deduct(24, "visual lacks reusable semantic modules", {
      visualChildren: slideReport.visualChildren,
      semanticVisualModules: slideReport.semanticVisualModules
    });
  }
  if (slideReport.visualLabelCount < 2) {
    deduct(10, "visual has too few readable labels", {
      visualLabelCount: slideReport.visualLabelCount
    });
  }
  if (slideReport.compactLabelWrapFailures && slideReport.compactLabelWrapFailures.length > 0) {
    deduct(18, "compact visual labels wrap into broken fragments", {
      failures: slideReport.compactLabelWrapFailures
    });
  }
  if (slideReport.darkFillFailures && slideReport.darkFillFailures.length > 0) {
    deduct(18, "large near-black filled surface is off-tone", {
      failures: slideReport.darkFillFailures
    });
  }
  if (slideReport.copyVisualOverlap) {
    deduct(20, "copy and visual overlap", {});
  }
  if (slideReport.visualModuleOverlaps && slideReport.visualModuleOverlaps.length > 0) {
    deduct(24, "semantic visual modules overlap", {
      overlaps: slideReport.visualModuleOverlaps
    });
  }
  if (slideReport.visualFormHealth && slideReport.visualFormHealth.issues.length > 0) {
    deduct(24, "visual form geometry is weak", {
      issues: slideReport.visualFormHealth.issues
    });
  }
  if (slideReport.visualModuleClipping && slideReport.visualModuleClipping.length > 0) {
    deduct(28, "semantic visual modules are clipped", {
      clipped: slideReport.visualModuleClipping
    });
  }
  if (slideReport.navSlideOverlap) {
    deduct(20, "navigation overlaps slide", {});
  }

  const score = Math.max(0, 100 - deductions.reduce((sum, item) => sum + item.points, 0));
  return { score, deductions };
}

async function runQualityGate() {
  const spec = getSpec();
  const chromePath = findChrome();
  if (!chromePath) {
    throw new Error("Chrome, Chromium, or Edge was not found");
  }

  ensureOutputDirs();

  const { server, origin } = await serveStatic();
  const { chrome, userDataDir, wsPromise, exitPromise } = launchChrome(chromePath);
  const screenshots = [];
  const issues = [];
  const motionObservations = [];
  const visualScores = [];

  try {
    const browserWs = await wsPromise;
    const pageWs = await createPage(browserWs, `${origin}/deck.html`);
    const client = await cdpClient(pageWs);

    await navigate(client, `${origin}/deck.html`, { width: 1366, height: 768, mobile: false });
    await waitForExpression(client, "window.DECK_READY === true");

    for (let index = 0; index < spec.slides.length; index += 1) {
      const slide = spec.slides[index];
      await evaluate(client, `window.DECK_API.goTo(${index})`);
      await new Promise((resolve) => setTimeout(resolve, SCREENSHOT_TIMING.initialDelayMs));
      const earlyPath = path.join(screenshotDir, `${String(index + 1).padStart(2, "0")}-${slide.id}-desktop-000ms.png`);
      await capturePng(client, earlyPath);
      screenshots.push(earlyPath);

      const preSettleAnimationDetails = await collectAnimationDetails(client);
      const settledDelayMs = chooseSettledScreenshotDelay(preSettleAnimationDetails);
      await new Promise((resolve) => setTimeout(resolve, Math.max(0, settledDelayMs - SCREENSHOT_TIMING.initialDelayMs)));
      const latePath = path.join(screenshotDir, `${String(index + 1).padStart(2, "0")}-${slide.id}-desktop-settled-${settledDelayMs}ms.png`);
      await capturePng(client, latePath);
      screenshots.push(latePath);

      const slideReport = await evaluate(client, `
        (() => {
          const active = document.querySelector(".deck-frame.is-active .slide");
          const h1 = active?.querySelector("h1, h2");
          const subtitle = active?.querySelector(".subtitle");
          const visual = active?.querySelector(".visual");
          const visualChildren = visual ? Array.from(visual.querySelectorAll("*")).length : 0;
          const visualLabelCount = visual ? Array.from(visual.querySelectorAll("strong, b, small, span, code, .visual-label"))
            .filter((node) => node.textContent.trim().length > 0).length : 0;
          const semanticVisualModules = visual ? visual.querySelectorAll(".visual-module, [data-visual-module]").length : 0;
          const visualRect = visual?.getBoundingClientRect();
          const slideRect = active?.getBoundingClientRect();
          const copyRect = active?.querySelector(".copy")?.getBoundingClientRect();
          const navRects = Array.from(document.querySelectorAll(".deck-nav")).map((node) => node.getBoundingClientRect());
          const animationDetails = active ? active.getAnimations({ subtree: true }).map((animation) => {
            const timing = animation.effect?.getTiming?.() || {};
            const target = animation.effect?.target;
            return {
              delay: Number(timing.delay || 0),
              endDelay: Number(timing.endDelay || 0),
              duration: Number(timing.duration || 0),
              iterations: timing.iterations === Infinity ? "Infinity" : Number(timing.iterations || 0),
              fill: timing.fill || "",
              easing: timing.easing || "",
              targetClass: typeof target?.className === "string" ? target.className : ""
            };
          }) : [];
          const directText = (element) => Array.from(element.childNodes || [])
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent || "")
            .join(" ")
            .replace(/\\s+/g, " ")
            .trim();
          const isVisible = (element) => {
            const style = getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.visibility !== "hidden"
              && style.display !== "none"
              && Number.parseFloat(style.opacity || "1") > 0.01
              && rect.width > 0
              && rect.height > 0;
          };
          const parseColor = (value) => {
            const match = String(value || "").match(/rgba?\\(([^)]+)\\)/);
            if (!match) {
              return null;
            }
            const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
            return {
              r: parts[0],
              g: parts[1],
              b: parts[2],
              a: parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1
            };
          };
          const blend = (top, bottom) => {
            const alpha = top.a + bottom.a * (1 - top.a);
            if (alpha === 0) {
              return { r: 255, g: 255, b: 255, a: 1 };
            }
            return {
              r: ((top.r * top.a) + (bottom.r * bottom.a * (1 - top.a))) / alpha,
              g: ((top.g * top.a) + (bottom.g * bottom.a * (1 - top.a))) / alpha,
              b: ((top.b * top.a) + (bottom.b * bottom.a * (1 - top.a))) / alpha,
              a: alpha
            };
          };
          const effectiveBackground = (element) => {
            const chain = [];
            for (let node = element; node && node.nodeType === Node.ELEMENT_NODE; node = node.parentElement) {
              chain.unshift(node);
            }
            return chain.reduce((background, node) => {
              const color = parseColor(getComputedStyle(node).backgroundColor);
              return color && color.a > 0 ? blend(color, background) : background;
            }, { r: 255, g: 255, b: 255, a: 1 });
          };
          const luminance = (color) => {
            const channel = (value) => {
              const normalized = value / 255;
              return normalized <= 0.03928
                ? normalized / 12.92
                : ((normalized + 0.055) / 1.055) ** 2.4;
            };
            return (0.2126 * channel(color.r)) + (0.7152 * channel(color.g)) + (0.0722 * channel(color.b));
          };
          const contrastRatio = (foreground, background) => {
            const lighter = Math.max(luminance(foreground), luminance(background));
            const darker = Math.min(luminance(foreground), luminance(background));
            return (lighter + 0.05) / (darker + 0.05);
          };
          const textLabel = (element, text) => {
            const className = typeof element.className === "string" && element.className.trim()
              ? "." + element.className.trim().split(/\\s+/).slice(0, 3).join(".")
              : "";
            return element.tagName.toLowerCase() + className + ": " + text.slice(0, 42);
          };
          const textElements = active ? Array.from(active.querySelectorAll("*"))
            .filter((element) => isVisible(element) && directText(element).length > 0)
            : [];
          const contrastFailures = textElements.map((element) => {
            const text = directText(element);
            const style = getComputedStyle(element);
            const foreground = parseColor(style.color);
            const background = effectiveBackground(element);
            const fontSize = Number.parseFloat(style.fontSize || "0");
            const fontWeight = Number.parseInt(style.fontWeight || "400", 10);
            const isLarge = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
            const requiredRatio = isLarge ? 3 : 4.5;
            const ratio = foreground ? contrastRatio(foreground, background) : 0;
            return {
              selector: textLabel(element, text),
              text,
              ratio: Math.round(ratio * 100) / 100,
              requiredRatio,
              fontSize,
              fontWeight
            };
          }).filter((item) => item.ratio < item.requiredRatio)
            .sort((a, b) => (a.ratio - b.ratio) || (b.requiredRatio - a.requiredRatio))
            .slice(0, 5);
          const koreanWrapFailures = textElements.map((element) => {
            const text = directText(element);
            if (!/[가-힣]/.test(text)) {
              return null;
            }
            const rect = element.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(element);
            const lineCount = Math.max(1, new Set(Array.from(range.getClientRects())
              .filter((line) => line.width > 0 && line.height > 0)
              .map((line) => Math.round(line.top))).size);
            range.detach();
            const compactTextLength = text.replace(/\\s+/g, "").length;
            const averageCharactersPerLine = compactTextLength / lineCount;
            const shortLabelOverwrapped = compactTextLength <= 12 && lineCount >= 4;
            if (rect.width < 110 && compactTextLength > 4 && (averageCharactersPerLine < 3 || shortLabelOverwrapped)) {
              return {
                selector: textLabel(element, text),
                text,
                width: Math.round(rect.width),
                lineCount,
                averageCharactersPerLine: Math.round(averageCharactersPerLine * 10) / 10
              };
            }
            return null;
          }).filter(Boolean).slice(0, 5);
          const compactLabelWrapFailures = textElements.map((element) => {
            const text = directText(element);
            const compactText = text.replace(/\\s+/g, "");
            if (
              compactText.length < 5
              || compactText.length > 14
              || /\\s/.test(text)
              || /[가-힣]/.test(text)
            ) {
              return null;
            }
            const rect = element.getBoundingClientRect();
            if (rect.width >= 88) {
              return null;
            }
            const range = document.createRange();
            range.selectNodeContents(element);
            const lineCount = Math.max(1, new Set(Array.from(range.getClientRects())
              .filter((line) => line.width > 0 && line.height > 0)
              .map((line) => Math.round(line.top))).size);
            range.detach();
            if (lineCount >= 2) {
              return {
                selector: textLabel(element, text),
                text,
                width: Math.round(rect.width),
                lineCount,
                averageCharactersPerLine: Math.round((compactText.length / lineCount) * 10) / 10
              };
            }
            return null;
          }).filter(Boolean).slice(0, 5);
          const darkFillFailures = active ? Array.from(active.querySelectorAll("*")).map((element) => {
            if (!isVisible(element)) {
              return null;
            }
            const style = getComputedStyle(element);
            const background = parseColor(style.backgroundColor);
            if (!background || background.a < 0.92) {
              return null;
            }
            const maxChannel = Math.max(background.r, background.g, background.b);
            if (maxChannel > 24) {
              return null;
            }
            const rect = element.getBoundingClientRect();
            const area = rect.width * rect.height;
            if (area < 900 || rect.width < 24 || rect.height < 16) {
              return null;
            }
            const className = typeof element.className === "string" ? element.className : "";
            if (/\\b(rail-line|recipe-line|branch-line)\\b/.test(className)) {
              return null;
            }
            const slideArea = slideRect ? slideRect.width * slideRect.height : 1;
            return {
              selector: textLabel(element, directText(element) || element.getAttribute("aria-label") || ""),
              className,
              color: "rgb(" + Math.round(background.r) + ", " + Math.round(background.g) + ", " + Math.round(background.b) + ")",
              areaRatio: Math.round((area / slideArea) * 10000) / 10000,
              width: Math.round(rect.width),
              height: Math.round(rect.height)
            };
          }).filter(Boolean).slice(0, 5) : [];
          const visualFormRequirements = ${JSON.stringify(visualFormRequirements)};
          const requiredSelectors = visualFormRequirements[${JSON.stringify(slide.visualForm || "")}] || [];
          const missingVisualFormSelectors = requiredSelectors.filter((selector) => !active?.querySelector(selector));
          const motionPlan = ${JSON.stringify(slide.motionPlan || null)};
          const findElements = (selector) => {
            try {
              return Array.from(active?.querySelectorAll(selector) || []);
            } catch (error) {
              return [];
            }
          };
          const activeAnimations = active ? active.getAnimations({ subtree: true })
            .filter((animation) => animation.playState !== "idle" && animation.effect?.target)
            : [];
          const animationDelayFor = (element) => {
            const animation = activeAnimations.find((item) => item.effect?.target === element);
            if (!animation) {
              return null;
            }
            const timing = animation.effect?.getTiming?.() || {};
            return Number(timing.delay || 0);
          };
          const motionPlanReport = motionPlan ? (() => {
            const targets = Array.isArray(motionPlan.targets) ? motionPlan.targets : [];
            const targetReports = targets.map((target) => {
              const elements = target?.selector ? findElements(target.selector) : [];
              const animatedDelays = elements
                .map((element) => animationDelayFor(element))
                .filter((delay) => delay !== null);
              return {
                selector: target?.selector || "",
                delayStep: Number(target?.delayStep || 0),
                exists: elements.length > 0,
                hasActiveAnimation: animatedDelays.length > 0,
                firstDelay: animatedDelays.length ? Math.min(...animatedDelays) : null
              };
            });
            const mustNotAnimateReports = Array.isArray(motionPlan.mustNotAnimate)
              ? motionPlan.mustNotAnimate.map((selector) => {
                const elements = findElements(selector);
                const hasActiveAnimation = elements.some((element) => activeAnimations.some((animation) => {
                  const target = animation.effect?.target;
                  return target === element || element.contains(target);
                }));
                return { selector, exists: elements.length > 0, hasActiveAnimation };
              })
              : [];
            const delayedTargets = targetReports
              .filter((target) => target.hasActiveAnimation && target.firstDelay !== null)
              .sort((a, b) => a.delayStep - b.delayStep);
            const delaysFollowDelayStep = delayedTargets.every((target, index, list) => {
              if (index === 0) {
                return true;
              }
              const previous = list[index - 1];
              if (target.delayStep > previous.delayStep) {
                return target.firstDelay > previous.firstDelay;
              }
              return target.firstDelay >= previous.firstDelay;
            });
            return {
              targets: targetReports,
              mustNotAnimate: mustNotAnimateReports,
              activeTargetSelectors: targetReports.filter((target) => target.hasActiveAnimation).length,
              fewerTargetReason: Boolean(motionPlan.fewerTargetsReason || motionPlan.justification || motionPlan.reason),
              delaysFollowDelayStep
            };
          })() : null;
          const visualFormHealth = (() => {
            const issues = [];
            const declaredForm = ${JSON.stringify(slide.visualForm || "")};
            if (declaredForm === "hub-map" && visual) {
              const hub = active?.querySelector(".handoff-hub");
              const destinations = Array.from(active?.querySelectorAll(".export-destination") || []);
              const branches = Array.from(active?.querySelectorAll(".branch-line") || []);
              const hubRect = hub?.getBoundingClientRect();
              const visualBounds = visual.getBoundingClientRect();
              if (!hubRect || destinations.length < 4 || branches.length < 4) {
                issues.push("hub-map requires one hub, four destinations, and four branch lines");
              } else {
                const hubCenterX = hubRect.left + (hubRect.width / 2);
                const hubCenterY = hubRect.top + (hubRect.height / 2);
                const visualCenterX = visualBounds.left + (visualBounds.width / 2);
                const visualCenterY = visualBounds.top + (visualBounds.height / 2);
                const centerDrift = Math.hypot(hubCenterX - visualCenterX, hubCenterY - visualCenterY);
                const hubAreaRatio = (hubRect.width * hubRect.height) / (visualBounds.width * visualBounds.height);
                const destinationRects = destinations.map((node) => node.getBoundingClientRect());
                const minDestinationWidth = Math.min(...destinationRects.map((rect) => rect.width));
                const quadrants = new Set(destinationRects.map((rect) => {
                  const centerX = rect.left + (rect.width / 2);
                  const centerY = rect.top + (rect.height / 2);
                  return (centerX < hubCenterX ? "left" : "right") + "-" + (centerY < hubCenterY ? "top" : "bottom");
                }));
                const visibleBranchCount = branches.filter((branch) => {
                  const rect = branch.getBoundingClientRect();
                  const style = getComputedStyle(branch);
                  return rect.width >= 36 && rect.height >= 3 && Number.parseFloat(style.opacity || "1") > 0.2;
                }).length;
                if (centerDrift > Math.max(48, visualBounds.width * 0.12)) {
                  issues.push("hub is not visually centered: drift " + Math.round(centerDrift) + "px");
                }
                if (hubAreaRatio < 0.08) {
                  issues.push("hub is too small for a hub-map: ratio " + (Math.round(hubAreaRatio * 1000) / 1000));
                }
                if (minDestinationWidth < 116) {
                  issues.push("destination cards are too narrow: min " + Math.round(minDestinationWidth) + "px");
                }
                if (quadrants.size < 4) {
                  issues.push("destinations do not occupy four quadrants: " + Array.from(quadrants).join(", "));
                }
                if (visibleBranchCount < 4) {
                  issues.push("not enough visible branch connectors: " + visibleBranchCount);
                }
              }
            }
            return { issues };
          })();
          const h1Style = h1 ? getComputedStyle(h1) : null;
          const headingWrap = (() => {
            if (!h1) {
              return { overwrapped: false };
            }
            const text = h1.textContent.trim();
            const compactLength = text.replace(/\\s+/g, "").length;
            const rect = h1.getBoundingClientRect();
            const fontSize = h1Style ? Number.parseFloat(h1Style.fontSize || "0") : 0;
            const lineHeight = h1Style ? Number.parseFloat(h1Style.lineHeight || "0") : 0;
            const estimatedLineHeight = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : fontSize * 1.12;
            const estimatedLines = estimatedLineHeight > 0 ? Math.round(rect.height / estimatedLineHeight) : 1;
            return {
              text,
              compactLength,
              width: Math.round(rect.width),
              height: Math.round(rect.height),
              estimatedLines,
              overwrapped: /[가-힣]/.test(text) && compactLength <= 22 && estimatedLines >= 3
            };
          })();
          const visualAreaRatio = visualRect && slideRect ? (visualRect.width * visualRect.height) / (slideRect.width * slideRect.height) : 0;
          const lucideIconCount = visual ? visual.querySelectorAll("svg.lucide-icon").length : 0;
          const markerSuffix = ["b", "a", "d", "g", "e"].join("");
          const legacyMarkerClasses = ["visual", "key", "lane", "proof", "flow"].map((prefix) => prefix + "-" + markerSuffix);
          const legacyMarkerCount = visual ? Array.from(visual.querySelectorAll("*"))
            .filter((node) => Array.from(node.classList || []).some((name) => legacyMarkerClasses.includes(name)))
            .length : 0;
          const nonLucideSvgCount = visual ? visual.querySelectorAll("svg:not(.lucide-icon)").length : 0;
          const intersects = (a, b) => a && b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
          const overlapArea = (a, b) => {
            if (!intersects(a, b)) {
              return 0;
            }
            const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
            const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
            return Math.max(0, width) * Math.max(0, height);
          };
          const labelFor = (element) => {
            const className = typeof element.className === "string" && element.className.trim()
              ? "." + element.className.trim().split(/\\s+/).slice(0, 3).join(".")
              : element.tagName.toLowerCase();
            const text = element.textContent.trim().replace(/\\s+/g, " ").slice(0, 36);
            return text ? className + ": " + text : className;
          };
          const moduleNodes = visual ? Array.from(visual.querySelectorAll(".visual-module, [data-visual-module]")) : [];
          const visualModuleOverlaps = [];
          const visualModuleClipping = [];
          for (let i = 0; i < moduleNodes.length; i += 1) {
            const rect = moduleNodes[i].getBoundingClientRect();
            const tolerance = 2;
            if (
              visualRect
              && (
                rect.left < visualRect.left - tolerance
                || rect.right > visualRect.right + tolerance
                || rect.top < visualRect.top - tolerance
                || rect.bottom > visualRect.bottom + tolerance
              )
            ) {
              visualModuleClipping.push({
                module: labelFor(moduleNodes[i]),
                bounds: {
                  left: Math.round(rect.left - visualRect.left),
                  right: Math.round(rect.right - visualRect.right),
                  top: Math.round(rect.top - visualRect.top),
                  bottom: Math.round(rect.bottom - visualRect.bottom)
                }
              });
            }
            for (let j = i + 1; j < moduleNodes.length; j += 1) {
              const first = moduleNodes[i].getBoundingClientRect();
              const second = moduleNodes[j].getBoundingClientRect();
              const area = overlapArea(first, second);
              if (area > 24) {
                visualModuleOverlaps.push({
                  first: labelFor(moduleNodes[i]),
                  second: labelFor(moduleNodes[j]),
                  area: Math.round(area)
                });
              }
            }
          }
          const copyVisualOverlap = copyRect && visualRect
            ? intersects(copyRect, visualRect)
            : false;
          const navSlideOverlap = slideRect ? navRects.some((navRect) => intersects(navRect, slideRect)) : false;
          return {
            hasHeading: Boolean(h1 && h1.textContent.trim()),
            hasSubtitle: Boolean(subtitle && subtitle.textContent.trim()),
            headingFontSize: h1Style ? Number.parseFloat(h1Style.fontSize) : 0,
            headingWrap,
            visualChildren,
            visualLabelCount,
            semanticVisualModules,
            visualAreaRatio,
            lucideIconCount,
            legacyMarkerCount,
            nonLucideSvgCount,
            copyVisualOverlap,
            visualModuleOverlaps,
            visualModuleClipping,
            visualFormHealth,
            navSlideOverlap,
            animations: animationDetails.length,
            animationDetails,
            contrastFailures,
            koreanWrapFailures,
            compactLabelWrapFailures,
            darkFillFailures,
            visualForm: {
              declared: ${JSON.stringify(slide.visualForm || "")},
              requiredSelectors,
              missingSelectors: missingVisualFormSelectors
            },
            motionPlanReport
          };
        })()
      `);
      const animationTargets = new Set(
        (slideReport.animationDetails || [])
          .map((item) => item.targetClass)
          .filter(Boolean)
      );
      const staggeredDelays = new Set(
        (slideReport.animationDetails || [])
          .map((item) => Math.round(Number(item.delay || 0)))
          .filter((delay) => delay > 0)
      );
      const maxDurationMs = (slideReport.animationDetails || []).reduce((max, item) => {
        return Math.max(max, Number(item.duration || 0));
      }, 0);
      const maxDelayMs = (slideReport.animationDetails || []).reduce((max, item) => {
        return Math.max(max, Number(item.delay || 0));
      }, 0);
      const maxSettleMs = (slideReport.animationDetails || []).reduce((max, item) => {
        const settleMs = animationSettleMs(item);
        return Number.isFinite(settleMs) ? Math.max(max, settleMs) : Infinity;
      }, 0);
      const infiniteAnimations = (slideReport.animationDetails || []).filter((item) => item.iterations === "Infinity").length;
      const isAnimatedSlide = slide.motionDecision?.mode === "animated" || Boolean(slide.motion);
      const visualScore = scoreVisual(slideReport);
      visualScores.push({
        slide: slide.id,
        score: visualScore.score,
        deductions: visualScore.deductions,
        measuredEvidence: {
          visualChildren: slideReport.visualChildren,
          visualLabelCount: slideReport.visualLabelCount,
          semanticVisualModules: slideReport.semanticVisualModules,
          visualAreaRatio: slideReport.visualAreaRatio,
          lucideIconCount: slideReport.lucideIconCount,
          legacyMarkerCount: slideReport.legacyMarkerCount,
          nonLucideSvgCount: slideReport.nonLucideSvgCount,
          darkFillFailures: slideReport.darkFillFailures,
          compactLabelWrapFailures: slideReport.compactLabelWrapFailures
        }
      });

      if (isAnimatedSlide) {
        motionObservations.push({
          slide: slide.id,
          animations: slideReport.animations,
          animatedTargets: animationTargets.size,
          staggeredDelays: staggeredDelays.size,
          maxDelayMs: Number.isFinite(maxDelayMs) ? Math.round(maxDelayMs) : maxDelayMs,
          maxDurationMs: Number.isFinite(maxDurationMs) ? Math.round(maxDurationMs) : maxDurationMs,
          maxSettleMs: Number.isFinite(maxSettleMs) ? Math.round(maxSettleMs) : maxSettleMs,
          screenshotDelayMs: settledDelayMs,
          infiniteAnimations
        });
      }

      if (slideReport.contrastFailures.length > 0) {
        issues.push({
          slide: slide.id,
          problem: "text contrast is below readable threshold",
          measuredEvidence: {
            failures: slideReport.contrastFailures
          },
          feedback: "Adjust rendered foreground and background colors so normal text reaches 4.5:1 contrast and large or bold text reaches 3:1."
        });
      }

      if (slideReport.koreanWrapFailures.length > 0) {
        issues.push({
          slide: slide.id,
          problem: "text wraps into unreadable narrow columns",
          measuredEvidence: {
            failures: slideReport.koreanWrapFailures
          },
          feedback: "Widen Korean text containers, use word-break: keep-all for prose and labels, and avoid one-character vertical wrapping."
        });
      }

      if (slideReport.compactLabelWrapFailures.length > 0) {
        issues.push({
          slide: slide.id,
          problem: "compact visual labels wrap into broken fragments",
          measuredEvidence: {
            failures: slideReport.compactLabelWrapFailures
          },
          feedback: "Widen compact badges, reduce the label text, or use an icon/short code so labels do not split inside fixed-format visual elements."
        });
      }

      if (slideReport.darkFillFailures.length > 0) {
        issues.push({
          slide: slide.id,
          problem: "large near-black fill is off-tone for the deck style",
          measuredEvidence: {
            failures: slideReport.darkFillFailures
          },
          feedback: "Replace pure-black or near-black filled modules with warm charcoal, blue-charcoal, paper, or cream surfaces unless the source requires a literal black object."
        });
      }

      if (!slideReport.hasHeading || !slideReport.hasSubtitle) {
        issues.push({
          slide: slide.id,
          problem: "heading or subtitle is missing",
          measuredEvidence: {
            hasHeading: slideReport.hasHeading,
            hasSubtitle: slideReport.hasSubtitle
          },
          feedback: "Regenerate the slide with one clear visible message and concise supporting copy."
        });
      }

      if (slideReport.headingFontSize < 36) {
        issues.push({
          slide: slide.id,
          problem: "heading hierarchy is too weak for a presentation slide",
          measuredEvidence: {
            headingFontSize: slideReport.headingFontSize
          },
          feedback: "Increase slide-level heading scale while keeping mobile overflow checks passing."
        });
      }

      if (slideReport.headingWrap.overwrapped) {
        issues.push({
          slide: slide.id,
          problem: "heading wraps too aggressively",
          measuredEvidence: slideReport.headingWrap,
          feedback: "Shorten the heading or adjust layout so compact Korean content-slide headings do not split into three or more heavy lines."
        });
      }

      if (slideReport.visualChildren < 3 || slideReport.visualAreaRatio < 0.08) {
        issues.push({
          slide: slide.id,
          problem: "visual appears too sparse or placeholder-like",
          measuredEvidence: {
            visualChildren: slideReport.visualChildren,
            visualAreaRatio: slideReport.visualAreaRatio
          },
          feedback: "Regenerate a meaningful CSS information graphic with labels, hierarchy, and slide-specific structure."
        });
      }

      if (slideReport.visualForm.missingSelectors.length > 0) {
        issues.push({
          slide: slide.id,
          problem: "visual form does not match declared structure",
          measuredEvidence: slideReport.visualForm,
          feedback: "Regenerate the slide visual so its rendered HTML contains the required selectors for the declared visualForm."
        });
      }

      if (slideReport.legacyMarkerCount > 0) {
        issues.push({
          slide: slide.id,
          problem: "legacy placeholder markers remain in deck visual output",
          measuredEvidence: {
            legacyMarkerCount: slideReport.legacyMarkerCount
          },
          feedback: "Replace legacy marker placeholders with Lucide icons inside HTML/CSS modules, or use locally rendered bitmap assets for full scenes."
        });
      }

      if (slideReport.nonLucideSvgCount > 0) {
        issues.push({
          slide: slide.id,
          problem: "custom drawing svg remains in deck visual output",
          measuredEvidence: {
            nonLucideSvgCount: slideReport.nonLucideSvgCount
          },
          feedback: "Use Lucide icons for common objects and actions; keep the rest of the visual as HTML/CSS cards, rails, labels, and local raster images when needed."
        });
      }

      if (visualScore.score < VISUAL_SCORE_PASS) {
        issues.push({
          slide: slide.id,
          problem: "visual rubric score is below presentation-ready threshold",
          measuredEvidence: {
            score: visualScore.score,
            passThreshold: VISUAL_SCORE_PASS,
            deductions: visualScore.deductions
          },
          feedback: "Repair the slide visual using reusable HTML/CSS components, readable labels, and allowed visual primitives before accepting screenshot quality."
        });
      }

      if (slideReport.visualChildren > 0 && slideReport.semanticVisualModules < 2) {
        issues.push({
          slide: slide.id,
          problem: "visual lacks reusable semantic modules",
          measuredEvidence: {
            visualChildren: slideReport.visualChildren,
            semanticVisualModules: slideReport.semanticVisualModules
          },
          feedback: "Use recognized reusable visual modules or extend the semantic module registry before accepting a deck visual."
        });
      }

      if (slideReport.copyVisualOverlap) {
        issues.push({
          slide: slide.id,
          problem: "copy and visual bounding boxes overlap",
          measuredEvidence: {
            copyVisualOverlap: slideReport.copyVisualOverlap
          },
          feedback: "Adjust layout, scale, or responsive stacking so text and visuals have independent space."
        });
      }

      if (slideReport.visualModuleOverlaps.length > 0) {
        issues.push({
          slide: slide.id,
          problem: "semantic visual modules overlap",
          measuredEvidence: {
            overlaps: slideReport.visualModuleOverlaps
          },
          feedback: "Repair the visual layout so semantic modules have independent space and do not sit on top of each other."
        });
      }

      if (slideReport.visualFormHealth.issues.length > 0) {
        issues.push({
          slide: slide.id,
          problem: "visual form geometry is weak",
          measuredEvidence: slideReport.visualFormHealth,
          feedback: "Repair the declared visual form so the rendered geometry communicates the promised structure, not just selector presence."
        });
      }

      if (slideReport.visualModuleClipping.length > 0) {
        issues.push({
          slide: slide.id,
          problem: "semantic visual modules are clipped",
          measuredEvidence: {
            clipped: slideReport.visualModuleClipping
          },
          feedback: "Keep every semantic visual module inside the visual safe area so labels and cards are not cropped."
        });
      }

      if (slideReport.navSlideOverlap) {
        issues.push({
          slide: slide.id,
          problem: "deck navigation overlaps the active slide",
          measuredEvidence: {
            navSlideOverlap: slideReport.navSlideOverlap,
            viewport: "desktop"
          },
          feedback: "Move navigation controls outside the slide rect or reserve enough layout space so controls never cover slide content."
        });
      }

      if (isAnimatedSlide && !slideReport.motionPlanReport) {
        issues.push({
          slide: slide.id,
          problem: "motion plan does not match rendered animation",
          measuredEvidence: {
            motionPlan: null,
            motionDecision: slide.motionDecision || null
          },
          feedback: "Add a motionPlan with concrete target selectors, mustNotAnimate selectors, and reduced-motion behavior for every animated slide."
        });
      }

      if (isAnimatedSlide && slideReport.motionPlanReport) {
        const missingTargets = slideReport.motionPlanReport.targets.filter((target) => !target.exists);
        const unanimatedTargets = slideReport.motionPlanReport.targets.filter((target) => target.exists && !target.hasActiveAnimation);
        const animatedForbiddenTargets = slideReport.motionPlanReport.mustNotAnimate.filter((target) => target.hasActiveAnimation);
        const tooFewActiveTargets = slideReport.motionPlanReport.activeTargetSelectors < 3
          && !slideReport.motionPlanReport.fewerTargetReason;

        if (
          missingTargets.length > 0
          || unanimatedTargets.length > 0
          || animatedForbiddenTargets.length > 0
          || tooFewActiveTargets
          || !slideReport.motionPlanReport.delaysFollowDelayStep
        ) {
          issues.push({
            slide: slide.id,
            problem: "motion plan does not match rendered animation",
            measuredEvidence: {
              missingTargets,
              unanimatedTargets,
              animatedForbiddenTargets,
              activeTargetSelectors: slideReport.motionPlanReport.activeTargetSelectors,
              fewerTargetReason: slideReport.motionPlanReport.fewerTargetReason,
              delaysFollowDelayStep: slideReport.motionPlanReport.delaysFollowDelayStep
            },
            feedback: "Align rendered CSS animation with motionPlan targets, keep mustNotAnimate selectors static, and stagger target delays in delayStep order."
          });
        }
      }

      if (isAnimatedSlide && slideReport.animations === 0) {
        issues.push({
          slide: slide.id,
          problem: "motion is declared but no active animation was detected",
          measuredEvidence: {
            animations: slideReport.animations
          },
          feedback: "Regenerate the visual motion using finite transform/opacity keyframes and reduced-motion fallback."
        });
      }

      if (isAnimatedSlide && slideReport.animations > 0) {
        if (slideReport.animations < 3 || animationTargets.size < 3) {
          issues.push({
            slide: slide.id,
            problem: "motion quality is too thin for a declared motion slide",
            measuredEvidence: {
              animations: slideReport.animations,
              animatedTargets: animationTargets.size
            },
            feedback: "Use a restrained multi-element choreography where at least three small visual elements animate to explain the motion sequence."
          });
        }

        if (staggeredDelays.size < 2) {
          issues.push({
            slide: slide.id,
            problem: "motion lacks staggered sequence",
            measuredEvidence: {
              staggeredDelays: Array.from(staggeredDelays)
            },
            feedback: "Add staggered delays so the animation reads as ordered explanation, not a single decorative fade."
          });
        }

        if (infiniteAnimations > 0 || maxDurationMs > 1800) {
          issues.push({
            slide: slide.id,
            problem: "motion timing is not presentation-safe",
            measuredEvidence: {
              infiniteAnimations,
              maxDurationMs
            },
            feedback: "Keep motion finite, calm, and under 1800ms so it supports the slide without distracting from the speaker."
          });
        }
      }
    }

    await navigate(client, `${origin}/deck.html`, { width: 390, height: 844, mobile: true });
    await waitForExpression(client, "window.DECK_READY === true");
    for (let index = 0; index < spec.slides.length; index += 1) {
      const slide = spec.slides[index];
      await evaluate(client, `window.DECK_API.goTo(${index})`);
      const mobileAnimationDetails = await collectAnimationDetails(client);
      const mobileSettledDelayMs = chooseSettledScreenshotDelay(mobileAnimationDetails);
      await new Promise((resolve) => setTimeout(resolve, mobileSettledDelayMs));
      const mobilePath = path.join(screenshotDir, `${String(index + 1).padStart(2, "0")}-${slide.id}-mobile-settled-${mobileSettledDelayMs}ms.png`);
      await capturePng(client, mobilePath);
      screenshots.push(mobilePath);

      const mobileReport = await evaluate(client, `
        (() => {
          const active = document.querySelector(".deck-frame.is-active .slide");
          const slideRect = active?.getBoundingClientRect();
          const navRects = Array.from(document.querySelectorAll(".deck-nav")).map((node) => node.getBoundingClientRect());
          const intersects = (a, b) => a && b && !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
          return {
            navSlideOverlap: slideRect ? navRects.some((navRect) => intersects(navRect, slideRect)) : false
          };
        })()
      `);

      if (mobileReport.navSlideOverlap) {
        issues.push({
          slide: slide.id,
          problem: "deck navigation overlaps the active slide",
          measuredEvidence: {
            navSlideOverlap: mobileReport.navSlideOverlap,
            viewport: "mobile"
          },
          feedback: "Move mobile navigation into document flow below the slide or reserve enough safe area below every slide."
        });
      }
    }

    await navigate(client, `${origin}/presenter-review.html`, { width: 1280, height: 900, mobile: false });
    await waitForExpression(client, "window.PRESENTER_REVIEW_READY === true");
    const presenterPath = path.join(screenshotDir, "presenter-review-desktop.png");
    await capturePng(client, presenterPath);
    screenshots.push(presenterPath);

    const presenterReport = await evaluate(client, `
      ({
        cards: document.querySelectorAll(".review-card").length,
        scripts: Array.from(document.querySelectorAll(".presenter-script")).filter((node) => node.textContent.trim().length > 0).length
      })
    `);
    if (presenterReport.cards !== spec.slides.length || presenterReport.scripts !== spec.slides.length) {
      issues.push({
        slide: "presenter-review",
        problem: "presenter review does not show one script per slide",
        measuredEvidence: presenterReport,
        feedback: "Regenerate assets/slides.js or slide notes so every slide has presenter-review script coverage."
      });
    }

    client.close();
  } finally {
    fs.writeFileSync(rubricPath, `${JSON.stringify({
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      passThreshold: VISUAL_SCORE_PASS,
      averageScore: visualScores.length
        ? Math.round((visualScores.reduce((sum, item) => sum + item.score, 0) / visualScores.length) * 10) / 10
        : null,
      slides: visualScores
    }, null, 2)}\n`);
    fs.writeFileSync(reportPath, buildReport({ spec, screenshots, issues, motionObservations, visualScores }));
    fs.writeFileSync(remediationPlanPath, `${JSON.stringify(buildRemediationPlan({ spec, screenshots, issues, motionObservations, visualScores }), null, 2)}\n`);
    fs.writeFileSync(screenshotReviewPath, `${JSON.stringify(buildScreenshotReview({ spec, screenshots, issues, motionObservations, visualScores }), null, 2)}\n`);
    appendTrace(root, {
      event: "screenshot_review",
      status: issues.length ? "fail" : "pass",
      source: "visual-quality-gate.js",
      screenshots: screenshots.length,
      issues: issues.length
    });
    appendQualityCases(root, {
      deckTitle: spec.deckTitle || "HTML/CSS deck",
      issues,
      reportPath: path.relative(root, reportPath)
    });
    server.close();
    chrome.kill();
    await Promise.race([
      exitPromise,
      new Promise((resolve) => setTimeout(resolve, 1200))
    ]);
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }

  console.log(`PASS screenshots captured - ${screenshots.length} file(s)`);
  console.log(`PASS visual quality report - ${path.relative(root, reportPath)}`);
  console.log(`PASS remediation plan - ${path.relative(root, remediationPlanPath)}`);
  console.log(`PASS screenshot review artifact - ${path.relative(root, screenshotReviewPath)}`);

  if (issues.length) {
    console.error(`FAIL screenshot quality - ${issues.length} issue(s)`);
    issues.forEach((issue) => console.error(formatIssue(issue)));
    process.exitCode = 1;
  } else {
    console.log("PASS screenshot quality - no blocking visual issues");
  }
}

if (require.main === module) {
  runQualityGate().catch((error) => {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(reportPath, `# Visual Quality Report\n\nFAIL: ${error.message}\n`);
    appendTrace(root, {
      event: "screenshot_review",
      status: "fail",
      source: "visual-quality-gate.js",
      error: error.message
    });
    console.error(`FAIL screenshot quality - ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  SCREENSHOT_TIMING,
  animationSettleMs,
  chooseSettledScreenshotDelay,
  buildRemediationPlan,
  isWorkflowRemediationIssue
};
