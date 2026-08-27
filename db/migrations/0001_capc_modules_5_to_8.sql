-- ============================================================================
-- 0001_capc_modules_5_to_8.sql
-- MORPHEUS.EDU / CAP-C ("Claude AI Practitioner", CTS LLC)
--
-- Authors the remaining four modules of the CAP-C course:
--   5. Verification and Quality Control at Scale
--   6. Governance, Privacy, and Responsible Use
--   7. Capstone Build
--   8. Capstone Review and CAP-C Exam
--
-- Modules 1-4 were authored during the pilot build. This migration brings
-- 5-8 to the same standard: per module, three lessons + one lab + one
-- checkpoint (180 minutes), and eight auto-graded checkpoint questions.
--
-- SCOPE / SAFETY
--   * Additive only. INSERTs into edu_lessons and edu_checkpoint_questions,
--     UPDATEs to edu_modules rows with sort_order 5-8 of course CAP-C.
--   * Nothing belonging to modules 1-4 is touched. No DELETE, no DROP, no DDL.
--   * Idempotent: every INSERT is guarded by a NOT EXISTS on
--     (module_id, sort_order), so re-running this file is a no-op.
--   * Modules are resolved by (course code, sort_order) subquery -- never by
--     hardcoded UUID.
--
-- Author: Claude Academy content build, branch claude/cx-module-build-rb0cyu
-- ============================================================================

-- Applied via the Supabase migration runner, which wraps this file in a single
-- transaction; there is deliberately no explicit BEGIN/COMMIT here.

-- ============================================================================
-- MODULE 5 — Verification and Quality Control at Scale
-- ============================================================================

insert into edu_lessons (module_id, sort_order, title, kind, duration_minutes, content_md)
select m.id, v.sort_order, v.title, v.kind, v.duration_minutes, v.content_md
from (
  select id from edu_modules
  where sort_order = 5
    and course_id = (select id from edu_courses where code = 'CAP-C')
) m
cross join (values
(1, 'From Personal Habit to Team Standard', 'lesson', 35, $c$
## Verification does not survive being personal

Modules 1 through 4 built a discipline that lives in one head: yours. You know the Verify-or-Not grid, you run the omission hunt, you put stop-points in your chains. That works exactly as long as you are the only person doing the work, and it stops working the week your program grows to four staff and a caseload.

### The three ways personal verification dies

**It dies by dilution.** You trained yourself. The new hire learned Claude by watching you on a busy Tuesday — they saw the speed and not the check. Nothing was written down, so nothing was transmitted.

**It dies by volume.** Verifying one participant progress summary is thirty seconds. Verifying sixty of them before a Friday funder deadline is thirty minutes you do not have — so the check quietly becomes a skim, and the skim becomes nothing.

**It dies by deadline.** This is the honest one. A QC step that only happens when the day is calm is not a QC step. It is a preference.

### What a standard is

A team standard replaces judgment with a written default — not because your team lacks judgment, but because judgment is the first thing deadline pressure takes. Four parts, and it fits on one page:

1. **Scope** — which tasks this covers, named specifically ("participant intake summaries", not "AI work").
2. **The check** — what a reviewer actually does, as items, not adjectives.
3. **The sample** — how much output gets checked when there is too much to check all of it.
4. **The owner** — one named person per task, accountable for the check having happened.

Notice what is not on that list: a training requirement, a values statement, a paragraph about responsible AI. Those belong in Module 6's policy. This document is operational. If a temp could not follow it on their third day, it is not finished.

> **Write this down:** Module 1 asked *should this be verified?* Module 5 asks *who verified it, against what list, and how do we know?* The second question is the one an auditor asks.
$c$),

(2, 'Checklists and Sampling', 'lesson', 40, $c$
## Checklists that actually get used

A review checklist fails for one of two reasons: it is too long, or its items are opinions. Fix both.

**Keep it to five to seven items.** A twelve-item checklist gets performed for a week and then eyeballed forever. Cut to the errors that would actually hurt — the same question Module 4 made you ask when writing a template's Check line.

**Make every item binary.** "Is the tone appropriate?" is an invitation to skip. "Does every dollar figure appear in the source notes?" has one answer, and a reviewer either did it or did not.

A real one, for weekly funder-facing program summaries:

> 1. Every number in the summary appears in this week's raw notes — yes/no.
> 2. No participant is identifiable by name, case number, or a detail unique to one person — yes/no.
> 3. No sentence commits the organization to a date, dollar amount, or outcome we have not approved — yes/no.
> 4. Bracketed gaps have been filled or removed — yes/no.
> 5. The narrative matches the numbers — if attendance fell, the text says so — yes/no.
> 6. Reviewer name and date recorded.

Six items, ninety seconds, and it catches the failures that actually cost programs money.

### Sampling: when there is too much to check

Bulk output — sixty intake summaries, two hundred extracted invoice rows — breaks 100% review. Sampling is the professional answer, and it has rules.

**Stratify by stakes, not by convenience.** Anything leaving the building, going to a funder, or affecting a participant's eligibility gets checked at 100%. There is no sample rate that makes an unchecked eligibility letter acceptable. Sample only inside the low-stakes, high-volume tier.

**Sample randomly, and before the batch ships.** Ten items pulled at random from across the batch. Checking the first ten tells you about the first ten; Claude's failure modes are not evenly distributed through a batch, and the tail is where a drifting brief shows up.

**Write the escalation rule before you need it.** This is the part teams skip:

> If any sampled item fails any checklist line, stop. Check the full batch, or regenerate it with a corrected brief and re-sample. Never ship a batch on a sample that failed.

Without that sentence, a failed sample becomes a shrug. With it, the sample has teeth — and a batch that fails twice is telling you the brief is broken, not that the reviewer is slow.
$c$),

(3, 'The Error Log and the Deadline Test', 'lesson', 35, $c$
## Log the errors or repeat them

Every caught error is free information about where your workflow leaks, and it evaporates within a day unless someone writes it down. The error log is the cheapest instrument in this course: one shared sheet, five columns, thirty seconds per entry.

> **Date | Task | What Claude got wrong | Who caught it, at which check | Fix applied**

The fourth column is the one that earns its keep. "Caught at checklist item 3" tells you the checklist works. "Caught by the program officer" tells you it does not.

### What to do with it

Read the log once a month, for fifteen minutes, hunting exactly three things:

**Repeats.** The same error three times is not a reviewer problem, it is a brief problem. Go fix the template's Check line (Module 4), not the person.

**Escapes.** Anything caught downstream of your own check — by a colleague, a funder, a participant. Every escape is a missing checklist item. Add it, and cut a stale item so the list stays six long.

**Silence.** A log with no entries for a month does not mean no errors. It means nobody is logging. Module 1's whole lesson was that wrong output looks exactly like right output; a clean log from a busy team is a finding, not a trophy.

### The deadline test

Here is the test that decides whether anything in this module survives contact with your actual job. Take the QC step you just designed and ask:

*Would this happen at 4:40pm on the Friday a funder report is due, by a tired person, with the executive director standing there asking for it?*

If the honest answer is no, the step is designed wrong. Redesign it against three constraints:

**Cheap.** Under two minutes, or it gets skipped. Six binary items, not a narrative review.

**Structural.** Built into the task, not remembered. Put the checklist at the bottom of the brief template so that running the workflow means meeting the checklist.

**Named.** "The team reviews it" means nobody reviewed it. One name per task.

And if the honest answer is that the step still will not happen under pressure — that is a finding, not a failure. The correct response is to shrink the scope of what you route through Claude, not to pretend the check exists.
$c$),

(4, 'Lab: Build Your Team QC Standard', 'lab', 50, $c$
## The standard your team would actually follow

You will leave this lab with a one-page QC standard for one real task — the task you built a template for in Module 4, unless you have a better one.

### Step 1 — Name the task and the stakes (5 min)
Write the task in its narrow form: "weekly LDSS attendance and progress summary", not "reporting". Then one sentence on what a wrong output costs and who pays it: the organization, a funder, or a participant. If a participant pays, this task is 100% review and Step 3 is short.

### Step 2 — Write the checklist (15 min)
Five to seven binary items. Draft them yourself first, then use Claude as a second pair of eyes:

> "Below is a checklist a reviewer runs on a weekly funder-facing program summary before it ships: [PASTE]. What error could pass all six items? Suggest at most two additional items, and tell me which existing item you would cut to keep the list at six."

Take the suggestion or reject it deliberately — you are the author (Module 2). Then verify the checklist the only way a checklist can be verified: run it against a real output you produced last week and see what it catches.

### Step 3 — Write the sampling plan (10 min)
Four lines: the volume, the strata, the rate, and the escalation rule. High-stakes tier at 100%. Low-stakes tier at a rate you would defend out loud to a program officer. The escalation sentence must be written down, not implied.

### Step 4 — Start the error log (10 min)
Create the five-column sheet. Seed it with at least two real errors from Modules 1 through 4 — the invented citation, the omission the hunt caught, the extraction that guessed a missing field. A log that starts empty stays empty.

### Step 5 — Run the deadline test (10 min)
Read the standard aloud and ask the 4:40pm Friday question. Then time your own checklist with a stopwatch on one real output. If it runs over two minutes, cut items until it does not, and write down what you cut and why. That cut is a decision your capstone will have to defend.

### Exit ticket
Three lines: the task, the number of checklist items and their measured runtime in seconds, and the name of the person who owns the check. If that name is yours for every task on your team, say so — that is a finding about your program, and Module 7 will want it.
$c$),

(5, 'Module 5 Checkpoint', 'checkpoint', 20, $c$
Answer the checkpoint questions below. Pass mark is **80%**. Retakes allowed — best score counts.
$c$)
) as v(sort_order, title, kind, duration_minutes, content_md)
where not exists (
  select 1 from edu_lessons el
  where el.module_id = m.id and el.sort_order = v.sort_order
);

