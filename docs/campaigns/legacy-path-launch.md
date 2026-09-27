# Legacy Path — Launch Campaign Playbook

**Product:** Legacy Path, $20 one-time lifetime access · https://legacy.morpheuscr.com/
**Owner:** Certified Training Standards LLC
**Run it from:** Morpheus → **Campaign Studio** (`/campaigns`, module `growth.campaigns`)

This playbook is the strategy. Campaign Studio does the day-to-day work: it writes drafts with AI, checks them for compliance, holds them until a super_admin approves, and reports which sources turn into paying families.

---

## 1. How the autonomous loop works

```
 Autopilot (weekly)          Human gate             Channels              Measurement
 ────────────────────        ────────────           ─────────             ───────────
 7 dated AI drafts   ──▶  super_admin approves ──▶  post / send    ──▶  UTM link → free account
 per week, each with       (DB trigger enforces;     (copy button,        → lp_attribution
 its own tracked link      automation cannot         scheduler, or        → $20 purchase
 + compliance flags        approve its own work)     partner)             → Funnel tab
        ▲                                                                       │
        └──────────── next week's angles lean on what converted ◀──────────────┘
```

**What's automated:** writing copy for every channel, rotating audiences and angles, compliance screening, tracked links, first-touch attribution and the funnel report.
**What stays human, on purpose:** approving copy, and posting to accounts CTS owns. Legacy Path teaches money, estates and funerals. One overstated claim ("avoid probate", "guaranteed") creates regulatory risk for CTS, so no AI output goes out unreviewed.

## 2. Positioning

> **A plan for your family's money, from the cradle to the legacy years.**
> Take the free five-minute screener. Unlock every guide for your whole household for $20, once.

Why people buy (use these, in this order):
1. **It starts free.** The screener gives a real plan before any payment. Lead with it.
2. **$20 once, no subscription.** That's less than one hour with most professionals. Say "one time" every time.
3. **Cradle to grave in one place.** Covers a baby's first account through funeral planning.
4. **Privacy.** It never asks for an SSN, account numbers or bank logins. This matters most to the audiences below.
5. **Respect for tradition.** Funeral guidance covers 11 faith and cultural traditions.

## 3. Audiences (priority order)

| # | Audience | Hook | Best channels |
|---|---|---|---|
| 1 | **Faith communities** | "Plan a funeral your family can afford, in your tradition." | Church partners, bulletins + QR, Facebook |
| 2 | **Sandwich generation (40–60)** | "Kids *and* aging parents. Do you know who decides if Mom gets sick?" | Facebook, email, LinkedIn/HR |
| 3 | **First-generation wealth builders** | "The money talk nobody had with you." | TikTok/Reels, Instagram, YouTube |
| 4 | **New and expecting parents** | "529, custodial Roth or Trump Account: what comes first?" | Instagram, Meta ads, pediatric/daycare partners |
| 5 | **Pre-retirees and grandparents** | "Make sure the house goes where you meant it to." | Facebook, credit-union newsletters, senior centers |
| 6 | **Workforce and reentry participants** | "A plan that fits your first paycheck." | CTS cohorts (existing Morpheus participants) |

## 4. 90-day launch sequence

| Weeks | Phase | Goal | Actions |
|---|---|---|---|
| 1–2 | **Seed** | 100 free accounts | Offer it to CTS staff, trainers and cohort alumni. Post organically on CTS pages. Ask 5 early users for permission to quote real feedback. Never invent a testimonial. |
| 3–6 | **Partners** | 10 partner orgs | Use the partner outreach template (below) with churches, credit unions, funeral homes and employer HR teams. Each partner gets its own `utm_source` and a QR flyer. Offer a free 45-minute "Family Money Map" workshop. |
| 5–10 | **Paid test** | Find the CAC that works | $10–20/day on Meta and $10/day on Google Search. Three creative variants per audience. Kill anything above $15 per purchase after 50 clicks. |
| 7–12 | **Scale + content** | Compounding organic traffic | Two SEO articles a week from Autopilot. Double spend on the best audience/channel pair shown in the Funnel tab. |

**Targets for day 90:** 1,500 free accounts, a 12% free-to-paid rate, 180 purchases, blended CAC under $12, refund rate under 5%.

## 5. Seasonal calendar

