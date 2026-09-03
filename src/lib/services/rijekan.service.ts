// =============================================================================
// Rijekan Ledger Service — pembukuan rijekan (docs/23 §5, docs/26 §3)
// =============================================================================
// Pool waste terstruktur: setiap entry IN membawa identitas lot — jenis TSG
// (tsgType) + asal (INTERNAL | MAKLOON) + order makloon (makloonOrderId),
// di-derive dari sumbernya (bukan input manual). Satuan berdampingan
// (KG & BATANG & PACK/SLOP/BAL) — tanpa konversi paksa.
//
// Sumber masuk:
//  - Settle waste RIJEKAN (kg)  → IN_MAKER_WASTE
//  - Settle waste MENIR (kg)    → IN_MAKER_MENIR (baru — docs/26 §3.2)
//  - Reject HLP (batang)        → IN_HLP_REJECT
//  - Reject stage WR/SLOP/BAL   → IN_STAGE_REJECT (baru — docs/26 §3.2)
// Keluar (OUT_REPROSES) dicatat saat reproses dibuat (docs/26 §4).
// =============================================================================

import { eq, and, or, gte, lte, desc, inArray, sql } from "drizzle-orm";
import db from "@/db";
import {
  rijekanLedger,
  rijekanAllocation,
  rijekanReturn,
  rijekanReturnItem,
} from "@/db/schema/hlp";
import {
  batch,
  shiftReport,
  product,
  makloonOrder,
  tsgReceiving,
  tsgReceivingBox,
  tsgInventory,
  tsgSupplier,
  user,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { ServiceError } from "./shift.service";

export type RijekanEntryType =
  | "IN_MAKER_WASTE"
  | "IN_MAKER_MENIR"
  | "IN_HLP_REJECT"
  | "IN_STAGE_REJECT"
  | "OUT_REPROSES";
export type RijekanUnit = "KG" | "BATANG" | "PACK" | "SLOP" | "BAL";
export type RijekanOrigin = "INTERNAL" | "MAKLOON";

export interface AddRijekanEntryInput {
  plantId: string;
  entryType: RijekanEntryType;
  quantity: number;
  unit: RijekanUnit;
  refId?: string | null;
  note?: string | null;
  // Identitas lot (docs/26 §3) — di-derive dari sumber oleh caller
  tsgType?: string | null;
  origin?: RijekanOrigin;
  makloonOrderId?: string | null;
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
    tsgType: input.tsgType ?? null,
    origin: input.origin ?? "INTERNAL",
    makloonOrderId: input.makloonOrderId ?? null,
  });
}

// =============================================================================
// Derive identitas lot (jenis + asal + order) — docs/26 §3.2
// =============================================================================

export interface RijekanContext {
  tsgType: string | null;
  origin: RijekanOrigin;
  makloonOrderId: string | null;
  makloonCustomer: string | null;
}

/** Derive dari batch — untuk reject HLP & stage WR/SLOP/BAL. */
export async function deriveRijekanContextFromBatch(batchId: string): Promise<RijekanContext> {
  const [b] = await db
    .select({
      source: batch.source,
      isMakloonTsg: batch.isMakloonTsg,
      makloonOrderId: batch.makloonOrderId,
      shiftReportId: batch.shiftReportId,
    })
    .from(batch)
    .where(eq(batch.id, batchId))
    .limit(1);
  if (!b) {
    return { tsgType: null, origin: "INTERNAL", makloonOrderId: null, makloonCustomer: null };
  }

  const origin: RijekanOrigin =
    b.source === "EXTERNAL" || b.isMakloonTsg ? "MAKLOON" : "INTERNAL";

  if (b.makloonOrderId) {
    const [o] = await db
      .select({ tsgType: makloonOrder.tsgType, customer: makloonOrder.customer })
      .from(makloonOrder)
      .where(eq(makloonOrder.id, b.makloonOrderId))
      .limit(1);
    return {
      tsgType: o?.tsgType ?? null,
      origin,
      makloonOrderId: b.makloonOrderId,
      makloonCustomer: o?.customer ?? null,
    };
  }

  // Batch internal tanpa order: jenis dari produk shift (0033 — satu jenis per produk)
  if (b.shiftReportId) {
    const [s] = await db
      .select({ tsgType: product.tsgType })
      .from(shiftReport)
      .innerJoin(product, eq(shiftReport.productId, product.id))
      .where(eq(shiftReport.id, b.shiftReportId))
      .limit(1);
    return { tsgType: s?.tsgType ?? null, origin, makloonOrderId: null, makloonCustomer: null };
  }

  // EXTERNAL tanpa order (data lama): jenis tidak diketahui
  return { tsgType: null, origin, makloonOrderId: null, makloonCustomer: null };
}