insert into edu_checkpoint_questions (module_id, sort_order, question, options, correct_index, explanation)
select m.id, v.sort_order, v.question, v.options, v.correct_index, v.explanation
from (
  select id from edu_modules
  where sort_order = 5
    and course_id = (select id from edu_courses where code = 'CAP-C')
) m
cross join (values
(1,
 $c$Your personal verification habit is excellent. Why does it still fail once three colleagues are doing the same work?$c$,
 jsonb_build_array(
   $c$Colleagues are less careful than you are$c$,
   $c$It was never written down, so volume and deadline pressure erode it invisibly$c$,
   $c$Claude behaves differently for different accounts$c$,
   $c$Verification only works on documents you personally uploaded$c$),
 1,
 $c$Personal discipline dies three ways: dilution (nothing written down, so nothing transmitted), volume, and deadline. None of them is about your colleagues being careless.$c$),

(2,
 $c$Which is the better review-checklist item?$c$,
 jsonb_build_array(
   $c$Is the summary well written and appropriate in tone?$c$,
   $c$Does every number in the summary appear in this week's raw notes?$c$,
   $c$Did the reviewer consider whether anything is missing?$c$,
   $c$Is the output of acceptable professional quality?$c$),
 1,
 $c$Checklist items must be binary. An opinion item ("appropriate", "acceptable quality") is an invitation to skip; a reviewer either checked the numbers against the notes or did not.$c$),

(3,
 $c$You must review 200 Claude-drafted items this week. Twelve of them are participant eligibility letters. What does risk-stratified sampling say?$c$,
 jsonb_build_array(
   $c$Sample 10% across all 200 items$c$,
   $c$Check all twelve eligibility letters at 100%, and sample only within the low-stakes remainder$c$,
   $c$Sample the first twenty items, since they are representative$c$,
   $c$Skip sampling and have Claude review its own output$c$),
 1,
 $c$Stratify by stakes, not by convenience. There is no sample rate that makes an unchecked eligibility letter acceptable. Sampling applies only inside the low-stakes, high-volume tier.$c$),

(4,
 $c$One item in your ten-item random sample fails a checklist line. What does the standard require?$c$,
 jsonb_build_array(
   $c$Fix that one item and ship the batch$c$,
   $c$Stop: check the full batch, or regenerate with a corrected brief and re-sample$c$,
   $c$Note it in the log and increase the sample next time$c$,
   $c$Ship the batch with a disclaimer$c$),
 1,
 $c$The escalation rule is what gives a sample teeth: never ship a batch on a sample that failed. Fixing only the caught item assumes the other 190 are clean, which is exactly what the sample just disproved.$c$),

(5,
 $c$Which error-log column tells you the most about whether your QC design is working?$c$,
 jsonb_build_array(
   $c$The date$c$,
   $c$The task name$c$,
   $c$Who caught it, and at which check$c$,
   $c$The fix applied$c$),
 2,
 $c$"Caught at checklist item 3" means the checklist works. "Caught by the program officer" means it does not — that is an escape, and every escape is a missing checklist item.$c$),

(6,
 $c$Your team's error log has no entries for a full month. The correct reading is:$c$,
 jsonb_build_array(
   $c$The workflow is now error-free and the check can be relaxed$c$,
   $c$Nobody is logging — a clean log from a busy team is a finding, not a trophy$c$,
   $c$Claude has improved and verification is less necessary$c$,
   $c$The log should be deleted as unnecessary overhead$c$),
 1,
 $c$Module 1: wrong output looks exactly like right output. Silence in the log almost always means the logging stopped, not that the errors did.$c$),

(7,
 $c$The same extraction error shows up in the log three times in one month. What do you fix?$c$,
 jsonb_build_array(
   $c$The reviewer, with retraining on the checklist$c$,
   $c$The brief template's Check line, because a repeat is a brief problem$c$,
   $c$Nothing — three in a month is within tolerance$c$,
   $c$The sampling rate, by doubling it$c$),
 1,
 $c$Repeats are design failures, not attention failures. The check caught it three times, which means the check works; the brief is what keeps producing it.$c$),

(8,
 $c$What is the deadline test?$c$,
 jsonb_build_array(
   $c$Whether the workflow finishes before the report is due$c$,
   $c$Whether the QC step would still happen at 4:40pm Friday, by a tired person, under pressure$c$,
   $c$Whether Claude responds quickly enough under load$c$,
   $c$Whether the sample can be drawn before the batch ships$c$),
 1,
 $c$A check that only happens on calm days is a preference, not a standard. If it fails the test, redesign it to be cheap, structural, and named — or shrink what you route through Claude.$c$)
) as v(sort_order, question, options, correct_index, explanation)
where not exists (
  select 1 from edu_checkpoint_questions q
  where q.module_id = m.id and q.sort_order = v.sort_order
);

