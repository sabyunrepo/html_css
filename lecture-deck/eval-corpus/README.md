# Deck Eval Corpus

This directory stores lightweight, commit-friendly learning cases from deck validation and screenshot quality loops.

Generated screenshots and detailed reports stay in `lecture-deck/.deck-quality/` and are ignored by Git. Durable cases belong in `deck-quality-cases.jsonl` with one JSON object per line.

Use these cases to update:

- `lecture-deck/design.md`
- `lecture-deck/few-shots.md`
- `.codex/skills/*/SKILL.md`
- `lecture-deck/scripts/visual-quality-gate.js`
