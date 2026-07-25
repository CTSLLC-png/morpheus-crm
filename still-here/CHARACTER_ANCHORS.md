# Character anchors — how the cast stays the same person every episode

This is the single most important production problem for an animated series
made this way. Without anchors, Maya is a slightly different girl in every
episode and the channel never builds a recognizable cast.

## How anchoring works

AgentOpus supports **anchor images**: reference pictures attached to a render
and tagged `actor`, `object`, or `logo`. The renderer holds the subject
on-model against them.

- Max **8 anchors per video**.
- Max **10 assets in the shared library** (`agentopus_list_assets`).
- Library assets are attached per-render via `shared_assets: [{asset_id, category}]`.

Two layers keep the cast consistent, and the series uses both:

| Layer | Strength | Status |
|---|---|---|
| **Written canon block** — verbatim character descriptions injected into every render's `user_prompt` | Moderate. Keeps hair, skin, clothing, and age right. Drifts on face. | **Working now** — see `SERIES_BIBLE.md` §4 and `lib/canon.py` |
| **Anchor images** — a reference picture per character in the library | Strong. This is what actually locks a face. | **Missing for all three characters** |

## Current state

| Asset | ID | Status |
|---|---|---|
| Wilson's Bakery & Restaurant (location) | `3c98b196fca1a9e1` | ✅ In library |
| Maya | — | ❌ Missing — reference frame exists, not yet uploaded |
| Maya's dad | — | ❌ Missing — reference frame exists, not yet uploaded |
| Grandma Ruth | — | ❌ Missing — design still unverified |
| Group leader | — | ❌ Missing — reference frame exists, not yet uploaded |

Until the character anchors exist, episodes rely on the written canon alone.
Since the canon now matches the published designs, that ships recognizable
episodes — but faces will still drift between them.

## Why this session could not create them

Two separate blocks, both environmental.

**Downloading frames is blocked.** The intended shortcut was to pull a clean
frame of Maya from the finished episode *Still Here: Maya Draws the Memories
That Keep Her Dad Close* (project `07221316-84o`). But
`prod-ao-ext.cdn.opus.pro`, the host serving rendered video and thumbnails, is
**denied by this environment's egress policy** (HTTP 403 on CONNECT). The bytes
cannot be reached. `ffmpeg` is also absent from the container.

**Pasted screenshots are not files.** The creator supplied three excellent
reference frames — Maya drawing, Maya and her dad in the diner, and the story
circle. Those arrived as images in the conversation, which the agent can *see*
but cannot *read as bytes*: nothing was written to disk, so there is no file to
PUT to a signed upload URL.

Their content was still put to use. The character canon in `SERIES_BIBLE.md` §4
and `lib/canon` was rewritten from those frames, replacing the earlier guessed
designs. That closes most of the drift gap even with no anchor images
registered.

**To actually register them, the files have to reach the upload API.** Either:

- Upload them directly in the AgentOpus web UI asset library (simplest), or
- Save them into the repository (e.g. `still-here/refs/maya.png`) and push, so a
  session with filesystem access can PUT the bytes and call
  `agentopus_register_asset`.

## Three ways to create the anchors

### Option A — harvest a frame from the existing Maya episode (recommended, free)

Maya is already correctly designed in project `07221316-84o`. Capture her and
promote that frame to a permanent anchor.

1. Open <https://prod-ao-ext.cdn.opus.pro/agent/workspace/07221316-84o/final_video.mp4>
   in a normal browser, on any machine outside this session.
2. Pause on the clearest, most front-facing shot of Maya. Screenshot it and crop
   to her — head and torso, minimal background.
3. Do the same for a golden-lit shot of her dad.
4. Upload each through the AgentOpus asset library, or hand the files to a
   Claude session and it will run `agentopus_upload_asset` →
   PUT bytes → `agentopus_register_asset`.
5. Record the returned `asset_id`s in `production.json` under
   `anchors.characters`.

Costs nothing and guarantees continuity with the episodes already published.

### Option B — render a character design sheet

Spend a small number of credits on a short render whose whole purpose is
producing clean reference frames: a slow turnaround of each character against a
plain background, using the canon block as the prompt. Then harvest frames as in
Option A.

Costs roughly 15–20 credits for a 15–20s render. Worth it if the existing
Maya design is not what you want going forward and you'd rather redesign.

### Option C — commission or draw the reference art

Any front-facing character illustration works as an anchor, including hand-drawn
art. Upload it the same way. This is the option that gives you the most control
over the cast's design.

## Registering an anchor once you have the image

The three-step library flow:

```
agentopus_upload_asset(filename="maya_ref.png", mime="image/png")
   -> returns { asset_id, signed_url }

PUT the image bytes to signed_url

agentopus_register_asset(asset_id=..., description="Maya - lead character
   reference. Black girl age 8, two puff-ball ponytails with yellow elastics,
   mustard tee, denim overalls, sketchbook. Actor anchor for Still Here.")
   -> confirms the library entry
```

Then add the `asset_id` to `production.json`, and every subsequent episode picks
it up automatically via `lib/build_episode.py`.

## Anchor budget per episode

With 8 slots and a three-person cast plus one location, a typical episode uses
four:

```
Maya (actor) + dad (actor) + Grandma Ruth (actor) + Wilson's (object)
```

Only attach characters who actually appear. Unused anchors waste consistency
pressure on subjects that aren't in frame.
