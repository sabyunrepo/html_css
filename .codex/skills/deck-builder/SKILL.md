---
name: deck-builder
description: Orchestrate the HTML/CSS lecture deck automation harness under lecture-deck/. Use when coordinating research, source.md, slide-spec.json, slide HTML, assets/slides.js, visuals.css, presenter review, validation hooks, screenshot quality, regeneration, and HANDOFF.md.
---

# Deck Builder

## Read First

1. `.codex/skills/deck-source-evidence-contract/SKILL.md`
2. `.codex/skills/deck-asset-selection/SKILL.md`
3. `.codex/skills/deck-asset-research/SKILL.md`
4. `.codex/skills/deck-visual-hierarchy-layout/SKILL.md`
5. `.codex/skills/deck-css-motion-generation/SKILL.md`
6. `.codex/skills/deck-output-reset/SKILL.md` when starting a new topic from a clean slate
7. `lecture-deck/prompt-layer.md`
8. `lecture-deck/current-run.json`
9. `lecture-deck/tool-layer.md`
10. `lecture-deck/tool-policy.json`
11. `lecture-deck/agent-handoff.schema.json`
12. `lecture-deck/screenshot-review.md`
13. `lecture-deck/source.md`
14. `lecture-deck/slide-spec.json`
15. `lecture-deck/design.md`
16. `lecture-deck/motion.md`
17. `lecture-deck/few-shots.md`
18. `lecture-deck/assets/illustrations/manifest.json`
19. `lecture-deck/HARNESS-IMPROVEMENT-BACKLOG.md` when doing harness-engineering work
20. `lecture-deck/HANDOFF.md`

## Phase Routing

- Research and evidence: `deck-research-brief`
- Source evidence contract: `deck-source-evidence-contract`
- Asset selection: `deck-asset-selection`
- Asset research and manifest metadata: `deck-asset-research`
- Visual hierarchy and layout: `deck-visual-hierarchy-layout`
- CSS motion generation: `deck-css-motion-generation`
- Output reset for a new topic: `deck-output-reset`
- Source/spec/slides/HANDOFF: `deck-content-production`
- Spec review: `deck-spec-review`
- Visuals, local assets, and motion: `deck-visual-motion`
- Screenshot quality and remediation: `deck-screenshot-quality`
- Hook validation and handoff readiness: `deck-validation-gate`

## Workflow

1. Treat `prompt-layer.md` as the durable prompt-layer rule, `current-run.json` as the active run contract, `tool-policy.json` as the machine-checkable tool boundary contract, `agent-handoff.schema.json` as the agent output contract, `screenshot-review.md` as the perceptual quality contract, and `slide-spec.json` as the slide output contract.
2. Work in order: prompt contract -> optional output reset -> research/tool selection -> source brief -> spec -> slide output -> visual/motion polish -> screenshot review -> validation -> handoff.
3. Before source or spec generation, run or rely on `node lecture-deck/scripts/run-hook.js deck-loop`; uninitialized decks still run `agent-contract-check` first.
4. When the user asks to start a new topic and remove prior results, use `deck-output-reset` first. Preserve harness, agents, skills, hooks, scripts, design rules, and shell HTML; remove only generated source/spec/slides/assets/HANDOFF/quality output.
5. Treat source research as a gate, not a preface. Before writing specs, ensure `source.md` includes evidence list, research selection notes, image candidates, image and asset decisions, slide-visible claims, speaker-note context, and unresolved risks.
6. For current/source-sensitive topics, require at least 8 trusted URLs and at least 5 official documentation URLs when those docs exist. If that threshold is impossible, record why in unresolved risks before slide generation.
7. Every slide-visible claim must have evidence. Every `slide-spec.json` evidence URL must appear in `source.md`.
8. Decide images and visual assets with `deck-asset-selection` and `deck-asset-research`: official product screenshots, real interface examples, official diagrams, method photos, and finished-result photos can be primary evidence/action; decorative stock or loosely related images should be rejected.
9. Require each slide spec to include `importanceMap`, `assetDecision`, `visualForm`, and `motionDecision`.
10. Use `deck-visual-hierarchy-layout` before layout generation and remediation.
11. Use `deck-css-motion-generation` for every animated slide and keep static slides free of active animation.
12. Keep individual slide content in `lecture-deck/slides/*.html`.
13. Keep shared behavior in `lecture-deck/assets/`.
14. Keep presenter-only content in `.note` and `speakerNote`; never expose `.note` in `deck.html`.
15. Put shell/layout CSS and design/motion tokens in `assets/style.css`; put visual styling and keyframes in `assets/visuals.css`.
16. Follow `design.md` for typography, layout, visual style, and asset tiers; follow `motion.md` for reusable motion recipes.
17. Use HTML/CSS cards, rails, labels, and Lucide icons for semantic visuals. Use local raster images when they show a real product, method, place, state, or finished result that teaches the slide.
18. When `current-run.json.assetRequirements` requires raster images, do not satisfy the deck with CSS-only modules. Store local rasters under `assets/illustrations/`, update the manifest, and make the slide HTML reference those files.
19. Keep CSS drawings simple and readable; prefer labeled modules over fragile freehand metaphors.
20. Add motion only when it explains sequence, focus, state change, or cause/effect.
21. Animate only `transform` and `opacity`; use finite keyframes, `assets/style.css` motion tokens, and reduced-motion fallbacks.
22. If a visible screenshot failure passes the hooks, classify it as a harness defect and strengthen `screenshot-review.md`, `visual-quality-gate.js`, `design.md`, `few-shots.md`, skills, or validation gates before one-off patching.
23. If remediation contains both `workflowIssues` and `outputIssues`, route to `deck-workflow-improver` first. Output regeneration is allowed only after the workflow issue is fixed and `route-failure.js` recommends `deck-output-regenerator`.
24. For deferred harness improvements, add or update `HARNESS-IMPROVEMENT-BACKLOG.md` with status, priority, problem, desired improvement, harness layer, suggested files, and validation commands.
25. Before adding a backlog item, search for similar root cause, harness layer, suggested files, or validation command. Merge new evidence into existing items instead of creating duplicates.
26. When a backlog item is implemented and verified, remove it from `Open Items`; delete it if code/tests/docs already preserve the lesson, or move only high-value teaching examples to `Completed Items`.

