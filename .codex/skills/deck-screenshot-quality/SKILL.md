---
name: deck-screenshot-quality
description: Use when rendered HTML/CSS lecture deck screenshots need visual quality review, stop-hook quality gates fail, or regeneration feedback is needed for CSS visuals and slide layout.
---

# Deck Screenshot Quality

## Purpose

Use screenshots as the visual truth. Passing JSON, link, overflow, and motion checks is not enough if the deck looks like placeholder boxes or weak CSS diagrams.

## Inputs

- `lecture-deck/.deck-quality/visual-quality-report.md`
- `lecture-deck/.deck-quality/quality-remediation-plan.json`
- `lecture-deck/.deck-quality/screenshots/*.png`
- `lecture-deck/slide-spec.json`
- `lecture-deck/design.md`
- `lecture-deck/assets/visuals.css`
- `lecture-deck/slides/*.html`

## Review Bar

A slide passes only when:

- The slide has one clear message visible within 3 seconds.
- CSS visuals explain the message rather than filling space.
- Visuals are meaningfully composed: hierarchy, alignment, whitespace, labels, and scale are intentional.
- Animated visuals use restrained finite motion and do not distract from text.
- No text, nav controls, or visual elements overlap in desktop or mobile screenshots.
- Presenter review contains useful scripts and evidence.

## Failure Feedback Format

When quality fails, write feedback as regeneration instructions:

```text
Slide: 04-flag
Problem: The visual reads as two generic boxes, not a half-mast ceremony.
Regenerate: Use one mast scene with a full-height guide, lowered flag, and one concise label.
CSS constraints: transform/opacity keyframes only; no box-shadow animation.
Acceptance check: screenshot immediately communicates that the flag is lowered for mourning.
```

## Regeneration Loop

1. Read the report and screenshots.
2. Group failures by slide id.
3. Split failures into two workstreams:
   - workflow issue: weak prompt, missing few-shot, missing design rule, weak hook, or missing validator coverage.
   - output issue: current slide HTML/CSS is visually weak, cluttered, sparse, overlapping, or off-tone.
4. Route workflow issues to `.codex/agents/deck-workflow-improver.toml`.
5. Route output issues to `.codex/agents/deck-output-regenerator.toml`.
6. Main Codex integrates both workstreams and re-runs:

```sh
node lecture-deck/scripts/run-hook.js stop-quality
node lecture-deck/scripts/run-hook.js pre-handoff
```

Do not mark complete until both pass.

## Agent Routing

When the stop quality gate fails, use the generated remediation plan:

- `agents.workflow`: prompt for the workflow/harness improvement agent.
- `agents.output`: prompt for the current deck output regeneration agent.
- `issues[]`: machine-readable failures with slide, problem, and feedback.

Main Codex may spawn both agents in parallel only when the user has authorized sub-agent delegation. Otherwise, apply the two workstreams locally in the same order: workflow first, output second.
