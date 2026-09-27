// One-time setup: downloads the free Piper neural voices (MIT-licensed
// engine, voices from rhasspy/piper on GitHub) and checks the Piper CLI.
// Nothing here costs money or needs an API key.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'

const VOICES = ['en-us-lessac-medium', 'en-us-ryan-medium']
mkdirSync('voices', { recursive: true })
for (const v of VOICES) {
  if (existsSync(`voices/${v}.onnx`)) { console.log(`✓ ${v}`); continue }
  const url = `https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-${v}.tar.gz`
  console.log(`↓ ${v}`)
  execFileSync('bash', ['-c', `curl -sSL --fail "${url}" | tar xz -C voices`], { stdio: 'inherit' })
}
try {
  execFileSync('python3', ['-c', 'import piper'], { stdio: 'ignore' })
  console.log('✓ piper-tts')
} catch {
  console.log('Installing piper-tts (pip)…')
  execFileSync('python3', ['-m', 'pip', 'install', '-q', 'piper-tts'], { stdio: 'inherit' })
}
console.log('Ready. Run: npm run render -- scripts/<name>.json')
