# In-house video renderer

Turns a Campaign Studio video script into narrated, captioned MP4s, with **no paid services and no API keys**.

| Step | Tool | Cost |
|---|---|---|
| Voice | [Piper](https://github.com/rhasspy/piper) neural text-to-speech, running offline (voices *Lessac* and *Ryan*) | Free |
| Picture | Branded HTML scenes animated frame by frame in headless Chromium (Playwright) | Free |
| Encode | ffmpeg (H.264 video, AAC audio, `faststart` for the web) | Free |

Each script produces:
- `out/<name>-16x9.mp4` (1920×1080) for YouTube, LinkedIn and Facebook feed
- `out/<name>-9x16.mp4` (1080×1920) for Reels, TikTok and Shorts
- a thumbnail JPG for each format
- `out/<name>.srt` caption file for YouTube uploads (captions are also burned into the video)

## Run it

```bash
cd tools/video
npm install
npm run setup                                            # once: downloads the voices, installs piper-tts
npm run render -- scripts/legacy-path-explainer.json     # about 2–3 min for both formats
```

Requirements: Node 18+, Python 3.9+, and Chromium for Playwright (`npx playwright install chromium` if it isn't already installed).

## Write a new video

Copy `scripts/legacy-path-explainer.json` and edit it. Each scene has a `kind` and a `vo` (the narration line). The scene lasts as long as its narration, so timing needs no hand-tuning.

| `kind` | Fields | Use for |
|---|---|---|
| `family` | `eyebrow`, `headline` | Opening hook |
| `screener` | `eyebrow`, `headline`, `chips[]`, `note` | Showing the free screener |
| `plan` | `eyebrow`, `columns[{label, items[]}]` | Do first / Work on next / When you're ready |
| `guides` | `eyebrow`, `tiles[]`, `price` | What $20 unlocks |
| `endcard` | `headline`, `tagline`, `cta` | Close; always shows the script's `disclaimer` |

- **Voice:** set `"voice"` to `en-us-lessac-medium` (female) or `en-us-ryan-medium` (male). `"lengthScale"` above 1 slows the delivery.
- **Copy:** narration and on-screen text must come from an **approved** Campaign Studio draft. The renderer produces video, not copy, so it adds nothing a reviewer hasn't seen.

## After rendering

1. Upload the MP4s and thumbnails in **Morpheus → Creator Studio → Asset vault → Upload files**.
2. Paste the hosted link as the project's **final cut**. It flows back to the campaign asset, so results can be tied to the video.
3. When posting, use the draft's tracked link (for example `utm_source=youtube&utm_medium=video`). Change the source with the Link builder if you post it somewhere else.

Look and feel live in `template.html`: the Legacy Path colors, Spectral and Public Sans fonts, the logo mark, and simple vector illustrations with no stock footage or licensing.
