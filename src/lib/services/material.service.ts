// =============================================================================
// Material Service — Receiving Consumable & Sparepart, Stock, Usage
// =============================================================================

import { eq, and, sql, gte, lte } from "drizzle-orm";
import db from "@/db";
import {
  materialReceiving,
  consumableReceivingItem,
  sparepartReceivingItem,
  tsgSupplier,
  materialOut,
  consumableOutItem,
  sparepartOutItem,
} from "@/db/schema";
import { tsgBoxConsumption, maintenanceEvent, tsgBoxProcess, shiftConsumption } from "@/db/schema/box";
import { shiftReport } from "@/db/schema/shift";
import { consumableItem, sparepart, machine } from "@/db/schema/master-product";
import { ServiceError } from "./shift.service";
export { ServiceError } from "./shift.service";

// =============================================================================
// Types
// =============================================================================

export type MaterialType = "CONSUMABLE" | "SPAREPART";

export interface CreateMaterialReceivingInput {
  plantId: string;
  supplierId: string;
  materialType: MaterialType;
  receivedAt?: Date;
  receivedBy: string;
  supplierDocRef?: string;
  notes?: string;
  items: Array<{ itemId: string; quantity: number; unitPrice?: number }>;
}

// =============================================================================
// Create Material Receiving
// =============================================================================

export async function createMaterialReceiving(input: CreateMaterialReceivingInput) {
  // Validasi supplier aktif
  const [supplier] = await db
    .select({ isActive: tsgSupplier.isActive })
    .from(tsgSupplier)
    .where(eq(tsgSupplier.id, input.supplierId))
    .limit(1);

  if (!supplier) throw new ServiceError("SUPPLIER_NOT_FOUND", "Supplier tidak ditemukan.");
  if (!supplier.isActive) {
    throw new ServiceError("SUPPLIER_INACTIVE", "Supplier tidak aktif.");
  }

  if (input.items.length === 0) {
    throw new ServiceError("EMPTY_ITEMS", "Minimal 1 item.");
  }

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // Generate receiving code — count hari ini + 1, per plant
  const existingCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(materialReceiving)
    .where(
      and(
        eq(materialReceiving.plantId, input.plantId),
        sql`created_at::date = CURRENT_DATE`
      )
    );

  const seq = Number(existingCount[0]?.count ?? 0) + 1;
  const receivingCode = `RCV-${today}-${String(seq).padStart(2, "0")}`;

  const result = await db.transaction(async (tx) => {
    const [header] = await tx
      .insert(materialReceiving)
      .values({
        plantId: input.plantId,
        supplierId: input.supplierId,
        receivingCode,
        receivedAt: input.receivedAt ?? new Date(),
        receivedBy: input.receivedBy,
        materialType: input.materialType,
        supplierDocRef: input.supplierDocRef ?? null,
        notes: input.notes ?? null,
      })
      .returning();

    if (!header) throw new Error("RECEIVING_CREATE_FAILED");

    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i]!;
      if (input.materialType === "CONSUMABLE") {
        await tx.insert(consumableReceivingItem).values({
          receivingId: header.id,
          plantId: input.plantId,
          consumableItemId: item.itemId,
          quantity: String(item.quantity),
          unitPrice: item.unitPrice != null ? String(item.unitPrice) : null,
          seq: i + 1,
        });
      } else {
        await tx.insert(sparepartReceivingItem).values({
          receivingId: header.id,
          plantId: input.plantId,
          sparepartId: item.itemId,
          quantity: Math.round(item.quantity),
          unitPrice: item.unitPrice != null ? String(item.unitPrice) : null,
          seq: i + 1,
        });
      }
    }

    return header;
  });

  return {
    receivingId: result.id,
    receivingCode: result.receivingCode,
    materialType: input.materialType,
    totalItems: input.items.length,
  };
}

// =============================================================================
// List Material Receiving
// =============================================================================

