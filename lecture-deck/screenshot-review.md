# Screenshot Review Gate

## Purpose

Screenshot review is the perceptual quality gate for the deck. It checks the rendered artifact, not only the source files.

`scripts/visual-quality-gate.js` is the executable gate. This file is the human-readable contract that explains what the gate must protect.

## Required Screenshot Set

`stop-quality` must produce:

- One desktop screenshot near initial render for each slide.
- One desktop screenshot after motion has settled for each slide.
- One mobile screenshot for each slide.
- One presenter-review screenshot.

Screenshots are written to `.deck-quality/screenshots/`.

The settled screenshots must be animation-aware. The gate must inspect the active
slide's rendered CSS animations and wait until the largest finite
`delay + duration * iterations + endDelay` value has elapsed, plus a small
stabilization buffer. A fixed timestamp such as 900ms is not enough when
`motionPlan` uses staggered targets. If a settled screenshot captures visible
mid-animation opacity or transform state, treat it as a harness failure and
route it to `deck-workflow-improver`.

## Pass Bar

A slide passes only when:

- The main message is clear within 3 seconds.
- Text has readable contrast against its actual rendered background.
- Large pure-black or near-black filled surfaces are rejected unless the slide evidence requires a literal black object; dark ink is for text, strokes, small labels, and compact badges.
- Korean text does not collapse into one-character or overly narrow columns.
- Compact visual labels do not split into broken fragments inside badges,
  counters, markers, or fixed-format modules.
- Primary evidence/action from `importanceMap` is large enough to matter.
- Visuals match `visualForm`; selector presence alone is not enough.
- Semantic modules do not overlap or clip outside the visual safe area.
- Navigation controls do not cover slide content.
- Motion matches `motionPlan`, is finite, and disappears under reduced motion.

## Failure Routing

- Current slide HTML/CSS defects route to `deck-output-regenerator`.
- Repeated generation pattern defects route to `deck-workflow-improver`.
- Weak visual form diversity routes to `deck-spec-review` and `deck-visual-hierarchy-layout`.
- Weak motion use routes to `deck-css-motion-generation`.
- Weak evidence or image choice routes to `deck-research-brief` and `deck-asset-selection`.

## Non-Negotiable Rule

Do not accept a deck because `deck-loop` passed if the screenshots show broken layout, unreadable text, irrelevant imagery, or decorative motion. A visual false pass is a harness defect.
