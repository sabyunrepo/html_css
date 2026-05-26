---
name: deck-research-brief
description: Research and evidence-check source material for HTML/CSS lecture decks. Use when a deck needs official or trusted sources, source.md preparation, slide-visible claims, citation pointers, fact checking, or evidence-aligned slide specs.
---

# Deck Research Brief

## Read First

- `.codex/skills/deck-source-evidence-contract/SKILL.md`
- `.codex/skills/deck-asset-selection/SKILL.md`

## Workflow

1. Identify topic, audience, duration, objective, and decision constraints.
2. Search official, primary, or trusted sources first. For current/source-sensitive topics, use broad enough coverage before proposing slides:
   - at least 8 trusted URLs total
   - at least 5 official documentation URLs when official docs exist
   - include reputable case studies, implementation guides, or official PDFs when they explain real usage patterns
3. Reject weak sources before they enter the deck: SEO summaries, unverifiable screenshots, copied tutorials, unrelated stock images, and low-context blog posts.
4. Prefer stable source URLs that can be cited in `slide-spec.json`.
5. Separate slide-visible claims from presenter-only context.
6. Keep quotes short; paraphrase where possible.
7. Capture unresolved risks, disputed facts, weak evidence, and unavailable official docs.
8. Decide asset usage during research, before slide layout, using `deck-asset-selection`:
   - record official images, local raster candidates, Lucide/HTML/CSS opportunities, CSS-module opportunities, or no-asset decisions
   - use local raster images only for real product screens, official diagrams, real examples, or method/state evidence
   - use HTML/CSS modules for abstract processes and comparison structures
   - avoid decorative stock images and fragile CSS drawings of recognizable objects
9. Write or update `lecture-deck/source.md` with:
   - topic and objective
   - audience and duration
   - evidence list
   - research selection notes
   - image and asset decisions
   - slide-visible claims
   - speaker-note context
   - unresolved risks
10. Suggest slide candidates only when each factual claim has evidence and each candidate has an initial asset decision.

## Quality Bar

- No unsupported factual claim appears in slide-visible text.
- Official or primary sources are preferred over summaries.
- Current facts are browsed and dated.
- Evidence pointers are ready for `slide-spec.json`.
- Every `slide-spec.json` evidence URL must also appear in `source.md`.
- `source.md` includes image and asset decisions that can become `assetDecision` in `slide-spec.json`.
- Local image assets must have source URL, publisher, checked date, license/source check, and edit notes.
