# Open decision: watercolor or 3D?

**Status: unresolved.** This is the one thing that should be settled before any
further episode renders, because it is visible to every viewer and expensive to
change later.

## What happened

The published episodes (1–3) are in AgentOpus's **`watercolor`** style: soft
storybook watercolor, pastel sage-and-peach palette, wet-on-wet texture, sepia
outlines. Maya in a sage tee and clay overalls; her dad in a sage tee and cap;
the story circle in washed greens and peaches.

Episode 4 was rendered in **`Animation`** — modern 3D feature animation, the
"Pixar-style polish" look — because that is what was asked for. It is scheduled
unlisted and has not published.

The result is that the channel now holds one episode that does not look like the
other three.

## The two options

### Stay watercolor

- **Continuity.** Three episodes already establish it; a viewer scrolling the
  channel sees one series.
- **It suits the material.** Soft watercolor reads as gentle and safe, which is
  the correct register for a six-year-old processing a parent's absence. 3D
  realism makes the same story feel more literal, and literal is heavier here.
- **Cheaper to be consistent.** The cast is already on-model in this style, and
  reference frames exist to anchor them.
- **Cost:** episode 4's 50 credits are sunk. It would need re-rendering in
  watercolor (another ~50) or staying unlisted.

### Switch to 3D

- **It is what was asked for** — "Disney Pixar animated characters."
- **More arresting in a feed.** 3D reads as higher production value on a
  thumbnail, which matters for a channel that needs to be found.
- **Cost:** the back catalogue looks like a different show. Three episodes either
  stay visibly older, or get re-rendered at ~50–90 credits each. Character
  anchors harvested from the watercolor episodes are also less useful, since the
  faces do not translate directly.

## Recommendation

**Stay watercolor**, and treat episode 4 as a one-off experiment that stays
unlisted.

The reason is the audience, not the aesthetics. Watercolor's softness is doing
real work for a child who is being told something hard — it holds the subject at
a gentle distance, where 3D closes that distance. The published episodes already
found the right register. "Pixar-style" is a reasonable instinct for production
value, but on this particular subject the polish costs more than it buys.

If discovery is the concern, the cheaper lever is thumbnails and titles, not a
re-render of the whole series.

## Whichever way it goes

1. Set `render.style_name` in `production.json` to the winner — one value, no
   per-episode variation.
2. Confirm `STYLE_CLAUSES` in `lib/build_episode.py` has a matching entry; the
   builder raises if it does not, so the prompt can never describe a look
   different from the one being rendered.
3. Decide episode 4: publish as the pivot, re-render in the chosen style, or
   leave unlisted.
