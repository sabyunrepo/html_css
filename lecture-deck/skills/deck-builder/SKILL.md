---
name: deck-builder
description: Use when creating or updating the HTML/CSS deck automation harness, including source brief, slide spec, slide HTML, presenter review, hook verification, and handoff.
---

# Deck Builder

Use this skill for work inside `lecture-deck/`. It is the shared project skill for Claude-style and local deck workflows. The Codex-native mirror is `.codex/skills/deck-builder/SKILL.md`.

## Read First

1. `prompt-layer.md`
2. `current-run.json`
3. `tool-layer.md`
4. `tool-policy.json`
5. `agent-handoff.schema.json`
6. `screenshot-review.md`
7. `source.md`
8. `slide-spec.json`
9. `design.md`
10. `motion.md`
11. `few-shots.md`
12. `assets/illustrations/manifest.json`
13. `HANDOFF.md`

## Delegation Map

- Research and evidence checks: `.codex/skills/deck-research-brief/SKILL.md`
- Asset research and manifest metadata: `.codex/skills/deck-asset-research/SKILL.md`
- Source/spec/slides/HANDOFF generation: `.codex/skills/deck-content-production/SKILL.md`
- Slide flow and spec review: `.codex/skills/deck-spec-review/SKILL.md`
- CSS visual and motion review: `.codex/skills/deck-visual-motion/SKILL.md`
- Hook and handoff validation: `.codex/skills/deck-validation-gate/SKILL.md`
- Screenshot quality review and remediation routing: `.codex/skills/deck-screenshot-quality/SKILL.md`

## Workflow

1. Treat `prompt-layer.md` as the durable prompt-layer rule, `current-run.json` as the active run contract, `tool-policy.json` as the machine-checkable tool boundary contract, `agent-handoff.schema.json` as the agent output contract, `screenshot-review.md` as the perceptual quality contract, and `slide-spec.json` as the slide source of truth.
2. Source and spec come before output. Use researcher output first, then route source/spec/slides/HANDOFF generation through the content producer contract.
3. Treat source research as a gate, not a preface. Before writing specs, ensure `source.md` includes evidence list, research selection notes, image candidates, image and asset decisions, slide-visible claims, speaker-note context, and unresolved risks.
4. For current/source-sensitive topics, require at least 8 trusted URLs and at least 5 official documentation URLs when those docs exist. If that threshold is impossible, record why in unresolved risks before slide generation.
5. Every slide-visible claim must have evidence. Every `slide-spec.json` evidence URL must appear in `source.md`.
6. Decide images from evidence value: official product screenshots, real interface examples, official diagrams, method screenshots, and finished-result photos can be primary evidence/action; decorative stock or loosely related images should be rejected.
7. Wait for user confirmation when the user requested a spec review gate.
8. Add `visualArchetype` to every slide. Use it to force visual grammar variety before HTML/CSS generation, not after screenshots reveal sameness.
9. Add `visualForm` to every slide. Use it to choose the actual HTML/CSS structure: `evidence-image`, `interface-mock`, `funnel`, `document-template`, `process-rail`, `token-board`, `radial-map`, `hub-map`, `triage-table`, `step-path`, `timeline`, `matrix`, `annotated-screenshot`, or `before-after`.
10. Add `motionDecision` to every slide. Use `mode: "animated"` only when motion explains sequence, cause/effect, input-output, handoff, or ordered steps. Use `mode: "static"` for proof images, catalogs, caution lists, and reference/checklist slides.
11. Add optional `motion` only when `motionDecision.mode` is `animated`. Static slides must omit `motion`.
12. Before writing slide HTML/CSS, draft a short visual motion brief from `slide-spec.json` fields: `visualArchetype`, `visualForm`, `visual`, `motionDecision`, optional `motion.type`, `motion.mood`, `motion.sequence`, and `motion.reducedMotion`.
13. Update `assets/slides.js` when slide order or metadata changes.
14. Keep individual slide content in `slides/*.html`.
15. Keep shared deck behavior in `assets/`.
16. Keep presenter-only content in `.note` and `speakerNote`.
17. Never expose `.note` in `deck.html`.
18. Follow `design.md` for typography, layout, visual style, and motion rules; follow `motion.md` for reusable motion recipes.
19. Keep deck shell, typography, layout, responsive basics, and design/motion tokens in `assets/style.css`.
20. Keep visual styling and keyframes in `assets/visuals.css`, imported by `style.css` when animated visuals are generated.
21. Generate CSS motion with the performance harness:
    - Animate only `transform` and `opacity` inside `@keyframes`.
    - Do not animate `top`, `left`, `width`, `height`, `margin`, `padding`, `background`, `box-shadow`, `filter`, `border`, or `color`.
    - Prefer finite keyframes with `animation-fill-mode: both`.
    - Use motion tokens from `assets/style.css` for duration, delay, easing, and entry distance.
    - Add `prefers-reduced-motion` fallbacks.
    - Use `will-change` only on small elements that actually animate.
