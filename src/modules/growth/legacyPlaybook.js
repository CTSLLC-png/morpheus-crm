// src/modules/growth/legacyPlaybook.js
// ── Legacy Path campaign playbook — the facts, audiences and guardrails the
//    Campaign Studio generator is allowed to use. Every claim the AI may make
//    about the product lives in PRODUCT_FACTS; if it isn't here, it doesn't go
//    in an ad. Keep in step with public/legacy/index.html.

export const LANDING = 'https://legacy.morpheuscr.com/'

export const PRODUCT_FACTS = [
  'Legacy Path is an education-only web app from Certified Training Standards LLC (Albany, NY).',
  'It teaches families how money works at every age, from a child\'s first savings account to wills, trusts and funeral planning.',
  'Eight life stages: Cradle (0–4), Learning (5–12), Teen (13–17), Launch (18–24), Foundation (25–34), Building (35–49), Protection (50–64), Legacy (65+).',
  'A free family screener (about five minutes, ranges are fine) sorts steps into "do first", "work on next" and "when you\'re ready", and shows which answer triggered each one.',
  'Options library: 31 places a family\'s money can go, with 2026 rules (529 plans, custodial Roth IRAs, Trump Accounts for children, 401(k)s, HSAs, index funds and more).',
  'Trusts and estate: wills, powers of attorney, beneficiary designations and 10 kinds of family trusts explained with examples.',
  'Insurance and financing: 15 insurance types, plus six ways families use life insurance to reach financing, with the risks spelled out.',
  'Burial and legacy: funeral traditions for 11 faith and cultural traditions, family cemetery plots, costs, veterans\' benefits and rights under the FTC Funeral Rule.',
  'Price: $20 one time, plus sales tax where applicable. Lifetime access for the whole household. No subscription.',
  'Free account needs only an email and password. Never asks for Social Security numbers, account numbers or bank logins.',
  'Runs in any web browser on phone, tablet or computer. Nothing to download.',
  'Checkout by Stripe. 30-day full refund policy.',
  'Free "Ask AI" help on any topic.',
]

export const DISCLAIMER =
  'Education only — not investment, insurance, tax or legal advice. Talk to a licensed professional before acting.'

export const AUDIENCES = [
  { key: 'new-parents',   label: 'New and expecting parents',        pain: 'Want to start a child off right but don\'t know if a 529, custodial account or Trump Account comes first.', stage: 'Cradle / Learning' },
  { key: 'first-gen',     label: 'First-generation wealth builders', pain: 'Nobody in the family taught them how credit, retirement accounts or trusts work.', stage: 'Launch / Foundation' },
  { key: 'sandwich',      label: 'Sandwich generation (40–60)',      pain: 'Supporting kids and aging parents at once; worried about wills, insurance and who decides if a parent gets sick.', stage: 'Building / Protection' },
  { key: 'pre-retirees',  label: 'Pre-retirees and retirees',        pain: 'Want their house and savings to pass to the kids without confusion, fights or probate surprises.', stage: 'Protection / Legacy' },
  { key: 'faith',         label: 'Faith communities',                pain: 'Want funeral and burial plans that honor their tradition without leaving the family a bill.', stage: 'All stages' },
  { key: 'grandparents',  label: 'Grandparents',                     pain: 'Want to help grandchildren save and leave something behind the right way.', stage: 'Legacy' },
  { key: 'workforce',     label: 'Workforce and reentry participants', pain: 'Starting over; need plain-language money basics and a plan that fits a first paycheck.', stage: 'Launch / Foundation' },
]

export const CHANNELS = [
  { key: 'email',         label: 'Email',                  spec: 'Subject line (under 50 characters), preview text (under 90), body 120–200 words, one call to action.' },
  { key: 'facebook',      label: 'Facebook post',          spec: '60–120 words, conversational, one question to invite comments, link at the end.' },
  { key: 'instagram',     label: 'Instagram caption',      spec: 'Hook in the first line, 80–150 words, 5–8 relevant hashtags, "link in bio".' },
  { key: 'tiktok',        label: 'TikTok / Reels script',  spec: '30–45 seconds: 3-second hook, 3 beats, on-screen text cues in [brackets], spoken CTA.' },
  { key: 'youtube',       label: 'YouTube description',    spec: 'Title under 70 characters, 150-word description with chapters, link in the first line.' },
  { key: 'linkedin',      label: 'LinkedIn post',          spec: 'For HR/benefits leaders and community partners: 120–200 words, professional, a financial-wellness angle.' },
  { key: 'google-search', label: 'Google Search ad',       spec: '10 headlines (max 30 characters each) and 4 descriptions (max 90 characters each). Label every line with its character count.' },
  { key: 'meta-ads',      label: 'Meta ad set',            spec: '3 variants, each with primary text (under 125 characters), headline (under 40) and description (under 30).' },
  { key: 'sms',           label: 'SMS (opt-in list only)', spec: 'Under 160 characters including link, and must end with "Reply STOP to opt out".' },
  { key: 'partner',       label: 'Partner outreach',       spec: 'Email to a church, credit union, employer HR team, funeral home or community nonprofit proposing a free family-money workshop and a group code. 150–220 words.' },
  { key: 'video-script',  label: 'Explainer video script', spec: '60–90 seconds with scene descriptions, voiceover and on-screen text.' },
  { key: 'blog',          label: 'SEO blog article',       spec: '700–900 words, H2 subheads, plain language, target keyword in the title and first paragraph, ends with a link to the free screener.' },
]

