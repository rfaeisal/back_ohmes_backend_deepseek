-- =============================================================================
-- 0015 — FIFO override di tsg_inventory (mobile handoff §6)
-- =============================================================================
-- Permission `tsg.inventory.allocate.override` sudah di-seed untuk PLANT_MANAGER
-- + SUPERADMIN, tapi belum ada endpoint yang mengeksekusinya. Kolom ini mencatat
-- otorisasi pakai boks di luar urutan FIFO: alasan wajib (compliance) + aktor +
-- waktu. Endpoint: POST /tsg-inventory/:id/override-fifo.
-- =============================================================================

ALTER TABLE tsg_inventory
  ADD COLUMN IF NOT EXISTS fifo_override_reason TEXT,
  ADD COLUMN IF NOT EXISTS fifo_override_by UUID REFERENCES "user"(id),
  ADD COLUMN IF NOT EXISTS fifo_override_at TIMESTAMP;
