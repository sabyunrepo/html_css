---
theme: apple
fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
transition: fade-out
mdc: true
---

# Apple-style HTML/CSS Deck Design Guide

## Intent

Use a minimal Apple/Slidev-inspired presentation style. The deck should feel calm, spacious, and presentation-ready, not like a dashboard or card-heavy web app.

## Typography

- Use the system font stack only:
  `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`
- Avoid external font loading.
- Keep letter spacing at `0`.
- Use large headings only for slide-level statements.
- Use short supporting copy and generous line height.

## Layouts

- `layout-title`: first slide, strong title signal, lots of whitespace.
- `layout-intro`: one message or quote, centered or near-centered.
- `layout-cols-2`: left side for the claim, right side for a quiet visual or structured evidence.
- `layout-center`: one central idea, one central visual, no dense side content.

## Visual Style

- Prefer whitespace and thin hairlines over boxes.
- Avoid thick black borders, decorative shadows, and boxed dashboard cards.
- Use low-contrast surfaces: white, near-white, soft gray.
- Use one restrained accent color only for emphasis.
- Use CSS visuals for repeated diagrams and avoid stock-like imagery.

## CSS Visual Quality

- Treat every CSS visual as a small information graphic, not a placeholder box.
- Prefer semantic scene classes such as `moment-visual`, `flag-ceremony-scene`, and `closing-lights`.
- Use depth through static gradients, thin guide lines, layering, and whitespace.
- For complex symbolic shapes, inline SVG or structured spans are allowed when they reduce fragile div nesting.
- Do not add Tailwind, UnoCSS, or external animation runtimes to this plain HTML/CSS deck.

## Motion Contract

- Motion must explain the slide idea: pause, lower, connect, remember, or focus.
- Motion is specified before CSS is written. Do not add animation ad hoc while polishing a slide.
- In `@keyframes`, animate only `transform` and `opacity` by default.
- Never animate layout properties: `top`, `left`, `right`, `bottom`, `width`, `height`, `margin`, or `padding`.
- Never animate paint-heavy properties: `background`, `background-color`, `box-shadow`, `filter`, `border`, or `color`.
- Use CSS variables for duration and easing tokens.
- Use finite animations with `animation-fill-mode: both`; avoid infinite loops unless the visual is explicitly ambient and tiny.
- Use `will-change` only on small moving elements that actually animate.
- Include `@media (prefers-reduced-motion: reduce)` so visual content stays readable without motion.

## Motion Spec Field

Use optional `motion` only when a slide needs a generated visual animation:

```json
{
  "type": "clock-pause",
  "mood": "solemn",
  "sequence": ["ring-breathe", "bar-pulse"],
  "loop": "finite",
  "reducedMotion": "static-final-state"
}
```

- `type`: stable generator hint for the visual scene.
- `mood`: tone guardrail. It should shape timing and restraint, not add decorative effects.
- `sequence`: ordered motion beats that explain the slide.
- `loop`: must be `finite` unless a tiny ambient element is explicitly justified.
- `reducedMotion`: required fallback behavior for accessibility.

## Visual Motion Brief

Before generating slide HTML/CSS, write a brief for each animated visual:

```text
Slide: 03-moment
Meaning: Everyone pauses together at 10:00.
Motion: clock hand settles, ring breathes once, pause bars quiet down.
Allowed properties: transform, opacity.
Reduced motion: static final state.
Risk: motion must not cover the title or become festive.
```

If the brief cannot explain why the motion improves understanding, keep the visual static.

## Slide Rules

- One slide, one message.
- Screen text should be shorter than presenter notes.
- Keep visual blocks subordinate to the message.
- Avoid layout asymmetry in `layout-cols-2`; text and visual should have similar visual weight.
- Do not expose `.note` in `deck.html`.
- Presenter review must show `speakerNote` and `evidence`.
