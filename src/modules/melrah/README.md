# MELRAH FIELD™ v1

MELRAH FIELD is the field-service and recovery-intelligence layer for Melrah Environmental Services inside MorpheusOS.

## Core workflow

Collection Station → Pickup Request / Work Order → Dispatch → Driver → Collection Record → Material Batch → Final Disposition → Recovery Intelligence

## Included UI modules

- **Operations Control** — dispatch queue, capacity alerts, field-resource overview
- **MELRAH FIELD** — mobile-first route/appointment workflow
- **Collection Stations** — service locations, station assets, stream containers, QR identity
- **Work Orders** — existing work-order + custody ledger view
- **Recovery Intelligence** — recovered weight, package counts, pouch recovery, contamination, disposition

## Status model

UNASSIGNED → DISPATCHED → ACCEPTED → EN_ROUTE → ARRIVED → IN_PROGRESS → COMPLETED

Exception states: CANCELLED, EXCEPTION

## Pilot material streams

1. FLEXIBLE_POUCH — primary stream
2. RIGID_PLASTIC
3. GLASS_METAL
4. PAPER_FIBER
5. OTHER — controlled exception only

## QR convention

Recommended container code pattern:

`MEL-<CITY>-<LOCATION>-<STREAM>-<NN>`

Example: `MEL-ALB-003-FP-01`

The QR value should be stable and unique. A scan resolves location → station → container → material stream.

## Collection data

Every collection record can capture:

- work order / service appointment
- location / station / container
- material stream
- recovered weight
- package count
- contamination percentage
- fill level
- bag/batch ID
- before/after photo URLs
- coordinates
- field notes
- field resource
- timestamp

## Downstream chain

Material batch status:

COLLECTED → RECEIVED → SORTED → CHARACTERIZED → PROCESSOR_ASSIGNED → TRANSFERRED → FINAL_DISPOSITION

Do not represent material as recycled until the batch reaches a verified downstream disposition.

## Database setup

Apply `sql/melrah_field_v1.sql` after the existing Morpheus core and Melrah database schema.

## Tenant modules

The following module keys are registered in `src/modules/registry.jsx` and should be seeded/enabled in `core.module` / `core.tenant_module` for the Melrah tenant:

- `logistics.dispatch`
- `logistics.field`
- `logistics.stations`
- `logistics.recovery`

Existing Melrah module keys remain in place:

- `logistics.accounts`
- `logistics.workorders`
- `quality.inventory`

## Pilot principle

The field platform is designed to validate both the collection model and the data model during the Albany pilot. Flexible cannabis pouches are treated as the primary characterization/recovery stream; no universal recyclability claim is implied.
