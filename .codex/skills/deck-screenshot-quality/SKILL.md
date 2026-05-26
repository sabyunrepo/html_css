---
name: deck-screenshot-quality
description: Review rendered HTML/CSS deck screenshots and route visual quality failures. Use when stop-quality fails, screenshots look weak, CSS visuals are unreadable, motion is decorative, visual assets are poor, or deck output needs regeneration feedback.
---

# Deck Screenshot Quality

## Inputs

- `.codex/skills/deck-css-motion-generation/SKILL.md`
- `.codex/skills/deck-visual-hierarchy-layout/SKILL.md`
- `.codex/skills/deck-asset-selection/SKILL.md`
- `lecture-deck/screenshot-review.md`
- `lecture-deck/prompt-layer.md`
- `lecture-deck/tool-layer.md`
- `lecture-deck/.deck-quality/visual-quality-report.md`
- `lecture-deck/.deck-quality/quality-remediation-plan.json`
- `lecture-deck/.deck-quality/screenshot-review.json`
- `lecture-deck/.deck-quality/screenshots/*.png`
- `lecture-deck/eval-corpus/deck-quality-cases.jsonl`
- `lecture-deck/slide-spec.json`
- `lecture-deck/design.md`
- `lecture-deck/motion.md`
- `lecture-deck/assets/visuals.css`
- `lecture-deck/slides/*.html`

## Review Bar

A slide passes only when:

- The message is clear within 3 seconds.
- Visuals explain the slide claim rather than fill space.
- Layout, hierarchy, alignment, labels, and scale are intentional.
- Rendered hierarchy matches `importanceMap`: primary evidence/action is not suppressed by headline scale, repeated cards, metadata, or captions.
- Rendered asset choice matches `assetDecision`: official or local images are large enough when they are primary evidence, and CSS modules are used for abstract structures.
- Recognizable common objects and action metaphors use HTML/CSS cards, rails, labels, and Lucide icons.
- Custom drawing markup or external drawing asset dependencies are not allowed in deck visual output.
- Text-only icon placeholders are not allowed; common objects and actions should use Lucide icons.
- Large conceptual, human, product, UI, workflow, or system scenes use local raster images only when HTML/CSS modules are insufficient.
- No crude CSS pseudo-element drawings appear for meaningful imagery.
- Large downloaded illustrations are local and source-noted.
- Motion is restrained, meaningful, finite, token-based, recipe-aligned, and reduced-motion safe.
- Animated output matches `motionPlan`: targets exist, `mustNotAnimate` selectors remain still, and visual-form-specific sequencing is visible.
- Desktop/mobile screenshots have no overflow or overlap.
- Korean text does not wrap into one-character columns, and pale backgrounds do not use white or low-contrast text.
- Large pure-black or near-black filled surfaces are not acceptable unless the source material requires a literal black object. Black may be used for text, strokes, small labels, and compact badges, but not as the dominant fill for terminal panes, hubs, preview cards, or instructional modules.
- A passing report with visibly broken screenshots is a harness defect, not an acceptable output.
- `screenshot-review.json` must exist after `stop-quality` when `visual-quality-report.md` exists. Missing review artifact is a harness failure, not an output polish issue.

## Remediation Workflow

1. Read reports and screenshots.
2. Group failures by slide id.
3. Split into:
   - workflow issue: weak design/motion/source/asset/hierarchy rule, missing few-shot, weak skill, missing validator
   - output issue: current slide HTML/CSS visual is weak, cluttered, sparse, overlapping, off-tone, or inconsistent with `importanceMap`, `assetDecision`, `visualForm`, or `motionPlan`
4. Route workflow fixes to skill/design/few-shot/hook improvements.
5. Route output fixes to slide HTML, `assets/visuals.css`, local raster assets, or `HANDOFF.md`.
6. Preserve reusable failures in `eval-corpus/deck-quality-cases.jsonl` when appropriate.
7. Re-run `node lecture-deck/scripts/run-hook.js deck-loop`.

## Failure Routing

- Contrast or pale-background readability failure: route to `deck-visual-hierarchy-layout` and current CSS output.
- Heavy black fill or off-tone dark surface: route to `deck-visual-motion`, `lecture-deck/design.md`, and current CSS output.
- One-character Korean wrapping: route to `deck-visual-hierarchy-layout`, then repair width, `word-break`, and copy density.
- Weak image priority: route to `deck-asset-selection` and current layout allocation.
- Weak or decorative motion: route to `deck-css-motion-generation` and current `motionPlan`.
- Visual form mismatch: route to `deck-content-production` spec fields and current HTML/CSS structure.

Do not mark complete until screenshot quality passes.

## Improvement Loop Drill

When asked to measure whether the improvement loop itself works, run:

```sh
cd lecture-deck
node scripts/improvement-loop.js --max-iterations=8 --threshold-percent=10
```

For CSS animation-only smoke checks, run:

```sh
cd lecture-deck
node scripts/improvement-loop.js --focus=motion --max-iterations=4 --threshold-percent=10
```

The drill copies the current deck to temporary roots, injects the same controlled quality failures each time, resets to that initial failure state per iteration, applies cumulative repair steps, and writes:

- `lecture-deck/.deck-quality/improvement-loop-report.json`
- `lecture-deck/.deck-quality/improvement-loop-report.md`

Use the efficiency gain column to decide whether more loop work is worthwhile. Stop when the latest gain is below the threshold.

The report is also a gate-health artifact. `gateHealth.status` must be `passed`.
Treat these as workflow failures that route to `deck-workflow-improver`:

- `controlled-failure-not-detected`: the quality gate missed the injected defect
- `repair-sequence-not-effective`: the scripted repair sequence did not improve the score
- `no-op-control-improved`: the no-op control produced threshold-level improvement, which indicates an unstable or nondeterministic gate

## Motion Mutation Gate

When asked whether motion validation is actually effective, run:

```sh
cd lecture-deck
node scripts/motion-mutation-loop.js --max-mutants=7
```

This injects independent CSS animation defects into temporary deck copies and writes:

- `lecture-deck/.deck-quality/motion-mutation-report.json`
- `lecture-deck/.deck-quality/motion-mutation-report.md`

All mutants must be killed by their expected gate, and the clean deck must pass the final `deck-loop` smoke. Any survived mutant is a workflow failure, not an output polish issue.

## Combined Quality Loop Gate

When asked whether the harness can catch controlled quality failures, run:

```sh
cd lecture-deck
node scripts/run-hook.js quality-loop
```

This runs the visual improvement loop, motion-focused improvement loop, and motion mutation loop as one gate. If any controlled defect is missed, treat the failure as a gate or workflow-improvement problem, not as a slide polish task.
