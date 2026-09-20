# Coffee Grounds E2E Validation

Controlled fixture: **TEST-COFFEE-0001**  
QR/container: **MEL-SCH-TEST-CG-01**  
Program: **ORGANICS_COFFEE**

## Run
1. Apply migrations through `0013_melrah_coffee_e2e_fixture.sql`.
2. Open Melrah Operations Control. Confirm the test work order appears with an ORGANICS badge.
3. Assign it to the authenticated test collector. This deliberately is not done by seed SQL.
4. On Field Mobile, refresh the Route Briefcase.
5. Confirm the stop says ORGANICS and scan/enter `MEL-SCH-TEST-CG-01`.
6. Progress ACCEPT JOB → EN ROUTE → ARRIVED → START COLLECTION.
7. Record a test weight, fill %, contamination level and optional replacement container; attach evidence if desired.
8. Save the collection and COMPLETE STOP.
9. In Recovery Intelligence, confirm Coffee Grounds weight reflects the test collection.
10. Verify custody history includes FIELD_* transitions and COLLECTION_RECORDED.

## Pass criteria
- No cannabis-only bag/batch or package-count requirement on the coffee stop.
- Work order and container program mismatch is rejected.
- Collection persists as ORGANICS_COFFEE.
- Route Briefcase remains scoped to the assigned authenticated collector.
- Recovery Intelligence reports the recorded coffee weight.

The fixture uses a synthetic address/customer name and must never be represented as a real customer.
