#!/usr/bin/env node
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const results = [];
const KEYFRAME_ALLOWED_PROPERTIES = new Set(["opacity", "transform"]);
const MOTION_SPEC_REQUIRED_FIELDS = ["type", "mood", "sequence", "loop", "reducedMotion"];
const modeArg = process.argv.find((arg) => arg.startsWith("--mode="));
const mode = modeArg ? modeArg.slice("--mode=".length) : "all";
const validModes = new Set(["all", "harness", "render"]);

function pass(name, detail = "") {
  results.push({ ok: true, name, detail });
}

function fail(name, detail) {
  results.push({ ok: false, name, detail });
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function getSpec() {
  if (!fileExists("slide-spec.json")) {
    throw new Error("slide-spec.json is missing; create source.md first, then propose and approve slide-spec.json");
  }
  const spec = JSON.parse(readText("slide-spec.json"));
  if (!Array.isArray(spec.slides) || spec.slides.length === 0) {
    throw new Error("slide-spec.json must include a non-empty slides array");
  }
  return spec;
}

function extractLocalReferences(relativePath, text) {
  const references = [];
  const attrPattern = /\b(?:href|src)=["']([^"']+)["']/g;
  const cssPattern = /url\(["']?([^"')]+)["']?\)/g;

  for (const pattern of [attrPattern, cssPattern]) {
    let match;
    while ((match = pattern.exec(text))) {
      const value = match[1].trim();
      if (!value || value.startsWith("#") || /^(https?:|mailto:|tel:|data:|javascript:)/.test(value)) {
        continue;
      }
      references.push({
        from: relativePath,
        target: value.split("#")[0].split("?")[0]
      });
    }
  }

  return references;
}

function walkFiles(dir) {
  const entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relativePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walkFiles(relativePath);
    }
    return relativePath;
  });
}

function removeCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function extractKeyframeBlocks(css) {
  const blocks = [];
  const pattern = /@keyframes\s+([a-zA-Z0-9_-]+)\s*\{/g;
  let match;

  while ((match = pattern.exec(css))) {
    const name = match[1];
    let index = pattern.lastIndex;
    let depth = 1;

    while (index < css.length && depth > 0) {
      const char = css[index];
      if (char === "{") {
        depth += 1;
      } else if (char === "}") {
        depth -= 1;
      }
      index += 1;
    }

    if (depth === 0) {
      blocks.push({
        name,
        content: css.slice(pattern.lastIndex, index - 1)
      });
    }

    pattern.lastIndex = index;
  }

  return blocks;
}

function runStaticChecks(spec) {
  const files = [
    "source.md",
    "design.md",
    "slide-spec.json",
    "CLAUDE.md",
    "few-shots.md",
    "HANDOFF.md",
    "skills/deck-builder/SKILL.md",
    "agents/researcher.md",
    "agents/slide-reviewer.md",
    "agents/visual-reviewer.md",
    "hooks/verify-deck.json",
    "hooks/harness-check.json",
    "hooks/render-check.json",
    "scripts/verify-deck.js",
    "evaluation-template.md",
    "deck.html",
    "presenter-review.html",
    "assets/style.css",
    "assets/visuals.css",
    "assets/slides.js",
    "assets/deck.js",
    "assets/presenter-review.js",
    ...spec.slides.map((slide) => slide.file)
  ];

  const missing = files.filter((file) => !fileExists(file));
  if (missing.length) {
    fail("missing files", missing.join(", "));
  } else {
    pass("missing files", `${files.length} required files found`);
  }

  pass("slide count", `${spec.slides.length} slides in slide-spec.json`);

  const invalidSlides = spec.slides.filter((slide) => {
    return !slide.id || !slide.file || !slide.title || !slide.message || !slide.visual || !slide.speakerNote || !Array.isArray(slide.evidence);
  });

  if (invalidSlides.length) {
    fail("slide spec shape", invalidSlides.map((slide) => slide.id || slide.file || "unknown").join(", "));
  } else {
    pass("slide spec shape", `${spec.slides.length} slides`);
  }

  const allHtmlAndCss = walkFiles(".").filter((file) => /\.(html|css)$/.test(file));
  const brokenLinks = [];

  allHtmlAndCss.forEach((file) => {
    const text = readText(file);
    extractLocalReferences(file, text).forEach((reference) => {
      const targetPath = path.normalize(path.join(path.dirname(reference.from), reference.target));
      if (!fileExists(targetPath)) {
        brokenLinks.push(`${reference.from} -> ${reference.target}`);
      }
    });
  });

  if (brokenLinks.length) {
    fail("broken links", brokenLinks.join("; "));
  } else {
    pass("broken links", "0 broken local references");
  }
}

function runAnimationSafetyChecks(spec) {
  const cssFiles = walkFiles("assets").filter((file) => file.endsWith(".css"));
  const cssBundle = cssFiles.map((file) => {
    return { file, css: removeCssComments(readText(file)) };
  });
  const keyframeIssues = [];
  const infiniteIssues = [];
  let keyframeCount = 0;

  cssBundle.forEach(({ file, css }) => {
    const blocks = extractKeyframeBlocks(css);
    keyframeCount += blocks.length;

    blocks.forEach((block) => {
      const declarations = [...block.content.matchAll(/(^|[;{\s])([a-zA-Z-]+)\s*:/g)]
        .map((declaration) => declaration[2])
        .filter((property) => property && !property.startsWith("--"));
      const invalid = declarations.filter((property) => !KEYFRAME_ALLOWED_PROPERTIES.has(property));
      if (invalid.length) {
        keyframeIssues.push(`${file} @keyframes ${block.name}: ${[...new Set(invalid)].join(", ")}`);
      }
    });

    const animationDeclarations = [...css.matchAll(/(^|[;{\s])(animation(?:-iteration-count)?)\s*:\s*([^;}]+)/g)];
    animationDeclarations.forEach((declaration) => {
      const property = declaration[2];
      const value = declaration[3].trim();
      if (/\binfinite\b/.test(value)) {
        infiniteIssues.push(`${file} ${property}: ${value}`);
      }
    });
  });

  if (keyframeIssues.length) {
    fail("animation keyframe safety", keyframeIssues.join("; "));
  } else {
    pass("animation keyframe safety", `${keyframeCount} keyframe block(s) use transform/opacity only`);
  }

  if (keyframeCount > 0 && !cssBundle.some(({ css }) => /prefers-reduced-motion\s*:\s*reduce/.test(css))) {
    fail("reduced motion fallback", "CSS animations exist but no prefers-reduced-motion: reduce block was found");
  } else {
    pass("reduced motion fallback", keyframeCount > 0 ? "fallback found" : "no keyframes");
  }

  if (infiniteIssues.length) {
    fail("finite animation policy", infiniteIssues.join("; "));
  } else {
    pass("finite animation policy", "no infinite animation declarations");
  }

  const motionSlides = spec.slides.filter((slide) => slide.motion);
  const invalidMotionSpecs = motionSlides.filter((slide) => {
    return MOTION_SPEC_REQUIRED_FIELDS.some((field) => {
      if (field === "sequence") {
        return !Array.isArray(slide.motion.sequence) || slide.motion.sequence.length === 0;
      }
      return typeof slide.motion[field] !== "string" || slide.motion[field].trim().length === 0;
    });
  });

  if (invalidMotionSpecs.length) {
    fail("motion spec shape", invalidMotionSpecs.map((slide) => slide.id).join(", "));
  } else {
    pass("motion spec shape", `${motionSlides.length} slide(s) with structured motion`);
  }
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
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

function launchChrome(chromePath) {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "deck-verify-"));
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
      const text = chunk.toString();
      const match = text.match(/DevTools listening on (ws:\/\/[^\s]+)/);
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

async function runBrowserChecks(spec) {
  const chromePath = findChrome();
  if (!chromePath) {
    fail("browser runtime", "Chrome, Chromium, or Edge was not found");
    return;
  }

  const { server, origin } = await serveStatic();
  const { chrome, userDataDir, wsPromise, exitPromise } = launchChrome(chromePath);

  try {
    const browserWs = await wsPromise;
    const pageWs = await createPage(browserWs, `${origin}/deck.html`);
    const client = await cdpClient(pageWs);

    const viewports = [
      { name: "desktop overflow", width: 1366, height: 768, mobile: false },
      { name: "mobile overflow", width: 390, height: 844, mobile: true }
    ];
    let deckNoteCount = 0;

    for (const viewport of viewports) {
      await navigate(client, `${origin}/deck.html`, viewport);
      await waitForExpression(client, "window.DECK_READY === true");
      const report = await evaluate(client, `
        (async () => {
          const issues = [];
          const tolerance = 3;
          const slides = window.DECK_API.getSlides();
          for (let index = 0; index < slides.length; index += 1) {
            window.DECK_API.goTo(index);
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const active = document.querySelector(".deck-frame.is-active .slide");
            const elements = [active, ...active.querySelectorAll("*")];
            elements.forEach((element) => {
              if (element.scrollWidth > element.clientWidth + tolerance || element.scrollHeight > element.clientHeight + tolerance) {
                issues.push({
                  slide: slides[index].id,
                  tag: element.tagName.toLowerCase(),
                  className: element.className || "",
                  scrollWidth: element.scrollWidth,
                  clientWidth: element.clientWidth,
                  scrollHeight: element.scrollHeight,
                  clientHeight: element.clientHeight
                });
              }
            });
          }
          return {
            slideCount: slides.length,
            noteCount: document.querySelectorAll("#deck .note").length,
            activeCount: document.querySelectorAll(".deck-frame.is-active").length,
            issues
          };
        })()
      `);

      if (report.slideCount !== spec.slides.length) {
        fail(`${viewport.name} slide count`, `rendered ${report.slideCount} of ${spec.slides.length} slides`);
      } else {
        pass(`${viewport.name} slide count`, `${report.slideCount} slides rendered`);
      }

      if (report.issues.length) {
        fail(viewport.name, JSON.stringify(report.issues.slice(0, 5)));
      } else {
        pass(viewport.name, `${report.slideCount} slides checked`);
      }

      deckNoteCount = Math.max(deckNoteCount, report.noteCount);
    }

    if (deckNoteCount > 0) {
      fail("deck note exposure", `${deckNoteCount} .note elements visible in deck`);
    } else {
      pass("deck note exposure", "0 .note elements in deck");
    }

    const motionSlides = spec.slides
      .map((slide, index) => ({ id: slide.id, index, hasMotion: Boolean(slide.motion) }))
      .filter((slide) => slide.hasMotion);

    if (motionSlides.length > 0) {
      await client.send("Emulation.setEmulatedMedia", { features: [] });
      await navigate(client, `${origin}/deck.html`, { width: 1366, height: 768, mobile: false });
      await waitForExpression(client, "window.DECK_READY === true");
      const animationReport = await evaluate(client, `
        (async () => {
          const slides = ${JSON.stringify(motionSlides)};
          const issues = [];
          for (const slide of slides) {
            window.DECK_API.goTo(slide.index);
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const active = document.querySelector(".deck-frame.is-active .slide");
            if (!active) {
              issues.push(slide.id + ": no active slide");
              continue;
            }
            const animations = active.getAnimations({ subtree: true });
            if (animations.length === 0) {
              issues.push(slide.id);
            }
          }
          return issues;
        })()
      `);

      if (animationReport.length) {
        fail("motion runtime", `no active animation detected: ${animationReport.join(", ")}`);
      } else {
        pass("motion runtime", `${motionSlides.length} motion slide(s) detected`);
      }

      await client.send("Emulation.setEmulatedMedia", {
        features: [{ name: "prefers-reduced-motion", value: "reduce" }]
      });
      await navigate(client, `${origin}/deck.html`, { width: 1366, height: 768, mobile: false });
      await waitForExpression(client, "window.DECK_READY === true");
      const reducedReport = await evaluate(client, `
        (async () => {
          const slides = ${JSON.stringify(motionSlides)};
          const issues = [];
          for (const slide of slides) {
            window.DECK_API.goTo(slide.index);
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const active = document.querySelector(".deck-frame.is-active .slide");
            if (!active) {
              issues.push({ id: slide.id, count: "no active slide" });
              continue;
            }
            const animations = active.getAnimations({ subtree: true })
              .filter((animation) => animation.playState !== "finished");
            if (animations.length > 0) {
              issues.push({ id: slide.id, count: animations.length });
            }
          }
          return issues;
        })()
      `);

      if (reducedReport.length) {
        fail("reduced motion runtime", JSON.stringify(reducedReport));
      } else {
        pass("reduced motion runtime", `${motionSlides.length} motion slide(s) static`);
      }

      await client.send("Emulation.setEmulatedMedia", { features: [] });
    } else {
      pass("motion runtime", "no motion slides declared");
      pass("reduced motion runtime", "no motion slides declared");
    }

    await navigate(client, `${origin}/presenter-review.html`, { width: 1280, height: 900, mobile: false });
    await waitForExpression(client, "window.PRESENTER_REVIEW_READY === true");
    const presenterReport = await evaluate(client, `
      ({
        cards: document.querySelectorAll(".review-card").length,
        scripts: Array.from(document.querySelectorAll(".presenter-script")).filter((node) => node.textContent.trim().length > 0).length
      })
    `);

    if (presenterReport.cards === spec.slides.length && presenterReport.scripts === spec.slides.length) {
      pass("presenter script", `${presenterReport.scripts} scripts visible`);
    } else {
      fail("presenter script", JSON.stringify(presenterReport));
    }

    client.close();
  } catch (error) {
    fail("browser checks", error.message);
  } finally {
    server.close();
    chrome.kill();
    await Promise.race([
      exitPromise,
      new Promise((resolve) => setTimeout(resolve, 1200))
    ]);
    fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

async function main() {
  let spec;
  try {
    if (!validModes.has(mode)) {
      throw new Error(`Unknown verify mode: ${mode}`);
    }
    spec = getSpec();
    if (mode === "all" || mode === "harness") {
      runStaticChecks(spec);
      runAnimationSafetyChecks(spec);
    }
    if (mode === "all" || mode === "render") {
      await runBrowserChecks(spec);
    }
  } catch (error) {
    fail("verify-deck", error.message);
  }

  results.forEach((result) => {
    const prefix = result.ok ? "PASS" : "FAIL";
    console.log(`${prefix} ${result.name}${result.detail ? ` - ${result.detail}` : ""}`);
  });

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

main();
