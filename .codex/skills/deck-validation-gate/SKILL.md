---
name: deck-validation-gate
description: Run and interpret HTML/CSS lecture deck validation hooks. Use when checking harness state, render safety, broken links, note exposure, overflow, keyframe safety, motion runtime, reduced-motion behavior, screenshot quality, or pre-handoff readiness.
---

# Deck Validation Gate

## Commands

Run from repository root:

```sh
node lecture-deck/scripts/run-hook.js deck-loop
```

`deck-loop` is state-aware. It skips final gates while the deck is uninitialized, and when the deck is handoff-ready it runs normal output validation: `pre-handoff` and `stop-quality`. It does not run `quality-loop`; run `quality-loop` explicitly when the task is harness-engineering improvement.

Run from `lecture-deck/`:

```sh
node scripts/run-hook.js deck-loop
node scripts/verify-agent-contracts.js
node scripts/run-hook.js harness-check
node scripts/run-hook.js render-check
node scripts/run-hook.js stop-quality
node scripts/run-hook.js pre-handoff
node scripts/run-hook.js quality-loop
node scripts/improvement-loop.js --max-iterations=8 --threshold-percent=10
node scripts/improvement-loop.js --focus=motion --max-iterations=4 --threshold-percent=10
node scripts/motion-mutation-loop.js --max-mutants=7
```

## What Gates Must Catch

- Missing required files
- Missing or incomplete active run contract in `current-run.json`
- Missing or stale tool policy in `tool-policy.json`
- Agent definitions whose canonical flow does not include prompt/tool/screenshot review layers
- Missing `agent-handoff.schema.json`
- Missing screenshot review artifact when screenshot reports exist
- Missing workflow trace events
- Missing Prompt, Tool, or Screenshot Review layer contracts
- Thin or undocumented research source briefs
- Too few trusted/official documentation URLs for current or source-sensitive topics
- Slide evidence URLs that are untrusted or missing from `source.md`
- Local image assets without source, publisher, checked date, license/source check, and edit notes
- Bad `slide-spec.json` shape
- Broken local links
- `.note` exposure in `deck.html`
- Missing presenter scripts
- Desktop or mobile overflow
- Unsafe keyframe properties
- Missing reduced-motion fallback
- Motion slides with declared `motion` but no active animation
- Active animations under `prefers-reduced-motion: reduce`
- Screenshot quality failures
- Visual false passes where screenshots are visibly broken even though a hook passed; these are harness defects and route to `deck-workflow-improver`
- Improvement-loop gate defects where the injected controlled failure is not detected, the configured repair sequence does not improve quality, or a no-op control produces threshold-level improvement
- Motion-focused improvement-loop gate defects where CSS animation failure is not isolated, does not recover through the motion recipe step, or keeps improving after the no-op control
- Motion mutation regressions where realistic CSS animation defects survive their expected gate: no animation, single-target motion, no stagger, infinite or overlong timing, missing reduced-motion behavior, raw timing tokens, or unsafe keyframe properties

## Interpretation

- Harness failures usually mean missing files, thin research, unsupported evidence, bad image source documentation, bad links, unsafe animation CSS, or malformed spec.
- Agent contract failures usually mean the active run brief, tool policy, handoff schema, agent definitions, screenshot review artifact, or trace ledger is stale.
- Render failures usually mean overflow, note exposure, runtime motion, reduced-motion, or presenter review issues.
- Stop-quality failures are screenshot-level visual problems and should route through `deck-screenshot-quality`.
- Improvement-loop reports are gate-health evidence, not just exercise logs. Inspect `.deck-quality/improvement-loop-report.md`; `gateHealth: failed` means a workflow gate defect that routes to `deck-workflow-improver`.
- `--focus=motion` limits the drill to declared motion-slide CSS animation generation and repair behavior. It is still a gate-health check, but not a mutation score.
- `motion-mutation-loop.js` measures whether the motion gate is effective. Inspect `.deck-quality/motion-mutation-report.md`; any survived mutant means the gate or mutation definition needs work.

Never weaken hooks or scripts to pass.
