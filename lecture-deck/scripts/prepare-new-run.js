#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { appendTrace } = require("./workflow-trace");

const deckRoot = process.env.DECK_ROOT
  ? path.resolve(process.env.DECK_ROOT)
  : path.resolve(__dirname, "..");

function parseArgs(argv) {
  const parsed = {};
  argv.forEach((arg) => {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      parsed[match[1]] = match[2];
    }
  });
  return parsed;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "deck-run";
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function requireArg(args, name) {
  if (!args[name]) {
    throw new Error(`Missing required argument --${name}=...`);
  }
  return args[name];
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const runPath = path.join(deckRoot, "current-run.json");
  const run = JSON.parse(fs.readFileSync(runPath, "utf8"));
  const topic = requireArg(args, "topic");
  const runId = args["run-id"] || `${todayIsoDate()}-${slugify(topic)}`;

  const updated = {
    ...run,
    runId,
    topic,
    audience: args.audience || run.audience,
    outcome: args.outcome || run.outcome
  };

  if (args["trusted-hosts"]) {
    updated.researchNeed = {
      ...updated.researchNeed,
      trustedHosts: args["trusted-hosts"].split(",").map((item) => item.trim()).filter(Boolean)
    };
  }

  fs.writeFileSync(runPath, `${JSON.stringify(updated, null, 2)}\n`);
  const tracePath = appendTrace(deckRoot, {
    event: "run_prepared",
    source: "prepare-new-run.js",
    status: "pass",
    topic,
    previousRunId: run.runId || "unknown-run"
  });

  console.log(JSON.stringify({
    ok: true,
    runId,
    topic,
    currentRunPath: path.relative(deckRoot, runPath),
    tracePath: path.relative(deckRoot, tracePath)
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
