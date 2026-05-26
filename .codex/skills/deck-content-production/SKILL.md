---
name: deck-content-production
description: Produce complete HTML/CSS lecture deck output from researched material. Use when creating or updating source.md, slide-spec.json, slides/*.html, assets/slides.js, assets/visuals.css, and HANDOFF.md after research or user-provided source material.
---

# Deck Content Production

## Inputs

- Researcher output or user-provided source material
- `.codex/skills/deck-source-evidence-contract/SKILL.md`
- `.codex/skills/deck-asset-selection/SKILL.md`
- `.codex/skills/deck-visual-hierarchy-layout/SKILL.md`
- `.codex/skills/deck-css-motion-generation/SKILL.md`
- `lecture-deck/design.md`
- `lecture-deck/motion.md`
- `lecture-deck/few-shots.md`
- `lecture-deck/eval-corpus/deck-quality-cases.jsonl` when present

## Output Files

- `lecture-deck/source.md`
- `lecture-deck/slide-spec.json`
- `lecture-deck/slides/*.html`
- `lecture-deck/assets/slides.js`
- `lecture-deck/assets/visuals.css`
- `lecture-deck/HANDOFF.md`

## Production Rules

1. Write compact `source.md` that satisfies `deck-source-evidence-contract`: topic, audience, duration, objective, evidence list, research selection notes, image and asset decisions, slide-visible claims, speaker-note context, and unresolved risks.
2. Write `slide-spec.json` before slide HTML.
3. Each slide spec includes `id`, `file`, `title`, `message`, `visual`, `speakerNote`, `evidence`, `importanceMap`, `assetDecision`, `visualForm`, and `motionDecision`.
4. Stop before generation when the source brief is thin, slide-visible claims lack evidence, or `slide-spec.json` evidence URLs do not appear in `source.md`.
5. Add `motionPlan` only when `motionDecision.mode` is `animated`; static slides must not include active animation.
6. Use the `deck-css-motion-generation` schema for animated slide targets, `mustNotAnimate`, and reduced-motion behavior.
7. Screen copy is shorter than speaker notes.
8. Each slide HTML contains one `.slide`, one `.copy`, one `.visual`, heading, `.subtitle`, and `.note`.
9. Keep `.note` presenter-only.
10. Before writing layout, use `importanceMap` to rank visible content as primary message, primary evidence/action, secondary constraints, and metadata.
11. Allocate size and position from that ranking: primary evidence/action must not be reduced to a thumbnail when it teaches the slide.
12. Use `assetDecision` to choose official image, local raster, Lucide/HTML/CSS, CSS module, or no visual.
13. Use meaningful visuals, not placeholder boxes.
14. Use HTML/CSS cards, rails, labels, and Lucide icons for semantic visuals.
15. Do not use pure black or near-black as a large filled surface. Dark ink is for text, strokes, small labels, and small state badges; terminal panes, hubs, preview cards, and large blocks need warm charcoal, blue-charcoal, paper, or cream fills.
16. Keep CSS drawings simple and readable; use local raster images only when a full polished scene is necessary.
17. Store local raster assets in `lecture-deck/assets/illustrations/` and update that README with source URL, license page checked, date, and edits.
18. Put reusable visual classes and keyframes in `assets/visuals.css`.
19. Use `lecture-deck/motion.md` recipes and `assets/style.css` motion tokens before inventing new keyframes or timing values.
20. Animate only `transform` and `opacity`; add reduced-motion fallback when animation exists.
21. Update `HANDOFF.md` with decisions, validation status, remaining risks, and next prompt.

## Quality Loop

Run:

```sh
node lecture-deck/scripts/run-hook.js deck-loop
```

If it fails, read `.deck-quality/validation-result.json`, `.deck-quality/visual-quality-report.md`, and `.deck-quality/quality-remediation-plan.json`, then split workflow fixes from current output fixes.