export async function listMaterialReceiving(params: {
  plantId?: string;
  from?: string;
  to?: string;
  materialType?: MaterialType;
  limit?: number;
}) {
  const conditions = [];
  if (params.plantId) conditions.push(eq(materialReceiving.plantId, params.plantId));
  if (params.materialType) conditions.push(eq(materialReceiving.materialType, params.materialType));
  if (params.from) conditions.push(gte(materialReceiving.receivedAt, new Date(params.from)));
  if (params.to) conditions.push(lte(materialReceiving.receivedAt, new Date(params.to + "T23:59:59.999Z")));

  const limit = Math.min(params.limit ?? 100, 300);

  const items = await db
    .select({
      id: materialReceiving.id,
      receivingCode: materialReceiving.receivingCode,
      supplierId: materialReceiving.supplierId,
      receivedAt: materialReceiving.receivedAt,
      materialType: materialReceiving.materialType,
      supplierDocRef: materialReceiving.supplierDocRef,
      notes: materialReceiving.notes,
      supplierName: tsgSupplier.name,
      supplierCode: tsgSupplier.code,
    })
    .from(materialReceiving)
    .leftJoin(tsgSupplier, eq(materialReceiving.supplierId, tsgSupplier.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(sql`${materialReceiving.receivedAt} DESC`)
    .limit(limit);

  // Attach items
  for (const r of items) {
    if (r.materialType === "CONSUMABLE") {
      const rows = await db
        .select({
          id: consumableReceivingItem.id,
          itemId: consumableReceivingItem.consumableItemId,
          quantity: consumableReceivingItem.quantity,
          unitPrice: consumableReceivingItem.unitPrice,
          itemName: consumableItem.name,
          itemUnit: consumableItem.unit,
        })
        .from(consumableReceivingItem)
        .leftJoin(consumableItem, eq(consumableReceivingItem.consumableItemId, consumableItem.id))
        .where(eq(consumableReceivingItem.receivingId, r.id))
        .orderBy(consumableReceivingItem.seq);
      (r as any).items = rows;
    } else {
      const rows = await db
        .select({
          id: sparepartReceivingItem.id,
          itemId: sparepartReceivingItem.sparepartId,
          quantity: sparepartReceivingItem.quantity,
          unitPrice: sparepartReceivingItem.unitPrice,
          itemName: sparepart.name,
          itemUnit: sparepart.unit,
        })
        .from(sparepartReceivingItem)
        .leftJoin(sparepart, eq(sparepartReceivingItem.sparepartId, sparepart.id))
        .where(eq(sparepartReceivingItem.receivingId, r.id))
        .orderBy(sparepartReceivingItem.seq);
      (r as any).items = rows;
    }
  }

  return { data: items };
}

// =============================================================================
// Get Material Stock — computed: masuk − terpakai per item
// =============================================================================

export async function getMaterialStock(plantId: string, materialType: MaterialType) {
  if (materialType === "CONSUMABLE") {

    const receivedRows = await db
      .select({
        itemId: consumableReceivingItem.consumableItemId,
        total: sql<number>`COALESCE(SUM(${consumableReceivingItem.quantity}::decimal), 0)`.mapWith(Number),
        totalValue: sql<number>`COALESCE(SUM(${consumableReceivingItem.quantity}::decimal * COALESCE(${consumableReceivingItem.unitPrice}::decimal, 0)), 0)`.mapWith(Number),
      })
      .from(consumableReceivingItem)
      .innerJoin(materialReceiving, eq(consumableReceivingItem.receivingId, materialReceiving.id))
      .where(eq(materialReceiving.plantId, plantId))
      .groupBy(consumableReceivingItem.consumableItemId);

    const boxUsedRows = await db
      .select({
        itemId: tsgBoxConsumption.consumableItemId,
        total: sql<number>`COALESCE(SUM(${tsgBoxConsumption.quantity}::decimal), 0)`.mapWith(Number),
      })
      .from(tsgBoxConsumption)
      .where(eq(tsgBoxConsumption.plantId, plantId))
      .groupBy(tsgBoxConsumption.consumableItemId);

    const shiftUsedRows = await db
      .select({
        itemId: shiftConsumption.consumableItemId,
        total: sql<number>`COALESCE(SUM(${shiftConsumption.quantity}::decimal), 0)`.mapWith(Number),
      })
      .from(shiftConsumption)
      .where(eq(shiftConsumption.plantId, plantId))
      .groupBy(shiftConsumption.consumableItemId);

    const outRows = await db
      .select({
        itemId: consumableOutItem.consumableItemId,
        total: sql<number>`COALESCE(SUM(${consumableOutItem.quantity}::decimal), 0)`.mapWith(Number),
      })
      .from(consumableOutItem)
      .where(eq(consumableOutItem.plantId, plantId))
      .groupBy(consumableOutItem.consumableItemId);

    const items = await db
      .select({ id: consumableItem.id, code: consumableItem.code, name: consumableItem.name, unit: consumableItem.unit })
      .from(consumableItem)
      .orderBy(consumableItem.code);

    const receivedMap = new Map(receivedRows.map((r) => [r.itemId, { total: r.total, totalValue: r.totalValue }]));
    const usedMap = new Map(boxUsedRows.map((r) => [r.itemId, r.total]));
    // Gabungkan pemakaian shift-level
    for (const r of shiftUsedRows) {
      usedMap.set(r.itemId, (usedMap.get(r.itemId) ?? 0) + r.total);
    }
    // Gabungkan keluar (transfer/retur)
    for (const r of outRows) {
      usedMap.set(r.itemId, (usedMap.get(r.itemId) ?? 0) + r.total);
    }

    return items.map((it) => {
      const masuk = receivedMap.get(it.id)?.total ?? 0;
      const terpakai = usedMap.get(it.id) ?? 0;
      const sisa = Math.round((masuk - terpakai) * 100) / 100;
      const avgPrice = masuk > 0 ? (receivedMap.get(it.id)?.totalValue ?? 0) / masuk : 0;
      return {
        itemId: it.id,
        code: it.code,
        name: it.name,
        unit: it.unit,
        masuk,
        terpakai,
        sisa,
        avgPrice: Math.round(avgPrice * 100) / 100,
        nilaiStok: Math.round(sisa * avgPrice * 100) / 100,
      };
    });
  }

  // SPAREPART

  const receivedRows = await db
    .select({
      itemId: sparepartReceivingItem.sparepartId,
      total: sql<number>`COALESCE(SUM(${sparepartReceivingItem.quantity}), 0)`.mapWith(Number),
      totalValue: sql<number>`COALESCE(SUM(${sparepartReceivingItem.quantity} * COALESCE(${sparepartReceivingItem.unitPrice}::decimal, 0)), 0)`.mapWith(Number),
    })
    .from(sparepartReceivingItem)
    .innerJoin(materialReceiving, eq(sparepartReceivingItem.receivingId, materialReceiving.id))
    .where(eq(materialReceiving.plantId, plantId))
    .groupBy(sparepartReceivingItem.sparepartId);

  const usedRows = await db
    .select({
      itemId: maintenanceEvent.sparepartId,
      total: sql<number>`COALESCE(SUM(${maintenanceEvent.quantity}), 0)`.mapWith(Number),
    })
    .from(maintenanceEvent)
    .where(eq(maintenanceEvent.plantId, plantId))
    .groupBy(maintenanceEvent.sparepartId);

  const outRows = await db
    .select({
      itemId: sparepartOutItem.sparepartId,
      total: sql<number>`COALESCE(SUM(${sparepartOutItem.quantity}), 0)`.mapWith(Number),
    })
    .from(sparepartOutItem)
    .where(eq(sparepartOutItem.plantId, plantId))
    .groupBy(sparepartOutItem.sparepartId);

  const items = await db
    .select({ id: sparepart.id, code: sparepart.code, name: sparepart.name, unit: sparepart.unit })
    .from(sparepart)
    .orderBy(sparepart.code);

  const receivedMap = new Map(receivedRows.map((r) => [r.itemId, { total: r.total, totalValue: r.totalValue }]));
  const usedMap = new Map(usedRows.map((r) => [r.itemId, r.total]));
  for (const r of outRows) {
    usedMap.set(r.itemId, (usedMap.get(r.itemId) ?? 0) + r.total);
  }

  return items.map((it) => {
    const masuk = receivedMap.get(it.id)?.total ?? 0;
    const terpakai = usedMap.get(it.id) ?? 0;
    const sisa = masuk - terpakai;
    const avgPrice = masuk > 0 ? (receivedMap.get(it.id)?.totalValue ?? 0) / masuk : 0;
    return {
      itemId: it.id,
      code: it.code,
      name: it.name,
      unit: it.unit,
      masuk,
      terpakai,
      sisa,
      avgPrice: Math.round(avgPrice * 100) / 100,
      nilaiStok: Math.round(sisa * avgPrice * 100) / 100,
    };
  });
}


// =============================================================================
// Helper — harga rata-rata tertimbang per item (untuk rekap biaya)
// =============================================================================

async function getWeightedAvgPrices(plantId: string | undefined, materialType: MaterialType): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!plantId) return map;

  if (materialType === "CONSUMABLE") {
    const rows = await db
      .select({
        itemId: consumableReceivingItem.consumableItemId,
        total: sql<number>`COALESCE(SUM(${consumableReceivingItem.quantity}::decimal), 0)`.mapWith(Number),
        totalValue: sql<number>`COALESCE(SUM(${consumableReceivingItem.quantity}::decimal * COALESCE(${consumableReceivingItem.unitPrice}::decimal, 0)), 0)`.mapWith(Number),
      })
      .from(consumableReceivingItem)
      .innerJoin(materialReceiving, eq(consumableReceivingItem.receivingId, materialReceiving.id))
      .where(eq(materialReceiving.plantId, plantId))
      .groupBy(consumableReceivingItem.consumableItemId);
    for (const r of rows) {
      if (r.total > 0) map.set(r.itemId, r.totalValue / r.total);
    }
  } else {
    const rows = await db
      .select({
        itemId: sparepartReceivingItem.sparepartId,
        total: sql<number>`COALESCE(SUM(${sparepartReceivingItem.quantity}), 0)`.mapWith(Number),
        totalValue: sql<number>`COALESCE(SUM(${sparepartReceivingItem.quantity} * COALESCE(${sparepartReceivingItem.unitPrice}::decimal, 0)), 0)`.mapWith(Number),
      })
      .from(sparepartReceivingItem)
      .innerJoin(materialReceiving, eq(sparepartReceivingItem.receivingId, materialReceiving.id))
      .where(eq(materialReceiving.plantId, plantId))
      .groupBy(sparepartReceivingItem.sparepartId);
    for (const r of rows) {
      if (r.total > 0) map.set(r.itemId, r.totalValue / r.total);
    }
  }
  return map;
}

