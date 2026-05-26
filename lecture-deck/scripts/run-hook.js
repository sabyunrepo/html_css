#!/usr/bin/env node
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const {
  analyzeDeckState,
  formatStateSummary,
  shouldSkipFinalGate
} = require("./deck-loop-state");
const { appendTrace } = require("./workflow-trace");

const deckRoot = process.env.DECK_ROOT
  ? path.resolve(process.env.DECK_ROOT)
  : path.resolve(__dirname, "..");
const hookDir = path.join(deckRoot, "hooks");
const eventName = process.argv[2] || "manual";
const finalGateEvents = new Set(["pre-handoff", "stop-quality", "quality-loop", "regression-gate"]);

function readHookFiles() {
  return fs.readdirSync(hookDir)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => {
      const fullPath = path.join(hookDir, file);
      return {
        file,
        fullPath,
        config: JSON.parse(fs.readFileSync(fullPath, "utf8"))
      };
    });
}

function matchingHooks(name = eventName) {
  return readHookFiles().filter(({ config }) => {
    return Array.isArray(config.events) && config.events.includes(name);
  });
}

function runCommand(hook, name = eventName) {
  const command = hook.config.command;
  if (!command) {
    throw new Error(`${hook.file} does not define command`);
  }

  console.log(`[deck-hook] ${name}: ${hook.config.name || hook.file}`);
  console.log(`[deck-hook] command: ${command}`);
  appendTrace(deckRoot, {
    event: "hook_command_started",
    hook: hook.config.name || hook.file,
    hookFile: hook.file,
    command,
    source: "run-hook.js"
  });

  const result = spawnSync(command, {
    cwd: deckRoot,
    shell: true,
    stdio: "inherit",
    env: {
      ...process.env,
      DECK_HOOK_EVENT: name,
      DECK_ROOT: deckRoot
    }
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    appendTrace(deckRoot, {
      event: "hook_command_finished",
      status: "fail",
      hook: hook.config.name || hook.file,
      hookFile: hook.file,
      command,
      exitStatus: result.status,
      source: "run-hook.js"
    });
    throw new Error(`${hook.file} exited with status ${result.status}`);
  }
  appendTrace(deckRoot, {
    event: "hook_command_finished",
    status: "pass",
    hook: hook.config.name || hook.file,
    hookFile: hook.file,
    command,
    exitStatus: result.status,
    source: "run-hook.js"
  });
}

function runEvent(name) {
  const hooks = matchingHooks(name);
  if (hooks.length === 0) {
    console.log(`[deck-hook] ${name}: no matching hooks`);
    return;
  }

  hooks.forEach((hook) => runCommand(hook, name));
  console.log(`[deck-hook] ${name}: passed ${hooks.length} hook(s)`);
}

function runDeckLoop() {
  const state = analyzeDeckState(deckRoot);
  console.log(`[deck-hook] deck-loop: state ${formatStateSummary(state)}`);
  appendTrace(deckRoot, {
    event: "deck_loop_state",
    status: state.status,
    readyForFinalGate: state.readyForFinalGate,
    slideCount: state.slideCount,
    source: "run-hook.js"
  });

  if (state.status === "uninitialized") {
    console.log("[deck-hook] deck-loop: running agent-contract-check before source/spec generation");
    runEvent("agent-contract-check");
    console.log("[deck-hook] deck-loop: next action create source.md and slide-spec.json");
    return;
  }

  if (state.status === "spec-invalid") {
    throw new Error(`[deck-hook] deck-loop: ${formatStateSummary(state)}`);
  }

  if (state.status === "spec-ready") {
    console.log("[deck-hook] deck-loop: running harness-check for spec/output gaps");
    runEvent("harness-check");
    return;
  }

  if (state.status === "output-ready") {
    console.log("[deck-hook] deck-loop: running harness-check and render-check before HANDOFF.md exists");
    runEvent("harness-check");
    runEvent("render-check");
    return;
  }

  runEvent("pre-handoff");
  runEvent("stop-quality");
}

function main() {
  if (eventName === "deck-loop") {
    runDeckLoop();
    return;
  }

  if (finalGateEvents.has(eventName)) {
    const state = analyzeDeckState(deckRoot);
    if (shouldSkipFinalGate(state)) {
      console.log(`[deck-hook] ${eventName}: SKIP final gate - ${formatStateSummary(state)}`);
      return;
    }
  }

  runEvent(eventName);
}

try {
  main();
} catch (error) {
  console.error(`[deck-hook] ${eventName}: failed`);
  console.error(error.message);
  process.exitCode = 1;
}