-- ============================================================================
-- MODULE 6 — Governance, Privacy, and Responsible Use
-- ============================================================================

insert into edu_lessons (module_id, sort_order, title, kind, duration_minutes, content_md)
select m.id, v.sort_order, v.title, v.kind, v.duration_minutes, v.content_md
from (
  select id from edu_modules
  where sort_order = 6
    and course_id = (select id from edu_courses where code = 'CAP-C')
) m
cross join (values
(1, 'What an AI Usage Standard Contains', 'lesson', 35, $c$
## The document your organization does not have yet

Module 2 gave you a personal rule: sanitize before you paste. Module 5 gave your team an operational one: check before it ships. Module 6 is where those become an organizational standard someone outside your team can read — a funder, an auditor, a board member, a participant who asks.

Most workforce organizations are running Claude right now with no written standard at all. That is rarely recklessness; it is that nobody could face writing twelve pages of policy. You are not going to. A usable AI usage standard is one page with four sections.

### 1. Permitted and prohibited uses
Named tasks, not categories. "Drafting funder narratives from staff notes: permitted." "Summarizing intake notes into case-file format: permitted, sanitized." "Writing determinations of program eligibility: prohibited." The prohibited list is the section people actually read, so make it specific enough to obey and short enough to remember.

### 2. Data rules
What may go into a prompt and what may not. This is the Module 2 rule in writing: no names, no case numbers, no dates of birth, no addresses, no small-population details that re-identify someone. Add the tool boundary: which Claude account or plan is approved, and that pasting program data into a personal consumer account is not.

### 3. Human accountability
One sentence, and it is the sentence the whole document exists for: **a person signs every output, and that person is responsible for its accuracy.** There is no "the AI made an error" defense in your standard, because there is none in your funder's.

### 4. Review and disclosure
Which outputs get the Module 5 check, who owns it, and when AI assistance gets disclosed (next lesson but one). Plus a review date — a standard written this year and never reopened is a liability, not a protection.

> **The test of a good standard:** hand it to a new hire on day one and to a program officer on audit day. If it is too vague for the first or too embarrassing for the second, rewrite it.
$c$),

(2, 'Obligations You Did Not Write', 'lesson', 35, $c$
## Somebody else's rules already apply to you

Your organization's standard is the layer you control. Underneath it sit obligations you did not write and cannot waive. Practitioners get into trouble by assuming the vendor's terms are the only rules in the room; they are the floor, not the ceiling.

### Four layers, strictest wins

**Law.** Depending on your program, some combination of HIPAA (health information), FERPA (education records), state privacy statutes, and the confidentiality rules attached to benefits and criminal-record data. Reentry and LDSS-referred work sits squarely in this territory.

**Funder and contract terms.** The layer that surprises people. Grant agreements and government contracts routinely carry confidentiality, data-handling, subcontractor, and increasingly explicit AI clauses. A clause saying participant data may not be disclosed to third parties without written consent does not carve out an exception because the third party is a chat window.

**Vendor terms.** Consumer and enterprise plans handle data differently. Which plan your organization actually pays for is a five-minute question with a large consequence.

**Your own standard.** The page you wrote in the last lesson.

**When they conflict, the strictest governs** — not the most convenient, and not the most recent.

### Reading your own agreements

You do not need a lawyer for the first pass. You need Module 3:

> "I have attached our funder agreement. Enumerate every clause that touches data handling, confidentiality, disclosure to third parties, subcontracting, or technology use. For each: quote the clause, cite the section, and state in one sentence what it would require of us if we used an AI assistant to draft documents containing program data. Do not summarize — enumerate. If the agreement is silent on something, say it is silent rather than inferring."

Enumeration, quoted evidence, explicit uncertainty: the Module 3 architecture pointed at your own obligations. Then verify the quotes against the agreement by eye, because a misread clause here is precisely the failure Module 3 called confident misreading, and this is high stakes by definition. The output is a first pass for a human decision. It is never the decision.
$c$),

(3, 'Disclosure, Bias, and Decisions About People', 'lesson', 40, $c$
## Two obligations people get wrong in opposite directions

### Disclosure

Practitioners split into two camps and both are wrong. One discloses nothing, on the theory that tools are tools and nobody announces spellcheck. The other discloses everything, stamping "AI-assisted" on internal emails until the label means nothing.

The workable norm turns on two questions.

**Does the reader's decision depend on who authored it?** A funder narrative, a recommendation letter, a condolence note, an assessment of a participant — here authorship is part of what is being read. Disclose, or do not use Claude.

**Was there a request or a rule?** Some funders, universities, and clients now ask directly or have a clause. Answer honestly. Being caught in a false negative on that question costs far more than the efficiency it bought.

Everything else — reformatting your own notes, drafting an internal agenda, shortening your own paragraph — needs no announcement. And note what disclosure is *not*: a transfer of responsibility. "Drafted with AI assistance" does not make an unverified number anyone's fault but yours.

A line that works: *"Prepared with AI assistance; all content reviewed and verified by [name], [title]."* It names the tool and, more importantly, the human.

### Bias

Claude learned from human text, and human text carries the assumptions of the people who wrote it. In workforce development that lands in specific, checkable places: job postings that drift toward "culture fit" or degree requirements the role does not need; participant narratives written in deficit terms ("despite his record", "struggles with") rather than the person-first language your funder likely requires; and the hard one — screening or ranking actual people.

**Do not use Claude to rank, score, or screen human beings** — applicants, participants, tenants, candidates for a slot. Not because the output would be worthless, but because you cannot verify a ranking the way you verify a date. There is no source document to check it against, the reasoning is not auditable, and the person harmed has no way to contest it. That is soft ground with a human being standing on it.

Claude is genuinely useful on the other side of the same problem:

> "Review this job posting for language that could discourage qualified applicants: degree or experience requirements that may not be essential to the duties listed, age-coded phrasing, and anything that is not person-first. Quote each phrase, say why it may screen someone out, and suggest a replacement. Do not rewrite the posting."

That is a bias audit you can check phrase by phrase, and the judgment stays yours.
$c$),

(4, 'Lab: Draft Your Team''s Usage Standard', 'lab', 50, $c$
## Draft it, then test it against reality

You will leave with a one-page AI usage standard for your team and — more usefully — a written list of the questions you cannot answer yet.

### Step 1 — Inventory what is already happening (10 min)
List every way Claude is currently used in your program, including the uses nobody approved: someone's personal account, a volunteer, a chat on a phone at lunch. Be honest; the standard has to govern the real state, not the tidy one. Mark each use permitted, prohibited, or **unknown**. The unknown pile is the real output of this step.

### Step 2 — Draft the four sections (15 min)
One page: permitted and prohibited uses (named tasks), data rules, human accountability, review and disclosure. Draft it with Claude if you like — this is exactly what it is good at — but the brief must carry your Step 1 inventory or you will get a generic policy that governs nobody:

> "Draft a one-page AI usage standard for a workforce-development nonprofit in Albany, NY serving LDSS-referred and reentry participants. Sections: permitted and prohibited uses, data rules, human accountability, review and disclosure. Use only the tasks and constraints listed below — do not invent uses we do not have, and do not add tools or obligations I have not given you. Mark with [BRACKETS] anything you need that I have not supplied. Plain language, readable by a new hire on day one. Our current uses: [PASTE STEP 1 LIST]."

### Step 3 — Run the obligations pass (10 min)
Take one real funder agreement or contract you are subject to. Run the enumeration prompt from this module's second lesson. Verify two quotes against the source by eye. Add whatever it surfaces to your data rules — and record any clause you are genuinely unsure about rather than resolving it yourself. "Escalate to the executive director" is a legitimate entry and a better one than a guess.

### Step 4 — Disclosure line and bias check (10 min)
Write one disclosure sentence naming the tool and the responsible human, plus the list of outputs that carry it. Then name the one place in your program where Claude output touches a decision about a person, and write the sentence that keeps it on the right side of the screening line. If no such use exists, write that — it is also an answer.

### Step 5 — The two-reader test (5 min)
Read the page as a new hire on day one: is any sentence too vague to follow? Then read it as a program officer on audit day: is any sentence one you would not want quoted back to you? Fix both kinds.

### Exit ticket
Two things: the one-page standard, and the list of items you marked unknown or escalated. The second list matters more. A standard with three honest open questions beats a confident page that quietly authorizes something your funder forbids.
$c$),

(5, 'Module 6 Checkpoint', 'checkpoint', 20, $c$
Answer the checkpoint questions below. Pass mark is **80%**. Retakes allowed — best score counts.
$c$)
) as v(sort_order, title, kind, duration_minutes, content_md)
where not exists (
  select 1 from edu_lessons el
  where el.module_id = m.id and el.sort_order = v.sort_order
);

