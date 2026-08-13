// =============================================================================
// Satuan Standar — untuk master consumable & sparepart
// =============================================================================

export const UNIT_OPTIONS = [
  "pcs",
  "roll",
  "kg",
  "meter",
  "liter",
  "pack",
  "lembar",
  "unit",
] as const;

export type UnitOption = (typeof UNIT_OPTIONS)[number];