export const ANGLES = [
  'Start free: take the five-minute family screener',
  'One price, no subscription: $20 for the whole household, for life',
  'Cradle to grave: every age has a money to-do list',
  'The talk nobody had with you: what your parents never explained',
  'Funeral planning your family can afford, in your tradition',
  'Trusts aren\'t just for the rich: 10 kinds explained',
  'Your child\'s first account: 529 vs custodial Roth vs Trump Account',
  'Privacy first: no bank logins, no SSN, ever',
]

// Seasonal hooks the calendar can lean on (month index 0–11).
export const SEASONAL = {
  0: 'New Year money reset', 1: 'Black History Month — building generational wealth', 2: 'Tax season',
  3: 'Financial Literacy Month', 4: 'Mother\'s Day — protect the family', 5: 'Father\'s Day / graduation',
  6: 'Mid-year check-in', 7: 'Back to school — start the kids\' accounts', 8: 'Life Insurance Awareness Month',
  9: 'Open enrollment season', 10: 'Veterans Day benefits + Thanksgiving family talks', 11: 'Year-end giving and estate review',
}

// Phrases that turn education into advice, or promise outcomes. The checker
// flags them before a human reviewer sees the draft; the reviewer decides.
const RULES = [
  { re: /\bguarantee(d|s)?\b/i,                              msg: 'Promises an outcome ("guarantee").' },
  { re: /\b(get rich|wealthy fast|double your|risk[- ]free)\b/i, msg: 'Implies returns or no risk.' },
  { re: /\b(we recommend|you should (buy|invest|open)|best investment)\b/i, msg: 'Reads as individual advice.' },
  { re: /\bfinancial (advisor|adviser|advice)\b(?![^.]*\bnot\b)/i, msg: 'Mentions advice/advisers without saying Legacy Path is not advice.' },
  // "talk to a licensed professional" is the required disclaimer, not a claim.
  { re: /\b(certified financial|fiduciary)\b|\blicensed\b(?!\s+(professional|attorney|agent|adviser|advisor))/i, msg: 'Could imply CTS holds a license it does not.' },
  { re: /\b(avoid|skip) (taxes|probate) (completely|entirely)\b/i, msg: 'Overstates what a trust or plan does.' },
  { re: /\bfree\b(?![^.]*(screener|account|help|workshop|session|class|ask ai))/i, msg: '"Free" must refer to the screener, account, workshop or Ask AI — the guides cost $20.' },
  { re: /\$\s?(?!20\b)\d+/,                                   msg: 'Mentions a price other than $20. Check it.' },
  { re: /\b(limited time|only \d+ left|expires tonight)\b/i, msg: 'False-urgency language.' },
  { re: /\b(social security number|ssn|bank login)\b(?![^.]*\b(never|no)\b)/i, msg: 'Mentions sensitive data without saying we never collect it.' },
]

/** Returns a list of human-readable compliance flags for a piece of copy. */
export function complianceCheck(text, channel) {
  const flags = RULES.filter(r => r.re.test(text)).map(r => r.msg)
  if (!/education/i.test(text) && ['meta-ads', 'google-search', 'sms'].indexOf(channel) === -1) {
    flags.push('No "education only" disclaimer. Add it before publishing.')
  }
  if (channel === 'sms' && !/reply stop/i.test(text)) flags.push('SMS must include "Reply STOP to opt out".')
  if (channel === 'email' && !/unsubscribe/i.test(text)) flags.push('Email needs an unsubscribe line and the CTS mailing address (CAN-SPAM).')
  if (text.includes(`utm_source=${PARTNER_PLACEHOLDER}`)) flags.push('Link still says "partner-name". Make one link per partner in the Link builder and swap it in before sending.')
  if (text.includes(`utm_source=${PLACEMENT_PLACEHOLDER}`)) flags.push('Link still says "placement-name". Name where this is posted in the Link builder and swap the link in.')
  return flags
}

