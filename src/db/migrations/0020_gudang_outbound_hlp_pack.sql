-- 0020_gudang_outbound_hlp_pack.sql
-- GUDANG_OUTBOUND butuh permission hlp.pack: GET /api/v1/hlp/packs dipakai
-- dialog "Isi Pack" di /admin/gudang-outbound (tanpa ini select kosong → 403
-- di-swallow jadi []). Idempotent — ON CONFLICT DO NOTHING.
INSERT INTO role_permission (role_id, permission_id)
SELECT r.id, p.id
FROM role r, permission p
WHERE r.code = 'GUDANG_OUTBOUND' AND p.code = 'hlp.pack'
ON CONFLICT DO NOTHING;
