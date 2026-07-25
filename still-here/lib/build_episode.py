#!/usr/bin/env python3
"""
Still Here — Episode Builder
Resolves the next queued episode into exact AgentOpus prepare_project parameters.

Run this at the start of a daily production run. It reads SERIES_BIBLE canon,
production.json, and episodes/queue.json, then prints the parameter set to pass
to agentopus_prepare_project — including the anchor images that keep the cast
on-model.

Usage:
    python3 build_episode.py                 # next queued episode
    python3 build_episode.py --episode 6     # a specific episode
    python3 build_episode.py --check         # validate config, spend nothing
"""

import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

PRODUCTION = os.path.join(ROOT, "production.json")
QUEUE = os.path.join(ROOT, "episodes", "queue.json")

# Narration pace for a gentle read-aloud delivery, words per second.
# Measured against the existing episodes' scripts.
WORDS_PER_SECOND = 2.3

# Verbatim character canon from SERIES_BIBLE.md section 4. Injected into every
# render so characters hold their design even when no anchor image exists.
# Keep in sync with the bible by hand — the bible is the source of truth.
CANON = {
    "maya": (
        "MAYA is a Black girl about eight years old, round cheeks, wide "
        "expressive dark-brown eyes, dark brown coils in two puff-ball "
        "ponytails tied with mismatched yellow elastics, mustard-yellow "
        "long-sleeve tee, denim overalls with one strap loose, scuffed white "
        "sneakers, always carrying a dog-eared sketchbook and a pencil stub. "
        "Small for her age, thoughtful rather than sad."
    ),
    "maya_dad": (
        "MAYA'S DAD is a Black man in his early thirties, broad shoulders, "
        "close-cropped hair, short beard, deep smile lines, warm brown eyes "
        "matching Maya's, plain heather-grey crewneck sweatshirt, big careful "
        "hands. He appears ONLY as a warm golden-lit memory, as Maya imagines "
        "him, or as a pencil drawing in her sketchbook — never in custody."
    ),
    "grandma_ruth": (
        "GRANDMA RUTH is a Black woman in her early sixties, silver-grey hair "
        "in a low bun, reading glasses on a beaded chain, floral apron over a "
        "cardigan, steady and dry-humored and warm."
    ),
}

LOCATIONS = {
    "wilsons_bakery": (
        "LOCATION is Wilson's Bakery and Restaurant, the corner diner in the "
        "attached reference image: bright yellow illuminated BAKERY & "
        "RESTAURANT signage on both faces, glass-enclosed sidewalk seating "
        "strung with warm white lights, golden light spilling onto a wet "
        "street, brick building with fire escapes above."
    ),
    "maya_bedroom": (
        "LOCATION is Maya's small bedroom: her drawings taped over most of one "
        "wall, a warm bedside lamp, a narrow bed, late-afternoon light."
    ),
    "kitchen_table": (
        "LOCATION is a modest kitchen with a small table where the phone sits. "
        "Warm domestic light, worn but cared-for."
    ),
    "school_hallway": (
        "LOCATION is an ordinary elementary school hallway with lockers, "
        "cool daylight through high windows, other children blurred in motion."
    ),
    "none": "",
}

# Hard prohibitions from SERIES_BIBLE.md sections 3 and 8, appended to every render.
SAFETY_CLAUSE = (
    "Absolutely no prison imagery of any kind: no bars, cells, handcuffs, "
    "uniforms, guards, or institutional corridors. Nothing that would frighten "
    "a child about where their parent is. Gentle, hopeful, emotionally honest, "
    "never bleak."
)

STYLE_CLAUSE = (
    "Episode of the \"Still Here\" animated series for children who have a "
    "parent in prison. Modern 3D feature animation with warm cinematic "
    "lighting, soft depth of field, and expressive stylized characters. "
    "All characters are original to this series."
)