22. Prefer meaningful infographic motion over decoration. Use the asset rules in `design.md`: HTML/CSS cards, rails, labels, and Lucide icons for semantic visuals; local raster images when they show a real product, method, place, state, or finished result that teaches the slide.
23. When `current-run.json.assetRequirements` requires raster images, do not satisfy the deck with CSS-only modules. Store local rasters under `assets/illustrations/`, update `assets/illustrations/manifest.json`, and make slide HTML reference those files.
24. Do not allow every slide to become the same visual module with a different label set. Validate that each `visualArchetype` is visible in the HTML/CSS output.
25. Do not allow every slide to become a card. Validate that `visualForm` is visible in the HTML/CSS output and that a deck uses at least five distinct forms when there are enough slides.
26. Keep animated slides as the minority in normal lecture decks. If more than half the deck is animated, the spec needs a strong topic-specific reason.
27. Do not patch a finished deck just to make one slide prettier. If the issue is repeatable generation quality or a visible screenshot false pass, strengthen `screenshot-review.md`, `visual-quality-gate.js`, `design.md`, `few-shots.md`, this skill, or validation gates first.
28. In Codex Desktop, default to interactive orchestration with `spawn_agent` or delegate tools. Use `orchestrated-runner.js` for replay, CI-style checks, or external CLI/API adapters, not as the primary Desktop sub-agent caller.
29. During normal operation, run the state-aware loop from the repository root. Even when the deck is uninitialized, this runs `agent-contract-check` before source/spec generation:

```sh
node lecture-deck/scripts/run-hook.js deck-loop
```

To replay/check the orchestration harness itself after output exists:

```sh
node lecture-deck/scripts/orchestrated-runner.js --validate
```

To connect an external phase agent adapter outside Desktop sub-agent tools, set `DECK_AGENT_COMMAND`. The runner passes the phase contract on stdin and sets `DECK_AGENT_PHASE`, `DECK_AGENT_NAME`, `DECK_AGENT_TASK`, `DECK_AGENT_PROMPT`, and `DECK_AGENT_RUN_ID`.

When the deck is `handoff-ready`, `deck-loop` runs normal output validation: `pre-handoff` and `stop-quality`. It does not run `quality-loop`; run `quality-loop` directly only for harness-engineering improvement work.

If your current working directory is `lecture-deck/`, use:

```sh
node scripts/run-hook.js deck-loop
```

30. Before final handoff, or when you need focused triage, run:

```sh
node scripts/run-hook.js harness-check
node scripts/verify-agent-contracts.js
node scripts/run-hook.js render-check
node scripts/run-hook.js stop-quality
node scripts/run-hook.js pre-handoff
node scripts/run-hook.js quality-loop
node scripts/improvement-loop.js --focus=motion --max-iterations=4 --threshold-percent=10
node scripts/motion-mutation-loop.js --max-mutants=7
```

Treat `quality-loop` as the combined harness-engineering gate. If `improvement-loop` reports `gateHealth: failed` or `motion-mutation-loop` reports survived mutants, route the issue to workflow/harness improvement rather than current slide polish.

30. If `stop-quality` fails, read `.deck-quality/quality-remediation-plan.json` and route remediation into two tracks:
    - workflow/harness fixes via `.codex/agents/deck-workflow-improver.toml`
    - current output fixes via `.codex/agents/deck-output-regenerator.toml`
    - for Claude-style/local markdown workflows, use `agents/workflow-improver.md` and `agents/output-regenerator.md`.

## Validation

Fast harness-only gate:

```sh
node scripts/run-hook.js harness-check
```

Browser render gate:

```sh
node scripts/run-hook.js render-check
```

Full handoff gate:

```sh
node scripts/run-hook.js pre-handoff
```

Screenshot quality gate:

```sh
node scripts/run-hook.js stop-quality
```

State-aware loop:

```sh
node scripts/run-hook.js deck-loop
```

The full gate must fail on:

- missing required deck files
- thin or undocumented research source briefs
- too few trusted/official documentation URLs for current or source-sensitive topics
- slide evidence URLs that are untrusted or missing from `source.md`
- local image assets without source, publisher, checked date, license/source check, and edit notes
- missing asset manifest coverage when local raster images are required
- CSS-only overuse when `current-run.json.assetRequirements.maximumCssModuleShare` is set
- broken local links
- `.note` exposure in `deck.html`
- missing presenter scripts in `presenter-review.html`
- desktop or mobile overflow
- unsafe keyframe properties
- missing reduced-motion fallback when animation exists
- missing or repetitive `visualArchetype` values
- missing or repetitive `visualForm` values
- missing, contradictory, or overused `motionDecision` values
- motion slides that declare `motion` but have no active animation
- active animations under `prefers-reduced-motion: reduce`
- screenshot quality failures with report and screenshots in `.deck-quality/`
- realistic motion regressions in the mutation loop, including no animation, thin motion, no stagger, unsafe timing, missing reduced-motion behavior, raw timing tokens, and unsafe keyframe properties

## Report

Use Korean. Include:

- changed files
- exact command
- pass/fail summary
- remaining risk
- local URL when a server was used
