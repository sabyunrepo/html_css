# Prompt Layer Contract

## Purpose

The Prompt Layer captures the short-lived instruction for one deck run before it is promoted into durable context, skills, agents, hooks, or evaluation loops.

This file exists so deck generation does not depend on an implicit chat prompt. Every new topic starts by writing or refreshing the current run brief in this layer, then promoting repeated rules to the correct higher layer.

## Required Run Brief

Every deck run must define:

- `Topic`: the lecture subject and audience.
- `Outcome`: what the audience should be able to do after the deck.
- `Scope`: what is included and explicitly excluded.
- `Research Need`: whether web research, official docs, screenshots, or local references are required.
- `Output Reset`: whether previous generated deck output should be removed before generation.
- `Visual Priority`: which claims need primary evidence/action visuals and which can stay textual.
- `Motion Priority`: which slides need motion because sequence, handoff, cause/effect, or state change must be explained.
- `Validation Bar`: which hooks must pass before handoff.

## Promotion Rules

- One-off wording stays in the prompt.
- Repeated project rules move to `CLAUDE.md` or `AGENTS.md`.
- Repeated procedures move to `.codex/skills/deck-*/SKILL.md`.
- Repeated visual or motion expectations move to `design.md`, `motion.md`, or `few-shots.md`.
- Repeated role decisions move to `.codex/agents/*.toml` and `lecture-deck/agents/*.md`.
- Repeated mechanical checks move to `hooks/*.json` and `scripts/*.js`.
- Repeated quality failures move to `eval-corpus/deck-quality-cases.jsonl`.

## Generation Gate

Before editing `source.md` or `slide-spec.json`, the orchestrator must check:

- The run brief distinguishes user-facing output from harness improvements.
- The run brief names the intended validation loop: normal `deck-loop` or harness-improvement `quality-loop`.
- Any request for "delete", "reset", or "new topic" routes through the output reset skill before generation.
- Any current, source-sensitive, or product-specific topic requires trusted web research and source mapping before slide writing.

