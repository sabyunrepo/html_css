---
name: deck-output-reset
description: Reset only generated lecture-deck outputs so the deck harness, agents, skills, scripts, hooks, and design workflow remain ready for a new topic. Use when the user asks to delete, clear, initialize, reset, or prepare deck outputs before generating another subject.
---

# Deck Output Reset

## Purpose

Use this skill before generating a new deck topic when stale output must not leak
into the next run.

This reset keeps the reusable workflow and removes only generated topic output.

## Preserve

Do not delete or modify:

- `.codex/skills/**`
- `.codex/agents/**`
- `.codex/hooks.json`
- `lecture-deck/agents/**`
- `lecture-deck/skills/**`
- `lecture-deck/scripts/**`
- `lecture-deck/hooks/**`
- `lecture-deck/design.md`
- `lecture-deck/design-quality.md`
- `lecture-deck/motion.md`
- `lecture-deck/few-shots.md`
- `lecture-deck/evaluation-template.md`
- `lecture-deck/AGENTS.md`
- `lecture-deck/CLAUDE.md`
- `lecture-deck/assets/deck.js`
- `lecture-deck/assets/presenter-review.js`
- `lecture-deck/assets/style.css`
- `lecture-deck/assets/illustrations/manifest.schema.json`
- `lecture-deck/deck.html`
- `lecture-deck/presenter-review.html`
- `lecture-deck/slides/.gitkeep`
- `lecture-deck/assets/illustrations/README.md`

## Reset

Remove generated deck output:

- `lecture-deck/source.md`
- `lecture-deck/slide-spec.json`
- `lecture-deck/HANDOFF.md`
- `lecture-deck/assets/slides.js`
- `lecture-deck/assets/visuals.css`
- `lecture-deck/slides/*.html`
- `lecture-deck/slides/assets/`
- `lecture-deck/.deck-quality/`
- `lecture-deck/.deck-quality-archive/`
- `.codex/stop-continuation-state.json`
- every local raster/generated file under `lecture-deck/assets/illustrations/`

Normalize preserved shell metadata:

- reset `lecture-deck/deck.html` title/topbar text to `HTML/CSS Deck Automation Harness`
- reset `lecture-deck/presenter-review.html` title/heading to the same neutral title
- reset generated cache query strings such as `?v=<old-topic>` to `?v=harness`
- reset `lecture-deck/assets/illustrations/manifest.json` to an empty manifest with `assets: []`
- reset `lecture-deck/current-run.json` to a neutral starter-safe run contract so no prior topic leaks into the next run

## Required Command

Always dry-run first:

```sh
node .codex/skills/deck-output-reset/scripts/reset-deck-output.js --dry-run
```

Apply only after confirming the listed files are generated output:

```sh
node .codex/skills/deck-output-reset/scripts/reset-deck-output.js --apply
```

## After Reset

The deck is intentionally not handoff-ready until a new topic is generated.
Next use `deck-builder` from research through generation:

```text
research -> source.md -> slide-spec.json -> slides/assets -> validation -> HANDOFF.md
```

## Report

Report in Korean:

- whether reset was dry-run or applied
- deleted/generated-output paths
- preserved workflow areas
- next command for creating the new topic
