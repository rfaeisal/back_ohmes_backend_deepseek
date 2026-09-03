// =============================================================================
// WMS Outbound Service — Finished Goods Receiving + Cartoning + Traceability
// =============================================================================

import { eq, and, sql, isNull } from "drizzle-orm";
import db from "@/db";
import { shiftReport, hlpPack, batch, batchStageEvent } from "@/db/schema";
import {
  finishedGoodsReceiving,
  carton,
  cartonContent,
  type CartonUnit,
} from "@/db/schema/wms-outbound";
import { product } from "@/db/schema/master-product";
import { STAGE_UNIT } from "./chain.service";
import { ServiceError } from "./shift.service";
export { ServiceError } from "./shift.service";

export type ChainStage = "WR" | "SLOP" | "BAL";
const NEXT_STAGE: Record<ChainStage, ChainStage | null> = {
  WR: "SLOP",
  SLOP: "BAL",
  BAL: null,
};

// =============================================================================
// Auto-Create Finished Goods Receiving (triggered saat shift APPROVED)
// — satu baris per (shift, unit): PACK (selalu), SLOP & BAL bila > 0.
// =============================================================================

export async function autoCreateFinishedGoods(shiftId: string) {
  const existing = await db
    .select()
    .from(finishedGoodsReceiving)
    .where(eq(finishedGoodsReceiving.shiftReportId, shiftId));
  const existingUnits = new Set(existing.map((r) => r.unit));

  const [shift] = await db
    .select({ id: shiftReport.id, plantId: shiftReport.plantId })
    .from(shiftReport)
    .where(eq(shiftReport.id, shiftId))
    .limit(1);

  if (!shift) throw new ServiceError("SHIFT_NOT_FOUND", "Shift tidak ditemukan.");

  // PACK = Σ packsLolos dari semua batch shift ini
  const packs = await db
    .select({
      total: sql<number>`COALESCE(SUM(${hlpPack.packsLolos}), 0)`.mapWith(Number),
    })
    .from(hlpPack)
    .innerJoin(batch, eq(hlpPack.batchId, batch.id))
    .where(eq(batch.shiftReportId, shiftId));

  // SLOP/BAL = agregat stage event semua batch shift ini.
  // 0032: SLOP = sisa TERCATAT di event BAL (Σ sisa_qty) bila ada; kalau tidak
  // (data lama), fallback max(0, Σout(SLOP) − Σin(BAL)). BAL = Σout(BAL).
  const stageRows = await db
    .select({
      stage: batchStageEvent.stage,
      outTotal: sql<number>`COALESCE(SUM(${batchStageEvent.outputQty}), 0)`.mapWith(Number),
      inTotal: sql<number>`COALESCE(SUM(${batchStageEvent.inputQty}), 0)`.mapWith(Number),
      sisaTotal: sql<number>`COALESCE(SUM(${batchStageEvent.sisaQty}), 0)`.mapWith(Number),
      sisaCount: sql<number>`COUNT(${batchStageEvent.sisaQty})`.mapWith(Number),
    })
    .from(batchStageEvent)
    .innerJoin(batch, eq(batchStageEvent.batchId, batch.id))
    .where(and(eq(batch.shiftReportId, shiftId), isNull(batchStageEvent.deletedAt)))
    .groupBy(batchStageEvent.stage);

  const byStage = new Map(stageRows.map((r) => [r.stage, r]));
  const outOf = (s: string) => Number(byStage.get(s)?.outTotal ?? 0);
  const inOf = (s: string) => Number(byStage.get(s)?.inTotal ?? 0);

  const balRows = byStage.get("BAL");
  const slopExpected =
    balRows && Number(balRows.sisaCount) > 0
      ? Number(balRows.sisaTotal)
      : Math.max(0, outOf("SLOP") - inOf("BAL"));

  const expectedByUnit: Record<string, number> = {
    PACK: packs[0]?.total ?? 0,
    SLOP: slopExpected,
    BAL: outOf("BAL"),
  };

  // Insert baris unit yang belum ada (idempotent — reopen+approve ulang aman).
  // PACK selalu dibuat (kompatibilitas konfirmasi FG lama); SLOP/BAL bila > 0.
  const missing = (["PACK", "SLOP", "BAL"] as const).filter(
    (u) => !existingUnits.has(u) && (u === "PACK" || (expectedByUnit[u] ?? 0) > 0)
  );
  if (missing.length > 0) {
    await db
      .insert(finishedGoodsReceiving)
      .values(
        missing.map((unit) => ({
          plantId: shift.plantId,
          shiftReportId: shiftId,
          unit,
          packsExpectedCount: expectedByUnit[unit]!,
          status: "PENDING",
        }))
      )
      .onConflictDoNothing({
        target: [finishedGoodsReceiving.shiftReportId, finishedGoodsReceiving.unit],
      });
  }

  const rows = await db
    .select()
    .from(finishedGoodsReceiving)
    .where(eq(finishedGoodsReceiving.shiftReportId, shiftId));
  return rows;
}

