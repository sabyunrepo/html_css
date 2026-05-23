# Codex instructions for `lecture-deck/`

This directory is an HTML/CSS Deck Automation Harness.

## Required workflow

When creating or updating this deck, follow this order:

1. Read `source.md`, `slide-spec.json`, `design.md`, `few-shots.md`, and `HANDOFF.md`.
2. Treat `slide-spec.json` as the contract for slide order, title, message, visual, speaker note, and evidence.
3. Use optional `motion` only when animation improves understanding.
4. Before animated CSS, draft a visual motion brief and follow `design.md`.
5. Keep presenter-only content in `.note` and `speakerNote`.
6. Do not expose `.note` in `deck.html`.
7. Keep shared behavior in `assets/`, slide content in `slides/`, shell CSS in `assets/style.css`, and CSS visuals/keyframes in `assets/visuals.css`.
8. Before handoff or final completion, run:

```sh
node scripts/run-hook.js pre-handoff
```

For faster triage:

```sh
node scripts/run-hook.js harness-check
node scripts/run-hook.js render-check
```

## Reporting

Use `evaluation-template.md` for final reports. Include changed files, command output summary, remaining risks, and the local URL if a server was used.

## Codex-native assets

- Project hook: `.codex/hooks.json`
- Project config: `.codex/config.toml`
- Project skill: `.codex/skills/deck-builder/SKILL.md`
- Shared deck skill: `skills/deck-builder/SKILL.md`
- Role skills:
  - `.codex/skills/deck-research-brief/SKILL.md`
  - `.codex/skills/deck-spec-review/SKILL.md`
  - `.codex/skills/deck-visual-motion/SKILL.md`
  - `.codex/skills/deck-validation-gate/SKILL.md`
- Review agents:
  - `.codex/agents/deck-researcher.toml`
  - `.codex/agents/deck-slide-reviewer.toml`
  - `.codex/agents/deck-visual-reviewer.toml`
  - `.codex/agents/deck-validation-runner.toml`

Main Codex owns scope, edits, and final judgment. Reviewer/validator agents return findings only.
