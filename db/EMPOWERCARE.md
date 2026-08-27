# EmpowerCare — scoring matrix audit

Read from the live database. Answers "does the scoring matrix match the
curriculum": **the matrix is fully specified; the item bank behind it is
not built.**

## The matrix (`empowercare.assessment`, 11 rows, 10 days)

| # | key | day | Assessment | Instrument | Items | Threshold | Gate | Rule |
|---|---|---|---|---|---|---|---|---|
| 1 | `d1` | 1 | Regulator identification | written | 8 | 80% | — | 80% correct |
| 2 | `d2` | 2 | HIPAA disclosure | scenario | 12 | **100%** | soft | Zero improper disclosures |
| 3 | `d3` | 3 | Caller authentication | live | 8 | **100%** | **HARD** | 100% — blocks Week Two |
| 4 | `d4` | 4 | Scope of practice | live | 6 | 80% | soft | 80% and no clinical advice |
| 5 | `d5` | 5 | FWA & documentation | written | 6 | 80% | — | 80% correct |
| 6 | `d6` | 6 | Benefits literacy | written | 10 | 80% | — | 80% calculation accuracy |
| 7 | `d7` | 7 | Claims & EOB | written | 16 | 80% | — | 80% across 8 scenarios and 8 artifact exercises |
| 8 | `d8` | 8 | Appeals classification | scenario | 15 | 80% | soft | No missed expedited request |
| 9 | `d9` | 9 | Medicare compliance | live | 6 | 80% | soft | No marketing-rule violation |
| 10 | `dx` | 10 | Final written exam | exam | 45 | 80% | soft | 80% on a 45-item draw |
| 11 | `db` | 10 | Final live battery | live | 5 | **100%** | soft | Pass all domains |

`d3` is the only **hard** gate — failing it blocks Week Two entirely.
Every assessment allows exactly one remediation (`remediation_limit = 1`).

This is a compliance-grade design and needs no redesign. It did **not**
require the Google Drive curriculum — it was already in the database.

## Content coverage — where it does not match

| Assessment | Declared items | Artifact exercises | Artifacts | Status |
|---|---|---|---|---|
| `d7` Claims & EOB | 16 | 8 | 4 | **Consistent** — 16 = 8 scenarios + 8 exercises, exactly as its rule states; 1 exercise is `auto_fail` |
| all other 10 | 121 combined | 0 | 0 | **No content authored** |

## The structural gap

`empowercare` has **no item or question bank table**. The schema is:
amendment, artifact, artifact_exercise, assessment, attempt, attendance,
audit, credential, enrollment, exam_form, regulatory_ref, remediation,
retention_policy.

Consequences:

1. Written and scenario items (`d1`, `d2`, `d5`, `d6`, `d8`, and the
   45-item `dx` exam) have nowhere to be stored. Only `artifact_exercise`
   holds authored items, and it is scoped to artifacts.
2. `exam_form` carries a `seed` for a randomized draw, implying a pool to
   draw from. That pool does not exist as a table.
3. Live assessments (`d3`, `d4`, `d9`, `db`) are observation-scored, so
   they may legitimately need only a rubric rather than items — but
   `attempt.scores jsonb` is the only place a rubric result can land, and
   nothing defines the rubric shape.

`regulatory_ref` (9 columns: topic, source, days, last_verified,
verified_by, review_by, material_change, change_note) is a citation
currency register for compliance review, **not** an item bank.

## What this means for the build

Delivering EmpowerCare needs an item bank plus an authoring path — the
same conclusion the CAP-C capstone reached from the other direction
(`edu_checkpoint_questions` is per-module multiple choice only, with
nowhere to hold capstone artifacts or rubric scores).

Both point at one shared piece of missing infrastructure rather than two
separate ones.
