# Codex instructions for `lecture-deck/`

This directory is an HTML/CSS Deck Automation Harness.

## Instruction Ownership

전역/사용자 레벨 AGENTS.md는 비워 두고, 이 프로젝트의 지침은 이 파일에서 관리한다.
Shared agent rules may be added here only after they are adapted to this deck harness's prompt-layer, contract, and validation workflow.

## Orchestration model

This harness is an orchestrated workflow, not a single ad hoc slide editor.

- Main Codex is the orchestrator. It owns scope, phase order, file edits, validation, final judgment, and user-facing reports.
- Main Codex should not act as the only producer for research, slide planning, visual review, validation, and remediation. It should route each phase through the matching role agent or skill workflow, then integrate the results.
- The main session coordinates the workflow: define the run contract, choose the next phase, delegate bounded work to agents, inspect their evidence, decide whether to repair output or improve the harness, run gates, and report the final state.
- Role agents are used for bounded review, research, validation, regeneration, and workflow improvement. They return evidence and findings; they do not silently decide final scope.
- Role agents carry the workflow work: research agents collect evidence, asset agents select usable visuals, content agents draft output, reviewers find defects, validation agents run checks, regenerators repair output, and workflow improvers strengthen the harness.
- Local Node scripts are gates and evidence collectors. They do not replace the orchestrator, and they do not weaken contracts to make a deck pass.
- Default operation in Codex Desktop is interactive orchestration: the main session calls `spawn_agent` or delegate tools for each role agent, waits for bounded handoffs, records phase trace, then decides the next phase. Use the local runner only as a helper for replay, CI-style validation, or external CLI/API adapters.
- `tool-policy.json` is the machine-readable role and tool boundary. Keep agent behavior aligned with it.
- `agent-handoff.schema.json` is the expected shape of agent outputs and handoff evidence.
- `current-run.json` is the active run contract for the current topic.
- `prompt-layer.md` defines how one-off user instructions become durable project rules, skills, agents, hooks, or eval cases.
- `HARNESS-IMPROVEMENT-BACKLOG.md` is the durable improvement backlog. Read it before harness-engineering work and update it when a reusable defect is fixed or a new recurring weakness is discovered.
- `scripts/export-starter.js` creates an education-safe starter copy. It must preserve harness assets, exclude generated/current-run artifacts from the copy plan, and write only sanitized starter stubs for files needed by `harness-check`.

Use this canonical flow for any deck topic:

```text
prompt contract -> optional output reset -> research/tool selection -> source brief -> spec -> slide output -> visual/motion polish -> screenshot review -> validation -> handoff
```

Do not collapse these phases just because the requested topic is simple. A simple topic may have a smaller source brief and fewer assets, but it still needs the same gates.

The expected operating pattern is:

1. Main session reads the run contract and identifies the current phase.
2. Main session runs `node scripts/orchestration-plan.js` when it needs the next required phase and agent prompt.
3. Main session invokes or follows the relevant skill/agent workflow for that phase.
4. The phase agent returns bounded findings, evidence, generated output, or remediation instructions.
5. Main session integrates the result into the repository, preserving file boundaries and contracts.
6. Main session records the phase result in `.deck-quality/workflow-trace.jsonl` using `node scripts/record-agent-phase.js ...`.
7. Main session runs the appropriate hook or validation gate.
8. If validation fails, Main session routes the failure to the correct agent type instead of patching blindly.
9. Main session repeats until `deck-loop` passes and the handoff evidence is complete.

Required phase completion is machine-checked. When `current-run.json` sets `orchestration.enforceAgentTrace: true`, `verify-agent-contracts.js` requires every `requiredAgentPhases` entry to have a matching `agent_phase_finished` or `agent_phase_fallback` event before a handoff-ready deck can pass.

For repeatable local execution outside the Codex Desktop agent toolchain, use the runner:

```sh
node scripts/orchestrated-runner.js --validate
```

The runner is secondary to Desktop orchestration. It reads `current-run.json`, walks `requiredAgentPhases` in order, writes `.deck-quality/orchestrated-runner-report.json`, records phase handoffs, and runs the final validation gate. If `DECK_AGENT_COMMAND` or `--agent-command="..."` is configured, the runner invokes that command once per phase with the phase contract on stdin and these environment variables:

