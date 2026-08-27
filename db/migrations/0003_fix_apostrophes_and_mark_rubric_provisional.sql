-- 0003 — two content repairs to the CAP-C course.
-- Applied to production as migration `fix_apostrophes_and_mark_rubric_provisional`.
--
-- (a) The original module 2 / 4 seed leaked its SQL escaping into the
--     stored markdown, so 17 doubled apostrophes rendered literally to
--     learners ("organization''s"). Pre-existing bug, not introduced by
--     the modules 5-8 authoring pass.
--
-- (b) The CAP-C rubric in module 8 lesson 1 (categories, weights, the
--     80/100 threshold, the review format, the revision policy) was
--     authored without any source of truth -- nothing in the repo or the
--     database defined one. It read to learners as settled CTS policy.
--     Marked provisional until the credential owner signs off. Remove
--     the banner in a follow-up once the real numbers are confirmed.

update edu_lessons
set content_md = replace(content_md, '''''', '''')
where content_md like '%''''%';

update edu_lessons l
set content_md =
  '> **Provisional — pending sign-off.** The rubric categories, weights,'
  || ' passing threshold and review format below are a proposed starting'
  || ' point, not ratified CTS policy. Confirm them with the credential'
  || ' owner before the pilot cohort is assessed against them.' || chr(10) || chr(10)
  || l.content_md
from edu_modules m
where l.module_id = m.id
  and m.sort_order = 8
  and l.sort_order = 1
  and l.content_md not like '%Provisional — pending sign-off%';

-- Verification
-- select count(*) from edu_lessons where content_md like '%''''%';  -- expect 0