def load(path):
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def estimate_duration(script):
    """Seconds of narration, rounded up to the nearest 5."""
    words = len(script.split())
    raw = words / WORDS_PER_SECOND
    return int(5 * (raw // 5 + (1 if raw % 5 else 0)))


def pick_script(entry, target_seconds):
    """Choose the script variant that fits the configured duration.

    Returns (script, source_key) or (None, None) when the episode is a brief
    that still needs authoring by the production run.
    """
    full = entry.get("script")
    short = entry.get("script_40s")

    if target_seconds <= 50 and short:
        return short, "script_40s"
    if full:
        return full, "script"
    if short:
        return short, "script_40s"
    return None, None


def build_user_prompt(entry):
    """Assemble the visual-context prompt: style, canon, location, safety."""
    parts = [STYLE_CLAUSE]

    cast = entry.get("cast") or []
    if cast:
        canon_blocks = [CANON[name] for name in cast if name in CANON]
        if canon_blocks:
            parts.append(
                "CHARACTER CANON, keep exactly on-model: " + " ".join(canon_blocks)
            )

    location = entry.get("location", "none")
    if LOCATIONS.get(location):
        parts.append(LOCATIONS[location])

    theme = entry.get("theme")
    if theme:
        parts.append("THEME: " + theme)

    parts.append(SAFETY_CLAUSE)
    return " ".join(parts)


def build_shared_assets(entry, production):
    """Anchor images for this episode: cast actors plus the location.

    Skips anchors that don't exist yet — a null asset_id means the character
    is carried by the canon text alone this episode.
    """
    anchors = production["anchors"]
    assets = []
    missing = []

    for name in entry.get("cast") or []:
        record = anchors["characters"].get(name)
        if record and record.get("asset_id"):
            assets.append({"asset_id": record["asset_id"], "category": "actor"})
        else:
            missing.append(name)

    location = entry.get("location", "none")
    record = anchors["locations"].get(location)
    if record and record.get("asset_id"):
        assets.append({"asset_id": record["asset_id"], "category": record["category"]})

    if len(assets) > 8:
        raise SystemExit(
            "Too many anchors (%d). AgentOpus allows 8 per render — trim the "
            "cast for episode %s." % (len(assets), entry["episode"])
        )

    return assets, missing


def resolve(episode_number=None):
    production = load(PRODUCTION)
    queue = load(QUEUE)

    pending = [e for e in queue["queue"] if e.get("status") == "queued"]
    if not pending:
        raise SystemExit("Queue is empty. Add episodes to episodes/queue.json.")

    if episode_number is None:
        entry = pending[0]
    else:
        matches = [e for e in queue["queue"] if e["episode"] == episode_number]
        if not matches:
            raise SystemExit("No episode %s in the queue." % episode_number)
        entry = matches[0]

    render = production["render"]
    lane_key = "lane_a_child_facing" if entry["lane"] == "A" else "lane_b_parent_facing"
    voice = production["voices"][lane_key]

    target = render["target_duration_seconds"]
    script, script_key = pick_script(entry, target)
    assets, missing = build_shared_assets(entry, production)

    params = {
        "style_name": render["style_name"],
        "voice_id": voice["voice_id"],
        "ratio": render["ratio"],
        "image_model": render["image_model"],
        "transition_video_model": render["transition_video_model"],
        "enable_captions": render["enable_captions"],
        "target_duration_seconds": target,
        "user_prompt": build_user_prompt(entry),
    }
    if script:
        params["script"] = script
        params["target_duration_seconds"] = estimate_duration(script)
    if assets:
        params["shared_assets"] = assets

    return {
        "episode": entry["episode"],
        "title": entry["title"],
        "lane": entry["lane"],
        "slug": entry.get("slug"),
        "voice_name": voice["name"],
        "script_source": script_key,
        "needs_authoring": script is None,
        "brief": entry.get("brief"),
        "missing_anchors": missing,
        "estimated_credits": params["target_duration_seconds"],
        "prepare_project_params": params,
    }


def check():
    """Validate configuration without resolving an episode."""
    production = load(PRODUCTION)
    queue = load(QUEUE)
    problems = []
    notes = []

    for key in ("ratio", "target_duration_seconds"):
        status = production["render"].get(key + "_status", "")
        if status.startswith("PENDING"):
            problems.append("render.%s is unconfirmed: %s" % (key, status))

    for lane, voice in production["voices"].items():
        if str(voice.get("status", "")).startswith("PENDING"):
            problems.append("voices.%s is unconfirmed" % lane)

    for name, record in production["anchors"]["characters"].items():
        if not record.get("asset_id"):
            notes.append(
                "no anchor image for '%s' — carried by canon text only, face "
                "will drift between episodes" % name
            )

    queued = [e for e in queue["queue"] if e.get("status") == "queued"]
    scripted = [e for e in queued if e.get("script") or e.get("script_40s")]
    notes.append(
        "%d episodes queued, %d pre-scripted, %d need authoring at run time"
        % (len(queued), len(scripted), len(queued) - len(scripted))
    )

    if queued:
        cost = sum(
            estimate_duration(e.get("script") or e.get("script_40s") or "")
            or production["render"]["target_duration_seconds"]
            for e in queued
        )
        notes.append("full queue would cost roughly %d credits to render" % cost)

    print("Still Here — configuration check\n")
    if problems:
        print("BLOCKING (%d):" % len(problems))
        for item in problems:
            print("  ! " + item)
        print("")
    print("Notes:")
    for item in notes:
        print("  - " + item)
    return 1 if problems else 0


def main():
    parser = argparse.ArgumentParser(description="Resolve the next Still Here episode.")
    parser.add_argument("--episode", type=int, help="Specific episode number.")
    parser.add_argument("--check", action="store_true", help="Validate config only.")
    args = parser.parse_args()

    if args.check:
        return check()

    print(json.dumps(resolve(args.episode), indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
