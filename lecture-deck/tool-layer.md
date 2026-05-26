# Tool Layer Contract

## Purpose

The Tool Layer defines which external tools and local automation points the deck harness may use. It keeps research, browser inspection, screenshot capture, and validation separate from prompt wording and slide generation.

## Tool Boundaries

### Web Research

- Use web search for current, source-sensitive, product-specific, legal, policy, or tool documentation topics.
- Prefer official documentation, product pages, support docs, standards, and primary-source references.
- Record selected URLs in `source.md`.
- Reject loosely related links that do not support a slide-visible claim.

### Browser And Screenshot Inspection

- Use the in-app browser or headless browser checks for local deck rendering.
- `stop-quality` must capture desktop, late desktop, mobile, and presenter-review screenshots under `.deck-quality/screenshots/`.
- A visual quality pass means screenshots and programmatic checks agree that the slide is readable, not merely that the DOM exists.

### Local Scripts

- Use `scripts/run-hook.js deck-loop` for normal generation readiness.
- Use `scripts/run-hook.js quality-loop` only for harness-engineering improvement work.
- Use `scripts/visual-quality-gate.js` for screenshot quality and remediation routing.
- Use `scripts/improvement-loop.js` and `scripts/motion-mutation-loop.js` to test whether gates catch controlled defects.

### MCP And Agent Tools

- Research agents collect and summarize evidence; they do not decide final scope.
- Asset research agents classify image candidates and source/license metadata; they do not add undocumented runtime assets.
- Visual and screenshot agents return findings; the orchestrator decides whether a failure is an output issue or workflow issue.
- Validation agents run hooks and report failures; they must not weaken gates to pass.
- Workflow-improver agents update rules, skills, few-shots, or validators when a defect recurs.
- Output-regenerator agents update current slide HTML/CSS only after the workflow issue has been classified.

## Required Evidence Of Tool Use

Every final handoff should be able to point to:

- `source.md` for research and evidence selection.
- `slide-spec.json` for slide claims, importance, asset, visual form, and motion decisions.
- `assets/illustrations/manifest.json` for local raster source, license, edit, role, and slide-ID metadata.
- `.deck-quality/visual-quality-report.md` for screenshot quality status.
- `.deck-quality/quality-remediation-plan.json` for routing failures.
- `.deck-quality/validation-result.json` for hook result details.

## Failure Rule

If a generated deck looks wrong but the hooks pass, treat it as a Tool/Evaluation Layer defect. Improve the gate or tool contract first, then repair the current output.