Autopilot adds these hooks to drafts automatically (`SEASONAL` in `src/modules/growth/legacyPlaybook.js`):
Sep **Life Insurance Awareness Month** · Oct **Open enrollment** · Nov **Veterans Day benefits + Thanksgiving family talks** · Dec **Year-end estate review** · Jan **Money reset** · Feb **Black History Month: generational wealth** · Mar **Tax season** · Apr **Financial Literacy Month** · May **Mother's Day** · Jun **Father's Day / graduation** · Aug **Back to school: start the kids' accounts**.

---

## 6. Ready-to-use copy (compliance-reviewed starters)

Replace `{LINK}` with a tracked link from **Campaign Studio → Link builder**.

### 6.1 Facebook: faith communities
> Every family deserves a goodbye that honors their faith without leaving a bill behind.
>
> Legacy Path walks you through funeral traditions for 11 faiths and cultures, what burial plots really cost, veterans' benefits, and your rights under the FTC Funeral Rule. It also covers wills, trusts and insurance, so the whole plan is in one place.
>
> Start with the free five-minute family screener. If you want every guide, it's $20 once for your whole household.
>
> Has your family talked about this yet? 👇
> {LINK}
>
> *Education only — not investment, insurance, tax or legal advice. Talk to a licensed professional before acting.*

### 6.2 Instagram: first-generation wealth builders
> Nobody sat you down and explained credit, 401(k)s or trusts. That's not your fault.
>
> Legacy Path is the money talk your family never had, in plain language, for every age from a baby's first account to retirement. Take the free 5-minute screener and see what to focus on first.
>
> $20 once unlocks everything. No subscription. No bank logins. Ever.
>
> Link in bio.
> *Education only — not financial advice.*
> #generationalwealth #firstgenwealth #financialliteracy #moneytalk #familyfinance #legacyplanning

### 6.3 TikTok / Reels script (35 s)
```
[0–3s]  ON SCREEN: "3 money moves by age — nobody told me"
VO:     "Nobody told me there's a money to-do list for every age."
[3–12s] ON SCREEN: "Baby → first savings account"
VO:     "When my kid was born? There are accounts made for that, and they're not all the same."
[12–22s] ON SCREEN: "Your 30s → will + beneficiaries"
VO:     "In your 30s, a will and your beneficiary forms matter more than you think."
[22–30s] ON SCREEN: "60s+ → a plan your family can follow"
VO:     "Later on, it's making sure your family isn't guessing."
[30–35s] ON SCREEN: "Free 5-min screener · Legacy Path · link in bio"
VO:     "There's a free screener that shows which step is yours. Link in bio."
CAPTION: Education only — not financial advice.
```

### 6.4 Google Search ad (responsive)
Headlines (≤30): `Family Money Plan by Age` (24) · `Free 5-Minute Family Screener` (29) · `$20 Once. Lifetime Access.` (26) · `Wills, Trusts & Insurance 101` (29) · `No Subscription, No Bank Login` (30) · `Cradle-to-Grave Money Guide` (27) · `529 Plans Explained Simply` (26)
Descriptions (≤90):
- `Learn what to focus on at every age, from a baby's first account to estate planning.` (84)
- `Take the free screener, then unlock every guide for your household for $20 one time.` (84)
- `Plain-language education on trusts, insurance and funeral planning. Not advice.` (79)
Keywords: `how to start generational wealth`, `family financial plan`, `what is a living trust`, `funeral planning checklist`, `529 vs custodial roth`, `trump account for kids`.

### 6.5 Meta ad: sandwich generation
- **Primary text (≤125):** Raising kids and helping your parents? One plain-language plan for the whole family, from the first account to the will.
- **Headline (≤40):** Free family money screener
- **Description (≤30):** $20 once. No subscription.

### 6.6 Email: nurture for free accounts that haven't bought (5-part)

