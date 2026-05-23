---
name: deck-spec-review
description: Use when reviewing HTML/CSS lecture deck slide specs for flow, information density, evidence alignment, speaker-note separation, or missing motion fields.
---

# Deck Spec Review

Use this skill before editing slide HTML or CSS.

## Read First

1. `lecture-deck/slide-spec.json`
2. `lecture-deck/source.md`
3. `lecture-deck/design.md`
4. `lecture-deck/few-shots.md`

## Checks

1. Every slide has one message.
2. `title`, `message`, `visual`, `speakerNote`, and `evidence` are present.
3. Screen text stays shorter than presenter notes.
4. Evidence supports the actual slide claim, not just the general topic.
5. Adjacent slides have a clear narrative transition.
6. Optional `motion` exists only when animation helps understanding.
7. If `motion` exists, it includes `type`, `mood`, `sequence`, `loop`, and `reducedMotion`.

## Output

Use Korean with exactly these sections:

```text
발견:
수행:
판단:
미해결:
```

Reference slide IDs and file paths. Do not rewrite the deck unless explicitly assigned.
