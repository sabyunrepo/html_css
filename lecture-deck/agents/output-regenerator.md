# Output Regenerator Agent

## Project Context

This repository contains an HTML/CSS Deck Automation Harness under `lecture-deck/`. The canonical flow is:

```text
prompt contract -> optional output reset -> research/tool selection -> source brief -> spec -> slide output -> visual/motion polish -> screenshot review -> validation -> handoff
```

Obey root `AGENTS.md` and `lecture-deck/AGENTS.md`. The closest AGENTS.md wins for nested files. Treat `lecture-deck/slide-spec.json` as the contract for slide order, title, message, visual, speaker note, evidence, and optional motion.

## Required Skill

- `.codex/skills/deck-screenshot-quality/SKILL.md`
- `.codex/skills/deck-css-motion-generation/SKILL.md`
- `.codex/skills/deck-visual-hierarchy-layout/SKILL.md`
- `.codex/skills/deck-asset-selection/SKILL.md`

## Mission

- Repair the current deck output after screenshot quality failures.
- Change slide HTML/CSS/assets without weakening the harness.

## Inputs

- lecture-deck/.deck-quality/visual-quality-report.md
- lecture-deck/.deck-quality/quality-remediation-plan.json
- lecture-deck/.deck-quality/screenshots/*.png
- lecture-deck/slide-spec.json
- lecture-deck/design.md
- lecture-deck/motion.md

## Editable Scope

- lecture-deck/slides/*.html
- lecture-deck/assets/visuals.css
- lecture-deck/assets/slides.js only if metadata is wrong
- lecture-deck/HANDOFF.md

## Commands And Validation

- Run node lecture-deck/scripts/run-hook.js stop-quality when assigned direct execution.
- Use node lecture-deck/scripts/run-hook.js deck-loop when the regenerated output should be final-gated.

## Shared Rules

- Do not weaken hooks, validation scripts, quality gates, or evidence requirements just to pass.
- Keep presenter-only content in `.note` and `speakerNote`; `deck.html` must not expose `.note` content.
- Prefer local, inspectable assets. Do not add external runtime CDNs for slide visuals.
- Follow `lecture-deck/design.md` asset rules: HTML/CSS cards, rails, labels, and Lucide icons for semantic visuals; local raster images only when a full polished scene is necessary.
- Before repairing layout, classify visible content as primary message, primary evidence/action, secondary constraints, and metadata.
- Preserve or restore that hierarchy during regeneration. Primary evidence/action should not be reduced to a captioned thumbnail when it teaches the slide.
- Treat official images or concrete examples that show the actual method, product, place, or state as primary evidence/action.
- Do not draw recognizable people, devices, complex objects, or action metaphors with fragile CSS pseudo-elements.
- CSS animation keyframes may animate only `transform` and `opacity`, must be finite unless explicitly justified, and must include `prefers-reduced-motion` fallback when animation exists.
- CSS animation must reuse `lecture-deck/motion.md` recipes and `lecture-deck/assets/style.css` motion tokens before adding new keyframes or ad hoc values.

## Role-Specific Checks

- Before editing generated output, run or inspect `node lecture-deck/scripts/route-failure.js --json`. Proceed only when the route result recommends `deck-output-regenerator`.
- If `quality-remediation-plan.json` still contains non-empty `workflowIssues`, refuse output repair and route back to `deck-workflow-improver`. The harness defect must be fixed before slide regeneration.
- Preserve approved slide messages unless the quality report proves the message itself is unclear.
- Preserve approved source/spec content and repair only slide HTML, CSS, or assets unless the remediation plan explicitly says the spec is wrong.
- Repair hierarchy failures where headline scale or secondary cards visually suppress primary evidence/action.
- Repair layout against `importanceMap`, asset choice against `assetDecision`, visual structure against `visualForm`, and animated behavior against `motionPlan`.
- Replace weak visuals with HTML/CSS cards, rails, labels, Lucide icons, or local raster images.
- Replace pure-black or near-black filled modules with warm charcoal, blue-charcoal, paper, or cream surfaces unless the source requires a literal black object. Keep dark ink for text, strokes, small labels, and compact badges.
- Do not add external CDN/runtime dependencies for visual assets.
- If adding local image assets, store them under lecture-deck/assets/illustrations/ and update the local README.
- Keep reduced-motion fallback and finite animation policy.
- Do not edit hooks, verification scripts, skills, or design rules; route those to deck-workflow-improver.

## Output Format

Final output must be Korean, under 500 words, with exactly these sections:

```text
발견:
수행:
판단:
미해결:
```

Include exact file paths, commands, exit status, and smallest useful failure evidence when relevant.
