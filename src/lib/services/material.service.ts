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
} from "@/db/schema";
import { tsgBoxConsumption, maintenanceEvent, tsgBoxProcess, shiftConsumption } from "@/db/schema/box";
import { shiftReport } from "@/db/schema/shift";
import { consumableItem, sparepart } from "@/db/schema/master-product";
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
  items: Array<{ itemId: string; quantity: number }>;
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
          seq: i + 1,
        });
      } else {
        await tx.insert(sparepartReceivingItem).values({
          receivingId: header.id,
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

    const items = await db
      .select({ id: consumableItem.id, code: consumableItem.code, name: consumableItem.name, unit: consumableItem.unit })
      .from(consumableItem)
      .orderBy(consumableItem.code);

    const receivedMap = new Map(receivedRows.map((r) => [r.itemId, r.total]));
    const usedMap = new Map(boxUsedRows.map((r) => [r.itemId, r.total]));
    // Gabungkan pemakaian shift-level
    for (const r of shiftUsedRows) {
      usedMap.set(r.itemId, (usedMap.get(r.itemId) ?? 0) + r.total);
    }

    return items.map((it) => {
      const masuk = receivedMap.get(it.id) ?? 0;
      const terpakai = usedMap.get(it.id) ?? 0;
      return {
        itemId: it.id,
        code: it.code,
        name: it.name,
        unit: it.unit,
        masuk,
        terpakai,
        sisa: Math.round((masuk - terpakai) * 100) / 100,
      };
    });
  }

  // SPAREPART

  const receivedRows = await db
    .select({
      itemId: sparepartReceivingItem.sparepartId,
      total: sql<number>`COALESCE(SUM(${sparepartReceivingItem.quantity}), 0)`.mapWith(Number),
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

  const items = await db
    .select({ id: sparepart.id, code: sparepart.code, name: sparepart.name, unit: sparepart.unit })
    .from(sparepart)
    .orderBy(sparepart.code);

  const receivedMap = new Map(receivedRows.map((r) => [r.itemId, r.total]));
  const usedMap = new Map(usedRows.map((r) => [r.itemId, r.total]));

  return items.map((it) => {
    const masuk = receivedMap.get(it.id) ?? 0;
    const terpakai = usedMap.get(it.id) ?? 0;
    return {
      itemId: it.id,
      code: it.code,
      name: it.name,
      unit: it.unit,
      masuk,
      terpakai,
      sisa: masuk - terpakai,
    };
  });
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

    return items
      .filter((it) => rowMap.has(it.id))
      .map((it) => {
        const r = rowMap.get(it.id)!;
        return {
          itemId: it.id,
          code: it.code,
          name: it.name,
          unit: it.unit,
          totalUsed: Math.round(r.total * 100) / 100,
          eventCount: r.eventCount,
          lastUsed: r.lastUsed,
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

  return items
    .filter((it) => rowMap.has(it.id))
    .map((it) => {
      const r = rowMap.get(it.id)!;
      return {
        itemId: it.id,
        code: it.code,
        name: it.name,
        unit: it.unit,
        totalUsed: r.total,
        eventCount: r.eventCount,
        lastUsed: r.lastUsed,
      };
    });
}
