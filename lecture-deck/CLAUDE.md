# CLAUDE.md

## Mission

Build HTML/CSS lecture decks from source material through a repeatable harness:

```text
source brief -> slide spec -> HTML/CSS deck -> presenter review -> verification -> handoff
```

## Rules

- Read `source.md`, `slide-spec.json`, `design.md`, and `few-shots.md` before editing slides.
- Treat `slide-spec.json` as the contract. Every slide must define `title`, `message`, `visual`, `speakerNote`, and `evidence`.
- Use optional `motion` only for slides that need generated CSS visual animation. If `motion` exists, it must define `type`, `mood`, `sequence`, `loop`, and `reducedMotion`.
- Use `slides/*.html` for individual slides and keep shared behavior in `assets/`.
- Keep `.note` content out of `deck.html`; it is only for presenter review and source slide editing.
- Show `speakerNote` and evidence in `presenter-review.html`.
- Prefer CSS visuals for repeated diagrams, rails, cards, and flow maps.
- Before writing animated CSS, draft a visual motion brief and follow `design.md` Motion Contract.
- In `@keyframes`, animate only `transform` and `opacity`. Add `prefers-reduced-motion: reduce` fallback whenever animation exists.
- Verify desktop and mobile overflow before handoff.
- Update `HANDOFF.md` with decisions, verification result, remaining risks, and the next prompt.

## Output Order

1. Update source brief if the input material changed.
2. Update slide spec before touching slide HTML.
3. Propose `motion` fields and wait for confirmation when the user requested a spec gate.
4. Update few-shot examples when output shape needs to be fixed.
5. Build or edit slide HTML/CSS/JS.
6. For triage, run `node scripts/run-hook.js harness-check` and `node scripts/run-hook.js render-check` separately when needed.
7. Run `node scripts/run-hook.js pre-handoff`.
8. Report using `evaluation-template.md`.
9. Update `HANDOFF.md`.