// =============================================================================
// Confirm Receiving — gudang konfirmasi jumlah diterima per unit
// =============================================================================

export async function confirmReceiving(
  shiftId: string,
  unit: CartonUnit,
  packsActualCount: number,
  receivedBy: string
) {
  const findRow = async () => {
    const rows = await db
      .select()
      .from(finishedGoodsReceiving)
      .where(
        and(
          eq(finishedGoodsReceiving.shiftReportId, shiftId),
          eq(finishedGoodsReceiving.unit, unit)
        )
      )
      .limit(1);
    return rows[0] ?? null;
  };

  let receiving = await findRow();

  if (!receiving) {
    // Backfill: shift di-approve sebelum autoCreate per-unit dipasang belum
    // punya baris unit ini — buat sekarang (idempotent).
    await autoCreateFinishedGoods(shiftId);
    receiving = await findRow();
  }

  if (!receiving) {
    throw new ServiceError(
      "RECEIVING_NOT_FOUND",
      `Receiving unit ${unit} tidak ditemukan. Shift belum APPROVED atau tidak ada ekspektasi unit ini.`
    );
  }

  if (receiving.status !== "PENDING") {
    throw new ServiceError("ALREADY_CONFIRMED", `Receiving unit ${unit} sudah dikonfirmasi sebelumnya.`);
  }

  const status = packsActualCount === receiving.packsExpectedCount ? "CONFIRMED" : "DISPUTED";

  const [updated] = await db
    .update(finishedGoodsReceiving)
    .set({
      packsActualCount,
      status,
      receivedAt: new Date(),
      receivedBy,
      disputeNotes:
        status === "DISPUTED"
          ? `Ekspektasi: ${receiving.packsExpectedCount}, Actual: ${packsActualCount}`
          : null,
    })
    .where(eq(finishedGoodsReceiving.id, receiving.id))
    .returning();

  return updated;
}

// =============================================================================
// List FG receiving per unit — untuk dialog konfirmasi gudang
// =============================================================================

export async function getFinishedGoodsForShift(shiftId: string) {
  const rows = await db
    .select()
    .from(finishedGoodsReceiving)
    .where(eq(finishedGoodsReceiving.shiftReportId, shiftId));
  return rows;
}

// =============================================================================
// Create Carton
// =============================================================================

export async function createCarton(input: {
  plantId: string;
  productId: string;
  capacityPack?: number;
  unit?: CartonUnit;
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
      unit: input.unit ?? "PACK",
      capacityPack: input.capacityPack ?? 50,
      openedBy: input.openedBy,
    })
    .returning();

  return ctn;
}

// =============================================================================
// Add Content to Carton — sumber HLP_PACK (pack langsung) atau STAGE
// (output WR / SLOP / BAL dari batch_stage_event). Satu karton = satu unit.
// =============================================================================