// =============================================================================
// Get Material Usage — agregat pemakaian per item dalam periode
// =============================================================================

export async function getMaterialUsage(params: {
  plantId?: string;
  from?: string;
  to?: string;
  materialType: MaterialType;
}) {
  if (params.materialType === "CONSUMABLE") {

    const conditions = [];
    if (params.plantId) conditions.push(eq(tsgBoxConsumption.plantId, params.plantId));
    if (params.from) conditions.push(gte(shiftReport.reportDate, params.from));
    if (params.to) conditions.push(lte(shiftReport.reportDate, params.to));

    const boxRows = await db
      .select({
        itemId: tsgBoxConsumption.consumableItemId,
        total: sql<number>`COALESCE(SUM(${tsgBoxConsumption.quantity}::decimal), 0)`.mapWith(Number),
        eventCount: sql<number>`CAST(COUNT(*) AS INTEGER)`.mapWith(Number),
        lastUsed: sql<Date>`MAX(${tsgBoxConsumption.loggedAt})`.mapWith((v) => new Date(v as string)),
      })
      .from(tsgBoxConsumption)
      .innerJoin(tsgBoxProcess, eq(tsgBoxConsumption.tsgBoxId, tsgBoxProcess.id))
      .innerJoin(shiftReport, eq(tsgBoxProcess.shiftReportId, shiftReport.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .groupBy(tsgBoxConsumption.consumableItemId);

    // Shift-level consumption (dicatat saat akhiri shift)
    const shiftConditions = [];
    if (params.plantId) shiftConditions.push(eq(shiftConsumption.plantId, params.plantId));
    if (params.from) shiftConditions.push(gte(shiftReport.reportDate, params.from));
    if (params.to) shiftConditions.push(lte(shiftReport.reportDate, params.to));

    const shiftRows = await db
      .select({
        itemId: shiftConsumption.consumableItemId,
        total: sql<number>`COALESCE(SUM(${shiftConsumption.quantity}::decimal), 0)`.mapWith(Number),
        eventCount: sql<number>`CAST(COUNT(*) AS INTEGER)`.mapWith(Number),
        lastUsed: sql<Date>`MAX(${shiftConsumption.loggedAt})`.mapWith((v) => new Date(v as string)),
      })
      .from(shiftConsumption)
      .innerJoin(shiftReport, eq(shiftConsumption.shiftReportId, shiftReport.id))
      .where(shiftConditions.length > 0 ? and(...shiftConditions) : undefined)
      .groupBy(shiftConsumption.consumableItemId);

    const items = await db
      .select({ id: consumableItem.id, code: consumableItem.code, name: consumableItem.name, unit: consumableItem.unit })
      .from(consumableItem)
      .orderBy(consumableItem.code);

    const rowMap = new Map(boxRows.map((r) => [r.itemId, r]));
    // Gabungkan shift-level
    for (const r of shiftRows) {
      const existing = rowMap.get(r.itemId);
      if (existing) {
        existing.total += r.total;
        existing.eventCount += r.eventCount;
        if (r.lastUsed > existing.lastUsed) existing.lastUsed = r.lastUsed;
      } else {
        rowMap.set(r.itemId, r);
      }
    }

    const priceMap = await getWeightedAvgPrices(params.plantId, params.materialType);

    return items
      .filter((it) => rowMap.has(it.id))
      .map((it) => {
        const r = rowMap.get(it.id)!;
        const avgPrice = priceMap.get(it.id) ?? 0;
        return {
          itemId: it.id,
          code: it.code,
          name: it.name,
          unit: it.unit,
          totalUsed: Math.round(r.total * 100) / 100,
          eventCount: r.eventCount,
          lastUsed: r.lastUsed,
          avgPrice: Math.round(avgPrice * 100) / 100,
          biaya: Math.round(r.total * avgPrice * 100) / 100,
        };
      });
  }

  // SPAREPART

  const conditions = [];
  if (params.plantId) conditions.push(eq(maintenanceEvent.plantId, params.plantId));
  if (params.from) conditions.push(gte(shiftReport.reportDate, params.from));
  if (params.to) conditions.push(lte(shiftReport.reportDate, params.to));

  const rows = await db
    .select({
      itemId: maintenanceEvent.sparepartId,
      total: sql<number>`COALESCE(SUM(${maintenanceEvent.quantity}), 0)`.mapWith(Number),
      eventCount: sql<number>`CAST(COUNT(*) AS INTEGER)`.mapWith(Number),
      lastUsed: sql<Date>`MAX(${maintenanceEvent.loggedAt})`.mapWith((v) => new Date(v as string)),
    })
    .from(maintenanceEvent)
    .innerJoin(shiftReport, eq(maintenanceEvent.shiftReportId, shiftReport.id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .groupBy(maintenanceEvent.sparepartId);

  const items = await db
    .select({ id: sparepart.id, code: sparepart.code, name: sparepart.name, unit: sparepart.unit })
    .from(sparepart)
    .orderBy(sparepart.code);

  const rowMap = new Map(rows.map((r) => [r.itemId, r]));

  const priceMap = await getWeightedAvgPrices(params.plantId, params.materialType);

  return items
    .filter((it) => rowMap.has(it.id))
    .map((it) => {
      const r = rowMap.get(it.id)!;
      const avgPrice = priceMap.get(it.id) ?? 0;
      return {
        itemId: it.id,
        code: it.code,
        name: it.name,
        unit: it.unit,
        totalUsed: r.total,
        eventCount: r.eventCount,
        lastUsed: r.lastUsed,
        avgPrice: Math.round(avgPrice * 100) / 100,
        biaya: Math.round(r.total * avgPrice * 100) / 100,
      };
    });
}

// =============================================================================
// Material Out — keluar consumable/sparepart (transfer antar pabrik / retur)
// =============================================================================

export type MaterialOutType = "TRANSFER" | "RETUR" | "PEMAKAIAN";

export interface CreateMaterialOutInput {
  plantId: string;
  materialType: MaterialType;
  outType: MaterialOutType;
  counterpartName: string;
  // Mesin tujuan — WAJIB untuk outType PEMAKAIAN (backlog HLP material)
  machineId?: string;
  reason: string;
  notes?: string;
  outBy: string;
  items: Array<{ itemId: string; quantity: number }>;
}

export async function createMaterialOut(input: CreateMaterialOutInput) {
  if (input.items.length === 0) throw new ServiceError("EMPTY_ITEMS", "Minimal 1 item.");
  if (!input.reason.trim() || input.reason.trim().length < 3) {
    throw new ServiceError("REASON_REQUIRED", "Alasan keluar wajib diisi (min 3 karakter).");
  }

  // PEMAKAIAN: mesin tujuan wajib — counterpartName diisi otomatis dari kode mesin
  let counterpartName = input.counterpartName;
  let machineId: string | null = null;
  if (input.outType === "PEMAKAIAN") {
    if (!input.machineId) {
      throw new ServiceError("MACHINE_REQUIRED", "Pilih mesin tujuan untuk pemakaian produksi.");
    }
    const [m] = await db
      .select({ code: machine.code })
      .from(machine)
      .where(eq(machine.id, input.machineId))
      .limit(1);
    if (!m) throw new ServiceError("MACHINE_NOT_FOUND", "Mesin tujuan tidak ditemukan.");
    machineId = input.machineId;
    counterpartName = m.code;
  } else if (!input.counterpartName.trim()) {
    throw new ServiceError("COUNTERPART_REQUIRED", "Tujuan/supplier wajib diisi.");
  }

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const existingCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(materialOut)
    .where(
      and(
        eq(materialOut.plantId, input.plantId),
        sql`created_at::date = CURRENT_DATE`
      )
    );
  const seq = Number(existingCount[0]?.count ?? 0) + 1;
  const outCode = `MTR-${today}-${String(seq).padStart(2, "0")}`;

  const result = await db.transaction(async (tx) => {
    const [header] = await tx
      .insert(materialOut)
      .values({
        plantId: input.plantId,
        materialType: input.materialType,
        outType: input.outType,
        machineId,
        counterpartName: counterpartName.trim(),
        outCode,
        reason: input.reason.trim(),
        notes: input.notes ?? null,
        outBy: input.outBy,
      })
      .returning();

    if (!header) throw new Error("MATERIAL_OUT_CREATE_FAILED");

    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i]!;
      if (input.materialType === "CONSUMABLE") {
        await tx.insert(consumableOutItem).values({
          outId: header.id,
          plantId: input.plantId,
          consumableItemId: item.itemId,
          quantity: String(item.quantity),
          seq: i + 1,
        });
      } else {
        await tx.insert(sparepartOutItem).values({
          outId: header.id,
          plantId: input.plantId,
          sparepartId: item.itemId,
          quantity: Math.round(item.quantity),
          seq: i + 1,
        });
      }
    }

    return header;
  });

  return {
    outId: result.id,
    outCode: result.outCode,
    materialType: input.materialType,
    outType: input.outType,
    totalItems: input.items.length,
  };
}

export async function listMaterialOutReport(
  plantId: string,
  params: { from?: string; to?: string; materialType?: MaterialType; outType?: MaterialOutType }
) {
  const conditions = [eq(materialOut.plantId, plantId)];
  if (params.materialType) conditions.push(eq(materialOut.materialType, params.materialType));
  if (params.outType) conditions.push(eq(materialOut.outType, params.outType));
  if (params.from) conditions.push(gte(materialOut.outAt, new Date(params.from)));
  if (params.to) conditions.push(lte(materialOut.outAt, new Date(params.to + "T23:59:59.999Z")));

  const rows = await db
    .select({
      id: materialOut.id,
      outCode: materialOut.outCode,
      materialType: materialOut.materialType,
      outType: materialOut.outType,
      counterpartName: materialOut.counterpartName,
      reason: materialOut.reason,
      notes: materialOut.notes,
      outAt: materialOut.outAt,
      outByName: sql<string>`u.full_name`.mapWith(String),
    })
    .from(materialOut)
    .leftJoin(sql`"user" u`, eq(materialOut.outBy, sql`u.id`))
    .where(and(...conditions))
    .orderBy(sql`${materialOut.outAt} DESC`)
    .limit(200);

  for (const r of rows) {
    if (r.materialType === "CONSUMABLE") {
      const items = await db
        .select({
          id: consumableOutItem.id,
          itemId: consumableOutItem.consumableItemId,
          quantity: consumableOutItem.quantity,
          itemName: consumableItem.name,
          itemUnit: consumableItem.unit,
        })
        .from(consumableOutItem)
        .leftJoin(consumableItem, eq(consumableOutItem.consumableItemId, consumableItem.id))
        .where(eq(consumableOutItem.outId, r.id))
        .orderBy(consumableOutItem.seq);
      (r as any).items = items;
    } else {
      const items = await db
        .select({
          id: sparepartOutItem.id,
          itemId: sparepartOutItem.sparepartId,
          quantity: sparepartOutItem.quantity,
          itemName: sparepart.name,
          itemUnit: sparepart.unit,
        })
        .from(sparepartOutItem)
        .leftJoin(sparepart, eq(sparepartOutItem.sparepartId, sparepart.id))
        .where(eq(sparepartOutItem.outId, r.id))
        .orderBy(sparepartOutItem.seq);
      (r as any).items = items;
    }
  }

  const totalItems = rows.reduce((s, r) => s + ((r as any).items?.length ?? 0), 0);

  return {
    summary: {
      totalOut: rows.length,
      totalItems,
      totalTransfer: rows.filter((r) => r.outType === "TRANSFER").length,
      totalReturn: rows.filter((r) => r.outType === "RETUR").length,
    },
    data: rows,
  };
}
