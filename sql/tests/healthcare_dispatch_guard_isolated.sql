-- Run ONLY on disposable local PostgreSQL with the proposal function installed.
-- This test attaches the proposed guard to a TEMP fixture table, not real work orders.
-- psql -v ON_ERROR_STOP=1 -f sql/tests/healthcare_dispatch_guard_isolated.sql
BEGIN;
CREATE TEMP TABLE healthcare_dispatch_guard_fixture (
  id integer PRIMARY KEY, program_key text NOT NULL, status text NOT NULL,
  assigned_resource_id uuid, dispatched_at timestamptz,
  en_route_at timestamptz, completed_at timestamptz
) ON COMMIT DROP;
CREATE TRIGGER healthcare_prevent_unverified_dispatch
BEFORE UPDATE ON healthcare_dispatch_guard_fixture
FOR EACH ROW EXECUTE FUNCTION melrah.healthcare_prevent_unverified_dispatch();
INSERT INTO healthcare_dispatch_guard_fixture(id,program_key,status)
VALUES (1,'HEALTHCARE_MDR','DRAFT'),
       (2,'ORGANICS_COFFEE','DRAFT'),
       (3,'CANNABIS_PACKAGING','DRAFT');

DO $test$
DECLARE
  blocked boolean;
BEGIN
  blocked := false;
  BEGIN
    UPDATE healthcare_dispatch_guard_fixture SET status='RELEASED' WHERE id=1;
  EXCEPTION WHEN check_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL: healthcare status progression allowed'; END IF;

  blocked := false;
  BEGIN
    UPDATE healthcare_dispatch_guard_fixture SET assigned_resource_id='00000000-0000-0000-0000-000000000001' WHERE id=1;
  EXCEPTION WHEN check_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL: healthcare assignment allowed'; END IF;

  blocked := false;
  BEGIN
    UPDATE healthcare_dispatch_guard_fixture SET dispatched_at=now() WHERE id=1;
  EXCEPTION WHEN check_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL: healthcare dispatch timestamp allowed'; END IF;

  UPDATE healthcare_dispatch_guard_fixture SET status='CANCELLED' WHERE id=1;
  IF (SELECT status FROM healthcare_dispatch_guard_fixture WHERE id=1) <> 'CANCELLED'
    THEN RAISE EXCEPTION 'FAIL: healthcare cancellation blocked'; END IF;

  UPDATE healthcare_dispatch_guard_fixture SET status='RELEASED' WHERE id IN (2,3);
  IF (SELECT count(*) FROM healthcare_dispatch_guard_fixture WHERE id IN (2,3) AND status='RELEASED') <> 2
    THEN RAISE EXCEPTION 'FAIL: other programs affected'; END IF;

  blocked := false;
  BEGIN
    UPDATE healthcare_dispatch_guard_fixture SET program_key='HEALTHCARE_MDR',assigned_resource_id='00000000-0000-0000-0000-000000000002' WHERE id=2;
  EXCEPTION WHEN check_violation THEN blocked := true;
  END;
  IF NOT blocked THEN RAISE EXCEPTION 'FAIL: program change bypass allowed'; END IF;

  RAISE NOTICE 'PASS: six isolated healthcare dispatch guard regression checks';
END
$test$;
ROLLBACK;