insert into edu_checkpoint_questions (module_id, sort_order, question, options, correct_index, explanation)
select m.id, v.sort_order, v.question, v.options, v.correct_index, v.explanation
from (
  select id from edu_modules
  where sort_order = 6
    and course_id = (select id from edu_courses where code = 'CAP-C')
) m
cross join (values
(1,
 $c$Which prohibited-use entry is written the way a usage standard should write it?$c$,
 jsonb_build_array(
   $c$Do not use AI irresponsibly$c$,
   $c$Writing determinations of program eligibility: prohibited$c$,
   $c$Avoid sensitive applications of artificial intelligence$c$,
   $c$Use good judgment when handling participant information$c$),
 1,
 $c$Named tasks, not categories. The prohibited list is the section staff actually read, so it has to be specific enough to obey and short enough to remember.$c$),

(2,
 $c$Your vendor terms permit something your funder's grant agreement forbids. Which governs?$c$,
 jsonb_build_array(
   $c$The vendor terms, because they are the contract with the tool$c$,
   $c$The strictest applicable layer — here, the funder agreement$c$,
   $c$Whichever was signed most recently$c$,
   $c$Your organization's own standard, since you wrote it$c$),
 1,
 $c$Law, funder and contract terms, vendor terms, and your own standard all apply at once. When they conflict the strictest governs — not the most convenient and not the most recent.$c$),

(3,
 $c$A grant agreement says participant data may not be disclosed to third parties without written consent. You want to paste intake notes into Claude. What is the analysis?$c$,
 jsonb_build_array(
   $c$The clause does not apply — a chat window is a tool, not a third party$c$,
   $c$The clause plausibly applies; sanitize the notes and escalate the question rather than deciding it yourself$c$,
   $c$The clause applies only to printed documents$c$,
   $c$Vendor terms override the clause$c$),
 1,
 $c$The clause does not carve out an exception because the third party is a chat window. Sanitize by default, and record the unresolved question for escalation instead of resolving it in your own favor.$c$),

(4,
 $c$Which output most clearly requires disclosure of AI assistance?$c$,
 jsonb_build_array(
   $c$An internal meeting agenda you reformatted$c$,
   $c$A letter of recommendation for a program graduate$c$,
   $c$A paragraph of your own writing that you shortened$c$,
   $c$A draft outline you will rewrite entirely before anyone sees it$c$),
 1,
 $c$The test is whether the reader's decision depends on who authored it. For a recommendation letter, authorship is part of what is being read. Disclose — or do not use Claude for it.$c$),

(5,
 $c$What does a disclosure line NOT do?$c$,
 jsonb_build_array(
   $c$Tell the reader a tool was involved$c$,
   $c$Name the human who reviewed and verified the content$c$,
   $c$Transfer responsibility for an unverified number away from you$c$,
   $c$Satisfy a funder clause that requires disclosure$c$),
 2,
 $c$Disclosure is information, not indemnity. "Drafted with AI assistance" does not make an unverified figure anyone's fault but the person who signed it.$c$),

(6,
 $c$Why is ranking real applicants with Claude the hard line rather than just a risky use?$c$,
 jsonb_build_array(
   $c$Rankings are always less accurate than human ones$c$,
   $c$There is no source document to verify a ranking against, the reasoning is not auditable, and the person harmed cannot contest it$c$,
   $c$Claude refuses all ranking requests$c$,
   $c$Ranking requires more context than the context window allows$c$),
 1,
 $c$It is soft ground with a human being standing on it. Verification is what makes output safe to sign, and a ranking of people offers nothing to verify it against.$c$),

(7,
 $c$Which is a legitimate bias-related use of Claude in hiring work?$c$,
 jsonb_build_array(
   $c$Scoring applicants against each other for interview shortlisting$c$,
   $c$Auditing a job posting for phrasing that may screen out qualified applicants, quoted phrase by phrase$c$,
   $c$Estimating which applicants are likely to complete the program$c$,
   $c$Flagging résumés with employment gaps for extra scrutiny$c$),
 1,
 $c$Auditing your own text is strong ground and fully checkable — you can verify every quoted phrase. The other three apply Claude to judgments about people, which is the screening line.$c$),

(8,
 $c$What is the two-reader test for a finished usage standard?$c$,
 jsonb_build_array(
   $c$Two staff members proofread it for typos$c$,
   $c$Read it as a new hire on day one and as a program officer on audit day$c$,
   $c$Two managers sign it before it takes effect$c$,
   $c$Claude reviews it, then a human reviews it$c$),
 1,
 $c$Too vague for the new hire means it will not be followed. Embarrassing to the program officer means it will not survive an audit. A standard has to pass both readings.$c$)
) as v(sort_order, question, options, correct_index, explanation)
where not exists (
  select 1 from edu_checkpoint_questions q
  where q.module_id = m.id and q.sort_order = v.sort_order
);

-- ============================================================================
-- MODULE 7 — Capstone Build
-- ============================================================================

insert into edu_lessons (module_id, sort_order, title, kind, duration_minutes, content_md)
select m.id, v.sort_order, v.title, v.kind, v.duration_minutes, v.content_md
from (
  select id from edu_modules
  where sort_order = 7
    and course_id = (select id from edu_courses where code = 'CAP-C')
) m
cross join (values
(1, 'What the Capstone Is — and What It Is Not', 'lesson', 35, $c$
## A workflow you can defend, not a demo you can perform

The capstone is not a presentation about AI. It is one real, running, documented workflow from your actual job, with evidence that it works and honest accounting of what it costs. Two candidates can build the same workflow and receive different results entirely on the strength of the verification and governance around it. That is deliberate, because that is what the credential says about you.

### What it must be

**Real.** From your job or your job search, with real inputs. A hypothetical workflow for a hypothetical employer cannot be defended, because the defense turns on details only a practitioner knows: what the funder actually asks for, where the notes actually come from, what actually goes wrong.

**Recurring.** Module 4's condition holds — weekly or monthly. A once-a-year task cannot be run twice, and you will run this twice.

**Verifiable, and verified.** You must be able to check the output faster than you could have produced it, and you must show the check happening rather than describing it in the abstract.

**Sanitizable.** If the task cannot be done without identifiable participant data in the prompt, it cannot be your capstone. Module 2's floor is still a floor here.

### What it is not

Not a tool review. Not a deck about the potential of AI. Not a workflow you designed today and never ran. And not, under any circumstances, a workflow whose time saving comes from removing the verification step.

### The two floors, restated

Two things fail the capstone outright regardless of everything else: **identifiable client PII in a prompt with no sanitization step**, and **unverified soft-ground output at high stakes**. Module 2 said the first and Module 1 said the second. The exam will not remind you, and neither will your reviewer — they will simply mark it.

> **Write this down:** the capstone answers four questions. What did you hand to Claude? What did you keep? How do you know the output is right? And what did it actually cost you in minutes, verification included?
$c$),

(2, 'Scoping: The Workflow You Can Defend', 'lesson', 35, $c$
## Most capstone trouble is scoping trouble

It shows up in two directions.

**Too big.** "Automate our intake process." Six steps, three systems, two staff, and a demonstration that cannot finish in twelve minutes. Large scopes hide their verification story, which is exactly the part being graded.

**Too small.** "I ask Claude to shorten my emails." True, useful, and it has no verification design, no governance surface, and nothing to defend.

The right size is one recurring deliverable with one owner, two to four steps, that you can run start to finish in front of a reviewer.

### Shapes that have worked

- The weekly attendance-and-progress summary for an LDSS-referred cohort, drafted from sanitized staff notes and checked against the raw attendance figures.
- Intake notes reformatted into the standard case-file structure, with a six-item review checklist and a named reviewer.
- Grant-agreement deadline extraction into a compliance calendar, enumerated with section citations and reconciled against the agreement.
- Employer outreach letters drafted from a template, forked per industry, with a commitment-flagging Check line.
- The one that scored highest last cohort: a workflow the candidate **abandoned**, documented with honest time accounting showing that verification ate the entire saving. It passed because the finding was real, the measurement was sound, and the candidate could name exactly which condition the task failed.

### The scoping questions, in order

1. Do I run this at least monthly, with inputs I can produce today?
2. Can I state in one sentence what a wrong output costs and who pays?
3. Can I check the output in a few minutes, against something real?
4. Can the inputs be sanitized without gutting the task?
5. Can I show it end to end in twelve minutes?

A "no" at question 3 or 4 is disqualifying — pick another task. A "no" at question 5 usually means narrow the deliverable, not abandon the task.

### Write the scope statement now

One paragraph, before you build anything: the task, the frequency, the inputs, the deliverable, the owner, and the one error that would actually hurt. Show it to your instructor this week. Most failed capstones were visibly failing at the scope statement, and nobody read it in time.
$c$),

(3, 'The Capstone Packet: Six Artifacts', 'lesson', 40, $c$
## What you actually hand in

Six artifacts. Every one of them is something you have already built once in this course; the capstone is where they become one coherent thing about one task.

**1. The scope statement.** The paragraph from the last lesson: task, frequency, inputs, deliverable, owner, and the one error that would hurt.

**2. The brief template (Module 4).** Full TCFC with explicit SLOTS for what changes each run, a model example if you have one, and a final Check line tuned to that one error. Submit the template, not a transcript — a reviewer needs to see the reusable thing.

**3. The verification plan (Modules 1, 3, 5).** Which cell of the Verify-or-Not grid this task sits in and why; the review checklist, five to seven binary items; the sampling plan and escalation rule if the output is bulk; and the named owner of the check. If your plan is "I read it", write it as six items — "I read it" is not a plan.

**4. The governance pass (Modules 2, 6).** What gets sanitized, how, and by whom, with a before/after example built from invented-but-realistic data. Which obligation layers apply. Whether the output carries a disclosure line. This artifact is short and it is not optional.

**5. Run evidence.** Two complete runs with real inputs, a few days apart, including the raw output *before* your edits. Reviewers ask for the pre-edit output specifically, because the gap between what Claude produced and what you shipped is the clearest picture of your judgment in the whole packet. Include at least one run where something went wrong.

**6. Honest time accounting.** Minutes before, minutes after with verification time counted in the "after" column, and the method you used to measure — timed, estimated, or reconstructed. Say which. A reconstructed estimate labeled as one is credible; an unlabeled precise-looking number is not.

> **On the honest number:** if the accounting shows no saving, submit it with the finding stated plainly. Module 4 said it and it is still true — that is a finding, not a failure, and it defends well. What does not defend well is a suspiciously clean saving with no verification time in it.
$c$),

(4, 'Lab: Build, Run, and Instrument Your Workflow', 'lab', 50, $c$
## From scope statement to real evidence

Fifty minutes to get from a scope statement to a workflow with evidence attached. Bring this week's actual inputs — notes, an agreement, a batch of forms. If you brought nothing real you will build something unusable; borrow a sanitized document from your instructor and flag the substitution in your packet.

### Step 1 — Lock the scope (5 min)
Read your scope statement aloud. Then answer the five scoping questions out loud, in order. Any "no" at question 3 or 4 means you change tasks now, in this room, with help — not the night before review.

### Step 2 — Finish the template (10 min)
Take your Module 4 template and do three things: mark every SLOT in caps, paste a model example of good output if one exists, and rewrite the final Check line so it names the one error from your scope statement. A generic Check line ("flag anything uncertain") reads as unfinished work.

### Step 3 — Run it cold and keep the evidence (15 min)
Run the workflow with this week's real inputs. Before you edit anything, copy the raw output somewhere untouched — that is artifact 5 and you cannot reconstruct it later. Start a timer when you begin the brief and stop it when the deliverable is ready to ship, verification included.

### Step 4 — Verify against your own checklist (10 min)
Run the checklist item by item on the raw output and record what it caught. If it caught nothing, that is either a good run or a weak checklist; decide which by re-reading the output specifically for the one error your scope statement names. Log everything in the Module 5 error log — two honest entries beat a clean sheet you cannot explain.

### Step 5 — Time and sanitization pass (10 min)
Write the honest before/after minutes with the measurement method labeled. Then build the before/after sanitization example for artifact 4, using invented-but-realistic data. Never a real participant's details, even inside a training artifact.

### Exit ticket
Four numbers and one sentence: minutes before, minutes after, checklist items, errors caught this run — plus the one thing you already know a reviewer will push on. Bring that sentence to Module 8. Candidates who can name their own weak point before the defense almost always survive it; candidates who cannot, usually do not.
$c$),

(5, 'Module 7 Checkpoint', 'checkpoint', 20, $c$
Answer the checkpoint questions below. Pass mark is **80%**. Retakes allowed — best score counts.
$c$)
) as v(sort_order, title, kind, duration_minutes, content_md)
where not exists (
  select 1 from edu_lessons el
  where el.module_id = m.id and el.sort_order = v.sort_order
);

insert into edu_checkpoint_questions (module_id, sort_order, question, options, correct_index, explanation)
select m.id, v.sort_order, v.question, v.options, v.correct_index, v.explanation
from (
  select id from edu_modules
  where sort_order = 7
    and course_id = (select id from edu_courses where code = 'CAP-C')
) m
cross join (values
(1,
 $c$A candidate proposes a capstone that genuinely requires participant names and case numbers in the prompt to work at all. What is the correct response?$c$,
 jsonb_build_array(
   $c$Proceed, and note the limitation in the governance artifact$c$,
   $c$Pick a different task — an unsanitizable task cannot be the capstone$c$,
   $c$Use initials instead of full names$c$,
   $c$Proceed if the reviewer approves it in advance$c$),
 1,
 $c$Sanitizable is a gate, not a scoring category. Module 2's floor still applies at capstone, and initials in a small program still re-identify people.$c$),

(2,
 $c$"Automate our intake process" is a bad capstone scope mainly because:$c$,
 jsonb_build_array(
   $c$Intake is too sensitive for any AI involvement$c$,
   $c$It is too large to demonstrate end to end, so the verification story disappears$c$,
   $c$Automation is outside the scope of the certification$c$,
   $c$It would take more than one Claude conversation$c$),
 1,
 $c$Large scopes hide the part being graded. The right size is one recurring deliverable, one owner, two to four steps, runnable start to finish in twelve minutes.$c$),

(3,
 $c$Why does the packet require the raw output from before your edits?$c$,
 jsonb_build_array(
   $c$To prove Claude was actually used$c$,
   $c$Because the gap between what Claude produced and what you shipped is the clearest evidence of your judgment$c$,
   $c$To check the word count$c$,
   $c$Because reviewers cannot read edited documents$c$),
 1,
 $c$Reviewers ask for the pre-edit output specifically. It is the one artifact that shows what you caught, what you rewrote, and what you chose to keep.$c$),

(4,
 $c$Your time accounting shows 40 minutes before and 12 minutes after. What must the "after" figure include?$c$,
 jsonb_build_array(
   $c$Only the time spent writing the brief$c$,
   $c$Brief, run, and verification time, with the measurement method labeled$c$,
   $c$Claude's response time$c$,
   $c$An average across the whole cohort$c$),
 1,
 $c$Verification never leaves the workflow, so it never leaves the accounting. Label the method too — a reconstructed estimate said to be one is credible; an unlabeled precise number is not.$c$),

(5,
 $c$A candidate's honest accounting shows verification consumed the entire saving, and they abandoned the workflow. Can this pass?$c$,
 jsonb_build_array(
   $c$No — a capstone must demonstrate a working time saving$c$,
   $c$Yes, if the measurement is sound and they can name which condition the task failed$c$,
   $c$Only with instructor permission obtained in advance$c$,
   $c$Only if they also submit a second, successful workflow$c$),
 1,
 $c$Honest accounting is the point. A documented abandonment with a real finding scored highest in a previous cohort; a suspiciously clean saving with no verification time in it does not.$c$),

(6,
 $c$Which pair of failures ends a capstone regardless of its total score?$c$,
 jsonb_build_array(
   $c$A weak scope statement and a missing model example$c$,
   $c$Identifiable client PII in a prompt with no sanitization step, and unverified soft-ground output at high stakes$c$,
   $c$Running the workflow only once and using bullet points$c$,
   $c$Exceeding twelve minutes and omitting the disclosure line$c$),
 1,
 $c$The two floors, unchanged since Modules 1 and 2. Reviewers do not weigh them against the rest of the packet, because your funder will not either.$c$),

(7,
 $c$Your verification plan currently reads "I read the output carefully before sending." What does the packet require instead?$c$,
 jsonb_build_array(
   $c$A statement that Claude was asked to check its own work$c$,
   $c$Grid placement with a reason, five to seven binary checklist items, sampling and escalation if bulk, and a named owner$c$,
   $c$A promise to verify every claim against a primary source$c$,
   $c$A screenshot of the final output$c$),
 1,
 $c$"I read it" is a habit, not a plan. Written as binary items with an owner, it becomes something a colleague could perform and a reviewer could audit.$c$),

(8,
 $c$You answer "no" only to scoping question 5 — you cannot show it end to end in twelve minutes. What should you do?$c$,
 jsonb_build_array(
   $c$Abandon the task and choose a different one$c$,
   $c$Narrow the deliverable so one complete pass fits the window$c$,
   $c$Present only the parts that fit and describe the rest$c$,
   $c$Ask for extra presentation time$c$),
 1,
 $c$A "no" at 3 or 4 is disqualifying. A "no" at 5 is a scoping fix: keep the task, shrink the deliverable until one full run fits.$c$)
) as v(sort_order, question, options, correct_index, explanation)
where not exists (
  select 1 from edu_checkpoint_questions q
  where q.module_id = m.id and q.sort_order = v.sort_order
);

-- ============================================================================
-- MODULE 8 — Capstone Review and CAP-C Exam
-- ============================================================================

insert into edu_lessons (module_id, sort_order, title, kind, duration_minutes, content_md)
select m.id, v.sort_order, v.title, v.kind, v.duration_minutes, v.content_md
from (
  select id from edu_modules
  where sort_order = 8
    and course_id = (select id from edu_courses where code = 'CAP-C')
) m
cross join (values
(1, 'The CAP-C Rubric', 'lesson', 35, $c$
## How the capstone is actually scored

Six categories, one hundred points, and two floors that sit outside the arithmetic. You have seen every category before; the weights tell you where this course thinks the difficulty is.

| Category | Points | What the reviewer looks for |
|---|---|---|
| Scope and design | 15 | A real, recurring, right-sized task; one deliverable, one owner, a stated cost of being wrong |
| Briefing craft | 20 | A reusable TCFC template with marked slots and a Check line tuned to the actual risk |
| Verification | 25 | Grid placement justified, a binary checklist, sampling and escalation where volume demands it, evidence of the check happening |
| Governance | 20 | Sanitization shown, obligation layers identified, disclosure decided, screening line respected |
| Measurement and judgment | 10 | Honest minutes with verification counted, method labeled, a defensible account of what stayed human |
| Presentation and defense | 10 | Twelve clear minutes, and answers that hold up under eight minutes of questions |

**Verification is the heaviest category, at a quarter of the total.** That is not an accident of arithmetic. Everything else in this course is craft that makes you faster; verification is what makes your output safe to sign, and it is what an employer is buying when they see this credential.

### The two floors

Outside the points, unchanged since Modules 1 and 2:

- **Identifiable client PII in a prompt with no sanitization step.** Automatic fail.
- **Unverified soft-ground output at high stakes.** Automatic fail.

A packet can score 94 and fail on either one. Reviewers do not weigh these against the rest, because your funder will not either.

### What a pass requires overall

All eight module checkpoints at 80% or better; the written exam at 80% or better; the capstone at 80 of 100 with no floor violation. Checkpoints and the exam allow retakes; the capstone allows one revision, resubmitted inside the cohort window. Mastery is the goal — the retake policy exists because this credential is a claim about your habits, not about your best single afternoon.
$c$),

(2, 'Presentation and Defense', 'lesson', 35, $c$
## Twelve minutes, then eight

The review is twenty minutes: a twelve-minute presentation, then eight minutes of questions from your instructor and two peers. Peers ask first. That is deliberate — the questions a colleague asks are the questions your workplace will ask.

### The twelve minutes

The structure that works, with the timing candidates consistently get wrong:

1. **The task, and what it costs to get wrong** — 1 minute. Not your org chart. The task.
2. **The brief template, on screen** — 2 minutes. Point at the slots and the Check line, and say which error that line is hunting.
3. **A live or recorded run** — 3 minutes. Real inputs, raw output showing.
4. **The verification, performed** — 3 minutes. Do not describe the checklist. Run it on the output in front of the room and say what it catches.
5. **The governance pass** — 2 minutes. Before/after sanitization, obligations, disclosure.
6. **The honest numbers** — 1 minute. Before, after, method.

The most common failure is spending seven minutes on the impressive part — the output — and ninety seconds on verification and governance, which are 45 of the 100 points between them. Time yourself in advance. Out loud. Twice.

### The eight minutes

Expect these, in some form, every cohort:

> *"Show me a run where it went wrong."* Have one ready. A candidate with no failed run either has not run it twice or is not telling us about the second one.
>
> *"What is in this prompt that you would not want on a screen in a funder meeting?"* The sanitization question, asked sideways.
>
> *"Who checks this when you are on vacation?"* Module 5's named-owner problem. "Nobody" is an honest answer that costs a point; an invented name costs more.
>
> *"Your time saving does not include verification — redo it."* If it does include it, say so immediately and show where.
>
> *"What would make you stop using this workflow?"* The best answer names a threshold, not a feeling: two escaped errors in a month, a funder clause change, a task that stopped being verifiable.

### How to defend

Answer the question asked, in one or two sentences, then stop. Say "I don't know" when you don't, and say what you would do to find out. A defended weakness scores better than a smooth evasion every time — reviewers are grading judgment, and judgment includes knowing where your own workflow is thin.
$c$),

(3, 'The Written Exam, Credentialing, and the Registry', 'lesson', 40, $c$
## The exam, and what happens to your name afterward

### The written exam

Closed-book and scenario-based: short situations from workforce practice, each asking what you would do and why. It covers all eight modules, weighted the way the rubric is — verification and governance carry the most items.

It does not test recall of the letters T, C, F and C. It gives you a situation and asks for a decision:

> *A colleague drafted a participant's employment-verification letter with Claude, using the participant's name and case number so the details would be accurate, and verified every fact against the case file before sending. Which floor did this cross, and what should have happened instead?*

Both floors exist in that scenario and only one of them is crossed. That is the shape of the exam. The module checkpoints you have already passed are the best available practice; retakes are allowed and the best score counts, as everywhere else in this course.

### Credential issuance

On a pass — checkpoints, exam, and capstone at 80 with no floor violation — your instructor issues the credential from the Academy admin console. Three things happen at once:

1. A record is written to **`edu_credentials`**, the MORPHEUS.EDU registry: your name as it will appear publicly, the credential name (**CTS Certified Claude Practitioner**), the issuer (**CTS LLC**), the issue date, and the status.
2. The registry generates your permanent **credential code**, in the form `CTS-CAPC-YYYY-NNNNNN`.
3. Your certificate PDF is generated, carrying that code and the public verification URL.

### The registry is the credential

The paper is a receipt. The record is the credential. Anyone — an employer, a funder, a recruiter — can go to `/verify/<your code>` on the Morpheus site, with no login and no account, and see the live status: **active**, **expired**, or **revoked**, alongside the holder name, credential name, issuer, and issue date.

Two consequences worth understanding before this goes on a résumé. First, put the **code** there, not just the credential name — a verifiable claim is worth more than an unverifiable one and costs six extra characters. Second, the registry is live, which means a credential can be revoked, and CTS will revoke one for falsified capstone evidence. A credential that cannot be revoked is not a credential; it is a graphic.

> **The whole point in one line:** this certification says a specific person verified specific work in a specific way — and anyone can check that the claim is real.
$c$),

(4, 'Lab: The Mock Defense', 'lab', 50, $c$
## The rehearsal that decides the grade

You will present to two peers and be questioned by them, then swap. Nobody is being graded today, which is exactly why today is where the grade gets made.

### Step 1 — Set up (5 min)
Groups of three: presenter, timer, lead questioner. Rotate twice so everyone does all three jobs. The timer holds a hard stop — that is not a courtesy, it is the format. Presenters who have never been cut off at twelve minutes get cut off in the real review.

### Step 2 — Present (12 min each)
Run the six-part structure. Actually perform the verification on screen instead of describing it. If you run out of time before the governance pass and the numbers, stop where you are and note it — that is your finding for Step 4.

### Step 3 — Defend (8 min each)
Questioners: use the five standard questions from this module's second lesson, then one of your own drawn from what you actually saw. Push once on the weakest artifact. Do not be gentle — a peer who lets a thin verification plan pass today has cost their colleague twenty points on review day.

Presenters: answer in one or two sentences, then stop. Count how many times you say "I don't know". The target is not zero. It is honest.

### Step 4 — Score each other on the rubric (10 min)
Each peer scores the presenter on all six categories, independently, without discussion. Then compare. The disagreements are the useful part: a category where two peers scored you 8 and 15 is a category you explained unclearly, which on review day is indistinguishable from a category you did badly.

Check both floors explicitly. If someone's packet crosses one, say so plainly today. It is the most valuable sentence anyone will say to them this week.

### Step 5 — Fix list (5 min)
Write the three changes you will make before the real review, in priority order, with the rubric category each one lifts. Three, not ten — you have one week and a job.

### Exit ticket
Your peers' two scores, your own self-score, and the widest gap between them. Bring that gap to your instructor. The category you rate yourself highest on and your peers rate lowest is, in almost every cohort, the category that decides your result.
$c$),

(5, 'Module 8 Checkpoint', 'checkpoint', 20, $c$
Answer the checkpoint questions below. Pass mark is **80%**. Retakes allowed — best score counts.
$c$)
) as v(sort_order, title, kind, duration_minutes, content_md)
where not exists (
  select 1 from edu_lessons el
  where el.module_id = m.id and el.sort_order = v.sort_order
);

insert into edu_checkpoint_questions (module_id, sort_order, question, options, correct_index, explanation)
select m.id, v.sort_order, v.question, v.options, v.correct_index, v.explanation
from (
  select id from edu_modules
  where sort_order = 8
    and course_id = (select id from edu_courses where code = 'CAP-C')
) m
cross join (values
(1,
 $c$Which CAP-C rubric category carries the most points?$c$,
 jsonb_build_array(
   $c$Briefing craft, at 20$c$,
   $c$Verification, at 25$c$,
   $c$Governance, at 20$c$,
   $c$Presentation and defense, at 10$c$),
 1,
 $c$Verification is a quarter of the total. Everything else in the course makes you faster; verification is what makes your output safe to sign, and it is what the credential is really claiming.$c$),

(2,
 $c$A capstone packet scores 94 out of 100 but a prompt in the run evidence contains a participant's name and case number, unsanitized. The result is:$c$,
 jsonb_build_array(
   $c$A pass, with a note in the feedback$c$,
   $c$A fail — the floors sit outside the points and are not weighed against them$c$,
   $c$A pass, since the score exceeds the 80 threshold$c$,
   $c$A deduction of 20 points from the governance category$c$),
 1,
 $c$The floors are not scoring categories. A packet can score 94 and fail on either one, because a funder reviewing the same incident would not weigh it against your other work.$c$),

(3,
 $c$In the twelve-minute presentation, the most common structural mistake is:$c$,
 jsonb_build_array(
   $c$Spending too long on the organization's background$c$,
   $c$Spending most of the time on the output and rushing verification and governance, which are 45 of the 100 points$c$,
   $c$Showing the brief template on screen$c$,
   $c$Performing the checklist live instead of describing it$c$),
 1,
 $c$The impressive part is the output; the graded part is what surrounds it. Verification and governance together outweigh every other category combined.$c$),

(4,
 $c$A reviewer asks what would make you stop using your workflow. The strongest answer:$c$,
 jsonb_build_array(
   $c$"If it stopped feeling reliable"$c$,
   $c$"Two escaped errors in a month, a funder clause change, or the task ceasing to be verifiable"$c$,
   $c$"If Claude changed its behavior"$c$,
   $c$"Nothing — the verification plan covers every case"$c$),
 1,
 $c$Name a threshold, not a feeling. A stated trigger shows you have thought about failure in advance; "nothing would stop me" tells a reviewer you have not.$c$),

(5,
 $c$A colleague drafted an employment-verification letter using a participant's name and case number for accuracy, and verified every fact against the case file before sending. Which floor did they cross?$c$,
 jsonb_build_array(
   $c$The verification floor — output at high stakes went out unchecked$c$,
   $c$The PII floor — identifiable data went into the prompt with no sanitization step$c$,
   $c$Both floors$c$,
   $c$Neither — verifying the facts resolves the privacy concern$c$),
 1,
 $c$The verification discipline was sound; the governance one was not. Sanitize the prompt, draft from role labels and generalized detail, then add the real identifiers yourself in the final document.$c$),

(6,
 $c$What is the relationship between the certificate PDF and the registry record?$c$,
 jsonb_build_array(
   $c$The PDF is the credential; the registry is a backup copy$c$,
   $c$The registry record is the credential; the PDF is a receipt that carries the code and verification URL$c$,
   $c$They are issued independently and may disagree$c$,
   $c$The PDF must be presented before a registry lookup will work$c$),
 1,
 $c$The paper is only ever as good as the live registry entry. Status, holder, issuer and dates all come from `edu_credentials` at lookup time.$c$),

(7,
 $c$How does an employer confirm your CAP-C credential?$c$,
 jsonb_build_array(
   $c$By emailing CTS LLC for written confirmation$c$,
   $c$By visiting /verify/<credential code> on the Morpheus site — no login required$c$,
   $c$By requesting a copy of the capstone packet$c$,
   $c$By creating a MORPHEUS.EDU account and searching the participant list$c$),
 1,
 $c$Public verification is the point of the registry. That is also why the code belongs on your résumé alongside the credential name — a verifiable claim beats an unverifiable one.$c$),

(8,
 $c$Which statement about credential status is correct?$c$,
 jsonb_build_array(
   $c$Once issued, a credential cannot be changed$c$,
   $c$A credential may read active, expired, or revoked, and CTS will revoke one for falsified capstone evidence$c$,
   $c$Revocation removes the record from the registry entirely$c$,
   $c$Status changes only when the holder requests them$c$),
 1,
 $c$The registry is live, and revocation is visible at the verify URL rather than erasing the record. A credential that cannot be revoked is not a credential; it is a graphic.$c$)
) as v(sort_order, question, options, correct_index, explanation)
where not exists (
  select 1 from edu_checkpoint_questions q
  where q.module_id = m.id and q.sort_order = v.sort_order
);

-- ============================================================================
-- Publish modules 5-8 and rewrite their summaries.
-- The old summaries ended with "Full content built after the pilot cohort."
-- which is no longer true once the inserts above have run.
-- ============================================================================

update edu_modules
set status = 'available',
    summary = $c$Turning the Verify-or-Not habit into team process: review checklists, sampling strategies for bulk output, error logging, and building a QC step that survives deadline pressure. You will write the standard your team would actually follow at 4:40pm on a Friday — binary items, a named owner, and the escalation rule that fires when a sample fails.$c$
where sort_order = 5
  and course_id = (select id from edu_courses where code = 'CAP-C');

update edu_modules
set status = 'available',
    summary = $c$The full governance picture: organizational AI policy, funder and regulatory obligations, disclosure norms for AI-assisted work, bias awareness, and writing a usage standard for your own team. One page, four sections, a named accountable human — plus the screening line you do not cross, and the honest list of questions to escalate rather than answer yourself.$c$
where sort_order = 6
  and course_id = (select id from edu_courses where code = 'CAP-C');

update edu_modules
set status = 'available',
    summary = $c$Each candidate designs, documents, and demonstrates a real Claude-assisted workflow from their own job — brief templates, verification plan, and governance pass included. The module produces the six-artifact capstone packet: scope statement, template, verification plan, governance pass, two runs of real evidence, and honest time accounting with verification counted.$c$
where sort_order = 7
  and course_id = (select id from edu_courses where code = 'CAP-C');

update edu_modules
set status = 'available',
    summary = $c$Capstone presentations with instructor and peer review against the CAP-C rubric, the written exam, and credential issuance through the MORPHEUS.EDU registry. You present for twelve minutes, defend for eight, sit the scenario-based exam, and on a pass receive a registry-verifiable credential code anyone can check at the public verify URL.$c$
where sort_order = 8
  and course_id = (select id from edu_courses where code = 'CAP-C');
