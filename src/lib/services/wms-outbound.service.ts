// =============================================================================
// WMS Outbound Service — Finished Goods Receiving + Cartoning + Traceability
// =============================================================================

import { eq, and, sql } from "drizzle-orm";
import db from "@/db";
import { shiftReport, hlpPack, batch } from "@/db/schema";
import { finishedGoodsReceiving, carton, cartonContent } from "@/db/schema/wms-outbound";
import { product } from "@/db/schema/master-product";
import { ServiceError } from "./shift.service";
export { ServiceError } from "./shift.service";

// =============================================================================
// Auto-Create Finished Goods Receiving (triggered saat shift APPROVED)
// =============================================================================

export async function autoCreateFinishedGoods(shiftId: string) {
  // Idempotent — shift yang di-reopen lalu di-approve ulang tidak boleh
  // membuat baris receiving ganda.
  const [existing] = await db
    .select()
    .from(finishedGoodsReceiving)
    .where(eq(finishedGoodsReceiving.shiftReportId, shiftId))
    .limit(1);
  if (existing) return existing;

  const [shift] = await db
    .select({ id: shiftReport.id, plantId: shiftReport.plantId })
    .from(shiftReport)
    .where(eq(shiftReport.id, shiftId))
    .limit(1);

  if (!shift) throw new ServiceError("SHIFT_NOT_FOUND", "Shift tidak ditemukan.");

  // Hitung total packs dari HLP
  const packs = await db
    .select({
      total: sql<number>`COALESCE(SUM(${hlpPack.packsLolos}), 0)`.mapWith(Number),
    })
    .from(hlpPack)
    .innerJoin(batch, eq(hlpPack.batchId, batch.id))
    .where(eq(batch.shiftReportId, shiftId));

  const packsExpectedCount = packs[0]?.total ?? 0;

  // Create receiving record
  const [receiving] = await db
    .insert(finishedGoodsReceiving)
    .values({
      plantId: shift.plantId,
      shiftReportId: shiftId,
      packsExpectedCount,
      status: "PENDING",
    })
    .returning();

  return receiving;
}

// =============================================================================
// Confirm Receiving — gudang konfirmasi jumlah pack diterima
// =============================================================================

export async function confirmReceiving(
  shiftId: string,
  packsActualCount: number,
  receivedBy: string
) {
  let [receiving] = await db
    .select()
    .from(finishedGoodsReceiving)
    .where(eq(finishedGoodsReceiving.shiftReportId, shiftId))
    .limit(1);

  if (!receiving) {
    // Backfill: shift yang di-approve sebelum autoCreate dipasang di approve
    // belum punya baris receiving — buat sekarang (idempotent, selalu return row).
    receiving = await autoCreateFinishedGoods(shiftId);
  }

  if (!receiving) throw new ServiceError("RECEIVING_NOT_FOUND", "Receiving record tidak ditemukan. Shift belum APPROVED?");

  if (receiving.status !== "PENDING") {
    throw new ServiceError("ALREADY_CONFIRMED", "Receiving sudah dikonfirmasi sebelumnya.");
  }

  const status = packsActualCount === receiving.packsExpectedCount ? "CONFIRMED" : "DISPUTED";

  const [updated] = await db
    .update(finishedGoodsReceiving)
    .set({
      packsActualCount,
      status,
      receivedAt: new Date(),
      receivedBy,
      disputeNotes: status === "DISPUTED" ? `Ekspektasi: ${receiving.packsExpectedCount}, Actual: ${packsActualCount}` : null,
    })
    .where(eq(finishedGoodsReceiving.id, receiving.id))
    .returning();

  return updated;
}

// =============================================================================
// Create Carton
// =============================================================================

export async function createCarton(input: {
  plantId: string;
  productId: string;
  capacityPack?: number;
  openedBy: string;
}) {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const existing = await db
    .select({ count: sql<number>`count(*)` })
    .from(carton)
    .where(and(eq(carton.plantId, input.plantId), sql`opened_at::date = CURRENT_DATE`));

  const seq = (existing[0]?.count ?? 0) + 1;

  // Get plant code for carton code
  const { plant } = await import("@/db/schema/tenancy");
  const [plt] = await db
    .select({ code: plant.code })
    .from(plant)
    .where(eq(plant.id, input.plantId))
    .limit(1);

  const code = `CTN-${plt?.code ?? "UNK"}-${today}-${String(seq).padStart(3, "0")}`;

  const [ctn] = await db
    .insert(carton)
    .values({
      plantId: input.plantId,
      code,
      productId: input.productId,
      capacityPack: input.capacityPack ?? 50,
      openedBy: input.openedBy,
    })
    .returning();

  return ctn;
}

// =============================================================================
// Add Pack to Carton
// =============================================================================