/** Derive dari shift — untuk settle waste MAKER (RIJEKAN & MENIR). */
export async function deriveRijekanContextFromShift(shiftId: string): Promise<RijekanContext> {
  const [s] = await db
    .select({ tsgType: product.tsgType })
    .from(shiftReport)
    .innerJoin(product, eq(shiftReport.productId, product.id))
    .where(eq(shiftReport.id, shiftId))
    .limit(1);

  // Asal: kalau ada batch makloon di shift ini → MAKLOON (waste per shift
  // tidak dipecah per asal — keputusan sederhana; input per-kejadian tetap
  // tercatat di ledger lewat reject HLP/stage yang per batch).
  const [mb] = await db
    .select({ makloonOrderId: batch.makloonOrderId, makloonCustomer: batch.makloonCustomer })
    .from(batch)
    .where(
      and(
        eq(batch.shiftReportId, shiftId),
        or(eq(batch.isMakloonTsg, true), eq(batch.source, "EXTERNAL"))
      )
    )
    .limit(1);

  if (mb) {
    let customer = mb.makloonCustomer ?? null;
    if (mb.makloonOrderId) {
      const [o] = await db
        .select({ customer: makloonOrder.customer })
        .from(makloonOrder)
        .where(eq(makloonOrder.id, mb.makloonOrderId))
        .limit(1);
      customer = o?.customer ?? customer;
    }
    return {
      tsgType: s?.tsgType ?? null,
      origin: "MAKLOON",
      makloonOrderId: mb.makloonOrderId ?? null,
      makloonCustomer: customer,
    };
  }

  return { tsgType: s?.tsgType ?? null, origin: "INTERNAL", makloonOrderId: null, makloonCustomer: null };
}

// =============================================================================
// Overview
// =============================================================================

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
    .limit(500);

  const sum = (type: string, unit: string) =>
    rows
      .filter((r) => r.entryType === type && r.unit === unit)
      .reduce((s, r) => s + Number(r.quantity), 0);

  // KG masuk = waste RIJEKAN + MENIR (docs/26 §3.2 — menir ikut pool)
  const inKg = sum("IN_MAKER_WASTE", "KG") + sum("IN_MAKER_MENIR", "KG");
  const outKg = sum("OUT_REPROSES", "KG");
  const inBatang = sum("IN_HLP_REJECT", "BATANG");
  const outBatang = sum("OUT_REPROSES", "BATANG");
  // Reject stage — satuan PACK/SLOP/BAL berdampingan
  const inStage = {
    PACK: sum("IN_STAGE_REJECT", "PACK"),
    SLOP: sum("IN_STAGE_REJECT", "SLOP"),
    BAL: sum("IN_STAGE_REJECT", "BAL"),
  };
  const outStage = {
    PACK: sum("OUT_REPROSES", "PACK"),
    SLOP: sum("OUT_REPROSES", "SLOP"),
    BAL: sum("OUT_REPROSES", "BAL"),
  };

  return {
    summary: {
      inKg,
      outKg,
      saldoKg: Math.round((inKg - outKg) * 100) / 100,
      inBatang,
      outBatang,
      saldoBatang: inBatang - outBatang,
      inStage,
      outStage,
      saldoStage: {
        PACK: inStage.PACK - outStage.PACK,
        SLOP: inStage.SLOP - outStage.SLOP,
        BAL: inStage.BAL - outStage.BAL,
      },
    },
    data: rows.map((r) => ({ ...r, quantity: Number(r.quantity) })),
  };
}

// =============================================================================
// Pool — rijek tersedia untuk reproses / serah terima (docs/26 §3.3)
// =============================================================================

const IN_ENTRY_TYPES = ["IN_MAKER_WASTE", "IN_MAKER_MENIR", "IN_HLP_REJECT", "IN_STAGE_REJECT"] as const;

export interface RijekanPoolGroup {
  origin: RijekanOrigin;
  tsgType: string | null;
  unit: string;
  makloonOrderId: string | null;
  makloonCustomer: string | null;
  availableQty: number;
}

