const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { analyzeDeckState, shouldSkipFinalGate } = require("./deck-loop-state");
const deckSourceRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(__dirname, "../..");

function makeDeckRoot(files = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "deck-loop-state-"));
  fs.mkdirSync(path.join(root, "slides"), { recursive: true });
  fs.mkdirSync(path.join(root, "assets"), { recursive: true });

  Object.entries(files).forEach(([relativePath, content]) => {
    const filePath = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
  });

  return root;
}

function spec(slides) {
  return JSON.stringify({ slides }, null, 2);
}

function copyContractGateFiles(root) {
  [
    "current-run.json",
    "tool-policy.json",
    "agent-handoff.schema.json"
  ].forEach((file) => {
    fs.copyFileSync(path.join(deckSourceRoot, file), path.join(root, file));
  });
  fs.mkdirSync(path.join(root, "hooks"), { recursive: true });
  fs.copyFileSync(
    path.join(deckSourceRoot, "hooks/agent-contract-check.json"),
    path.join(root, "hooks/agent-contract-check.json")
  );
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  [
    "deck-loop-state.js",
    "verify-agent-contracts.js",
    "workflow-trace.js"
  ].forEach((file) => {
    fs.copyFileSync(path.join(deckSourceRoot, "scripts", file), path.join(root, "scripts", file));
  });
}

test("classifies an uninitialized deck without treating it as a final gate failure", () => {
  const root = makeDeckRoot();
  const state = analyzeDeckState(root);

  assert.equal(state.status, "uninitialized");
  assert.equal(state.readyForFinalGate, false);
  assert.equal(shouldSkipFinalGate(state), true);
  assert.deepEqual(state.missingInputs, ["source.md", "slide-spec.json"]);
});

test("classifies a spec-ready deck when approved spec exists but slide output is missing", () => {
  const root = makeDeckRoot({
    "source.md": "# Source",
    "slide-spec.json": spec([
      {
        id: "01-intro",
        file: "slides/01-intro.html",
        title: "Intro",
        message: "One message",
        visual: "Diagram",
        speakerNote: "Presenter note",
        evidence: ["source.md"]
      }
    ])
  });
  const state = analyzeDeckState(root);

  assert.equal(state.status, "spec-ready");
  assert.equal(state.readyForFinalGate, false);
  assert.equal(shouldSkipFinalGate(state), true);
  assert.deepEqual(state.missingSlideFiles, ["slides/01-intro.html"]);
});

test("classifies output-ready before handoff exists", () => {
  const root = makeDeckRoot({
    "source.md": "# Source",
    "slide-spec.json": spec([
      {
        id: "01-intro",
        file: "slides/01-intro.html",
        title: "Intro",
        message: "One message",
        visual: "Diagram",
        speakerNote: "Presenter note",
        evidence: ["source.md"]
      }
    ]),
    "slides/01-intro.html": "<section class=\"slide\"><h1>Intro</h1></section>"
  });
  const state = analyzeDeckState(root);

  assert.equal(state.status, "output-ready");
  assert.equal(state.readyForFinalGate, false);
  assert.equal(shouldSkipFinalGate(state), true);
});

test("classifies handoff-ready when source, spec, slides, and handoff exist", () => {
  const root = makeDeckRoot({
    "source.md": "# Source",
    "HANDOFF.md": "# Handoff",
    "slide-spec.json": spec([
      {
        id: "01-intro",
        file: "slides/01-intro.html",
        title: "Intro",
        message: "One message",
        visual: "Diagram",
        speakerNote: "Presenter note",
        evidence: ["source.md"]
      }
    ]),
    "slides/01-intro.html": "<section class=\"slide\"><h1>Intro</h1></section>"
  });
  const state = analyzeDeckState(root);

  assert.equal(state.status, "handoff-ready");
  assert.equal(state.readyForFinalGate, true);
  assert.equal(shouldSkipFinalGate(state), false);
});

test("run-hook skips final gates before deck output is ready", () => {
  const root = makeDeckRoot();
  const result = spawnSync(process.execPath, ["lecture-deck/scripts/run-hook.js", "pre-handoff"], {
    cwd: path.resolve(__dirname, "../.."),
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: root
    }
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /SKIP final gate/);
  assert.match(result.stdout, /uninitialized/);
});

test("deck-loop reports next action for an uninitialized deck", () => {
  const root = makeDeckRoot();
  copyContractGateFiles(root);
  const result = spawnSync(process.execPath, ["lecture-deck/scripts/run-hook.js", "deck-loop"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: root,
      REPO_ROOT: repoRoot
    }
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /deck-loop: state uninitialized/);
  assert.match(result.stdout, /next action create source\.md and slide-spec\.json/);
});

test("deck-loop keeps harness improvement loop separate from normal final gates", () => {
  const root = makeDeckRoot({
    "source.md": "# Source",
    "HANDOFF.md": "# Handoff",
    "slide-spec.json": spec([
      {
        id: "01-intro",
        file: "slides/01-intro.html",
        title: "Intro",
        message: "One message",
        visual: "Diagram",
        speakerNote: "Presenter note",
        evidence: ["source.md"]
      }
    ]),
    "slides/01-intro.html": "<section class=\"slide\"><h1>Intro</h1></section>",
    "hooks/pre.json": JSON.stringify({
      name: "pre",
      events: ["pre-handoff"],
      command: "node -e \"console.log('pre-ok')\""
    }),
    "hooks/stop.json": JSON.stringify({
      name: "stop",
      events: ["stop-quality"],
      command: "node -e \"console.log('stop-ok')\""
    }),
    "hooks/quality.json": JSON.stringify({
      name: "quality",
      events: ["quality-loop"],
      command: "node -e \"console.log('quality-ok')\""
    })
  });
  const result = spawnSync(process.execPath, ["lecture-deck/scripts/run-hook.js", "deck-loop"], {
    cwd: path.resolve(__dirname, "../.."),
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: root
    }
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /pre-ok/);
  assert.match(result.stdout, /stop-ok/);
  assert.doesNotMatch(result.stdout, /quality-ok/);
});

test("quality-loop can be run explicitly for harness improvement checks", () => {
  const root = makeDeckRoot({
    "source.md": "# Source",
    "HANDOFF.md": "# Handoff",
    "slide-spec.json": spec([
      {
        id: "01-intro",
        file: "slides/01-intro.html",
        title: "Intro",
        message: "One message",
        visual: "Diagram",
        speakerNote: "Presenter note",
        evidence: ["source.md"]
      }
    ]),
    "slides/01-intro.html": "<section class=\"slide\"><h1>Intro</h1></section>",
    "hooks/quality.json": JSON.stringify({
      name: "quality",
      events: ["quality-loop"],
      command: "node -e \"console.log('quality-ok')\""
    })
  });
  const result = spawnSync(process.execPath, ["lecture-deck/scripts/run-hook.js", "quality-loop"], {
    cwd: path.resolve(__dirname, "../.."),
    encoding: "utf8",
    env: {
      ...process.env,
      DECK_ROOT: root
    }
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /quality-ok/);
});
