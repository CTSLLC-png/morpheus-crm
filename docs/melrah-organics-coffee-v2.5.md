# MorpheusOS v2.5 — Melrah Organics / Coffee Grounds

## Objective
Extend the existing MELRAH FIELD recovery platform so one dispatch engine can manage cannabis-packaging recovery and spent-coffee-grounds recovery without duplicating logistics code.

## Shared workflow
Station / Generator → Pickup Request / Work Order → Dispatch → Driver → Collection Record → Material Batch → Final Disposition → Recovery Intelligence

## Program model
Every Melrah work order, station, container, collection record and batch should support a `program_key`.

Initial program keys:
- `CANNABIS_PACKAGING`
- `ORGANICS_COFFEE`

Future material programs should be configuration-driven.

## Coffee material streams
- `COFFEE_GROUNDS`
- `COFFEE_FILTER_PAPER`
- `COFFEE_CONTAMINATION` (exception/reject classification only)

## Coffee container QR convention
Recommended code pattern:

`MEL-<CITY>-<LOCATION>-ORG-CG-<NN>`

Example:
`MEL-SCH-004-ORG-CG-01`

The QR scan resolves account → site → station/container → program → stream.

## Coffee collection record fields
Required at completion:
- work order / service appointment
- account / site
- program key
- container ID / QR
- material stream
- recovered net weight (lb)
- contamination level: NONE / MINOR / MAJOR / REJECT
- paper-filter inclusion yes/no
- fill level
- replacement-container ID when exchanged
- collector / driver
- route
- timestamp
- downstream destination or load assignment

Optional / conditional:
- contamination percentage
- exception photo
- before/after photo
- coordinates
- field notes
- gross/tare weight

## Coffee dispatch signals
Coffee service urgency can use:
- scheduled service frequency
- days since last completed pickup
- historical pounds per day/week
- latest recorded fill level
- contamination hold
- route proximity / service-zone density

## Route Briefcase behavior
One route can contain multiple Melrah programs. Each stop carries a visible program badge and loads the correct field form.

Examples:
- CANNABIS — flexible pouch pickup
- ORGANICS — coffee grounds pickup

Do not duplicate Route Briefcase logic by program. Program-specific forms should sit on the shared dispatch/retrieval layer.

## Coffee field workflow
1. Open assigned stop.
2. Verify customer/site.
3. Scan container QR.
4. Inspect contents.
5. Record contamination level.
6. Record gross/tare or net pounds.
7. Record filter-paper inclusion.
8. Capture exception evidence if required.
9. Exchange container if configured.
10. Close collection record.
11. Associate collected weight with route/load and downstream destination.
12. Sync through the existing offline evidence/outbox pattern when connectivity is unavailable.

## Recovery reporting
Coffee recovery dashboard metrics:
- pounds collected
- pounds per stop
- stops completed
- contamination rate
- rejected pounds
- average service minutes
- route miles per 100 lb
- downstream destination
- customer retention
- contribution margin per stop (when cost data is available)

## Day-1 implementation principle
Reuse the existing MELRAH FIELD status model and downstream batch chain. Do not represent coffee grounds as composted, recycled, or otherwise recovered until a verified final disposition exists.

## Regression requirement
Before enabling mixed-program production routes, confirm the authenticated Route Briefcase reliably returns assigned cannabis test work orders. The existing dispatch/RLS retrieval behavior must remain a regression test so the organics program does not reproduce a hidden-assignment defect.

## Recommended implementation order
1. Add `program_key` support to shared Melrah data objects.
2. Seed `ORGANICS_COFFEE` program and coffee material-stream configuration.
3. Add coffee-specific collection form fields and validation.
4. Add program badge / form resolver to Dispatch and MELRAH FIELD.
5. Extend Recovery Intelligence filters and metrics by program.
6. Add coffee pilot fixtures/tests.
7. Enable mixed-program route optimization after single-program coffee pilot validation.