export interface RijekanPoolResult {
  groups: RijekanPoolGroup[];
  /** Lot tersedia (untuk form reproses & serah terima) */
  lots: Array<{
    id: string;
    entryType: string;
    unit: string;
    tsgType: string | null;
    origin: RijekanOrigin;
    makloonOrderId: string | null;
    originalQty: number;
    allocatedQty: number;
    returnedQty: number;
    availableQty: number;
    createdAt: string;
  }>;
}

export async function getRijekanPool(plantId: string): Promise<RijekanPoolResult> {
  const entries = await db
    .select()
    .from(rijekanLedger)
    .where(and(eq(rijekanLedger.plantId, plantId), inArray(rijekanLedger.entryType, [...IN_ENTRY_TYPES])))
    .orderBy(desc(rijekanLedger.createdAt))
    .limit(500);

  const allocs = await db
    .select({ ledgerEntryId: rijekanAllocation.ledgerEntryId, qty: rijekanAllocation.qty })
    .from(rijekanAllocation)
    .where(eq(rijekanAllocation.plantId, plantId));

  const returns = await db
    .select({ ledgerEntryId: rijekanReturnItem.ledgerEntryId, qty: rijekanReturnItem.qty })
    .from(rijekanReturnItem)
    .where(eq(rijekanReturnItem.plantId, plantId));

  // Nama pemesan order untuk label kelompok makloon
  const orders = await db
    .select({ id: makloonOrder.id, customer: makloonOrder.customer })
    .from(makloonOrder)
    .where(eq(makloonOrder.plantId, plantId));
  const orderCustomer = new Map(orders.map((o) => [o.id, o.customer]));

  const sum = (rows: Array<{ ledgerEntryId: string; qty: unknown }>, id: string) =>
    rows
      .filter((r) => r.ledgerEntryId === id)
      .reduce((s, r) => s + Number(r.qty), 0);

  const lots = entries
    .map((e) => {
      const originalQty = Number(e.quantity);
      const allocatedQty = sum(allocs, e.id);
      const returnedQty = sum(returns, e.id);
      return {
        id: e.id,
        entryType: e.entryType,
        unit: e.unit,
        tsgType: e.tsgType,
        origin: e.origin as RijekanOrigin,
        makloonOrderId: e.makloonOrderId,
        originalQty,
        allocatedQty,
        returnedQty,
        availableQty: Math.round((originalQty - allocatedQty - returnedQty) * 1000) / 1000,
        createdAt: e.createdAt.toISOString(),
      };
    })
    .filter((l) => l.availableQty > 0.001);

  // Kelompokkan per (asal × jenis × satuan × order)
  const groupMap = new Map<string, RijekanPoolGroup>();
  for (const l of lots) {
    const key = `${l.origin}|${l.tsgType ?? ""}|${l.unit}|${l.makloonOrderId ?? ""}`;
    const existing = groupMap.get(key);
    if (existing) {
      existing.availableQty = Math.round((existing.availableQty + l.availableQty) * 1000) / 1000;
    } else {
      groupMap.set(key, {
        origin: l.origin,
        tsgType: l.tsgType,
        unit: l.unit,
        makloonOrderId: l.makloonOrderId,
        makloonCustomer: l.makloonOrderId ? (orderCustomer.get(l.makloonOrderId) ?? null) : null,
        availableQty: l.availableQty,
      });
    }
  }

  const groups = [...groupMap.values()].sort((a, b) => {
    const o = a.origin.localeCompare(b.origin);
    if (o !== 0) return o;
    const t = (a.tsgType ?? "").localeCompare(b.tsgType ?? "");
    if (t !== 0) return t;
    return a.unit.localeCompare(b.unit);
  });

  return { groups, lots };
}

// =============================================================================
// Reproses rijek → TSG (docs/26 §4)
// =============================================================================

export interface ProcessRijekanInput {
  plantId: string;
  actorUserId: string;
  tsgType: "REGULER" | "MILD" | "PUTIHAN"; // hasil = jenis yang sama dengan lot
  lots: Array<{ ledgerEntryId: string; qty: number }>;
  weightKg: number; // berat timbang aktual saat pembentukan TSG baru
  note?: string;
}

