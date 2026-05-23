---
name: deck-visual-motion
description: Use when generating or reviewing CSS visuals, infographic scenes, keyframes, motion specs, reduced-motion behavior, or overflow risk in an HTML/CSS lecture deck.
---

# Deck Visual Motion

Use this skill for visual-generation and visual-review tasks.

## Read First

1. `lecture-deck/design.md`
2. `lecture-deck/slide-spec.json`
3. `lecture-deck/few-shots.md`
4. `lecture-deck/assets/style.css`
5. `lecture-deck/assets/visuals.css` if present

## Motion Brief

Before CSS, write a short internal brief:

```text
Slide:
Meaning:
Motion:
Allowed properties: transform, opacity
Reduced motion:
Risk:
```

If motion does not clarify the slide meaning, keep the visual static.

## CSS Rules

- Put deck shell, typography, and layout in `assets/style.css`.
- Put CSS illustrations, motion tokens, and keyframes in `assets/visuals.css`.
- In `@keyframes`, use only `transform` and `opacity`.
- Do not animate layout or paint-heavy properties: `top`, `left`, `width`, `height`, `margin`, `padding`, `background`, `box-shadow`, `filter`, `border`, or `color`.
- Prefer finite animation with `animation-fill-mode: both`.
- Add `@media (prefers-reduced-motion: reduce)` whenever animation exists.
- Use `will-change` only on small animated elements.
- Check desktop and mobile overflow before claiming visual quality.

## Output

Use Korean with exactly these sections:

```text
발견:
수행:
판단:
미해결:
```
