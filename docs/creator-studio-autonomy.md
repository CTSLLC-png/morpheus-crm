# Creator Studio: running without a person at a computer

Creator Studio can turn a script into finished, filed video with nobody signed in anywhere. This page explains the path, the one-time setup, and the limits.

## How a render runs

1. A video script (`tools/video/scripts/<name>.json`) is pushed to a branch named `render/<anything>`.
2. The **Creator Studio render** workflow starts on a GitHub runner. It renders every script that differs from `main` with the in-house renderer: Piper voice, branded HTML scenes, ffmpeg. No paid service is called.
3. The workflow files the MP4s, thumbnails and caption file in the private `studio-assets` bucket under `renders/<script>/<run>/` and lists them in **Creator Studio → Asset vault**, tagged `render`.
4. If the script has `"studioProjectId": "<project id>"`, the files are attached to that Creator Studio project.

A script can also be rendered on demand from **Actions → Creator Studio render → Run workflow**.

## Render queue: asking for a render from inside Nguzo

Staff can queue a render without touching git:

1. **Nguzo → Creator Studio → Render queue**: pick a script, optionally a project, and press **Queue render**.
2. Every 30 minutes the **Creator Studio render** workflow checks the queue. It claims the oldest job, renders `tools/video/scripts/<script>.json` from `main`, files the output in the vault (attached to the chosen project) and marks the job **Done** with the file count, or **Failed** with a reason and a link to the run log.
3. An empty queue costs one short step and renders nothing. To work the queue right away, run the workflow by hand with the script name left empty.

Rules the database enforces (`sql/0022_creator_studio_render_queue.sql`):

- Only staff (trainer, super_admin) can see or queue jobs. A staff member can cancel a job only while it is still queued, and can never mark one done or failed.
- One open job per script and project, and at most 20 open jobs in all.
- Script names are plain file names (`a-z`, `0-9`, dashes), so a job cannot point outside `tools/video/scripts`.
- A job left running for over two hours is failed automatically on the next check.
- Only the `studio-agent` function (service role) can claim or finish jobs. super_admin can delete finished history.

The scheduled check runs only from `main`, so the queue starts working once this change is merged and `sql/0022_creator_studio_render_queue.sql` has been applied in Supabase.

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
| Claim the next queued render job and mark it done or failed | Queue, edit or cancel jobs, or change a finished job |

The service-role key stays inside Supabase. The function sends no CORS headers, so a web page cannot call it.

## Limits to know

- **This repository is public.** A script pushed here can be read by anyone before the video is released. Keep unreleased story material out of scripts until the repository is private.
- **Scene types.** The renderer draws the explainer scene kinds listed in `tools/video/README.md`. Animation, AI-generated images or footage and cloned voices are not part of this path.
- **File size.** The vault accepts files up to 50 MB.
- **Spending.** Nothing here costs money on a public repository. Any step that would (GPU rendering, paid generation) still needs a cost estimate and approval per job.
- **Copy.** Narration and on-screen text must come from an approved Campaign Studio draft.
