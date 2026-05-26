---
name: deck-visual-hierarchy-layout
description: Use when converting slide content importance into presentation layout allocation and readability constraints.
---

# Deck Visual Hierarchy Layout

## Importance Map Schema

Each slide spec must include:

```json
{
  "importanceMap": {
    "primaryMessage": "the sentence the audience must remember",
    "primaryEvidenceOrAction": "the image, interface, example, or process that teaches it",
    "secondaryConstraints": ["supporting point 1", "supporting point 2"],
    "metadata": ["source label", "minor note"]
  }
}
```

## Layout Allocation

- Primary message: large enough to anchor the slide but never so large that it suppresses primary evidence/action.
- Primary evidence/action: allocate at least 30 percent of the active slide width or height when it teaches the slide.
- Secondary constraints: smaller, grouped, and visually subordinate.
- Metadata: smallest text, never placed where it competes with the main message.

## Readability Rules

- Korean text must not wrap one character per line.
- Avoid narrow columns for Korean prose.
- Use `word-break: keep-all` for Korean labels and sentence fragments.
- Long English tokens may use `overflow-wrap: anywhere` only inside code/path/URL fields.
- Ivory or pale backgrounds must use dark text, not white text.

## Rejection Rules

- Reject huge headlines that make evidence/action feel optional.
- Reject small official screenshots when the screenshot is the teaching object.
- Reject card grids where all cards have equal visual weight despite different importance.
- Reject text containers narrower than their role requires.
