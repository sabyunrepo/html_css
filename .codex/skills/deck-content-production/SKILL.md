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
3. Each slide spec includes `id`, `file`, `title`, `message`, `visual`, `speakerNote`, `evidence`, `importanceMap`, `assetDecision`, `visualForm`, `motionDecision`, `learningObjective`, `audienceQuestion`, `explanationBeats`, `exampleOrScenario`, `misconceptionOrCaveat`, and `takeaway`.
4. `learningObjective` names what the audience should understand or be able to do after this slide.
5. `audienceQuestion` is the question this slide answers for the audience; use it to prevent generic summary slides.
6. `explanationBeats` is an array of at least three ordered teaching beats: concept, mechanism or evidence, implication or decision.
7. `exampleOrScenario` gives the presenter a concrete case, observation, or mini-scenario to make the claim teachable.
8. `misconceptionOrCaveat` states the likely wrong reading, limitation, exception, or nuance the presenter must address.
9. `takeaway` is the one action, judgment, or durable memory the audience should leave with.
10. `speakerNote` must support a 30-60 second spoken explanation. It should follow explanation -> example/scenario -> caveat -> action/takeaway, and must not merely repeat the title, message, or subtitle text.
11. Do not make a deck of summary-only slides. Each slide needs a teachable question, evidence-backed explanation beats, and a concrete example or caveat before HTML generation.
12. Stop before generation when the source brief is thin, slide-visible claims lack evidence, or `slide-spec.json` evidence URLs do not appear in `source.md`.
13. Add `motionPlan` only when `motionDecision.mode` is `animated`; static slides must not include active animation.
14. Use the `deck-css-motion-generation` schema for animated slide targets, `mustNotAnimate`, and reduced-motion behavior.
15. Screen copy is shorter than speaker notes.
16. Keep Korean content-slide headings short enough to render in two lines or fewer at the desktop deck width. If a heading reaches three heavy lines, rewrite the heading before shrinking the visual or subtitle.
17. Each slide HTML contains one `.slide`, one `.copy`, one `.visual`, heading, `.subtitle`, and `.note`.
18. Keep `.note` presenter-only.
19. Before writing layout, use `importanceMap` to rank visible content as primary message, primary evidence/action, secondary constraints, and metadata.
20. Allocate size and position from that ranking: primary evidence/action must not be reduced to a thumbnail when it teaches the slide.
21. Use `assetDecision` to choose official image, local raster, Lucide/HTML/CSS, CSS module, or no visual.
22. Use meaningful visuals, not placeholder boxes.
23. Use HTML/CSS cards, rails, labels, and Lucide icons for semantic visuals.
24. Do not use pure black or near-black as a large filled surface. Dark ink is for text, strokes, small labels, and small state badges; terminal panes, hubs, preview cards, and large blocks need warm charcoal, blue-charcoal, paper, or cream fills.
25. Keep CSS drawings simple and readable; use local raster images only when a full polished scene is necessary.
26. Store local raster assets in `lecture-deck/assets/illustrations/` and update that README with source URL, license page checked, date, and edits.
27. Put reusable visual classes and keyframes in `assets/visuals.css`.
28. Use `lecture-deck/motion.md` recipes and `assets/style.css` motion tokens before inventing new keyframes or timing values.
29. Animate only `transform` and `opacity`; add reduced-motion fallback when animation exists.
30. Update `HANDOFF.md` with decisions, validation status, remaining risks, and next prompt.

## Quality Loop

Run:

```sh
node lecture-deck/scripts/run-hook.js deck-loop
```

If it fails, read `.deck-quality/validation-result.json`, `.deck-quality/visual-quality-report.md`, and `.deck-quality/quality-remediation-plan.json`, then split workflow fixes from current output fixes.
