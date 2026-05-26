---
name: deck-asset-selection
description: Use when deciding whether deck visuals should use official images, local raster assets, Lucide icons, HTML/CSS modules, or no visual asset.
---

# Deck Asset Selection

## Asset Decision Schema

Each slide spec must include:

```json
{
  "assetDecision": {
    "mode": "official-image | local-raster | lucide-html-css | css-module | none",
    "reason": "why this mode best teaches the slide",
    "source": "URL or local path when mode uses an asset",
    "assetRole": "primary evidence/action, secondary support, or decoration",
    "placement": "where and how prominently the asset appears",
    "cropIntent": "what must remain visible after cropping",
    "fallback": "what to use if the asset is unavailable"
  }
}
```

## Decision Rules

- Use `official-image` when a real product interface, official diagram, government guide, or primary screenshot teaches the slide.
- Use `local-raster` when a polished conceptual scene is needed and HTML/CSS would look crude.
- Use `lucide-html-css` for common actions, states, and objects such as file, upload, lock, browser, check, warning, link, settings.
- Use `css-module` for abstract structure: rails, tables, matrices, funnels, maps, timelines.
- Use `none` when the slide is a compact reference or warning where visuals would distract.

## Rejection Rules

- Reject CSS drawings of recognizable people, devices, flags, or complex physical objects.
- Reject decorative stock imagery that does not prove or teach the claim.
- Reject undocumented local assets.
- Reject official images placed as tiny thumbnails when they are primary evidence.
- Reject CSS-only decks when `current-run.json.assetRequirements.minimumRasterSlides` requires real images.
