// tools/video/render.mjs
// ── In-house video renderer: script JSON → narrated, captioned MP4s.
//    Voice: Piper (free, offline neural TTS). Picture: branded HTML scenes
//    rendered frame by frame in headless Chromium. Encode: ffmpeg (H.264/AAC).
//    No paid service and no API key anywhere in the pipeline.
//
//    npm run setup                       (once: voices + piper)
//    npm run render -- scripts/legacy-path-explainer.json

import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ffmpeg from 'ffmpeg-static'
import { chromium } from 'playwright'

const scriptPath = process.argv[2]
if (!scriptPath) { console.error('Usage: npm run render -- scripts/<name>.json'); process.exit(1) }
const script = JSON.parse(readFileSync(scriptPath, 'utf8'))
const name = basename(scriptPath, '.json')
const WORK = `.work/${name}`, OUT = 'out'
mkdirSync(WORK, { recursive: true }); mkdirSync(OUT, { recursive: true })

const voice = `voices/${script.voice}.onnx`
if (!existsSync(voice)) { console.error(`Missing ${voice}. Run: npm run setup`); process.exit(1) }

// ── 1. Voice every scene ────────────────────────────────────────────────────
function wavSeconds(file) {
  const b = readFileSync(file)
  const rate = b.readUInt32LE(24), channels = b.readUInt16LE(22), bits = b.readUInt16LE(34)
  let o = 12
  while (o < b.length - 8) {               // walk chunks to find "data"
    const id = b.toString('ascii', o, o + 4), size = b.readUInt32LE(o + 4)
    if (id === 'data') return size / (rate * channels * (bits / 8))
    o += 8 + size
  }
  throw new Error('No data chunk in ' + file)
}

console.log(`▶ ${script.title}`)
const voiced = script.scenes.map((s, i) => {
  const wav = `${WORK}/vo-${i}.wav`
  execFileSync('python3', ['-m', 'piper', '-m', voice, '--length-scale', String(script.lengthScale ?? 1), '-f', wav],
    { input: s.vo, stdio: ['pipe', 'ignore', 'ignore'] })
  const secs = wavSeconds(wav)
  console.log(`  voice ${i + 1}/${script.scenes.length}  ${secs.toFixed(1)}s  ${s.kind}`)
  return { wav, secs }
})

// ── 2. Timeline: scenes sized to their voiceover, captions timed within it ──
const LEAD = 0.5, TAIL = 0.7, END_HOLD = 2.2
let t = 0
const scenes = script.scenes.map((s, i) => {
  const last = i === script.scenes.length - 1
  const dur = LEAD + voiced[i].secs + (last ? END_HOLD : TAIL)
  const sc = { start: t, dur, voStart: t + LEAD, voEnd: t + LEAD + voiced[i].secs }
  t += dur
  return sc
})
const total = t

// Captions: split at sentence ends, then into phrases of about 7 words,
// folding any 1–2 word tail into the phrase before it so no single word
// flashes on screen alone. Timed by length within the scene's voiceover.
function phrases(sentence, max = 7) {
  const w = sentence.split(/\s+/).filter(Boolean), out = []
  for (let k = 0; k < w.length; k += max) out.push(w.slice(k, k + max))
  if (out.length > 1 && out[out.length - 1].length < 3) out[out.length - 2].push(...out.pop())
  return out.map(p => p.join(' '))
}
const captions = []
script.scenes.forEach((s, i) => {
  const chunks = s.vo.split(/(?<=[.:;?!])\s+/).flatMap(sentence => phrases(sentence))
  const chars = chunks.reduce((n, c) => n + c.length, 0)
  let at = scenes[i].voStart
  for (const c of chunks) {
    const len = (c.length / chars) * (scenes[i].voEnd - scenes[i].voStart)
    captions.push({ start: at, end: at + len, text: c })
    at += len
  }
})
script.timeline = { scenes, captions, total }

const srt = captions.map((c, i) => {
  const ts = s => new Date(s * 1000).toISOString().slice(11, 23).replace('.', ',')
  return `${i + 1}\n${ts(c.start)} --> ${ts(c.end)}\n${c.text}\n`
}).join('\n')
writeFileSync(`${OUT}/${name}.srt`, srt)

// ── 3. One narration track ──────────────────────────────────────────────────
const narration = `${WORK}/narration.wav`
execFileSync(ffmpeg, [
  '-y', '-hide_banner', '-loglevel', 'error',
  ...voiced.flatMap(v => ['-i', v.wav]),
  '-filter_complex',
  voiced.map((v, i) => `[${i}:a]adelay=${Math.round(scenes[i].voStart * 1000)}:all=1[a${i}]`).join(';') + ';' +
  voiced.map((_, i) => `[a${i}]`).join('') + `amix=inputs=${voiced.length}:normalize=0,apad,atrim=0:${total.toFixed(3)}[out]`,
  '-map', '[out]', '-ar', '48000', '-ac', '2', narration,
])

// ── 4. Picture, per aspect ratio ────────────────────────────────────────────
const fps = script.fps ?? 30
const frames = Math.ceil(total * fps)
const browser = await chromium.launch()
for (const o of script.outputs) {
  const page = await browser.newPage({ viewport: { width: o.width, height: o.height }, deviceScaleFactor: 1 })
  await page.goto(pathToFileURL(resolve('template.html')).href)
  await page.evaluate(([s, orient]) => window.setup(s, orient), [script, o.height > o.width ? 'v' : 'h'])

  const file = `${OUT}/${name}-${o.name}.mp4`
  const enc = spawn(ffmpeg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
    '-i', narration,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-t', total.toFixed(3), file,
  ], { stdio: ['pipe', 'inherit', 'inherit'] })
  const done = new Promise((ok, fail) => enc.on('close', c => (c === 0 ? ok() : fail(new Error('ffmpeg exited ' + c)))))

  for (let f = 0; f < frames; f++) {
    await page.evaluate(ts => window.renderAt(ts), f / fps)
    const jpg = await page.screenshot({ type: 'jpeg', quality: 92 })
    if (!enc.stdin.write(jpg)) await new Promise(r => enc.stdin.once('drain', r))
    if (f % (fps * 10) === 0) process.stdout.write(`  ${o.name} ${Math.round((f / frames) * 100)}%\r`)
  }
  enc.stdin.end()
  await done

  // Thumbnail: the opening headline, fully on screen.
  await page.evaluate(ts => window.renderAt(ts), scenes[0].start + scenes[0].dur - 0.8)
  await page.screenshot({ path: `${OUT}/${name}-${o.name}-thumb.jpg`, type: 'jpeg', quality: 90 })
  await page.close()
  console.log(`  ✓ ${file}  (${o.width}×${o.height}, ${total.toFixed(1)}s)`)
}
await browser.close()
console.log(`  ✓ ${OUT}/${name}.srt`)
