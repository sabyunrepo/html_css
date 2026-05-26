---
name: deck-css-motion-generation
description: Use when generating or reviewing purposeful CSS motion for lecture-deck slides from motionPlan contracts, visualForm, and existing motion recipes.
---

# Deck CSS Motion Generation

## Required Inputs

- `slide.id`
- `slide.visualForm`
- `slide.motionDecision.mode`
- `slide.motionDecision.reason`
- optional `slide.motionPlan` when mode is `animated`
- current `lecture-deck/motion.md`
- current `lecture-deck/assets/style.css`
- current `lecture-deck/assets/visuals.css`

## Motion Plan Schema

Animated slides must include:

```json
{
  "purpose": "what the motion explains",
  "recipe": "input-output-reveal | rail-sequence | hub-branch | step-path | focus-then-result",
  "targets": [
    {
      "selector": ".meaningful-target",
      "effect": "enter | rail-grow | scale-in | settle",
      "delayStep": 0
    }
  ],
  "mustNotAnimate": [".copy", "h1", ".subtitle"],
  "reducedMotion": "show final state"
}
```

## Visual Form Motion Rules

- `evidence-image`: static by default. Do not animate the image.
- `interface-mock`: user prompt enters, reply enters, canvas/result appears.
- `process-rail`: rail grows first, then steps appear in sequence.
- `hub-map`: hub appears first, destinations branch out with staggered delays.
- `step-path`: path grows first, then step nodes appear in order.
- `funnel`: sources settle first, neck/result appears last.
- `document-template`, `token-board`, `triage-table`, `radial-map`: static unless the spec explains a state change.

## CSS Rules

- Use pure CSS keyframes only.
- Animate only `transform` and `opacity`.
- Use `--motion-fast`, `--motion-medium`, `--motion-slow`, `--motion-rise`, `--motion-scale-start`, `--delay-step`, and `--ease-calm`.
- Add every animated selector to `@media (prefers-reduced-motion: reduce)`.
- Do not animate text readability, layout, colors, borders, shadows, backgrounds, widths, or heights.

## Rejection Rules

- Reject one shared `card-place` animation for every visual form.
- Reject motion with fewer than three meaningful targets unless the slide has only one visual object and the reason explains why.
- Reject static slides that contain active animation.
- Reject animated slides where DOM selectors do not match `motionPlan.targets`.
- Reject decorative motion that does not explain sequence, focus, state change, or cause/effect.