| Day | Subject | Core message |
|---|---|---|
| 0 | Your family plan is ready | Here's your "do first" list. Open it here. |
| 2 | The one form most families forget | Beneficiary designations can matter more than a will. The guide explains why. |
| 5 | What a trust actually is (and isn't) | 10 kinds, explained with examples. Not just for the rich. |
| 9 | A conversation worth having this Sunday | Funeral wishes by tradition, plus the FTC Funeral Rule rights every family has. |
| 14 | Everything for $20, once | Recap of what unlocks. 30-day refund. Last email in the series. |

Every email ends with:
> *Education only — not investment, insurance, tax or legal advice. Talk to a licensed professional before acting.*
> Certified Training Standards LLC · 418 Broadway Ste 8N, Albany, NY 12205 · [Unsubscribe]

> ⚠️ **Sending needs an email service.** Morpheus doesn't send marketing email yet. Before sending, connect an ESP (Resend, Postmark, Mailchimp) with a consent checkbox at signup. Supabase auth emails must not be used for marketing.

### 6.7 Partner outreach (church / credit union / HR / funeral home)
> **Subject:** A free family-money workshop for {ORG}
>
> Hi {NAME},
>
> I'm with Certified Training Standards in Albany. We built **Legacy Path**, a plain-language guide that helps families plan for money at every stage of life: a child's first savings account, wills and trusts, insurance, and funeral planning that honors each family's tradition.
>
> We'd like to offer {ORG} a free 45-minute "Family Money Map" session, in person or on Zoom. Everyone who attends gets the free family screener. Your members get a link that lets us report back how many families it helped, with no personal information shared.
>
> Legacy Path is education only. We don't sell insurance or investments, and we never ask for Social Security or bank account numbers.
>
> Could we find 15 minutes to talk this month?
>
> {SENDER} · Certified Training Standards LLC · (518) 363-1140

### 6.8 Explainer video (60 s): voiceover
> "Most families don't have a money plan. Not because they don't care, but because nobody ever showed them one. *(beat)* Legacy Path is a plan for your family's money at every age. Start with a free five-minute screener. Ranges are fine, and it never asks for bank logins. You'll see what to do first, what to work on next, and what can wait. Then, for twenty dollars, once, your whole household gets every guide: savings and credit, retirement, a home, insurance, wills and trusts, and a funeral your family can afford, in your tradition. *(beat)* Legacy Path. From the cradle to the legacy years."
> **End card:** Free screener at legacy.morpheuscr.com · *Education only — not financial, legal or tax advice.*

---

## 7. Compliance guardrails

Enforced in three places: the AI system prompt, the automatic `complianceCheck()` flags, and the database approval trigger.

- **Education, not advice.** Never "you should buy/open/invest". Never imply CTS is an adviser, broker, insurance producer, attorney or fiduciary.
- **No outcome promises.** Never "guaranteed", "avoid probate completely", "risk-free" or "get rich".
- **"Free" means only** the account, screener, Ask AI or a workshop. The guides cost $20.
- **No invented proof.** No fabricated testimonials, reviews, statistics or press mentions (FTC Endorsement Guides).
- **Email:** CAN-SPAM footer, physical address and a working unsubscribe. **SMS:** prior express written consent and "Reply STOP" (TCPA).
- **Ads:** Meta *Financial products and services* special category may apply. Don't target by age or ZIP in ways the category forbids. Google's financial-services verification may apply for some keywords.
- **Grief-sensitive tone.** Funeral content is about care and control, never fear.

## 8. Measurement

- Every link carries `utm_source / utm_medium / utm_campaign / utm_content`. The landing page (`public/legacy/attribution.js`) and the app (`captureAttribution`) keep the first campaign touch for 90 days.
- After signup, the first touch is written once to `lp_attribution`. It holds tags only, with no personal data.
- **Funnel tab** (`lp_campaign_funnel()`, super_admin only): free accounts → purchases → refunds → net revenue, per source, medium and campaign.
- Weekly review: cut the bottom third of angles by conversion and feed the top angle into next week's Autopilot "extra direction".

## 9. Go-live checklist

- [ ] Apply `sql/0014_legacy_growth_campaigns.sql` to Supabase (adds the tables, the gate, the funnel and the module)
- [ ] Deploy (Vercel) so `/legacy/attribution.js` and Campaign Studio ship
- [ ] Confirm `ANTHROPIC_API_KEY` is set in Vercel (Autopilot uses `/api/claude`)
- [ ] Run Autopilot for week 1 → review → approve
- [ ] Create CTS Facebook, Instagram, TikTok and LinkedIn pages if they don't exist, then Meta Business + Google Ads accounts
- [ ] Choose an email service provider and add a marketing-consent checkbox at signup
- [ ] Print QR flyers per partner (Link builder → a separate `utm_source` for each partner)
