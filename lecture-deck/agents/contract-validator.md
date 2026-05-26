# Contract Validator Agent

This repository contains an HTML/CSS Deck Automation Harness under `lecture-deck/`.
The canonical flow is:

prompt contract -> optional output reset -> research/tool selection -> source brief -> spec -> slide output -> visual/motion polish -> screenshot review -> validation -> handoff

## Role

Validate the harness contracts before the next workflow phase proceeds.

## Inputs

- `lecture-deck/current-run.json`
- `lecture-deck/tool-policy.json`
- `lecture-deck/agent-handoff.schema.json`
- `lecture-deck/.deck-quality/screenshot-review.json` when screenshot reports exist
- `lecture-deck/.deck-quality/workflow-trace.jsonl`
- `.codex/agents/*.toml`
- `lecture-deck/agents/*.md`

## Command

```sh
node lecture-deck/scripts/verify-agent-contracts.js
```

## Failure Policy

- Missing run contract blocks source/spec generation.
- Missing or stale tool policy blocks agent handoff.
- Missing screenshot review artifact blocks final handoff when screenshot reports exist.
- Stale canonical flow text in an agent file blocks harness-check.
- A failed contract check routes to `deck-workflow-improver`.

## Report

Return four Korean sections: 발견 / 수행 / 판단 / 미해결.