/** UTM-tagged landing link. Slugs keep the funnel report readable. */
export function utmLink({ source, medium, campaign, content, path = '' }) {
  const slug = v => String(v || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80)
  const u = new URL(path.replace(/^\//, ''), LANDING)
  if (source)   u.searchParams.set('utm_source', slug(source))
  if (medium)   u.searchParams.set('utm_medium', slug(medium))
  if (campaign) u.searchParams.set('utm_campaign', slug(campaign))
  if (content)  u.searchParams.set('utm_content', slug(content))
  return u.toString()
}

// Where each channel's traffic comes from. utm_source is the PLATFORM the
// person saw it on (facebook, youtube, meta, google) and utm_medium is the
// FORMAT (social, video, paid-social, cpc). The channel key itself never goes
// in the link: "video-script" or "blog" as a source would make the Funnel
// tab's Source column meaningless.
// Partner and print links can't know their source up front — each church,
// credit union or flyer placement is its own source — so they carry a
// placeholder that complianceCheck() flags until someone names it.
export const PARTNER_PLACEHOLDER = 'partner-name'
export const PLACEMENT_PLACEHOLDER = 'placement-name'

export const CHANNEL_UTM = {
  facebook:        { source: 'facebook',         medium: 'social' },
  instagram:       { source: 'instagram',        medium: 'social' },
  linkedin:        { source: 'linkedin',         medium: 'social' },
  tiktok:          { source: 'tiktok',           medium: 'video' },
  youtube:         { source: 'youtube',          medium: 'video' },
  'video-script':  { source: 'youtube',          medium: 'video' },
  'meta-ads':      { source: 'meta',             medium: 'paid-social' },
  'google-search': { source: 'google',           medium: 'cpc' },
  email:           { source: 'newsletter',       medium: 'email' },
  sms:             { source: 'sms-list',         medium: 'sms' },
  blog:            { source: 'legacy-path-blog', medium: 'article' },
  partner:         { source: PARTNER_PLACEHOLDER,   medium: 'partner', named: 'the partner organization, e.g. st-johns-church' },
  print:           { source: PLACEMENT_PLACEHOLDER, medium: 'print',   named: 'where the flyer is posted, e.g. albany-library' },
}

/**
 * The tracked link for a channel. `source` overrides the default platform
 * (a partner's name, or "facebook" for a video posted there instead of
 * YouTube); the medium always follows the channel's format.
 */
export function channelLink({ channel, campaign, audience, source, path = '' }) {
  const utm = CHANNEL_UTM[channel] ?? { source: 'other', medium: 'other' }
  return utmLink({ source: source || utm.source, medium: utm.medium, campaign, content: audience, path })
}

export function systemPrompt() {
  return `You write marketing copy for Legacy Path, sold by Certified Training Standards LLC (CTS).

Use ONLY these product facts. Never invent features, statistics, testimonials, reviews, awards, press mentions or discounts:
${PRODUCT_FACTS.map(f => '- ' + f).join('\n')}

Rules:
- Legacy Path is EDUCATION. Never tell the reader what to buy, invest in or sign. Never promise returns, savings, tax results or probate outcomes.
- Never imply CTS is a financial adviser, broker, insurance producer, attorney or fiduciary.
- "Free" refers only to the account, screener, Ask AI help or a workshop. The guides cost $20 once.
- No false urgency, no fear tactics about death or poverty, no shaming. Warm, plain language at an 8th-grade reading level; respectful of every faith and culture.
- Long-form copy (email, posts, articles, scripts, partner emails) ends with: "${DISCLAIMER}"
- Emails end with an unsubscribe line and "Certified Training Standards LLC · 418 Broadway Ste 8N, Albany, NY 12205".
- Use the exact link you are given. Do not shorten or alter it.
- Output plain text only, no markdown code fences.`
}

export function generationPrompt({ channel, audience, angle, link, notes }) {
  const ch = CHANNELS.find(c => c.key === channel)
  const au = AUDIENCES.find(a => a.key === audience)
  return `Write a ${ch.label}.
Format: ${ch.spec}
Audience: ${au.label} — ${au.pain} (life stages: ${au.stage})
Angle: ${angle}
Link: ${link}
${notes ? 'Extra direction from the campaign manager: ' + notes + '\n' : ''}
Return ONLY a JSON object, no preamble:
{"title": "short internal name for this asset", "body": "the finished copy"}`
}

// ── Creator Studio handoff ─────────────────────────────────────────────────
// An approved asset becomes a Creator Studio project (Morpheus module
// growth.studio) with its production queue filled in. The same plan renders
// as a plain-text brief for tools outside Morpheus.

const PRODUCTION = {
  'video-script': { type: 'Explainer video',    specs: '60–90 s · 16:9 master + 9:16 cut · burned-in captions', kind: 'video', project: 'explainer' },
  tiktok:         { type: 'Short-form video',   specs: '30–45 s · 9:16 · captions on screen · hook in first 3 s', kind: 'video', project: 'short-form' },
  youtube:        { type: 'YouTube video',      specs: '16:9 · thumbnail 1280×720 · chapters from the description', kind: 'video', project: 'explainer' },
  instagram:      { type: 'Social image / Reel', specs: '1080×1350 feed image, or 9:16 Reel under 45 s', kind: 'image', project: 'social-image' },
  facebook:       { type: 'Social image',       specs: '1080×1080 and 1200×628 · text on image under 20%', kind: 'image', project: 'social-image' },
  'meta-ads':     { type: 'Ad creative set',    specs: '1080×1080, 1080×1350, 9:16 · one image or 15 s video per variant', kind: 'image', project: 'ad' },
  print:          { type: 'Print flyer',        specs: 'Letter 8.5×11 in · 300 dpi · QR code to the tracked link', kind: 'image', project: 'print' },
}

export const PRODUCTION_CHANNELS = Object.keys(PRODUCTION)

export const BRAND_KIT = {
  colors: 'Forest #1C3D35 (primary) · Gold #9C6A1E (accent) · Cream #F3F5F1 (background) · Ink #17231F',
  fonts: 'Spectral (headlines) · Public Sans (body)',
  logo: 'Legacy Path mark: rising three-point line in a rounded square (legacy.morpheuscr.com/og/legacy-path-icon.png)',
  tone: 'Warm, plain-spoken, respectful of every faith and culture. Real families, multi-generational, not stock "rich" imagery. No money piles, no luxury, no fear or grief staging.',
}

const shiftDate = (iso, days) => {
  const d = new Date(`${iso}T12:00:00`); d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * The production plan for one approved asset: what Creator Studio needs to
 * open a project and fill its queue. Due dates count back from the air date.
 */
export function productionPlan(asset) {
  const p = PRODUCTION[asset.channel] ?? { type: 'Creative', specs: 'See copy', kind: 'image', project: 'other' }
  const audience = AUDIENCES.find(a => a.key === asset.audience)
  const air = asset.scheduled_for || shiftDate(new Date().toISOString().slice(0, 10), 7)
  const due = n => shiftDate(air, -n)
  const queue = p.kind === 'video'
    ? [
        ['critical', 'Lock script and shot list', due(5)],
        ['high',     'Record or generate voiceover', due(4)],
        ['high',     'Generate visuals from the Asset vault (brand kit in brief)', due(3)],
        ['normal',   'Edit, captions, music, end card', due(2)],
        ['critical', 'Compliance pass: disclaimer on end card, link exact, no advice or promises', due(1)],
      ]
    : [
        ['high',     'Generate key visual from the Asset vault (brand kit in brief)', due(3)],
        ['normal',   'Lay out headline and copy, export every size', due(2)],
        ['critical', 'Compliance pass: disclaimer present, link or QR exact, no advice or promises', due(1)],
      ]
  return {
    title: `Legacy Path · ${asset.title}`,
    type: p.type,
    projectKind: p.project,
    specs: p.specs,
    air,
    audience: audience?.label ?? null,
    link: asset.landing_url || LANDING,
    queue: queue.map(([priority, title, due_date]) => ({ priority, title, due_date })),
  }
}

/** Plain-text production brief for one approved asset, ready to paste. */
export function productionBrief(asset) {
  const plan = productionPlan(asset)
  const cap = w => w[0].toUpperCase() + w.slice(1)
  return [
    'CREATOR STUDIO — PRODUCTION BRIEF',
    '',
    `Project: ${plan.title}`,
    `Type: ${plan.type}`,
    'Stage: Pre-production',
    `Campaign: ${asset.campaign} · Channel: ${asset.channel}${plan.audience ? ` · Audience: ${plan.audience}` : ''}`,
    `Air date: ${plan.air}`,
    '',
    'PRODUCTION QUEUE',
    ...plan.queue.map((q, i) => `${i + 1}. [${cap(q.priority)}] ${q.title} — due ${q.due_date}`),
    '',
    'SPECS',
    `- ${plan.specs}`,
    `- End card / footer: "Legacy Path · Free family screener at legacy.morpheuscr.com"`,
    `- Disclaimer on screen: "${DISCLAIMER}"`,
    `- Tracked link (use exactly): ${plan.link}`,
    '',
    'BRAND KIT',
    `- Colors: ${BRAND_KIT.colors}`,
    `- Fonts: ${BRAND_KIT.fonts}`,
    `- Logo: ${BRAND_KIT.logo}`,
    `- Look and tone: ${BRAND_KIT.tone}`,
    '',
    'APPROVED COPY / SCRIPT (do not change wording without re-approval in Campaign Studio)',
    '---',
    asset.body,
    '---',
    '',
    'When the cut is final, add the media link to the project so results can be tied to it.',
  ].join('\n')
}
