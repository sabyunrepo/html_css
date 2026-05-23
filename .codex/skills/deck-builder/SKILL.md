---
name: deck-builder
description: Use when creating or updating the HTML/CSS deck automation harness, including source brief, slide spec, slide HTML, presenter review, hook verification, and handoff.
---

# Codex Deck Builder

Use this skill for work under `lecture-deck/`.

## Read first

1. `lecture-deck/source.md`
2. `lecture-deck/slide-spec.json`
3. `lecture-deck/design.md`
4. `lecture-deck/few-shots.md`
5. `lecture-deck/HANDOFF.md`

## Delegation Map

- Research and evidence checks: `.codex/skills/deck-research-brief/SKILL.md`
- Slide flow and spec review: `.codex/skills/deck-spec-review/SKILL.md`
- CSS visual and motion review: `.codex/skills/deck-visual-motion/SKILL.md`
- Hook and handoff validation: `.codex/skills/deck-validation-gate/SKILL.md`
- Screenshot quality review and remediation routing: `.codex/skills/deck-screenshot-quality/SKILL.md`

## Workflow

1. Treat `slide-spec.json` as the source of truth for slide order, title, message, visual, speaker note, and evidence.
2. Source and spec come before output. Update `source.md`, then propose `slide-spec.json`; wait for user confirmation when the user requested a review gate.
3. Add optional `motion` only when the visual needs generated animation. Static slides should omit `motion`.
4. Before writing slide HTML/CSS, draft a short visual motion brief from `slide-spec.json` fields: `visual`, optional `motion.type`, `motion.mood`, `motion.sequence`, and `motion.reducedMotion`.
5. Update `lecture-deck/assets/slides.js` when slide order or metadata changes.
6. Keep individual slide content in `lecture-deck/slides/*.html`.
7. Keep shared deck behavior in `lecture-deck/assets/`.
8. Keep presenter-only content in `.note` and `speakerNote`.
9. Never expose `.note` in `deck.html`.
10. Follow `lecture-deck/design.md` for typography, layout, visual style, and motion rules.
11. Keep deck shell, typography, layout, and responsive basics in `lecture-deck/assets/style.css`.
12. Keep CSS illustrations, keyframes, and motion tokens in `lecture-deck/assets/visuals.css`, imported by `style.css` when animated visuals are generated.
13. Generate CSS motion with the performance harness:
    - Animate only `transform` and `opacity` inside `@keyframes`.
    - Do not animate `top`, `left`, `width`, `height`, `margin`, `padding`, `background`, `box-shadow`, `filter`, `border`, or `color`.
    - Prefer finite keyframes with `animation-fill-mode: both`.
    - Use CSS variables for duration, delay, and easing.
    - Add `prefers-reduced-motion` fallbacks.
    - Use `will-change` only on small elements that actually animate.
14. Prefer meaningful infographic motion over decoration. Complex visuals may use inline SVG or structured spans when that is clearer than nested placeholder boxes.
15. Do not patch a finished deck just to make one slide prettier. If the issue is repeatable generation quality, strengthen `design.md`, `few-shots.md`, or this skill first.
16. Before final handoff, run:

```sh
node lecture-deck/scripts/run-hook.js harness-check
node lecture-deck/scripts/run-hook.js render-check
node lecture-deck/scripts/run-hook.js stop-quality
node lecture-deck/scripts/run-hook.js pre-handoff
```

17. If `stop-quality` fails, read `lecture-deck/.deck-quality/quality-remediation-plan.json` and route remediation into two tracks:
    - workflow/harness fixes via `.codex/agents/deck-workflow-improver.toml`
    - current output fixes via `.codex/agents/deck-output-regenerator.toml`

## Validation

Fast harness-only gate:

```sh
node lecture-deck/scripts/run-hook.js harness-check
```

Browser render gate:

```sh
node lecture-deck/scripts/run-hook.js render-check
```

Full handoff gate:

```sh
node lecture-deck/scripts/run-hook.js pre-handoff
```

Screenshot quality gate:

```sh
node lecture-deck/scripts/run-hook.js stop-quality
```

These execute `lecture-deck/hooks/*.json`, which call `lecture-deck/scripts/verify-deck.js` in `harness`, `render`, or `all` mode.

The gate must fail on:

- missing required deck files
- broken local links
- `.note` exposure in `deck.html`
- missing presenter scripts in `presenter-review.html`
- desktop or mobile overflow
- unsafe keyframe properties
- missing reduced-motion fallback when animation exists
- motion slides that declare `motion` but have no active animation
- active animations under `prefers-reduced-motion: reduce`
- screenshot quality failures with report and screenshots in `lecture-deck/.deck-quality/`

## Report

Use Korean. Include:

- changed files
- exact command
- pass/fail summary
- remaining risk
- local URL when a server was used
