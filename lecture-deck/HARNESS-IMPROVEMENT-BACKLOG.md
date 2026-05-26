# Harness Improvement Backlog

This file is the durable backlog for improving the deck automation harness itself.
Use it when a generated deck exposes a weakness in orchestration, agents, skills, hooks, validators, reset behavior, or quality gates.

Do not use this file for one-off slide copy, HTML, or CSS polish. Current output fixes belong to `deck-output-regenerator` only after `scripts/route-failure.js` recommends that route.

## How To Use

1. Main Codex reads this backlog when planning harness work.
2. Pick the highest-priority open item that matches the failure evidence.
3. Delegate implementation to `deck-workflow-improver` when the issue affects reusable rules, agents, skills, hooks, validators, eval cases, or regression gates.
4. Require both a reusable rule change and an executable guard when the issue is repeatable.
5. Before adding a new item, search this file for the same failure mode, harness layer, suggested files, or validation command. If a similar item already exists, do not create a duplicate; merge the new evidence into that item.
6. Use each item as implementation input: copy the problem, desired improvement, harness layer, suggested files, and validation commands into the delegated `deck-workflow-improver` prompt.
7. After the fix, run the listed validation commands and update the item status.
8. When an item is fully reflected in reusable rules and executable guards, remove it from `Open Items`. If historical proof is useful, move a compact entry to `Completed Items`; otherwise deletion is preferred so the starter backlog stays small.

Status values:

- `open`: not started
- `in-progress`: being implemented
- `blocked`: needs user or external input
- `done`: implemented and verified
- `deferred`: intentionally postponed

## Intake And Cleanup Rules

- Duplicate check is required before adding any item.
- Similar means the item shares the same root cause, target harness layer, or likely changed files, even if the visible slide failure looked different.
- If similar content exists, append only missing evidence, reproduction notes, or validation commands to the existing item.
- Keep backlog items actionable. Every open item needs a problem, desired improvement, harness layer, suggested files, and validation.
- Do not keep completed items in `Open Items`.
- Delete completed items when the implementation is already represented by code, tests, docs, and validation reports.
- Move a completed item to `Completed Items` only when it teaches an important workflow lesson that future students should see.

## Open Items

## Completed Items

### HIB-010 Deck Metadata Drift Gate

- Status: done
- Priority: high
- Problem: `slide-spec.json` and `assets/slides.js` could drift in `id`, `file`, `title`, `speakerNote`, or `evidence` while validation still passed, leaving presenter metadata inconsistent with the source slide contract.
- Desired improvement: Compare presenter metadata against `slide-spec.json` during `harness-check` and route metadata drift failures to content regeneration.
- Harness layer: deck validator, failure routing, regression test
- Changed files:
  - `lecture-deck/scripts/verify-deck.js`
  - `lecture-deck/scripts/validation-result.test.js`
  - `lecture-deck/scripts/route-failure.js`
  - `lecture-deck/scripts/route-failure.test.js`
- Validation:
  - `node --test lecture-deck/scripts/validation-result.test.js lecture-deck/scripts/route-failure.test.js`
  - `node lecture-deck/scripts/run-hook.js harness-check`

### HIB-009 Content Depth Failure Routing

- Status: done
- Priority: high
- Problem: After the content-depth validator was added, `route-failure.js` treated `FAIL content depth` as an unclassified validation failure and repeatedly routed back to `deck-validation-runner`.
- Desired improvement: Route content-depth validation failures to `deck-content-producer` so current spec and presenter-note content can be regenerated under the strengthened contract.
- Harness layer: failure routing, regression test
- Changed files:
  - `lecture-deck/scripts/route-failure.js`
  - `lecture-deck/scripts/route-failure.test.js`
- Validation:
  - `node --test lecture-deck/scripts/route-failure.test.js`
  - `node lecture-deck/scripts/route-failure.js --json`

### HIB-008 Content Depth Gate

- Status: done
- Priority: high
- Problem: A deck could pass with shallow slide specs and speaker notes that only repeated screen text, producing weak presentation content even when visual gates passed.
- Desired improvement: Require explicit teaching fields in every slide spec and enforce presenter-depth speaker notes that support a 30-60 second explanation.
- Harness layer: content production skill, spec review skill, few-shots, deck validator, starter export fixtures
- Changed files:
  - `.codex/skills/deck-content-production/SKILL.md`
  - `.codex/skills/deck-spec-review/SKILL.md`
  - `lecture-deck/few-shots.md`
  - `lecture-deck/scripts/verify-deck.js`
  - `lecture-deck/scripts/validation-result.test.js`
  - `lecture-deck/scripts/export-starter.js`
- Validation:
  - `node --test lecture-deck/scripts/validation-result.test.js lecture-deck/scripts/export-starter.test.js`
  - `node lecture-deck/scripts/run-hook.js harness-check`

### HIB-006 Student Tutorial Runbook

- Status: done
- Priority: medium
- Problem: The harness is strong enough for development, but students needed a short guided path that shows what an agent workflow is, where orchestration happens, and how to inspect failure routing.
- Desired improvement: Add a tutorial that walks through one topic run, failure routing, backlog use, asset acquisition, workflow improvement, regression validation, and report cleanup.
- Harness layer: documentation, education workflow
- Changed files:
  - `docs/tutorial-agent-workflow.md`
  - `README.md`
  - `lecture-deck/evaluation-template.md`
- Validation:
  - Manual doc review
  - `node lecture-deck/scripts/run-hook.js deck-loop`

### HIB-005 Quality Report Compaction

