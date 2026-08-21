-- =============================================================================
-- 0011: Izinkan transisi status di RLS UPDATE (weigh close, approve, dispatch)
-- =============================================================================
-- Policy UPDATE dengan kondisi state (completed_at IS NULL / status <> X)
-- tanpa WITH CHECK eksplisit memakai USING sebagai WITH CHECK juga — sehingga
-- update TRANSISI yang justru mengubah state itu sendiri (timbang → completed_at
-- terisi, approve → status APPROVED, konfirmasi → status DISPATCHED) ditolak RLS
-- (SQLSTATE 42501, ExecWithCheckOptions). Terjadi sejak RLS diaktifkan
-- (commit 99b7a50) dan baru terlihat saat alur box weigh diuji.
--
-- Fix: USING tetap menjaga row lama (boks completed / shift approved / order
-- dispatched tidak bisa di-edit lagi), WITH CHECK hanya mensyaratkan plant match
-- supaya transisi state yang sah lolos. Endpoint transisi tetap di-gate
-- permission di withAuth.
-- =============================================================================

-- 1) tsg_box_process — timbang boks = close (completed_at terisi)
DROP POLICY p_box_update ON tsg_box_process;
CREATE POLICY p_box_update ON tsg_box_process
FOR UPDATE
USING (
  (
    plant_id = ANY (current_setting('app.current_plant_ids')::uuid[])
    OR current_setting('app.bypass_rls', true) = 'true'
  )
  AND completed_at IS NULL
)
WITH CHECK (
  plant_id = ANY (current_setting('app.current_plant_ids')::uuid[])
  OR current_setting('app.bypass_rls', true) = 'true'
);

-- 2) shift_report — approve shift = transisi status → APPROVED
DROP POLICY p_shift_update ON shift_report;
CREATE POLICY p_shift_update ON shift_report
FOR UPDATE
USING (
  (
    plant_id = ANY (current_setting('app.current_plant_ids')::uuid[])
    OR current_setting('app.bypass_rls', true) = 'true'
  )
  AND status <> 'APPROVED'
)
WITH CHECK (
  plant_id = ANY (current_setting('app.current_plant_ids')::uuid[])
  OR current_setting('app.bypass_rls', true) = 'true'
);

-- 3) dispatch_order — konfirmasi kirim = transisi status → DISPATCHED
DROP POLICY p_do_update ON dispatch_order;
CREATE POLICY p_do_update ON dispatch_order
FOR UPDATE
USING (
  (
    plant_id = ANY (current_setting('app.current_plant_ids')::uuid[])
    OR current_setting('app.bypass_rls', true) = 'true'
  )
  AND status <> 'DISPATCHED'
)
WITH CHECK (
  plant_id = ANY (current_setting('app.current_plant_ids')::uuid[])
  OR current_setting('app.bypass_rls', true) = 'true'
);