## Validation

Default orchestration in Codex Desktop should use `spawn_agent` or delegate tools for role-agent phases. Treat `orchestrated-runner.js` as a replay/CI/external-adapter helper, not as the primary Desktop agent caller.

Run from repository root:

```sh
node lecture-deck/scripts/run-hook.js deck-loop
```

To replay/check the orchestration harness itself after output exists:

```sh
node lecture-deck/scripts/orchestrated-runner.js --validate
```

To connect an external phase agent adapter outside Desktop sub-agent tools, set `DECK_AGENT_COMMAND`. The runner passes the phase contract on stdin and sets `DECK_AGENT_PHASE`, `DECK_AGENT_NAME`, `DECK_AGENT_TASK`, `DECK_AGENT_PROMPT`, and `DECK_AGENT_RUN_ID`.

When the deck is `handoff-ready`, `deck-loop` runs normal output validation: `pre-handoff` and `stop-quality`. It does not run `quality-loop`; run `quality-loop` directly only for harness-engineering improvement work.

Focused checks from `lecture-deck/`:

```sh
node scripts/run-hook.js harness-check
node scripts/run-hook.js render-check
node scripts/run-hook.js stop-quality
node scripts/run-hook.js pre-handoff
node scripts/run-hook.js quality-loop
node scripts/run-hook.js regression-gate
node scripts/route-failure.js --json
node scripts/improvement-loop.js --focus=motion --max-iterations=4 --threshold-percent=10
node scripts/motion-mutation-loop.js --max-mutants=7
```

Treat `quality-loop` as the harness-engineering gate for controlled visual and motion failures. `improvement-loop` must fail when the controlled defect is not detected or when the no-op control appears to improve quality. Use `motion-mutation-loop.js` when you need mutation-score evidence that motion gates catch realistic CSS animation defects.

Use `regression-gate` when the task is to enforce the whole recurring harness quality bar. It runs route-policy checks, the controlled quality loops, full motion mutation loop, and `orchestrated-runner.js --validate`, then writes `.deck-quality/regression-gate-report.{json,md}`.

When any hook or quality gate fails, run `route-failure.js` before assigning repairs. Use its `recommendedAgent`, `routingDecision`, and generated `prompt` as the next delegation target. Do not bypass it with a one-off patch unless the route result itself is malformed; if the route result is malformed, route to `deck-workflow-improver`.

## Report

Use Korean. Include changed files, exact command, pass/fail summary, remaining risk, and local URL when a server was used.