- Status: done
- Priority: medium
- Problem: `.deck-quality` can grow quickly with screenshots, trace events, and report snapshots. This helps debugging but makes the project hard to inspect after several runs.
- Desired improvement: Add a compaction/archive command that keeps the latest proof bundle and moves screenshots, loop snapshots, and bulky runtime artifacts into a dated archive or starter-excluded path.
- Harness layer: report hygiene, reset boundary
- Changed files:
  - `lecture-deck/scripts/compact-quality-reports.js`
  - `lecture-deck/scripts/compact-quality-reports.test.js`
  - `lecture-deck/AGENTS.md`
  - `lecture-deck/scripts/verify-deck.js`
- Validation:
  - `node --test lecture-deck/scripts/compact-quality-reports.test.js`

### HIB-004 External Agent Adapter Example

- Status: done
- Priority: medium
- Problem: `orchestrated-runner.js` supports `DECK_AGENT_COMMAND`, but the starter did not include a minimal example adapter students can run and modify.
- Desired improvement: Add a tiny local example adapter that reads a phase contract from stdin, returns a valid handoff-shaped payload, and makes clear where a real agent call would be inserted.
- Harness layer: runner adapter, education docs
- Changed files:
  - `lecture-deck/examples/agent-adapter/mock-agent.js`
  - `lecture-deck/examples/agent-adapter/README.md`
  - `lecture-deck/scripts/orchestrated-runner.test.js`
  - `README.md`
  - `lecture-deck/scripts/verify-deck.js`
- Validation:
  - `node --test lecture-deck/scripts/orchestrated-runner.test.js`

### HIB-003 Asset Acquisition Adapter

- Status: done
- Priority: high
- Problem: The workflow can require meaningful raster images, but there was not a single adapter that turns asset research decisions into local files with source metadata and rejection records.
- Desired improvement: Add an adapter that accepts approved or rejected asset candidates, stores accepted local files under `assets/illustrations/`, updates `manifest.json`, records license/source checks, and writes rejected candidates to a report.
- Harness layer: asset research, manifest validation, source evidence contract
- Changed files:
  - `lecture-deck/scripts/asset-acquisition.js`
  - `lecture-deck/scripts/asset-acquisition.test.js`
  - `.codex/skills/deck-asset-research/SKILL.md`
  - `lecture-deck/scripts/verify-deck.js`
- Validation:
  - `node --test lecture-deck/scripts/asset-acquisition.test.js`
  - `node --test lecture-deck/scripts/verify-harness-backlog.test.js lecture-deck/scripts/export-starter.test.js`

### HIB-002 Backlog Machine Schema

- Status: done
- Priority: medium
- Problem: The Markdown backlog was readable by people, but not machine-checkable. Future agents could silently ignore required fields.
- Desired improvement: Add a small JSON schema and parser that checks every backlog item has status, priority, problem, desired improvement, harness layer, files, validation, duplicate IDs, and valid open/completed status.
- Harness layer: contract validation
- Changed files:
  - `lecture-deck/harness-improvement.schema.json`
  - `lecture-deck/scripts/verify-harness-backlog.js`
  - `lecture-deck/scripts/verify-harness-backlog.test.js`
  - `lecture-deck/scripts/verify-agent-contracts.js`
  - `lecture-deck/scripts/verify-deck.js`
- Validation:
  - `node --test lecture-deck/scripts/verify-harness-backlog.test.js`
  - `node lecture-deck/scripts/verify-harness-backlog.js`

### HIB-001 Starter Export Boundary

- Status: done
- Priority: high
- Problem: The repository contains current-run output, `.deck-quality` reports, screenshots, old experiment images, archive candidates, and advanced regression artifacts that are useful for development but noisy for an educational starter download.
- Desired improvement: Add a repeatable starter export that preserves harness assets while excluding generated decks, large screenshots, historical experiments, runtime quality reports, candidate folders, and archive folders.
- Harness layer: reset/cleanup script, README, AGENTS policy
- Changed files:
  - `lecture-deck/scripts/export-starter.js`
  - `lecture-deck/scripts/export-starter.test.js`
  - `README.md`
  - `lecture-deck/AGENTS.md`
  - `lecture-deck/scripts/verify-deck.js`
- Validation:
  - `node --test lecture-deck/scripts/export-starter.test.js`
  - exported starter `node lecture-deck/scripts/run-hook.js harness-check`

### HIB-007 Route Policy Expansion

- Status: done
- Priority: high
- Problem: Mixed remediation artifacts with both `workflowIssues` and `outputIssues` could route to `deck-output-regenerator`, causing current slide patching before harness improvement.
- Desired improvement: Route any remediation plan with workflow issues to `deck-workflow-improver` first and add regression coverage so this cannot regress silently.
- Harness layer: failure routing, regression gate, agent policy
- Changed files:
  - `lecture-deck/scripts/route-failure.js`
  - `lecture-deck/scripts/route-failure-policy-check.js`
  - `lecture-deck/scripts/regression-gate.js`
  - `lecture-deck/scripts/visual-quality-gate.js`
  - `lecture-deck/agents/output-regenerator.md`
  - `lecture-deck/agents/workflow-improver.md`
  - `.codex/agents/deck-output-regenerator.toml`
  - `.codex/agents/deck-workflow-improver.toml`
- Validation:
  - `node --test lecture-deck/scripts/route-failure.test.js lecture-deck/scripts/regression-gate.test.js lecture-deck/scripts/verify-agent-contracts.test.js`
  - `node lecture-deck/scripts/route-failure-policy-check.js --case=mixed-remediation`
  - `node lecture-deck/scripts/run-hook.js regression-gate`
  - `node lecture-deck/scripts/run-hook.js deck-loop`
