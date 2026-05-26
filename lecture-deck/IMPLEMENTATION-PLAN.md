# Asset-Aware Deck Workflow Implementation Plan

## Goal

Stop generating decks that pass validation while relying on repetitive CSS-only visuals. The harness must decide when real visual evidence is needed, store images locally with source/license metadata, and fail validation when the deck ignores those requirements.

## Workflow Shape

1. Researcher gathers factual evidence and image candidates.
2. Asset researcher classifies each candidate as official-image, local-raster, lucide-html-css, css-module, or reject.
3. Source brief records `## Image candidates` and `## Image and asset decisions`.
4. Spec writer assigns every slide an `assetDecision`, including source, role, placement, and fallback.
5. Slide producer uses local images from `assets/illustrations/` when the spec requires them.
6. Validator checks manifest coverage, minimum raster slide count, CSS-only overuse, broken local image references, and source/spec alignment.
7. Visual reviewer judges whether images are primary evidence/action, not decorative thumbnails.

## Contract Changes

- `current-run.json` owns topic-specific image requirements under `assetRequirements`.
- `source.md` must include `## Image candidates`.
- `assets/illustrations/manifest.json` records every local raster asset.
- `assets/illustrations/manifest.schema.json` defines the manifest shape.
- `slide-spec.json` must include richer `assetDecision` metadata when using raster images:
  - `source`
  - `assetRole`
  - `placement`
  - `cropIntent`
  - `fallback`

## Validation Changes

- Static required files include the image manifest and schema.
- Research checks require `## Image candidates` when the run asks for candidate documentation.
- Asset checks fail when:
  - fewer raster slides than `minimumRasterSlides`
  - CSS module share exceeds `maximumCssModuleShare`
  - a local raster image is referenced without manifest metadata
  - a declared local raster/official image is not actually referenced in slide HTML
  - manifest entries miss source URL, publisher, license, checked date, edits, role, or slide IDs

## Current Deck Regeneration Example

- Apply the generic contract to the current topic by selecting topic-relevant images, documenting their source/license metadata, and keeping CSS modules only where abstraction explains the slide better than a raster image.
- Update source, spec, slides, CSS, asset manifest, and handoff.
- Run `node lecture-deck/scripts/run-hook.js deck-loop`.

## Remaining Future Work

- Add automatic image dimension/aspect checks in the visual quality gate.
- Add a screenshot scorer rule that penalizes raster images used as tiny decorative thumbnails.
- Add a temporary-workspace mutation test where a required image is removed and validation must fail.
- Add a temporary-workspace mutation test where a topic-specific CSS class is removed from the visual quality gate to prove semantic module detection depends only on `.visual-module` or `data-visual-module`.
