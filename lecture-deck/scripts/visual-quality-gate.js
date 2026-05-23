#!/usr/bin/env node
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, ".deck-quality");
const screenshotDir = path.join(outputDir, "screenshots");
const reportPath = path.join(outputDir, "visual-quality-report.md");
const remediationPlanPath = path.join(outputDir, "quality-remediation-plan.json");

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

function formatIssue(issue) {
  return `- ${issue.slide || "deck"}: ${issue.problem} -> ${issue.feedback}`;
}

function buildReport({ spec, screenshots, issues }) {
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

function buildRemediationPlan({ spec, screenshots, issues }) {
  const relativeScreenshots = screenshots.map((file) => path.relative(root, file));
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
    issues,
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

function ensureOutputDirs() {
  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(screenshotDir, { recursive: true });
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

  try {
    const browserWs = await wsPromise;
    const pageWs = await createPage(browserWs, `${origin}/deck.html`);
    const client = await cdpClient(pageWs);

    await navigate(client, `${origin}/deck.html`, { width: 1366, height: 768, mobile: false });
    await waitForExpression(client, "window.DECK_READY === true");

    for (let index = 0; index < spec.slides.length; index += 1) {
      const slide = spec.slides[index];
      await evaluate(client, `window.DECK_API.goTo(${index})`);
      await new Promise((resolve) => setTimeout(resolve, 80));
      const earlyPath = path.join(screenshotDir, `${String(index + 1).padStart(2, "0")}-${slide.id}-desktop-000ms.png`);
      await capturePng(client, earlyPath);
      screenshots.push(earlyPath);

      await new Promise((resolve) => setTimeout(resolve, 820));
      const latePath = path.join(screenshotDir, `${String(index + 1).padStart(2, "0")}-${slide.id}-desktop-900ms.png`);
      await capturePng(client, latePath);
      screenshots.push(latePath);

      const slideReport = await evaluate(client, `
        (() => {
          const active = document.querySelector(".deck-frame.is-active .slide");
          const h1 = active?.querySelector("h1, h2");
          const subtitle = active?.querySelector(".subtitle");
          const visual = active?.querySelector(".visual");
          const visualChildren = visual ? Array.from(visual.querySelectorAll("*")).length : 0;
          const visualRect = visual?.getBoundingClientRect();
          const slideRect = active?.getBoundingClientRect();
          const copyRect = active?.querySelector(".copy")?.getBoundingClientRect();
          const h1Style = h1 ? getComputedStyle(h1) : null;
          const visualAreaRatio = visualRect && slideRect ? (visualRect.width * visualRect.height) / (slideRect.width * slideRect.height) : 0;
          const copyVisualOverlap = copyRect && visualRect
            ? !(copyRect.right <= visualRect.left || copyRect.left >= visualRect.right || copyRect.bottom <= visualRect.top || copyRect.top >= visualRect.bottom)
            : false;
          return {
            hasHeading: Boolean(h1 && h1.textContent.trim()),
            hasSubtitle: Boolean(subtitle && subtitle.textContent.trim()),
            headingFontSize: h1Style ? Number.parseFloat(h1Style.fontSize) : 0,
            visualChildren,
            visualAreaRatio,
            copyVisualOverlap,
            animations: active ? active.getAnimations({ subtree: true }).length : 0
          };
        })()
      `);

      if (!slideReport.hasHeading || !slideReport.hasSubtitle) {
        issues.push({
          slide: slide.id,
          problem: "heading or subtitle is missing",
          feedback: "Regenerate the slide with one clear visible message and concise supporting copy."
        });
      }

      if (slideReport.headingFontSize < 36) {
        issues.push({
          slide: slide.id,
          problem: "heading hierarchy is too weak for a presentation slide",
          feedback: "Increase slide-level heading scale while keeping mobile overflow checks passing."
        });
      }

      if (slideReport.visualChildren < 3 || slideReport.visualAreaRatio < 0.08) {
        issues.push({
          slide: slide.id,
          problem: "visual appears too sparse or placeholder-like",
          feedback: "Regenerate a meaningful CSS information graphic with labels, hierarchy, and slide-specific structure."
        });
      }

      if (slideReport.copyVisualOverlap) {
        issues.push({
          slide: slide.id,
          problem: "copy and visual bounding boxes overlap",
          feedback: "Adjust layout, scale, or responsive stacking so text and visuals have independent space."
        });
      }

      if (slide.motion && slideReport.animations === 0) {
        issues.push({
          slide: slide.id,
          problem: "motion is declared but no active animation was detected",
          feedback: "Regenerate the visual motion using finite transform/opacity keyframes and reduced-motion fallback."
        });
      }
    }

    await navigate(client, `${origin}/deck.html`, { width: 390, height: 844, mobile: true });
    await waitForExpression(client, "window.DECK_READY === true");
    for (const index of [0, 3, 4, 7].filter((item) => item < spec.slides.length)) {
      const slide = spec.slides[index];
      await evaluate(client, `window.DECK_API.goTo(${index})`);
      await new Promise((resolve) => setTimeout(resolve, 160));
      const mobilePath = path.join(screenshotDir, `${String(index + 1).padStart(2, "0")}-${slide.id}-mobile.png`);
      await capturePng(client, mobilePath);
      screenshots.push(mobilePath);
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
        feedback: "Regenerate assets/slides.js or slide notes so every slide has presenter-review script coverage."
      });
    }

    client.close();
  } finally {
    fs.writeFileSync(reportPath, buildReport({ spec, screenshots, issues }));
    fs.writeFileSync(remediationPlanPath, `${JSON.stringify(buildRemediationPlan({ spec, screenshots, issues }), null, 2)}\n`);
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

  if (issues.length) {
    console.error(`FAIL screenshot quality - ${issues.length} issue(s)`);
    issues.forEach((issue) => console.error(formatIssue(issue)));
    process.exitCode = 1;
  } else {
    console.log("PASS screenshot quality - no blocking visual issues");
  }
}

runQualityGate().catch((error) => {
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(reportPath, `# Visual Quality Report\n\nFAIL: ${error.message}\n`);
  console.error(`FAIL screenshot quality - ${error.message}`);
  process.exitCode = 1;
});
