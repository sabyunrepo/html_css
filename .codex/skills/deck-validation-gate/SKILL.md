---
name: deck-validation-gate
description: Use when running or interpreting pre-handoff validation, local deck hooks, animation safety checks, browser overflow checks, presenter review checks, or handoff reports.
---

# Deck Validation Gate

Use this skill for final validation and hook triage.

## Required Commands

Fast harness-only gate:

```sh
node lecture-deck/scripts/run-hook.js harness-check
```

Browser render gate:

```sh
node lecture-deck/scripts/run-hook.js render-check
```

Full handoff gate:

```sh
node lecture-deck/scripts/run-hook.js pre-handoff
```

These execute `lecture-deck/hooks/*.json`, which run `lecture-deck/scripts/verify-deck.js` in `harness`, `render`, or `all` mode.

## Interpret Failures

Separate failures into:

- harness/config failure: missing files, broken links, invalid spec shape, hook error
- visual safety failure: unsafe keyframe property, missing reduced-motion fallback, infinite animation
- runtime motion failure: declared motion has no animation, reduced-motion still animates
- rendered fixture failure: desktop/mobile overflow, note exposure, missing presenter script

Do not weaken a check to get a pass. Fix the source or report the exact failing gate.

## Output

Use Korean with exactly these sections:

```text
발견:
수행:
판단:
미해결:
```

Include command, exit status, and the smallest useful failure evidence.
