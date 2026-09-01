-- =============================================================================
-- 0022 — Tolak approval receiving manual + catatan (mobile)
-- =============================================================================
-- Tim mobile minta fitur tolak receiving manual dengan catatan. Status baru
-- REJECTED pada approval_status (kolom TEXT, bukan enum — tidak butuh
-- ALTER TYPE) + kolom catatan & aktor penolakan.
-- =============================================================================

ALTER TABLE tsg_receiving
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE tsg_receiving
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES "user"(id);

ALTER TABLE tsg_receiving
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;

-- SHIFT_SUPERVISOR jadi approver cadangan receiving manual — seed() skip
-- kalau DB sudah ter-seed, jadi grant lewat migrasi (pola 0010, idempotent).
INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM role r, permission p
WHERE r.code = 'SHIFT_SUPERVISOR'
  AND p.code = 'tsg.receiving.approve'
ON CONFLICT DO NOTHING;
