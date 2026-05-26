---
name: deck-visual-motion
description: Design or review HTML/CSS deck visuals and motion. Use when creating or reviewing CSS visual modules, Lucide icons, local raster assets, keyframes, reduced-motion fallbacks, and overflow-safe slide layouts.
---

# Deck Visual Motion

## Read First

1. `.codex/skills/deck-css-motion-generation/SKILL.md`
2. `.codex/skills/deck-visual-hierarchy-layout/SKILL.md`
3. `.codex/skills/deck-asset-selection/SKILL.md`
4. `lecture-deck/design.md`
5. `lecture-deck/slide-spec.json`
6. `lecture-deck/motion.md`
7. `lecture-deck/few-shots.md`
8. `lecture-deck/assets/style.css`
9. `lecture-deck/assets/visuals.css` when present

## Visual Motion Brief

Before CSS animation, write or verify `motionPlan`:

```text
Slide:
visualForm:
purpose:
recipe:
targets:
mustNotAnimate:
reducedMotion:
Risk:
```

If motion does not clarify sequence, focus, state change, or cause/effect, keep the visual static.

## Visual Rules

- Put design and motion tokens in `assets/style.css`; put visual styling and keyframes in `assets/visuals.css`.
- Before styling, classify each visible item as primary message, primary evidence/action, secondary constraint, or metadata. Use size, placement, and grouping to make that ranking obvious.
- If an official image or concrete example teaches the slide, make it primary evidence/action rather than a small captioned thumbnail.
- Use `importanceMap` for layout hierarchy and `assetDecision` for visual asset mode before writing HTML/CSS.
- Use CSS for layout, cards, paper texture, simple rails, dividers, and motion surfaces.
- Use HTML/CSS cards, rails, labels, and Lucide icons for common semantic objects and actions: lock, key, phone, browser, server, warning, check, x, arrow, shield, user, clock, file, link, settings.
- Do not create large pure-black or near-black filled surfaces. Use dark ink for strokes, text, small labels, and compact badges only; large terminal panes, hubs, screenshots, and preview cards need warm charcoal, blue-charcoal, cream, or paper fills.
- Do not create custom drawing markup or external drawing asset dependencies for deck visuals.
- Lucide icons are the only inline icon markup allowed by default; the rest of the visual should remain HTML/CSS.
- Use local raster images only for large conceptual/human/product scenes that cannot be explained with HTML/CSS modules.
- Keep local image source notes in `assets/illustrations/README.md`.
- Do not add external visual CDNs or runtime dependencies.

## Motion Rules

- Animate only `transform` and `opacity`.
- Follow `.codex/skills/deck-css-motion-generation/SKILL.md` and use existing recipes from `motion.md` before adding new keyframes.
- Use motion tokens from `assets/style.css` for duration, delay, easing, and entry distance.
- Do not animate layout or paint-heavy properties: `top`, `left`, `width`, `height`, `margin`, `padding`, `background`, `box-shadow`, `filter`, `border`, or `color`.
- Prefer finite animation with `animation-fill-mode: both`.
- Animated slides require `motionPlan` with meaningful targets, staggered timing, `mustNotAnimate`, and reduced-motion final state.
- Static slides must not contain active animation.
- Add `@media (prefers-reduced-motion: reduce)` whenever animation exists.
- Check desktop and mobile overflow before claiming visual quality.
