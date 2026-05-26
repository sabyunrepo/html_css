# Design Quality Rubric

This rubric turns screenshot quality from "technically valid" into "presentation-ready".

## Slide Visual Score

Each slide starts at 100. The stop-quality gate subtracts points for visible design defects and fails a slide below 82.

## Required Checks

- Semantic clarity: the visual must explain the slide message within 3 seconds.
- Line-art integrity: common objects and actions must use Lucide icons inside simple HTML/CSS modules, not blob-like sketches.
- Asset appropriateness: default to HTML cards, Lucide icons, labels, rails, and local raster images when needed.
- Label legibility: labels must be readable HTML with strong contrast and no overlap.
- Composition: visual area must be large enough to matter but not crowd the copy.
- Presentation polish: visual modules should look intentionally composed, not like placeholder doodles.

## Failure Patterns

- Custom drawing markup or drawing assets used where Lucide icons plus HTML/CSS modules would be clearer.
- Text-only icon placeholders used instead of Lucide icons.
- Visual with too few semantic modules.
- Visual with no clear labels or state names.
- Hand-drawn metaphor that looks like an accidental scribble.
- Motion that animates one generic target instead of a meaningful sequence.

## Preferred Repair Order

1. Replace ad-hoc line sketches with reusable visual components.
2. Use Lucide icons for common semantic objects, actions, and states.
3. Use local raster images only when the scene needs illustration detail beyond HTML/CSS modules.
4. Keep custom drawings to simple CSS shapes, rails, dividers, and cards.
