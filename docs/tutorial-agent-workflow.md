# Agent Workflow Tutorial

This tutorial is for students using the HTML/CSS deck automation harness as a learning project.

The goal is not to hand-edit a pretty deck. The goal is to learn how an orchestrated workflow turns a topic request into researched content, structured output, validation evidence, and reusable harness improvements.

## 1. Inspect The Harness

Start from the repository root:

```sh
node lecture-deck/scripts/run-hook.js harness-check
```

What to notice:

- `AGENTS.md` and `lecture-deck/AGENTS.md` define the operating rules.
- `.codex/agents/` contains role agents.
- `.codex/skills/` contains reusable instructions.
- `lecture-deck/scripts/` contains gates and routing helpers.

## 2. Read The Canonical Flow

Every topic follows this order:

```text
prompt contract -> optional output reset -> research/tool selection -> source brief -> spec -> slide output -> visual/motion polish -> screenshot review -> validation -> handoff
```

The main session is the orchestrator. It chooses the current phase, delegates to the matching role agent or skill, integrates the result, then runs gates.

## 3. Prepare A Clean Starter Copy

Create a starter copy outside the repository:

```sh
node lecture-deck/scripts/export-starter.js --out=/tmp/html-css-deck-starter
cd /tmp/html-css-deck-starter
node lecture-deck/scripts/run-hook.js harness-check
```

The export keeps the harness and replaces current topic output with neutral starter stubs. This lets you practice without carrying old screenshots, reports, or experiment images.

## 4. Inspect The Next Phase

From a working deck root, ask the planner what phase is next:

```sh
cd lecture-deck
node scripts/orchestration-plan.js
```

Use the result as the prompt for the matching role agent. In Codex Desktop, the main session should delegate the phase. Outside Desktop, use the runner with an adapter.

## 5. Try The Mock Agent Adapter

The mock adapter shows the external-agent contract without calling a real model:

```sh
DECK_AGENT_COMMAND="node lecture-deck/examples/agent-adapter/mock-agent.js" \
  node lecture-deck/scripts/orchestrated-runner.js --validate
```

The runner sends a phase contract through stdin and sets `DECK_AGENT_PHASE`, `DECK_AGENT_NAME`, and related environment variables. Replace the mock script body when you want to connect a real CLI or API.

## 6. Route A Failure

When a gate fails, do not patch random files. Ask the router:

```sh
node lecture-deck/scripts/route-failure.js --json
```

The router returns:

- `recommendedAgent`
- `routingDecision`
- `reason`
- `evidence`
- `nextCommand`
- a ready-to-delegate `prompt`

If the issue is reusable or repeated, it should route to `deck-workflow-improver`. If the current slide output alone is wrong, it may route to `deck-output-regenerator`.

## 7. Use The Harness Backlog

Read the improvement backlog:

```sh
sed -n '1,220p' lecture-deck/HARNESS-IMPROVEMENT-BACKLOG.md
```

Rules:

- Search before adding a new item.
- Merge similar evidence into the existing item.
- Use the item as input for `deck-workflow-improver`.
- Remove the item from `Open Items` after code, tests, docs, and validation preserve the lesson.

Validate the backlog:

```sh
node lecture-deck/scripts/verify-harness-backlog.js
```

## 8. Practice Asset Acquisition

When a deck needs real images, asset research must become local files plus metadata:

```sh
node lecture-deck/scripts/asset-acquisition.js --input=asset-candidates.json
```

Accepted candidates go into `lecture-deck/assets/illustrations/` and `manifest.json`. Rejected candidates are recorded in `.deck-quality/asset-acquisition-report.json`.

## 9. Run Regression Gates

For normal deck work:

```sh
node lecture-deck/scripts/run-hook.js deck-loop
```

For harness improvement work:

```sh
node lecture-deck/scripts/run-hook.js regression-gate
```

The regression gate checks route policy, controlled quality loops, motion mutation score, and orchestration replay.

## 10. Clean Reports

When `.deck-quality` gets noisy:

```sh
node lecture-deck/scripts/compact-quality-reports.js --apply
```

This keeps the latest proof files and archives bulky screenshots or loop snapshots.

## Completion Checklist

- The phase order was followed.
- Role agents or skills were used for phase work.
- `route-failure.js` classified failures before repair.
- Repeated defects became harness improvements, not one-off slide patches.
- The relevant gate passed after each improvement.
- The handoff report states which agents and validations were used.
