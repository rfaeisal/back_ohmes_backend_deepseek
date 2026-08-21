-- =============================================================================
-- 0010: Pool label supplier SJ jadi milik bersama (permission-gated)
-- =============================================================================
-- Sebelumnya: policy SELECT/UPDATE supplier_sj_box hanya memperlihatkan label
-- pool (plant_id IS NULL) ke creator-nya. Padahal SOP §3.2 (10-supplier-sj-app):
-- petugas boleh memakai sisa label yang dicetak petugas lain — pool adalah
-- inventaris bersama area office. Akibat: GET /supplier-sj/pool & hitungan
-- "sisa pool" hanya menampilkan label milik user login (menyesatkan), dan
-- scan label cetakan petugas lain akan gagal update.
--
-- Fix:
-- 1. Label pool kini terlihat (SELECT) & bisa di-assign (UPDATE) oleh user
--    yang punya permission supplier.sj.pool — lewat EXISTS ke role_permission.
--    DELETE tetap creator-only (void label orang lain = SUPERADMIN via bypass).
-- 2. SUPERADMIN belum punya row permission supplier.sj.* (ditambah belakangan
--    di seed-sj-officer untuk role lain) — diisi di sini supaya RLS EXISTS
--    berlaku untuk SUPERADMIN juga.
-- =============================================================================

-- 2. Isi permission yang hilang untuk SUPERADMIN (idempotent)
INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM role r, permission p
WHERE r.code = 'SUPERADMIN'
  AND p.code IN ('supplier.sj.create', 'supplier.sj.view', 'supplier.sj.label',
                 'supplier.sj.pool', 'tsg.receiving.approve')
ON CONFLICT DO NOTHING;

-- 1. Policy baru: pool = bersama untuk pemegang supplier.sj.pool
DROP POLICY p_sjb_select ON supplier_sj_box;
CREATE POLICY p_sjb_select ON supplier_sj_box
FOR SELECT USING (
  plant_id = ANY (current_setting('app.current_plant_ids')::uuid[])
  OR current_setting('app.bypass_rls', true) = 'true'
  OR (
    plant_id IS NULL
    AND (
      created_by = current_setting('app.current_user_id')::uuid
      OR EXISTS (
        SELECT 1
        FROM user_assignment ua
        JOIN role_permission rp ON rp.role_id = ua.role_id
        JOIN permission p ON p.id = rp.permission_id
        WHERE ua.user_id = current_setting('app.current_user_id')::uuid
          AND p.code = 'supplier.sj.pool'
      )
    )
  )
);

DROP POLICY p_sjb_update ON supplier_sj_box;
CREATE POLICY p_sjb_update ON supplier_sj_box
FOR UPDATE USING (
  plant_id = ANY (current_setting('app.current_plant_ids')::uuid[])
  OR current_setting('app.bypass_rls', true) = 'true'
  OR (
    plant_id IS NULL
    AND (
      created_by = current_setting('app.current_user_id')::uuid
      OR EXISTS (
        SELECT 1
        FROM user_assignment ua
        JOIN role_permission rp ON rp.role_id = ua.role_id
        JOIN permission p ON p.id = rp.permission_id
        WHERE ua.user_id = current_setting('app.current_user_id')::uuid
          AND p.code = 'supplier.sj.pool'
      )
    )
  )
);
