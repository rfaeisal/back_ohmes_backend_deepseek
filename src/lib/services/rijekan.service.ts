// =============================================================================
// Rijekan Ledger Service — pembukuan rijekan (docs/23 §5)
// =============================================================================
// Tingkat 2: angka terlihat, peristiwa tetap manual. Masuk otomatis dari
// waste RIJEKAN settle (kg) + reject HLP (batang); keluar (OUT_REPROSES)
// tetap dicatat manual saat receiving reproses dibuat. Dua satuan
// berdampingan (KG & BATANG) — tanpa konversi paksa.
// =============================================================================

import { eq, and, gte, lte, desc } from "drizzle-orm";
import db from "@/db";
import { rijekanLedger } from "@/db/schema/hlp";

export type RijekanEntryType = "IN_MAKER_WASTE" | "IN_HLP_REJECT" | "OUT_REPROSES";
export type RijekanUnit = "KG" | "BATANG";

export interface AddRijekanEntryInput {
  plantId: string;
  entryType: RijekanEntryType;
  quantity: number;
  unit: RijekanUnit;
  refId?: string | null;
  note?: string | null;
}

export async function addRijekanEntry(input: AddRijekanEntryInput) {
  if (input.quantity <= 0) return;
  await db.insert(rijekanLedger).values({
    plantId: input.plantId,
    entryType: input.entryType,
    quantity: String(input.quantity),
    unit: input.unit,
    refId: input.refId ?? null,
    note: input.note ?? null,
  });
}

export async function getRijekanOverview(
  plantId: string,
  params: { from?: string; to?: string } = {}
) {
  const rows = await db
    .select()
    .from(rijekanLedger)
    .where(
      and(
        eq(rijekanLedger.plantId, plantId),
        ...(params.from ? [gte(rijekanLedger.createdAt, new Date(params.from))] : []),
        ...(params.to ? [lte(rijekanLedger.createdAt, new Date(params.to + "T23:59:59.999Z"))] : [])
      )
    )
    .orderBy(desc(rijekanLedger.createdAt))
    .limit(200);

  const sum = (type: string, unit: string) =>
    rows
      .filter((r) => r.entryType === type && r.unit === unit)
      .reduce((s, r) => s + Number(r.quantity), 0);

  const inKg = sum("IN_MAKER_WASTE", "KG");
  const outKg = sum("OUT_REPROSES", "KG");
  const inBatang = sum("IN_HLP_REJECT", "BATANG");
  const outBatang = sum("OUT_REPROSES", "BATANG");

  return {
    summary: {
      inKg,
      outKg,
      saldoKg: Math.round((inKg - outKg) * 100) / 100,
      inBatang,
      outBatang,
      saldoBatang: inBatang - outBatang,
    },
    data: rows.map((r) => ({ ...r, quantity: Number(r.quantity) })),
  };
}