export type AddContentInput = {
  cartonId: string;
  plantId: string;
  addedBy: string;
  packQty: number; // jumlah satuan (pack/slop/bal sesuai unit karton)
} & (
  | { sourceType: "HLP_PACK"; hlpPackId: string }
  | { sourceType: "STAGE"; batchId: string; stage: ChainStage }
);

// Tersedia per (batch, stage): sisa yang bisa dikartonkan.
// 0032: sisa TERCATAT operator = angka resmi — bila ada event stage berikutnya
// yang mengisi sisa_qty, pakai Σ(sisa_qty) event itu; kalau tidak (data lama),
// fallback rumus: Σoutput(stage) − Σinput(stage berikutnya). Lalu − dialokasikan.
async function getStageAvailabilityForBatch(batchId: string, stage: ChainStage) {
  const [outRow] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${batchStageEvent.outputQty}), 0)`.mapWith(Number),
    })
    .from(batchStageEvent)
    .where(
      and(
        eq(batchStageEvent.batchId, batchId),
        eq(batchStageEvent.stage, stage),
        isNull(batchStageEvent.deletedAt)
      )
    );

  const next = NEXT_STAGE[stage];
  let nextInput = 0;
  let sisa = 0;
  if (next) {
    // Sisa tercatat di event stage berikutnya (0032)
    const nextRows = await db
      .select({ inputQty: batchStageEvent.inputQty, sisaQty: batchStageEvent.sisaQty })
      .from(batchStageEvent)
      .where(
        and(
          eq(batchStageEvent.batchId, batchId),
          eq(batchStageEvent.stage, next),
          isNull(batchStageEvent.deletedAt)
        )
      );
    nextInput = nextRows.reduce((s, r) => s + Number(r.inputQty ?? 0), 0);
    const hasRecordedSisa = nextRows.some((r) => r.sisaQty != null);
    sisa = hasRecordedSisa
      ? nextRows.reduce((s, r) => s + (r.sisaQty == null ? 0 : Number(r.sisaQty)), 0)
      : Number(outRow?.total ?? 0) - nextInput;
  } else {
    // BAL: tidak ada konversi sesudahnya — sisa = seluruh output
    sisa = Number(outRow?.total ?? 0);
  }

  const [allocRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${cartonContent.packQty}), 0)` })
    .from(cartonContent)
    .where(
      and(
        eq(cartonContent.batchId, batchId),
        eq(cartonContent.stage, stage)
      )
    );

  const outputTotal = Number(outRow?.total ?? 0);
  const allocated = Number(allocRow?.total ?? 0);
  const available = Math.max(0, sisa - allocated);

  return { outputTotal, nextInput, allocated, available };
}

