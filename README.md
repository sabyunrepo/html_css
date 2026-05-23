# HTML/CSS Deck Automation Harness

Reusable workflow harness for creating browser-native lecture decks with HTML/CSS.

## What This Repo Contains

- Codex agents and skills for deck research, slide review, visual motion, validation, screenshot quality review, workflow improvement, and output regeneration.
- Project-local hooks for harness checks, render checks, screenshot quality checks, and pre-handoff validation.
- Browser-based deck shell files: `deck.html`, `presenter-review.html`, `assets/style.css`, `assets/deck.js`, and `assets/presenter-review.js`.
- Verification scripts under `lecture-deck/scripts/`.
- Design and few-shot guidance under `lecture-deck/`.

## What This Repo Does Not Contain

Generated deck content is intentionally excluded:

- `lecture-deck/source.md`
- `lecture-deck/slide-spec.json`
- `lecture-deck/HANDOFF.md`
- `lecture-deck/slides/*.html`
- `lecture-deck/.deck-quality/`

Create those per deck run.

## Workflow

1. Write `lecture-deck/source.md`.
2. Propose `lecture-deck/slide-spec.json` and get approval.
3. Generate `lecture-deck/slides/*.html`, `lecture-deck/assets/slides.js`, and if needed `lecture-deck/assets/visuals.css`.
4. Run:

```sh
node lecture-deck/scripts/run-hook.js harness-check
node lecture-deck/scripts/run-hook.js render-check
node lecture-deck/scripts/run-hook.js stop-quality
node lecture-deck/scripts/run-hook.js pre-handoff
```

If `stop-quality` fails, read `lecture-deck/.deck-quality/quality-remediation-plan.json` and route work into:

- `.codex/agents/deck-workflow-improver.toml`
- `.codex/agents/deck-output-regenerator.toml`

## Local Preview

After deck content has been generated:

```sh
cd lecture-deck
python3 -m http.server 58940 --bind 127.0.0.1
```

Open `http://127.0.0.1:58940/deck.html`.
