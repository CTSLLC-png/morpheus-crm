# Still Here — automated production pipeline

Daily animated episodes for the **Still Here** YouTube channel, rendered with
AgentOpus Story Mode and posted on a schedule.

```
still-here/
├── SERIES_BIBLE.md        Canon: premise, cast, tone, formula, safeguarding. Source of truth.
├── CHARACTER_ANCHORS.md   How the cast stays on-model between episodes. Read this first.
├── COSTS.md               Measured credit costs and what cadence is actually affordable.
├── production.json        Locked render parameters and anchor asset IDs.
├── episodes/queue.json    The episode backlog and production log.
└── lib/build_episode.py   Resolves the next episode into exact render parameters.
```

## How the automation actually works

**GitHub Actions cannot run this pipeline.** Video generation and YouTube
posting happen through AgentOpus **MCP tools**, which are only callable from
inside a Claude session — a CI runner has no access to them. Any workflow YAML
that claims to do this would be fiction.

The mechanism that does work is a **Routine**: a scheduled trigger that fires a
fresh Claude session on a cron, with the AgentOpus connector attached. That
session runs the production loop below and exits.

```
Routine fires daily
   │
   ├─ 1. python3 lib/build_episode.py        → next episode + render params
   ├─ 2. author the script if it's a brief   → follow SERIES_BIBLE.md §6 formula
   ├─ 3. agentopus_prepare_project           → free; returns estimated_credits
   ├─ 4. agentopus_start_project             → spends credits, renders async
   ├─ 5. agentopus_get_video (poll)          → wait for stage FINISHED
   ├─ 6. agentopus_schedule_publish          → queues the YouTube post
   └─ 7. update episodes/queue.json          → mark published, commit, push
```

## Daily run procedure

Run `python3 lib/build_episode.py --check` first. A non-zero exit means
configuration is unconfirmed — stop and resolve it rather than guessing at
creative decisions.

Then:

1. **Resolve the episode.** `python3 lib/build_episode.py` prints the episode and
   its `prepare_project_params`.

2. **Author the script if needed.** When `needs_authoring` is `true`, the entry
   is a brief, not a script. Write the narration from the brief following
   `SERIES_BIBLE.md` §6 (five beats) and §7 (language rules). Story Mode renders
   the script **verbatim** — it will not expand a topic into narration, so the
   script field must contain the actual words to be spoken.

3. **Check the safeguarding rules.** Before rendering, verify the script against
   `SERIES_BIBLE.md` §8. Every Lane A episode must name a trusted adult, promise
   nothing, and contain no crime detail. This check is not optional.

4. **Prepare.** Call `agentopus_prepare_project` with the resolved params.
   Preparing is free. Read back `estimated_credits` and confirm the account can
   cover it (`agentopus_whoami`).

5. **Render.** `agentopus_start_project`, then poll `agentopus_get_video` until
   `stage` is `FINISHED`. A 40–90s episode takes a few minutes.

6. **Schedule the post.** `agentopus_schedule_publish` with:
   - `post_account_id`: `6a60a0ac0aa1067780024dc0` (Still Here, YouTube)
   - `title`: the episode title, under 70 characters
   - `privacy`: `public`
   - `publish_at`: ISO 8601 **UTC**

7. **Log it.** Move the entry from `queue` to `produced` in
   `episodes/queue.json` with its `project_id`, bump `next_episode_number`,
   commit, and push.

## Set "Made for Kids" manually

`agentopus_schedule_publish` exposes `privacy` but **not** YouTube's
audience/"Made for Kids" flag. Lane A episodes are children's content and must
be marked as such in YouTube Studio. Until AgentOpus supports the flag, set it
by hand after each upload, or set the channel-level default in
**YouTube Studio → Settings → Channel → Advanced settings** so every upload
inherits it.

This is a compliance requirement, not a preference.

## Before the first automated run

Three things are unresolved. The first is blocking.

1. **Credits.** The account holds 80 credits with a daily pool of 0. That is not
   enough for one 90-second episode, let alone a daily series. See `COSTS.md` —
   this needs sorting on the AgentOpus billing side before any schedule is real.
2. **Creative sign-off** on aspect ratio, episode length, and the two narrator
   voices. Marked `PENDING` in `production.json`; `--check` blocks on them.
3. **Character anchor images** for Maya, her dad, and Grandma Ruth. Episodes
   will render without them, but faces drift between episodes. See
   `CHARACTER_ANCHORS.md` for the three ways to create them.

## Intellectual property

All characters are original to this series. The `Animation` style supplies the
3D feature-animation look — warm lighting, expressive stylized characters — with
no studio-owned character, name, likeness, or score involved. See
`SERIES_BIBLE.md` §9. A copyright strike on a channel serving these families
would be an avoidable loss, so this rule is firm.
