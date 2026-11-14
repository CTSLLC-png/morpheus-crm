# Creator Studio: running without a person at a computer

Creator Studio can turn a script into finished, filed video with nobody signed in anywhere. This page explains the path, the one-time setup, and the limits.

## How a render runs

1. A video script (`tools/video/scripts/<name>.json`) is pushed to a branch named `render/<anything>`.
2. The **Creator Studio render** workflow starts on a GitHub runner. It renders every script that differs from `main` with the in-house renderer: Piper voice, branded HTML scenes, ffmpeg. No paid service is called.
3. The workflow files the MP4s, thumbnails and caption file in the private `studio-assets` bucket under `renders/<script>/<run>/` and lists them in **Creator Studio → Asset vault**, tagged `render`.
4. If the script has `"studioProjectId": "<project id>"`, the files are attached to that Creator Studio project.

A script can also be rendered on demand from **Actions → Creator Studio render → Run workflow**.

## One-time setup

The workflow files results through the `studio-agent` edge function, which checks a shared key. The key is entered by a person in two places and never appears in code, chat or logs.

1. Make a random key of at least 32 characters (a password manager's generator works).
2. Supabase → project `morpheus-crm` → Edge Functions → Secrets → add `STUDIO_AGENT_KEY` with that value.
3. GitHub → `morpheus-crm` → Settings → Secrets and variables → Actions → New repository secret → `STUDIO_AGENT_KEY` with the same value.

To rotate the key, replace it in both places. To shut the door, delete the Supabase secret: the function then refuses every request.

## What the key can and cannot do

| Can | Cannot |
|---|---|
| Upload files under `renders/` in `studio-assets` | Read, replace or delete anything outside `renders/` |
| List those files in the asset vault | Read any table, or change projects, tasks or users |
| Attach them to an existing project | Create or delete projects |

The service-role key stays inside Supabase. The function sends no CORS headers, so a web page cannot call it.

## Limits to know

- **This repository is public.** A script pushed here can be read by anyone before the video is released. Keep unreleased story material out of scripts until the repository is private.
- **Scene types.** The renderer draws the explainer scene kinds listed in `tools/video/README.md`. Animation, AI-generated images or footage and cloned voices are not part of this path.
- **File size.** The vault accepts files up to 50 MB.
- **Spending.** Nothing here costs money on a public repository. Any step that would (GPU rendering, paid generation) still needs a cost estimate and approval per job.
- **Copy.** Narration and on-screen text must come from an approved Campaign Studio draft.