// Kode boks unik global (pola nextBoxCodes di supplier-sj.service)
async function nextReprosesBoxCode(): Promise<string> {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `TSG-${datePart}-`;
  const sjRows = await db
    .select({ boxCode: tsgReceivingBox.boxCode })
    .from(tsgReceivingBox)
    .where(sql`${tsgReceivingBox.boxCode} LIKE ${prefix + "%"}`);
  let maxSeq = 0;
  for (const r of sjRows) {
    const m = /-(\d+)$/.exec(r.boxCode);
    if (m?.[1]) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }
  return `${prefix}${String(maxSeq + 1).padStart(3, "0")}`;
}

export async function processRijekanReproses(input: ProcessRijekanInput) {
  if (!["REGULER", "MILD", "PUTIHAN"].includes(input.tsgType)) {
    throw new ServiceError("INVALID_TSG_TYPE", "Jenis TSG hasil reproses tidak valid.");
  }
  if (input.lots.length === 0) {
    throw new ServiceError("LOT_REQUIRED", "Pilih minimal satu lot rijekan.");
  }
  if (input.weightKg <= 0 || input.weightKg > 10000) {
    throw new ServiceError("INVALID_KG", "Berat timbang harus 0-10000 kg.");
  }

  // Muat lot + saldo alokasi/return untuk validasi sisa tersedia
  const lotIds = input.lots.map((l) => l.ledgerEntryId);
  const rows = await db
    .select()
    .from(rijekanLedger)
    .where(and(eq(rijekanLedger.plantId, input.plantId), inArray(rijekanLedger.id, lotIds)));
  const allocs = await db
    .select({ ledgerEntryId: rijekanAllocation.ledgerEntryId, qty: rijekanAllocation.qty })
    .from(rijekanAllocation)
    .where(and(eq(rijekanAllocation.plantId, input.plantId), inArray(rijekanAllocation.ledgerEntryId, lotIds)));
  const returns = await db
    .select({ ledgerEntryId: rijekanReturnItem.ledgerEntryId, qty: rijekanReturnItem.qty })
    .from(rijekanReturnItem)
    .where(and(eq(rijekanReturnItem.plantId, input.plantId), inArray(rijekanReturnItem.ledgerEntryId, lotIds)));

  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const lot of input.lots) {
    const row = byId.get(lot.ledgerEntryId);
    if (!row) {
      throw new ServiceError("LOT_NOT_FOUND", "Ada lot rijekan yang tidak ditemukan.");
    }
    if (!IN_ENTRY_TYPES.includes(row.entryType as (typeof IN_ENTRY_TYPES)[number])) {
      throw new ServiceError("LOT_NOT_CONSUMABLE", "Hanya lot masuk yang bisa diproses ulang.");
    }
    // Rijek makloon WAJIB dikembalikan ke customer — tidak boleh di-reproses
    if (row.origin !== "INTERNAL") {
      throw new ServiceError(
        "RIJEKAN_MAKLOON_RESTRICTED",
        "Rijek makloon dikembalikan ke customer — tidak bisa diproses ulang."
      );
    }
    if (row.tsgType !== input.tsgType) {
      throw new ServiceError(
        "RIJEKAN_TYPE_MISMATCH",
        `Lot ${row.id.substring(0, 8)} berjenis ${row.tsgType ?? "tidak diketahui"} — reproses ${input.tsgType} hanya boleh memakai lot berjenis sama.`
      );
    }
    const allocated = allocs.filter((a) => a.ledgerEntryId === lot.ledgerEntryId).reduce((s, a) => s + Number(a.qty), 0);
    const returned = returns.filter((a) => a.ledgerEntryId === lot.ledgerEntryId).reduce((s, a) => s + Number(a.qty), 0);
    const remaining = Number(row.quantity) - allocated - returned;
    if (lot.qty <= 0 || lot.qty > remaining + 0.001) {
      throw new ServiceError(
        "RIJEKAN_INSUFFICIENT",
        `Lot ${row.id.substring(0, 8)} tersisa ${Math.round(remaining * 1000) / 1000} ${row.unit} — tidak cukup untuk ${lot.qty}.`
      );
    }
  }

  // Supplier resmi penanda reproses (seed: SUP-INTERNAL)
  const [sup] = await db
    .select({ id: tsgSupplier.id })
    .from(tsgSupplier)
    .where(eq(tsgSupplier.code, "SUP-INTERNAL"))
    .limit(1);
  if (!sup) {
    throw new ServiceError("REPROSES_SUPPLIER_MISSING", "Supplier 'Reproses Internal (Rijekan)' tidak ditemukan di master.");
  }

  // Kode receiving mengikuti pola createReceiving (RCV-<date>-<seq>)
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const existingCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(tsgReceiving)
    .where(and(eq(tsgReceiving.plantId, input.plantId), sql`created_at::date = CURRENT_DATE`));
  const receivingCode = `RCV-${today}-${String((existingCount[0]?.count ?? 0) + 1).padStart(2, "0")}`;
  const boxCode = await nextReprosesBoxCode();

  // Berat acuan per satuan (riwayat rijek) — tampil berdampingan dengan timbang
  const beratAcuan: Record<string, number> = {};
  for (const lot of input.lots) {
    const row = byId.get(lot.ledgerEntryId)!;
    beratAcuan[row.unit] = (beratAcuan[row.unit] ?? 0) + lot.qty;
  }

  const result = await db.transaction(async (tx) => {
    const [header] = await tx
      .insert(tsgReceiving)
      .values({
        plantId: input.plantId,
        supplierId: sup.id,
        receivingCode,
        receivedAt: new Date(),
        receivedBy: input.actorUserId,
        totalBoxCount: 1,
        totalWeightKg: String(input.weightKg),
        source: "MANUAL",
        approvalStatus: "APPROVED", // reproses internal — langsung jadi stok
        notes: input.note?.trim() ? `Reproses rijekan ${input.tsgType} — ${input.note.trim()}` : `Reproses rijekan ${input.tsgType}`,
      })
      .returning();
    if (!header) throw new Error("RECEIVING_CREATE_FAILED");

    const [rb] = await tx
      .insert(tsgReceivingBox)
      .values({
        receivingId: header.id,
        plantId: input.plantId,
        boxCode,
        weightKg: String(input.weightKg),
        boxSeq: 1,
        tsgType: input.tsgType,
        receivedAt: new Date(),
      })
      .returning();
    if (!rb) throw new Error("BOX_CREATE_FAILED");

    await tx.insert(tsgInventory).values({
      plantId: input.plantId,
      boxId: rb.id,
      tsgType: input.tsgType,
      status: "AVAILABLE",
    });

    for (const lot of input.lots) {
      await tx.insert(rijekanAllocation).values({
        plantId: input.plantId,
        ledgerEntryId: lot.ledgerEntryId,
        reprosesReceivingId: header.id,
        qty: String(lot.qty),
        allocatedBy: input.actorUserId,
      });
    }

    // OUT_REPROSES per satuan — jejak keluar (docs/26 §4)
    for (const [unit, qty] of Object.entries(beratAcuan)) {
      await tx.insert(rijekanLedger).values({
        plantId: input.plantId,
        entryType: "OUT_REPROSES",
        quantity: String(qty),
        unit,
        refId: header.id,
        note: `Reproses ${receivingCode}`,
        tsgType: input.tsgType,
        origin: "INTERNAL",
      });
    }

    return { receivingId: header.id, receivingCode };
  });

  await writeAudit({
    actorUserId: input.actorUserId,
    action: "rijekan.reproses",
    entityTable: "tsg_receiving",
    entityId: result.receivingId,
    after: {
      receivingCode: result.receivingCode,
      tsgType: input.tsgType,
      weightKg: input.weightKg,
      beratAcuan,
      lotCount: input.lots.length,
    },
  });

  return {
    receivingId: result.receivingId,
    receivingCode: result.receivingCode,
    tsgType: input.tsgType,
    weightKg: input.weightKg,
    beratAcuan,
  };
}

