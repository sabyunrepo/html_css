---
name: deck-asset-research
description: Use when a deck needs researched visual assets with source/license metadata, local raster manifest entries, or gates against decorative and repetitive CSS-only visuals.
---

# Deck Asset Research

## When To Use

Use this skill before slide generation when the topic benefits from real images, screenshots, diagrams, product visuals, method photos, or generated raster assets.

## Required Outputs

- `source.md` includes `## Image candidates`.
- `source.md` explains accepted and rejected candidates in `## Image and asset decisions`.
- Local raster files live under `lecture-deck/assets/illustrations/`.
- `lecture-deck/assets/illustrations/manifest.json` records each local raster asset.
- Each raster slide in `slide-spec.json` has an `assetDecision` with `source`, `assetRole`, `placement`, `cropIntent`, and `fallback`.
- Use `node lecture-deck/scripts/asset-acquisition.js --input=<asset-candidates.json>` after candidates are approved. Prefer `localPath` for already downloaded/inspected files; use `--download` only when the source URL is approved for direct retrieval.
- Adapter input may include `candidates` with `status: accepted|rejected`. Accepted candidates are copied into `assets/illustrations/` and `manifest.json`; rejected candidates require `rejectionReason` and are recorded in `.deck-quality/asset-acquisition-report.json`, not in the manifest.

## Acceptance Rules

- Prefer official images, primary screenshots, institutional media libraries, Creative Commons repositories, public domain collections, or generated assets with clear provenance.
- Use local-raster when the image teaches a real object, method, place, state, or finished result.
- Use CSS modules only for abstract structure, comparisons, timelines, state machines, and flow diagrams.
- Reject images that are only atmospheric, decorative, heavily watermarked, too low resolution, unclear-license, or unrelated to the slide's action.

## Manifest Fields

Each accepted local raster asset needs:

```json
{
  "file": "asset.jpg",
  "sourceUrl": "https://example.com/source",
  "publisher": "Publisher",
  "author": "Author or unknown",
  "license": "License name",
  "licenseUrl": "https://example.com/license",
  "checkedDate": "YYYY-MM-DD",
  "edits": "download/crop/resize notes",
  "role": "what the image teaches",
  "slideIds": ["slide-01"]
}
```

Adapter input accepts an array, `{ "assets": [...] }`, or `{ "checkedDate": "YYYY-MM-DD", "candidates": [...] }`. Each accepted entry also needs one acquisition source: `localPath`, `dataUri`, or `sourceUrl` with `--download`.

## Failure Routing

If a deck passes visual gates while ignoring required images, treat that as a harness defect. Strengthen `verify-deck.js`, `visual-quality-gate.js`, `screenshot-review.md`, or this skill before one-off slide patching.
