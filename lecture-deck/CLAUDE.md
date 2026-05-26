# CLAUDE.md

## Mission

Build HTML/CSS lecture decks from source material through a repeatable harness:

```text
prompt contract -> source brief -> slide spec -> HTML/CSS deck -> presenter review -> screenshot review -> verification -> handoff
```

## Rules

- Read `prompt-layer.md`, `current-run.json`, `tool-layer.md`, `tool-policy.json`, `agent-handoff.schema.json`, `screenshot-review.md`, `source.md`, `slide-spec.json`, `design.md`, `motion.md`, and `few-shots.md` before editing slides.
- Use `prompt-layer.md` to separate one-run intent from durable rules, skills, hooks, and evaluation cases.
- Use `tool-policy.json` to enforce research, browser, screenshot, script, MCP, and agent tool boundaries.
- Treat `slide-spec.json` as the contract. Every slide must define `title`, `message`, `visual`, `speakerNote`, and `evidence`.
- Use optional `motion` only for slides that need generated CSS visual animation. If `motion` exists, it must define `type`, `mood`, `sequence`, `loop`, and `reducedMotion`.
- Use `slides/*.html` for individual slides and keep shared behavior in `assets/`.
- Keep `.note` content out of `deck.html`; it is only for presenter review and source slide editing.
- Show `speakerNote` and evidence in `presenter-review.html`.
- Prefer CSS visuals for repeated diagrams, rails, cards, and flow maps.
- Before writing animated CSS, draft a visual motion brief and follow `design.md` Motion Contract plus `motion.md` recipes.
- Use motion tokens from `assets/style.css`; do not invent one-off duration, easing, delay, or entry-distance values.
- In `@keyframes`, animate only `transform` and `opacity`. Add `prefers-reduced-motion: reduce` fallback whenever animation exists.
- Verify desktop and mobile overflow before handoff.
- Treat visible screenshot failures after a passing hook as a harness defect, not as a reason to lower the visual bar.
- Update `HANDOFF.md` with decisions, verification result, remaining risks, and the next prompt.

## Output Order

1. Update source brief if the input material changed.
2. Update slide spec before touching slide HTML.
3. Propose `motion` fields and wait for confirmation when the user requested a spec gate.
4. Update few-shot examples when output shape needs to be fixed.
5. Build or edit slide HTML/CSS/JS.
6. For normal operation, run `node scripts/run-hook.js deck-loop`; it detects uninitialized, spec-ready, output-ready, and handoff-ready states.
7. For triage, run `node scripts/run-hook.js harness-check` and `node scripts/run-hook.js render-check` separately when needed.
8. Run `node scripts/run-hook.js pre-handoff` only when final handoff content is present.
9. For CSS animation-only smoke checks, run `node scripts/improvement-loop.js --focus=motion --max-iterations=4 --threshold-percent=10`.
10. To verify that motion gates catch realistic failures, run `node scripts/motion-mutation-loop.js --max-mutants=7`.
11. Report using `evaluation-template.md`.
12. Update `HANDOFF.md`.
