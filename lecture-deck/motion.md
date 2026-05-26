# CSS Motion Reference

This file is the reusable motion recipe catalog for `lecture-deck`.
Use it with `design.md`, `few-shots.md`, and `assets/visuals.css` when creating
or reviewing animated slide visuals.

## One-line Summary

Motion is pure CSS in `assets/visuals.css`. It exists to explain sequence,
focus, state change, or cause/effect. It must not make text harder to read or
move layout.

For generation, `motionPlan` in `slide-spec.json` is the source of truth.
Use `.codex/skills/deck-css-motion-generation/SKILL.md` for visual-form-specific motion selection.

## Source Files

- Motion tokens: `assets/style.css` `:root`
- Motion recipes and keyframes: `assets/visuals.css`
- Motion validation: `scripts/verify-deck.js`
- Slide-level motion contract: `slide-spec.json` `motionDecision` and animated-only `motionPlan`
- Detailed generation contract: `.codex/skills/deck-css-motion-generation/SKILL.md`

`requestAnimationFrame` usage in `scripts/verify-deck.js` is only for browser
render stabilization during validation. It is not a deck motion mechanism.

## Motion Tokens

Use these CSS custom properties instead of ad hoc timing values:

- `--motion-fast`: short supporting element reveal
- `--motion-medium`: default card or step reveal
- `--motion-slow`: rails, connectors, or larger sequence elements
- `--motion-rise`: vertical entry distance for placed elements
- `--motion-scale-start`: compact start scale for line/ink reveals
- `--delay-step`: stagger unit for ordered sequences
- `--delay-nudge`: small offset when a child detail should follow its parent
- `--ease-calm`: default easing for deck motion

## Hard Rules

- Animate only `transform` and `opacity` inside `@keyframes`.
- Do not animate `top`, `left`, `width`, `height`, `margin`, `padding`,
  `background`, `background-position`, `box-shadow`, `filter`, `border`,
  `border-color`, or `color`.
- Prefer finite animation with `animation-fill-mode: both`.
- Do not use `infinite` animation unless the project motion contract is changed
  and the validation gate is updated in the same workflow.
- Every animated selector must have a `prefers-reduced-motion: reduce`
  fallback that leaves the final state readable.
- If existing `transform` is needed for positioning, include the same transform
  structure inside the keyframe instead of overwriting it.

## Recipe Catalog

### `card-place`

Use for cards, rows, and step nodes that enter from below.

```css
.deck-frame.is-active .motion-card {
  animation: card-place var(--motion-medium) var(--ease-calm) both;
  animation-delay: calc(var(--delay-step) * 1);
}
```

Use staggered delays for ordered groups: `calc(var(--delay-step) * 1)`,
`calc(var(--delay-step) * 2)`, `calc(var(--delay-step) * 3)`.

### `rail-grow`

Use for vertical or horizontal rails that reveal a connection. Set
`transform-origin` on the element so the rail grows from the meaningful end.

```css
.motion-rail {
  transform-origin: left center;
}

.deck-frame.is-active .motion-rail {
  animation: rail-grow var(--motion-slow) var(--ease-calm) both;
}
```

### `ink-settle`

Use for small supporting strokes, emphasis marks, or line details that settle
into the final drawing.

```css
.deck-frame.is-active .line-mark {
  animation: ink-settle var(--motion-fast) var(--ease-calm) both;
  animation-delay: calc(var(--delay-step) * 2);
}
```

### `passkey-step-in`

Use for passkey ceremony steps or similar ordered state cards. It is a
slide-specific variant of `card-place` for compact step rows.

### `passkey-rail-in`

Use for passkey ceremony rails or similar sequence connectors. It is a
slide-specific variant of `rail-grow`.

## Default Pattern For New Motion

1. Write or verify `motionPlan` from `.codex/skills/deck-css-motion-generation/SKILL.md`.
2. Try the existing recipes before adding a new keyframe.
3. Use `--delay-step` for staggered order.
4. Keep animated targets small and meaningful.
5. Add all new animated selectors to the reduced-motion block.

## Validation Harness

- Use `node scripts/improvement-loop.js --focus=motion --max-iterations=4 --threshold-percent=10`
  only as a smoke drill for CSS animation generation and repair behavior.
- Use `node scripts/motion-mutation-loop.js --max-mutants=7` when you need
  evidence that the motion gate catches realistic defects.
- A motion mutant must be killed by its expected gate. Survived mutants mean the
  workflow cannot distinguish valid motion from a broken pattern yet.
- Current mutation cases cover: no active animation, single-target motion,
  missing stagger, infinite or unsafe timing, reduced-motion failure, raw timing
  token bypass, and unsafe keyframe properties.

## LLM Prompt Insert

Use pure CSS keyframes only. Do not add JavaScript animation or external motion
libraries. Prefer existing recipes: `card-place`, `rail-grow`, `ink-settle`,
`passkey-step-in`, and `passkey-rail-in`. New keyframes are allowed only when
those recipes cannot explain the slide message. Keyframes may animate only
`transform` and `opacity`. Use motion tokens from `assets/style.css`; do not
invent one-off duration, easing, or delay values. Include the reduced-motion
selectors in the output.