// =============================================================================
// Serah terima waste makloon (docs/26 §5)
// =============================================================================

export interface ReturnRijekanInput {
  plantId: string;
  actorUserId: string;
  makloonOrderId: string;
  docRef?: string;
  notes?: string;
}

export async function returnRijekanMakloon(input: ReturnRijekanInput) {
  const [order] = await db
    .select()
    .from(makloonOrder)
    .where(and(eq(makloonOrder.id, input.makloonOrderId), eq(makloonOrder.plantId, input.plantId)))
    .limit(1);
  if (!order) {
    throw new ServiceError("ORDER_NOT_FOUND", "Order makloon tidak ditemukan untuk pabrik ini.");
  }

  // Lot MAKLOON tersedia milik order ini
  const entries = await db
    .select()
    .from(rijekanLedger)
    .where(
      and(
        eq(rijekanLedger.plantId, input.plantId),
        eq(rijekanLedger.makloonOrderId, input.makloonOrderId),
        eq(rijekanLedger.origin, "MAKLOON"),
        inArray(rijekanLedger.entryType, [...IN_ENTRY_TYPES])
      )
    );
  const allocs = await db
    .select({ ledgerEntryId: rijekanAllocation.ledgerEntryId, qty: rijekanAllocation.qty })
    .from(rijekanAllocation)
    .where(and(eq(rijekanAllocation.plantId, input.plantId), inArray(rijekanAllocation.ledgerEntryId, entries.map((e) => e.id))));
  const returns = await db
    .select({ ledgerEntryId: rijekanReturnItem.ledgerEntryId, qty: rijekanReturnItem.qty })
    .from(rijekanReturnItem)
    .where(and(eq(rijekanReturnItem.plantId, input.plantId), inArray(rijekanReturnItem.ledgerEntryId, entries.map((e) => e.id))));

  const items = entries
    .map((e) => {
      const allocated = allocs.filter((a) => a.ledgerEntryId === e.id).reduce((s, a) => s + Number(a.qty), 0);
      const returned = returns.filter((a) => a.ledgerEntryId === e.id).reduce((s, a) => s + Number(a.qty), 0);
      const remaining = Number(e.quantity) - allocated - returned;
      return remaining > 0.001 ? { ledgerEntryId: e.id, qty: remaining, unit: e.unit } : null;
    })
    .filter((x): x is { ledgerEntryId: string; qty: number; unit: string } => x !== null);

  if (items.length === 0) {
    throw new ServiceError("NOTHING_TO_RETURN", "Tidak ada waste makloon tersisa untuk diserahterimakan.");
  }

  const result = await db.transaction(async (tx) => {
    const [ret] = await tx
      .insert(rijekanReturn)
      .values({
        plantId: input.plantId,
        makloonOrderId: order.id,
        customer: order.customer,
        docRef: input.docRef?.trim() || null,
        notes: input.notes?.trim() || null,
        returnedBy: input.actorUserId,
      })
      .returning();
    if (!ret) throw new Error("RETURN_CREATE_FAILED");

    for (const item of items) {
      await tx.insert(rijekanReturnItem).values({
        returnId: ret.id,
        plantId: input.plantId,
        ledgerEntryId: item.ledgerEntryId,
        qty: String(item.qty),
        unit: item.unit,
      });
      await tx
        .update(rijekanLedger)
        .set({
          returnedAt: new Date(),
          returnedRef: input.docRef?.trim() || `RTR-${ret.id.substring(0, 8)}`,
        })
        .where(eq(rijekanLedger.id, item.ledgerEntryId));
    }

    return { returnId: ret.id, docRef: input.docRef?.trim() || `RTR-${ret.id.substring(0, 8)}` };
  });

  await writeAudit({
    actorUserId: input.actorUserId,
    action: "rijekan.return",
    entityTable: "rijekan_return",
    entityId: result.returnId,
    after: {
      makloonOrderId: order.id,
      customer: order.customer,
      items: items.map((i) => ({ unit: i.unit, qty: i.qty })),
    },
  });

  return {
    returnId: result.returnId,
    docRef: result.docRef,
    customer: order.customer,
    orderCode: order.code,
    items: items.map((i) => ({ unit: i.unit, qty: Math.round(i.qty * 1000) / 1000 })),
  };
}

export async function getRijekanReturnDetail(returnId: string) {
  const [ret] = await db
    .select()
    .from(rijekanReturn)
    .where(eq(rijekanReturn.id, returnId))
    .limit(1);
  if (!ret) return null;

  const items = await db
    .select()
    .from(rijekanReturnItem)
    .where(eq(rijekanReturnItem.returnId, returnId));

  let orderCode: string | null = null;
  let productName: string | null = null;
  if (ret.makloonOrderId) {
    const [o] = await db
      .select({ code: makloonOrder.code, productName: makloonOrder.productName })
      .from(makloonOrder)
      .where(eq(makloonOrder.id, ret.makloonOrderId))
      .limit(1);
    orderCode = o?.code ?? null;
    productName = o?.productName ?? null;
  }

  const [returner] = await db
    .select({ name: user.fullName })
    .from(user)
    .where(eq(user.id, ret.returnedBy))
    .limit(1);

  return {
    ...ret,
    orderCode,
    productName,
    items: items.map((i) => ({ ...i, qty: Number(i.qty) })),
    returnerName: returner?.name ?? null,
  };
}
