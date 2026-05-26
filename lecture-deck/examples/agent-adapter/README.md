# Mock Agent Adapter

This example shows how `orchestrated-runner.js` calls an external phase agent through `DECK_AGENT_COMMAND`.

The runner sends a JSON phase contract on stdin and sets these environment variables:

- `DECK_AGENT_PHASE`
- `DECK_AGENT_NAME`
- `DECK_AGENT_TASK`
- `DECK_AGENT_PROMPT`
- `DECK_AGENT_RUN_ID`
- `DECK_ROOT`
- `REPO_ROOT`

Run the example from `lecture-deck/` after phase evidence already exists:

```sh
DECK_AGENT_COMMAND="node lecture-deck/examples/agent-adapter/mock-agent.js" \
  node lecture-deck/scripts/orchestrated-runner.js --validate
```

The mock adapter only echoes a valid demonstration handoff. For a real workflow, replace the body of `mock-agent.js` with a call to your agent runtime, CLI, or API, then keep the same stdin contract and exit-code behavior.

Rules:

- Exit `0` only when the phase completed successfully.
- Exit non-zero when the phase failed or could not produce evidence.
- Do not weaken validation gates inside the adapter.
- Let `orchestrated-runner.js` run final gates and write the orchestration report.