export async function addContentToCarton(input: AddContentInput) {
  if (!Number.isInteger(input.packQty) || input.packQty < 1) {
    throw new ServiceError("INVALID_PACK_QTY", "Jumlah harus integer minimal 1.");
  }

  // Validasi carton OPEN
  const [ctn] = await db
    .select()
    .from(carton)
    .where(eq(carton.id, input.cartonId))
    .limit(1);

  if (!ctn) throw new ServiceError("CARTON_NOT_FOUND", "Karton tidak ditemukan.");
  if (ctn.status !== "OPEN") {
    throw new ServiceError("CARTON_NOT_OPEN", "Hanya karton status OPEN yang bisa diisi.");
  }

  // Isi karton saat ini (jumlah satuan — semua isi se-unit dengan karton)
  const [fillRow] = await db
    .select({ total: sql<number>`COALESCE(SUM(${cartonContent.packQty}), 0)` })
    .from(cartonContent)
    .where(eq(cartonContent.cartonId, input.cartonId));

  const currentFill = Number(fillRow?.total ?? 0);
  if (currentFill + input.packQty > ctn.capacityPack) {
    throw new ServiceError(
      "CARTON_FULL",
      `Kapasitas karton ${ctn.capacityPack} ${ctn.unit.toLowerCase()} — sisa ${ctn.capacityPack - currentFill}.`,
      { capacity: ctn.capacityPack, currentFill, unit: ctn.unit }
    );
  }

  if (input.sourceType === "HLP_PACK") {
    if (ctn.unit !== "PACK") {
      throw new ServiceError(
        "UNIT_MISMATCH",
        `Karton unit ${ctn.unit} tidak menerima pack HLP.`,
        { cartonUnit: ctn.unit, sourceUnit: "PACK" }
      );
    }

    const [pack] = await db
      .select({ packsLolos: hlpPack.packsLolos })
      .from(hlpPack)
      .where(eq(hlpPack.id, input.hlpPackId))
      .limit(1);

    if (!pack) throw new ServiceError("PACK_NOT_FOUND", "Pack tidak ditemukan.");

    // Total pack batch ini yang sudah dialokasikan ke SEMUA karton
    // (hanya baris sumber HLP — baris STAGE tidak ikut dihitung)
    const [allocRow] = await db
      .select({ total: sql<number>`COALESCE(SUM(${cartonContent.packQty}), 0)` })
      .from(cartonContent)
      .where(
        and(
          eq(cartonContent.hlpPackId, input.hlpPackId),
          eq(cartonContent.sourceType, "HLP_PACK")
        )
      );

    const allocated = Number(allocRow?.total ?? 0);
    if (allocated + input.packQty > pack.packsLolos) {
      throw new ServiceError(
        "PACK_INSUFFICIENT",
        `Sisa pack batch ini ${pack.packsLolos - allocated} pack.`,
        { packsLolos: pack.packsLolos, allocated }
      );
    }

    await db
      .insert(cartonContent)
      .values({
        cartonId: input.cartonId,
        plantId: input.plantId,
        sourceType: "HLP_PACK",
        hlpPackId: input.hlpPackId,
        packQty: input.packQty,
        addedBy: input.addedBy,
      })
      .onConflictDoUpdate({
        target: [cartonContent.cartonId, cartonContent.hlpPackId],
        set: { packQty: sql`${cartonContent.packQty} + ${input.packQty}` },
      });
  } else {
    const sourceUnit = STAGE_UNIT[input.stage];
    if (ctn.unit !== sourceUnit) {
      throw new ServiceError(
        "UNIT_MISMATCH",
        `Karton unit ${ctn.unit} tidak menerima hasil ${input.stage} (unit ${sourceUnit}).`,
        { cartonUnit: ctn.unit, sourceUnit }
      );
    }

    const [b] = await db
      .select({ id: batch.id, source: batch.source, code: batch.code })
      .from(batch)
      .where(eq(batch.id, input.batchId))
      .limit(1);

    if (!b) throw new ServiceError("BATCH_NOT_FOUND", "Batch tidak ditemukan.");
    if (b.source !== "INTERNAL") {
      throw new ServiceError(
        "NOT_INTERNAL_BATCH",
        "Batch external (makloon) keluar lewat alur makloon, bukan karton.",
        { batchCode: b.code, source: b.source }
      );
    }

    const avail = await getStageAvailabilityForBatch(input.batchId, input.stage);
    if (avail.available < input.packQty) {
      throw new ServiceError(
        "STAGE_OUTPUT_INSUFFICIENT",
        `Sisa hasil ${input.stage} batch ${b.code} tinggal ${avail.available} ${sourceUnit}.`,
        { ...avail }
      );
    }

    await db
      .insert(cartonContent)
      .values({
        cartonId: input.cartonId,
        plantId: input.plantId,
        sourceType: "STAGE",
        batchId: input.batchId,
        stage: input.stage,
        packQty: input.packQty,
        addedBy: input.addedBy,
      })
      .onConflictDoUpdate({
        target: [cartonContent.cartonId, cartonContent.batchId, cartonContent.stage],
        targetWhere: sql`${cartonContent.sourceType} = 'STAGE'`,
        set: { packQty: sql`${cartonContent.packQty} + ${input.packQty}` },
      });
  }

  // Update actual count (jumlah satuan — isi se-unit dengan karton)
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
// Stage Availability — daftar (batch, stage) dengan sisa yang bisa
// dikartonkan, untuk dropdown "Sumber Isi" gudang outbound.
// =============================================================================

export async function getStageAvailability(
  plantId: string,
  stage?: ChainStage
): Promise<
  Array<{
    batchId: string;
    batchCode: string;
    stage: ChainStage;
    unit: string;
    outputTotal: number;
    nextInput: number;
    allocated: number;
    available: number;
  }>
> {
  const stages: ChainStage[] = stage ? [stage] : ["WR", "SLOP", "BAL"];
  const out: Awaited<ReturnType<typeof getStageAvailability>> = [];

  for (const s of stages) {
    const [outRow] = await db
      .select({
        total: sql<number>`COALESCE(SUM(${batchStageEvent.outputQty}), 0)`.mapWith(Number),
      })
      .from(batchStageEvent)
      .where(
        and(
          eq(batchStageEvent.stage, s),
          isNull(batchStageEvent.deletedAt),
          eq(batchStageEvent.plantId, plantId)
        )
      );
    const totalOutput = Number(outRow?.total ?? 0);
    if (totalOutput === 0) continue;

    const batches = await db
      .select({ id: batch.id, code: batch.code })
      .from(batch)
      .where(and(eq(batch.source, "INTERNAL"), eq(batch.plantId, plantId)));

    for (const b of batches) {
      const avail = await getStageAvailabilityForBatch(b.id, s);
      if (avail.available <= 0) continue;
      out.push({
        batchId: b.id,
        batchCode: b.code,
        stage: s,
        unit: STAGE_UNIT[s],
        ...avail,
      });
    }
  }

  return out;
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
      sourceType: cartonContent.sourceType,
      stage: cartonContent.stage,
      packQty: cartonContent.packQty,
      hlpPackId: cartonContent.hlpPackId,
      batchId: batch.id,
      batchCode: batch.code,
      isMakloonTsg: batch.isMakloonTsg,
      makloonCustomer: batch.makloonCustomer,
      makloonTarget: batch.makloonTarget,
      machineId: batch.machineId,
      shiftReportId: batch.shiftReportId,
      reportDate: shiftReport.reportDate,
      productCode: product.code,
    })
    .from(cartonContent)
    // Isi STAGE tidak punya hlp_pack — pakai leftJoin + coalesce agar tidak hilang
    .leftJoin(hlpPack, eq(cartonContent.hlpPackId, hlpPack.id))
    .leftJoin(
      batch,
      eq(sql`COALESCE(${cartonContent.batchId}, ${hlpPack.batchId})`, batch.id)
    )
    .leftJoin(shiftReport, eq(batch.shiftReportId, shiftReport.id))
    .leftJoin(product, eq(shiftReport.productId, product.id))
    .where(eq(cartonContent.cartonId, ctn.id));

  return {
    cartonCode: ctn.code,
    unit: ctn.unit,
    actualPackCount: ctn.actualPackCount,
    status: ctn.status,
    contents: contents.map((c) => ({
      sourceType: c.sourceType,
      stage: c.stage,
      packQty: c.packQty,
      hlpPackId: c.hlpPackId,
      batchId: c.batchId,
      batchCode: c.batchCode,
      isMakloonTsg: c.isMakloonTsg,
      makloonCustomer: c.makloonCustomer,
      makloonTarget: c.makloonTarget,
      machineId: c.machineId,
      shiftReportId: c.shiftReportId,
      reportDate: c.reportDate,
      productCode: c.productCode,
    })),
  };
}
