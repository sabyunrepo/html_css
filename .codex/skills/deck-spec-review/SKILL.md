---
name: deck-spec-review
description: Review HTML/CSS lecture deck slide specs before generation. Use when checking slide-spec.json for flow, information density, evidence alignment, speaker-note separation, visual specificity, motion fields, and validation risks.
---

# Deck Spec Review

## Read First

- `.codex/skills/deck-source-evidence-contract/SKILL.md`
- `.codex/skills/deck-asset-selection/SKILL.md`
- `.codex/skills/deck-visual-hierarchy-layout/SKILL.md`
- `.codex/skills/deck-css-motion-generation/SKILL.md`

## Workflow

1. Read `source.md`, `slide-spec.json`, `design.md`, `motion.md`, and `few-shots.md`.
2. Verify each slide includes `id`, `file`, `title`, `message`, `visual`, `speakerNote`, `evidence`, `importanceMap`, `assetDecision`, `visualForm`, and `motionDecision`.
3. Check that `message` is one clear slide-visible claim.
4. Check that `speakerNote` contains explanation not suitable for screen text.
5. Check evidence supports every slide-visible factual claim.
6. Check every `slide-spec.json` evidence URL appears in `source.md`.
7. Check `importanceMap` names the primary message, primary evidence/action, secondary constraints, and metadata.
8. Check `assetDecision` has a valid mode, reason, source when needed, and fallback when needed.
9. Check `visual` and `visualForm` are specific enough to generate a meaningful scene, not a vague placeholder.
10. For animated slides, require `motionPlan` with purpose, recipe, targets, `mustNotAnimate`, and `reducedMotion`; for static slides, reject `motionPlan` and active animation intent.
11. Check asset intent: Lucide icons for small labels, HTML/CSS modules for reusable scenes, and local raster images only when needed.
12. Flag density, duplication, unsupported claims, vague visuals, missing contracts, and missing motion fallback before HTML generation.

## Output

Report findings by severity with exact slide ids and recommended spec edits.
