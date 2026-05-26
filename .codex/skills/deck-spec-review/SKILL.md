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
2. Verify each slide includes `id`, `file`, `title`, `message`, `visual`, `speakerNote`, `evidence`, `importanceMap`, `assetDecision`, `visualForm`, `motionDecision`, `learningObjective`, `audienceQuestion`, `explanationBeats`, `exampleOrScenario`, `misconceptionOrCaveat`, and `takeaway`.
3. Check that `message` is one clear slide-visible claim.
4. Check that `learningObjective` is observable, `audienceQuestion` is answerable, and `takeaway` is more specific than the title.
5. Check that `explanationBeats` has at least three ordered beats covering explanation, evidence/mechanism, and implication/action.
6. Check that `exampleOrScenario` gives a concrete teaching handle and `misconceptionOrCaveat` names a real limitation or likely wrong reading.
7. Check that `speakerNote` contains 30-60 seconds of explanation not suitable for screen text. Reject notes that mostly repeat the title, message, or subtitle.
8. Check that the note flow has explanation -> example/scenario -> caveat -> action/takeaway, not just a summary paragraph.
9. Check evidence supports every slide-visible factual claim, and that headline/message are visibly supported by `visual`, `visualForm`, or cited evidence.
10. Check every `slide-spec.json` evidence URL appears in `source.md`.
11. Check `importanceMap` names the primary message, primary evidence/action, secondary constraints, and metadata.
12. Check `assetDecision` has a valid mode, reason, source when needed, and fallback when needed.
13. Check `visual` and `visualForm` are specific enough to generate a meaningful scene, not a vague placeholder.
14. For animated slides, require `motionPlan` with purpose, recipe, targets, `mustNotAnimate`, and `reducedMotion`; for static slides, reject `motionPlan` and active animation intent.
15. Check asset intent: Lucide icons for small labels, HTML/CSS modules for reusable scenes, and local raster images only when needed.
16. Flag summary-only slides, density, duplication, unsupported claims, vague visuals, missing teaching fields, missing contracts, and missing motion fallback before HTML generation.

## Output

Report findings by severity with exact slide ids and recommended spec edits.
