-- =============================================================================
-- RESET TRANSAKSI PRODUKSI — HAPUS SEMUA DATA SHIFT & RESET INVENTORY TSG
-- ⚠️  DESTRUKTIF. Jalankan HANYA pada DB yang memang mau dikosongkan.
-- ⚠️  Backup dulu:  pg_dump -U <user> -d <db> -Fc > backup_$(date +%F).dump
-- ⚠️  Jalankan sebagai owner/superuser (bukan mes_app) supaya RLS tidak memfilter.
-- Satu transaksi: kalau ada tabel yang belum ada (migrasi tertinggal) → ABORT semua.
-- =============================================================================

BEGIN;

-- Outbound / dispatch
DELETE FROM dispatch_document;
DELETE FROM dispatch_item;
DELETE FROM dispatch_order;
DELETE FROM carton_content;
DELETE FROM carton;

-- Level boks (child dulu)
DELETE FROM tsg_box_consumption;
DELETE FROM downtime_log;
DELETE FROM maintenance_event;
DELETE FROM shift_waste;
DELETE FROM tsg_box_process;

-- HLP
DELETE FROM hlp_pack;            -- FK → batch & hlp_shift
DELETE FROM hlp_shift_member;    -- FK → hlp_shift
DELETE FROM hlp_shift;

-- Batch & rantai produksi (external batangan + stage event)
DELETE FROM batch_stage_event;
DELETE FROM external_batangan_receiving;
DELETE FROM external_pack_out;
DELETE FROM tsg_box_session;     -- FK → batch
DELETE FROM batch;

-- Level shift
DELETE FROM shift_handoff;
DELETE FROM shift_member;
DELETE FROM shift_correction;
DELETE FROM shift_consumption;
DELETE FROM finished_goods_receiving;

-- Bebaskan inventory SEBELUM shift_report dihapus (FK allocated_to_shift_id)
UPDATE tsg_inventory
SET status = 'AVAILABLE', allocated_to_shift_id = NULL, allocated_at = NULL, used_at = NULL
WHERE status IN ('USED', 'ALLOCATED');

-- Event level mesin (tanpa FK ke shift_report)
DELETE FROM machine_maintenance;
DELETE FROM machine_downtime;
DELETE FROM material_out;
DELETE FROM rijekan_ledger;

-- Terakhir: shift_report
DELETE FROM shift_report;

COMMIT;

-- Verifikasi (jalankan terpisah setelah COMMIT):
--   SELECT 'shift_report', count(*) FROM shift_report
--   UNION ALL SELECT 'batch', count(*) FROM batch
--   UNION ALL SELECT 'inventory belum AVAILABLE', count(*) FROM tsg_inventory WHERE status <> 'AVAILABLE';