- `DECK_ROOT`
- `REPO_ROOT`
- `DECK_AGENT_PHASE`
- `DECK_AGENT_NAME`
- `DECK_AGENT_TASK`
- `DECK_AGENT_PROMPT`
- `DECK_AGENT_RUN_ID`

If no agent command is configured, the runner may record `agent_phase_fallback` only after the expected evidence files for that phase already exist. Missing evidence blocks the run instead of creating a false pass.

Desktop mode precedence:

1. Use `spawn_agent`/delegate from the main Codex Desktop session for real phase work.
2. Use `node scripts/orchestration-plan.js` to identify the next required phase and prompt.
3. Record the returned result with `node scripts/record-agent-phase.js ...`.
4. Use `node scripts/orchestrated-runner.js --validate` only to replay/check completed phase state or to drive an external adapter when Desktop agent tools are unavailable.

## Agent routing

Use role agents according to the phase and keep their outputs bounded:

- `deck-researcher`: gathers trusted sources, source selection notes, slide-visible claim evidence, and unresolved risks.
- `deck-asset-researcher`: finds and classifies image candidates, license/source metadata, accepted/rejected asset decisions, and intended slide IDs.
- `deck-content-producer`: writes or repairs `source.md`, `slide-spec.json`, `slides/*.html`, `assets/slides.js`, `assets/visuals.css`, and `HANDOFF.md` after research and spec contracts are satisfied.
- `deck-slide-reviewer`: reviews slide flow, evidence mapping, speaker-note separation, and spec completeness.
- `deck-visual-reviewer`: reviews layout hierarchy, visual form, raster/CSS asset fit, responsive readability, and motion plan quality.
- `deck-screenshot-quality-reviewer`: reviews captured screenshots and writes/updates screenshot quality artifacts.
- `deck-validation-runner`: runs hooks, summarizes failures, and reports smallest useful failure snippets.
- `deck-output-regenerator`: repairs current slide output only after the defect has been classified as an output issue.
- `deck-workflow-improver`: updates skills, agents, hooks, validators, design rules, motion rules, few-shots, or eval corpus when the defect is a workflow issue.
- `deck-contract-validator`: checks run contract, tool policy, handoff schema, agent canonical flow, hooks, workflow trace, and reset boundary.

When a defect appears, classify it before editing:

- Source or claim gap: route to research/source/spec first.
- Layout, image, motion, or responsive issue in current slides: route to visual review, screenshot review, then output regeneration.
- A bad slide passes the gates: route to workflow improvement first, then repair output.
- If remediation contains both `workflowIssues` and `outputIssues`, resolve the workflow issue first. Output regeneration must wait until `route-failure.js` recommends `deck-output-regenerator`.
- Treat repeated bad output as a harness defect until routing evidence proves it is isolated to the current deck. Fix the reusable rule and an executable validator, hook, test, or eval case together.
- Reset or cleanup risk: route to contract validation and reset boundary checks before applying deletion.

Use the routing helper before choosing a repair agent:

```sh
node scripts/route-failure.js --json
```

If the failure only exists in a captured hook log, pass that log or text:

```sh
node scripts/route-failure.js --hook-output=hook-output.txt --json
```

The route result returns `recommendedAgent`, `phase`, `routingDecision`, `reason`, `evidence`, `nextCommand`, and a ready-to-delegate `prompt`. Treat `status: route-required` as the next delegation target; treat `status: no-route-needed` as permission to continue normal validation or handoff.

## Required workflow

When creating or updating this deck, follow this order:

1. Read `prompt-layer.md`, `current-run.json`, `tool-layer.md`, `tool-policy.json`, `agent-handoff.schema.json`, `screenshot-review.md`, `source.md`, `slide-spec.json`, `design.md`, `motion.md`, `few-shots.md`, `assets/illustrations/manifest.json`, and `HANDOFF.md`.
2. Treat `prompt-layer.md` as the durable prompt-layer rule, `current-run.json` as the active run contract, `tool-policy.json` as the machine-checkable tool boundary contract, `agent-handoff.schema.json` as the agent output contract, `screenshot-review.md` as the perceptual quality contract, and `slide-spec.json` as the contract for slide order, title, message, visual, speaker note, and evidence.
3. Do not generate `slide-spec.json` from a thin source brief. `source.md` must include `## Evidence list`, `## Research selection notes`, `## Image candidates`, `## Image and asset decisions`, `## Slide-visible claims`, `## Speaker-note context`, and `## Unresolved risks`.
4. Research must be deep enough for the topic. For current/source-sensitive topics, use at least 8 trusted URLs total and at least 5 official documentation URLs when official docs exist. If the topic lacks enough official docs, state the reason in `## Unresolved risks` before generating slides.
5. Every slide-visible claim must map to evidence in `slide-spec.json`, and every `slide-spec.json` evidence URL must also appear in `source.md`.
6. Before selecting visuals, classify assets as primary evidence/action, secondary support, or decoration. Use local raster images only when they show a real product, official diagram, screenshot, method, place, or state that teaches the slide.
7. Store local raster assets under `assets/illustrations/` and document source URL, publisher, author, checked date, license/source check, edits, role, and slide IDs in both `assets/illustrations/README.md` and `assets/illustrations/manifest.json`.
8. Use optional `motion` only when animation improves understanding.
9. Before generating or repairing slide layout, rank visible content as primary message, primary evidence/action, secondary constraints, and metadata. Size and position elements from that ranking.
10. Treat official images or concrete examples that teach the slide as primary evidence/action, not thumbnails or decoration.
11. Before animated CSS, draft a visual motion brief and follow `design.md` plus `motion.md`.
12. Keep presenter-only content in `.note` and `speakerNote`.
13. Do not expose `.note` in `deck.html`.
14. Keep shared behavior in `assets/`, slide content in `slides/`, shell CSS and design tokens in `assets/style.css`, and CSS visuals/keyframes in `assets/visuals.css`.
15. If a generated deck looks visually wrong but hooks pass, treat that as a harness defect. Strengthen `screenshot-review.md`, `visual-quality-gate.js`, `design.md`, `few-shots.md`, a deck skill, or `verify-agent-contracts.js` before one-off output patching.
16. For a new topic, run output reset first only through the reset workflow. Preserve harness, agents, skills, hooks, scripts, design rules, shell HTML, and manifest schema. Remove or reset only generated source/spec/slides/assets/HANDOFF/quality output.
17. Before handoff or final completion, run the state-aware loop:

```sh
node scripts/run-hook.js deck-loop
```

For faster triage:

```sh
node scripts/run-hook.js harness-check
node scripts/run-hook.js render-check
```

`deck-loop` must not hard-fail when the deck is still uninitialized or mid-generation. It should report the current state and only run final gates when source, spec, slide output, and `HANDOFF.md` are present.

To test the improvement loop without damaging the current deck, run:

```sh
node scripts/improvement-loop.js --max-iterations=8 --threshold-percent=10
```

To smoke-test only CSS animation generation and repair behavior, run:

```sh
node scripts/improvement-loop.js --focus=motion --max-iterations=4 --threshold-percent=10
```

This creates temporary deck roots, injects controlled visual and motion failures, resets to the same initial failure state for each iteration, applies cumulative repairs, and writes `.deck-quality/improvement-loop-report.{json,md}`. Stop criteria are based on the latest efficiency gain falling below the threshold. Treat `--focus=motion` as a smoke drill, not as proof that the motion gate detects realistic failures.

To test whether CSS animation gates are actually effective, run:

```sh
node scripts/motion-mutation-loop.js --max-mutants=7
```

This injects independent motion defects into temporary deck copies and requires each defect to fail at its expected gate. It writes `.deck-quality/motion-mutation-report.{json,md}` and then runs a final clean `deck-loop` smoke check.

## Reset safety

Reset is allowed only for generated deck output, not for orchestration assets.

Preserve:

