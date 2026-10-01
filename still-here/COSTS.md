# Credits, cost, and what cadence is actually possible

Measured on 2026-07-25 against the live AgentOpus account, by preparing
projects (preparing is free — it spends nothing and returns `estimated_credits`).

## The rate

**1 credit per second of finished video.** Confirmed linear:

| Target duration | Estimated credits |
|---|---|
| 30s | 30 |
| 40s | 40 |
| 60s | 60 |
| 90s | 90 |

Duration is the only cost lever. Style, voice, image model, captions, and
anchor images did not change the estimate.

## The current balance

```
plan:                          PRO
entitlement.plan:              FREE      <-- see below
daily_credits_available:       0
one_time_credits_available:    0
recurring_credits_available:   80
```

**Total spendable: 80 credits.**

### What 80 credits buys

- One 60s episode, with 20 credits left over.
- Two 40s episodes, exactly.
- **Not one 90s episode** — the natural length for the series' five-beat
  formula costs 90 and would be declined.

## What daily posting actually requires

| Episode length | Per day | Per 30 days |
|---|---|---|
| 30s | 30 | **900** |
| 40s | 40 | **1,200** |
| 60s | 60 | **1,800** |
| 90s | 90 | **2,700** |

The current balance covers **two days** of 40-second episodes, once.

## The blocker

`daily_credits_available` is **0**, and there is no recurring refill visible.
`agentopus_whoami` reports `plan: PRO` at the top level but
`entitlement: {plan: "FREE"}` underneath — the entitlement is what governs the
auto-refreshing daily pool that video generation spends from.

**Daily automated posting is not possible until that pool refills.** This is a
billing/plan question on the AgentOpus account, not something that can be fixed
in code. Everything else in this directory is built and ready to run the moment
credits exist.

## Recommendation

1. **Resolve the plan first.** Check the AgentOpus billing page for why the
   entitlement reads FREE while the plan reads PRO, and what daily credit
   allowance the paid tier grants. That number sets the real cadence ceiling.
2. **Then pick cadence to fit the allowance**, not the other way round. A
   sustainable 3×/week at 60s will build the channel better than a daily run
   that stops after two days.
3. **Spend the current 80 credits on one 60s pilot** that locks the cast's look,
   then harvest character anchor images from it (see `CHARACTER_ANCHORS.md`).
   Consistent characters compound in value across every later episode, so the
   first spend should buy reusable assets, not just one video.
