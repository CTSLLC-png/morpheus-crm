# Automation status

## The Routine

A scheduled trigger exists for the production run:

| | |
|---|---|
| **Trigger ID** | `trig_01YGugeuEQAD3iXdyUdZt1eS` |
| **Schedule** | `0 13 * * 1,3,5` — Mon/Wed/Fri, 13:00 UTC (09:00 America/New_York, EDT) |
| **Mode** | Fires a fresh Claude session per run |
| **Notifications** | Push + email on completion |
| **State** | **DISABLED** |

Its prompt is the full production run from `README.md`: resolve the next queued
episode, author the script if the entry is a brief, run the safeguarding check,
render, schedule the YouTube post, update the queue, commit, push.

## Why it is disabled

Two independent blockers. Neither is fixable in code.

### 1. The fired sessions have no AgentOpus tools

Video generation and YouTube posting happen through AgentOpus **MCP connector**
tools (`mcp__Opus__*`). A scheduled session only has those tools if the
connector is attached to the trigger.

This organization does not permit attaching connectors to triggers created
programmatically — the API rejects the `connectors` parameter outright, and the
trigger was created storing none. A run in this state would fail at step 1.

**Fix:** recreate the Routine from the **claude.ai Routines UI**, where the
AgentOpus connector can be attached to the schedule by hand. Paste the prompt
from the existing trigger (or from `README.md`) and set the same cron. Then
delete `trig_01YGugeuEQAD3iXdyUdZt1eS` to avoid two schedules.

### 2. There are not enough credits

See `COSTS.md`. At 1 credit per second, a 60-second episode costs 60 credits and
the account has no refreshing daily pool. The Routine's prompt deliberately
**stops rather than degrading** — it will not shorten an episode to squeeze
under a low balance, and it will not spend the last credits. That is the correct
behavior, but it means every run would stop at step 1 until billing is resolved.

## What does not work, and why

**GitHub Actions cannot run this pipeline.** It is worth stating plainly because
it is the obvious thing to reach for. A CI runner has no access to MCP connector
tools, so it cannot call AgentOpus to render a video or schedule a YouTube post.
There is no workflow YAML that makes this work. The repository deliberately
contains no such workflow.

The pipeline needs an agent session with the connector attached. That is what a
Routine provides.

## Re-enabling

Once the connector and the credits are both sorted:

1. Raise `render.target_duration_seconds` in `production.json` from `45` to `60`
   — the agreed episode length, currently held down by the credit balance.
2. Run `python3 lib/build_episode.py --check` and confirm a zero exit.
3. Enable the Routine (or the UI-created replacement).
4. Watch the first automated run's report before trusting it unattended.