export async function addPackToCarton(input: {
  cartonId: string;
  hlpPackId: string;
  packQty: number; // jumlah pack FISIK dari batch ini (migrasi 0019)
  plantId: string;
  addedBy: string;
}) {
  if (!Number.isInteger(input.packQty) || input.packQty < 1) {
    throw new ServiceError("INVALID_PACK_QTY", "Jumlah pack harus integer minimal 1.");
  }

  // Validasi carton OPEN
  const [ctn] = await db
    .select()
    .from(carton)
    .where(eq(carton.id, input.cartonId))
    .limit(1);

  if (!ctn) throw new ServiceError("CARTON_NOT_FOUND", "Karton tidak ditemukan.");
  if (ctn.status !== "OPEN") {
    throw new ServiceError("CARTON_NOT_OPEN", "Hanya karton status OPEN yang bisa ditambah pack.");
  }

  // Validasi pack ada + sisa pack batch cukup
  const [pack] = await db
    .select({ packsLolos: hlpPack.packsLolos })
    .from(hlpPack)
    .where(eq(hlpPack.id, input.hlpPackId))
    .limit(1);

  if (!pack) throw new ServiceError("PACK_NOT_FOUND", "Pack tidak ditemukan.");

  // Isi karton saat ini (jumlah pack fisik)
  const [fillRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${cartonContent.packQty}), 0)` })
    .from(cartonContent)
    .where(eq(cartonContent.cartonId, input.cartonId));

  const currentFill = Number(fillRow?.total ?? 0);
  if (currentFill + input.packQty > ctn.capacityPack) {
    throw new ServiceError(
      "CARTON_FULL",
      `Kapasitas karton ${ctn.capacityPack} pack — sisa ${ctn.capacityPack - currentFill} pack.`,
      { capacity: ctn.capacityPack, currentFill }
    );
  }

  // Total pack batch ini yang sudah dialokasikan ke SEMUA karton
  const [allocRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${cartonContent.packQty}), 0)` })
    .from(cartonContent)
    .where(eq(cartonContent.hlpPackId, input.hlpPackId));

  const allocated = Number(allocRow?.total ?? 0);
  if (allocated + input.packQty > pack.packsLolos) {
    throw new ServiceError(
      "PACK_INSUFFICIENT",
      `Sisa pack batch ini ${pack.packsLolos - allocated} pack.`,
      { packsLolos: pack.packsLolos, allocated }
    );
  }

  // Add/merge ke karton (unique carton+hlpPack → qty dijumlah)
  await db
    .insert(cartonContent)
    .values({
      cartonId: input.cartonId,
      plantId: input.plantId,
      hlpPackId: input.hlpPackId,
      packQty: input.packQty,
      addedBy: input.addedBy,
    })
    .onConflictDoUpdate({
      target: [cartonContent.cartonId, cartonContent.hlpPackId],
      set: { packQty: sql`${cartonContent.packQty} + ${input.packQty}` },
    });

  // Update actual pack count (jumlah pack fisik)
  const [countResult] = await db
    .select({ total: sql<number>`COALESCE(SUM(${cartonContent.packQty}), 0)` })
    .from(cartonContent)
    .where(eq(cartonContent.cartonId, input.cartonId));

  const newFill = Number(countResult?.total ?? 0);
  await db
    .update(carton)
    .set({ actualPackCount: newFill })
    .where(eq(carton.id, input.cartonId));

  return { cartonId: input.cartonId, packCount: newFill, remainingCapacity: ctn.capacityPack - newFill };
}

// =============================================================================
// Close Carton
// =============================================================================

export async function closeCarton(cartonId: string, closedBy: string) {
  const [ctn] = await db
    .select()
    .from(carton)
    .where(eq(carton.id, cartonId))
    .limit(1);

  if (!ctn) throw new ServiceError("CARTON_NOT_FOUND", "Karton tidak ditemukan.");
  if (ctn.status !== "OPEN") throw new ServiceError("CARTON_NOT_OPEN", "Karton sudah ditutup.");
  if (ctn.actualPackCount === 0) throw new ServiceError("CARTON_EMPTY", "Karton kosong — tidak bisa ditutup.");

  const [updated] = await db
    .update(carton)
    .set({ status: "READY", closedAt: new Date(), closedBy })
    .where(eq(carton.id, cartonId))
    .returning();

  return updated;
}

// =============================================================================
// Carton Lineage — traceability lengkap
// =============================================================================

export async function getCartonLineage(cartonCode: string) {
  const [ctn] = await db
    .select()
    .from(carton)
    .where(eq(carton.code, cartonCode))
    .limit(1);

  if (!ctn) throw new ServiceError("CARTON_NOT_FOUND", "Karton tidak ditemukan.");

  const contents = await db
    .select({
      hlpPackId: cartonContent.hlpPackId,
      batchId: batch.id,
      batchCode: batch.code,
      machineId: batch.machineId,
      shiftReportId: batch.shiftReportId,
      reportDate: shiftReport.reportDate,
      productCode: product.code,
    })
    .from(cartonContent)
    .innerJoin(hlpPack, eq(cartonContent.hlpPackId, hlpPack.id))
    .innerJoin(batch, eq(hlpPack.batchId, batch.id))
    .innerJoin(shiftReport, eq(batch.shiftReportId, shiftReport.id))
    .innerJoin(product, eq(shiftReport.productId, product.id))
    .where(eq(cartonContent.cartonId, ctn.id));

  return {
    cartonCode: ctn.code,
    actualPackCount: ctn.actualPackCount,
    status: ctn.status,
    contents: contents.map((c) => ({
      hlpPackId: c.hlpPackId,
      batchId: c.batchId,
      batchCode: c.batchCode,
      machineId: c.machineId,
      shiftReportId: c.shiftReportId,
      reportDate: c.reportDate,
      productCode: c.productCode,
    })),
  };
}