- `.codex/agents/`
- `.codex/skills/`
- `lecture-deck/agents/`
- `lecture-deck/hooks/`
- `lecture-deck/scripts/`
- `lecture-deck/tool-policy.json`
- `lecture-deck/agent-handoff.schema.json`
- `lecture-deck/prompt-layer.md`
- `lecture-deck/tool-layer.md`
- `lecture-deck/design.md`
- `lecture-deck/design-quality.md`
- `lecture-deck/motion.md`
- `lecture-deck/few-shots.md`
- `lecture-deck/screenshot-review.md`
- `lecture-deck/assets/style.css`
- `lecture-deck/assets/deck.js`
- `lecture-deck/assets/presenter-review.js`
- `lecture-deck/assets/illustrations/README.md`
- `lecture-deck/assets/illustrations/manifest.schema.json`

Reset or regenerate as topic output:

- `source.md`
- `slide-spec.json`
- `slides/*.html`
- `assets/slides.js`
- `assets/visuals.css`
- `HANDOFF.md`
- `.deck-quality/`
- topic-specific raster assets under `assets/illustrations/`
- `assets/illustrations/manifest.json` contents

Before trusting reset behavior, run:

```sh
node ../.codex/skills/deck-output-reset/scripts/reset-deck-output.js --dry-run
node scripts/verify-agent-contracts.js
```

`verify-agent-contracts.js` must fail if the reset plan tries to delete workflow files.

## Validation gates

Use the state-aware loop as the default command:

```sh
node scripts/run-hook.js deck-loop
```

Run focused gates only when narrowing a failure:

```sh
node scripts/run-hook.js harness-check
node scripts/run-hook.js render-check
node scripts/run-hook.js stop-quality
node scripts/run-hook.js pre-handoff
node scripts/run-hook.js quality-loop
node scripts/run-hook.js regression-gate
node scripts/route-failure.js --json
```

Expected behavior:

- Uninitialized decks run contract checks and report the next generation phase.
- Mid-generation decks do not run final screenshot gates too early.
- Handoff-ready decks run contract, harness, render, and screenshot quality gates.
- Harness improvement work may run `quality-loop`; normal deck handoff should not depend on `quality-loop`.
- Long regression work should run `regression-gate`. This bundles controlled quality loops, `motion-mutation-loop --max-mutants=7`, and `orchestrated-runner --validate`, then writes `.deck-quality/regression-gate-report.{json,md}`.
- Regression work must also enforce route policy: mixed workflow/output remediation must route to `deck-workflow-improver` before any output regeneration.
- When `.deck-quality` becomes noisy, run `node scripts/compact-quality-reports.js --apply` to archive screenshots, loop snapshots, and bulky runtime artifacts while preserving the latest proof files.

Before reporting completion, include validation evidence from the commands actually run.

## Harness improvement backlog

Use `HARNESS-IMPROVEMENT-BACKLOG.md` as the source of truth for deferred harness improvements.

- Add an item when a defect should inform future harness work but is not being fixed immediately.
- Before adding an item, search for similar root cause, harness layer, suggested files, or validation command. If a similar item exists, merge evidence into it instead of creating a duplicate.
- When starting harness work, use the matched backlog item as input for the delegated `deck-workflow-improver` prompt.
- Mark an item `done` only after the reusable rule and executable guard have both landed.
- Remove completed items from `Open Items`. Delete them if code/tests/docs already preserve the lesson; move only high-value examples to `Completed Items`.
- Do not list ordinary slide polish there unless the polish exposes a reusable generation, routing, validation, or reset weakness.
- When `deck-workflow-improver` fixes a recurring issue, update the matching backlog item with changed files and validation evidence.

## Agent phase trace

Use this command to inspect the next missing phase:

```sh
node scripts/orchestration-plan.js
```

After reset and before new topic generation, prepare the new run contract:

```sh
node scripts/prepare-new-run.js \
  --run-id="2026-05-26-example-topic" \
  --topic="Example topic" \
  --audience="Target audience" \
  --outcome="What the audience should be able to do"
```

After a delegated agent phase returns, record it:

```sh
node scripts/record-agent-phase.js \
  --phase="research/tool selection" \
  --agent="deck-researcher" \
  --task="Collect trusted sources and slide-visible claim evidence." \
  --status=pass \
  --evidence='{"kind":"source","pathOrUrl":"source.md","note":"source brief"}' \
  --evidence='{"kind":"claim-map","pathOrUrl":"source.md","note":"slide-visible claim map"}' \
  --validationEvidence='harness-check|skipped|gate runs after this phase trace' \
  --commandsRun='agent research review|pass|research agent returned trusted sources and claim map' \
  --nextGate=harness-check
```

For generated handoff artifacts, use structured evidence whenever possible. The `kind` values must cover the active phase's `current-run.json.requiredAgentPhases[].evidenceKinds`. Existing agent handoff files passed with `--handoffPath=...` must match `agent-handoff.schema.json`.

Allowed status values are `started`, `pass`, `fail`, `blocked`, and `fallback`. Use `fallback` only when agent delegation is unavailable; include a note that explains why the main session performed the phase.

The trace gate expects:

- `current-run.json` contains `orchestration` and `requiredAgentPhases`.
- Each required phase maps to an agent in `tool-policy.json`.
- Handoff-ready decks have every required phase recorded in `.deck-quality/workflow-trace.jsonl`.
- Each pass handoff includes non-empty `findings`, `actions`, `evidence`, `validationEvidence`, and `commandsRun`.
- Each pass handoff avoids `not-run` validation/command evidence. Use `skipped` only when the command is intentionally performed by the orchestrator after the phase.
- Each handoff includes `routingDecision`; successful phases normally use `no-routing-needed`.

Use this command when reporting which agents ran:

```sh
node scripts/agent-phase-report.js --markdown
```

Use this command when resuming or validating the whole orchestration pass:

```sh
node scripts/orchestrated-runner.js --validate
```

Use this command for an external agent adapter:

```sh
DECK_AGENT_COMMAND="your-agent-command" node scripts/orchestrated-runner.js --validate
```

For a new topic, combine reset and run preparation with the runner only when an agent command is available to create the missing evidence:

```sh
DECK_AGENT_COMMAND="your-agent-command" node scripts/orchestrated-runner.js \
  --reset \
  --topic="New topic" \
  --audience="Target audience" \
  --outcome="Audience outcome" \
  --validate
```

## Reporting

Use `evaluation-template.md` for final reports. Include changed files, command output summary, remaining risks, and the local URL if a server was used.

## Codex-native assets

- Project hook: `.codex/hooks.json`
- Project config: `.codex/config.toml`
- Project skill: `.codex/skills/deck-builder/SKILL.md`
- Shared deck skill: `skills/deck-builder/SKILL.md`
- Role skills:
  - `.codex/skills/deck-research-brief/SKILL.md`
  - `.codex/skills/deck-asset-research/SKILL.md`
  - `.codex/skills/deck-asset-selection/SKILL.md`
  - `.codex/skills/deck-content-production/SKILL.md`
  - `.codex/skills/deck-css-motion-generation/SKILL.md`
  - `.codex/skills/deck-output-reset/SKILL.md`
  - `.codex/skills/deck-source-evidence-contract/SKILL.md`
  - `.codex/skills/deck-spec-review/SKILL.md`
  - `.codex/skills/deck-visual-motion/SKILL.md`
  - `.codex/skills/deck-visual-hierarchy-layout/SKILL.md`
  - `.codex/skills/deck-validation-gate/SKILL.md`
- Review agents:
  - `.codex/agents/deck-researcher.toml`
  - `.codex/agents/deck-asset-researcher.toml`
  - `.codex/agents/deck-content-producer.toml`
  - `.codex/agents/deck-contract-validator.toml`
  - `.codex/agents/deck-slide-reviewer.toml`
  - `.codex/agents/deck-visual-reviewer.toml`
  - `.codex/agents/deck-screenshot-quality-reviewer.toml`
  - `.codex/agents/deck-validation-runner.toml`
  - `.codex/agents/deck-workflow-improver.toml`
  - `.codex/agents/deck-output-regenerator.toml`

Main Codex owns scope, edits, and final judgment. Reviewer/validator agents return findings only.
