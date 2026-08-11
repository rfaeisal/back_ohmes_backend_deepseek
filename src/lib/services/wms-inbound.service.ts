// =============================================================================
// WMS Inbound Service — Receiving TSG + Inventory FIFO
// =============================================================================

import { eq, and, sql } from "drizzle-orm";
import db from "@/db";
import {
  tsgSupplier,
  tsgReceiving,
  tsgReceivingBox,
  tsgInventory,
} from "@/db/schema";
import { ServiceError } from "./shift.service";

// =============================================================================
// Types
// =============================================================================

export interface CreateReceivingInput {
  plantId: string;
  supplierId: string;
  supplierDocRef?: string;
  receivedAt: Date;
  receivedBy: string;
  boxes: Array<{
    boxCode: string;
    weightKg: number;
    tsgType?: "REGULER" | "MILD" | "PUTIHAN";
  }>;
  notes?: string;
}

// =============================================================================
// Create Receiving — terima TSG dari supplier
// =============================================================================

export async function createReceiving(input: CreateReceivingInput) {
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

  // Validasi berat per boks
  for (const box of input.boxes) {
    if (box.weightKg <= 0 || box.weightKg > 100) {
      throw new ServiceError(
        "INVALID_BOX_WEIGHT",
        `Berat boks ${box.boxCode} harus 0-100 kg.`
      );
    }
  }

  const totalWeight = input.boxes.reduce((sum, b) => sum + b.weightKg, 0);
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  // Generate receiving code
  const existingCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(tsgReceiving)
    .where(
      and(
        eq(tsgReceiving.plantId, input.plantId),
        sql`created_at::date = CURRENT_DATE`
      )
    );

  const seq = (existingCount[0]?.count ?? 0) + 1;
  const receivingCode = `RCV-${today}-${String(seq).padStart(2, "0")}`;

  // Create dalam transaksi
  const result = await db.transaction(async (tx) => {
    // 1. Receiving header
    const [header] = await tx
      .insert(tsgReceiving)
      .values({
        plantId: input.plantId,
        supplierId: input.supplierId,
        receivingCode,
        receivedAt: input.receivedAt,
        receivedBy: input.receivedBy,
        totalBoxCount: input.boxes.length,
        totalWeightKg: String(totalWeight),
        supplierDocRef: input.supplierDocRef ?? null,
        notes: input.notes ?? null,
      })
      .returning();

    if (!header) throw new Error("RECEIVING_CREATE_FAILED");

    // 2. Receiving boxes
    for (let i = 0; i < input.boxes.length; i++) {
      const box = input.boxes[i]!;
      const [rb] = await tx
        .insert(tsgReceivingBox)
        .values({
          receivingId: header.id,
          plantId: input.plantId,
          boxCode: box.boxCode,
          weightKg: String(box.weightKg),
          boxSeq: i + 1,
          tsgType: box.tsgType ?? "REGULER",
          receivedAt: input.receivedAt,
        })
        .returning();

      if (!rb) throw new Error("BOX_CREATE_FAILED");

      // 3. Auto-create inventory
      await tx.insert(tsgInventory).values({
        plantId: input.plantId,
        boxId: rb.id,
        tsgType: box.tsgType ?? "REGULER",
        status: "AVAILABLE",
        locationCode: null,
      });
    }

    return header;
  });

  return {
    receivingId: result.id,
    receivingCode: result.receivingCode,
    totalBoxCount: input.boxes.length,
    totalWeightKg: totalWeight,
    inventoryCreated: input.boxes.length,
  };
}

// =============================================================================
// Get Available Inventory (FIFO — tertua di atas)
// =============================================================================

export async function getAvailableInventory(
  plantId: string,
  limit = 20
) {
  const items = await db
    .select({
      inventoryId: tsgInventory.id,
      boxCode: tsgReceivingBox.boxCode,
      weightKg: tsgReceivingBox.weightKg,
      tsgType: tsgReceivingBox.tsgType,
      locationCode: tsgInventory.locationCode,
      createdAt: tsgInventory.createdAt,
    })
    .from(tsgInventory)
    .innerJoin(tsgReceivingBox, eq(tsgInventory.boxId, tsgReceivingBox.id))
    .where(
      and(
        eq(tsgInventory.plantId, plantId),
        eq(tsgInventory.status, "AVAILABLE")
      )
    )
    .orderBy(tsgInventory.createdAt) // FIFO — ASC
    .limit(limit);

  return items.map((item) => ({
    ...item,
    ageInDays: Math.floor(
      (Date.now() - item.createdAt.getTime()) / (1000 * 60 * 60 * 24)
    ),
  }));
}

// =============================================================================
// Write-off Inventory
// =============================================================================

export async function writeoffInventory(
  inventoryId: string,
  reason: string,
  writtenOffBy: string
) {
  const [item] = await db
    .select()
    .from(tsgInventory)
    .where(eq(tsgInventory.id, inventoryId))
    .limit(1);

  if (!item) throw new ServiceError("INVENTORY_NOT_FOUND", "Inventory tidak ditemukan.");
  if (item.status !== "AVAILABLE") {
    throw new ServiceError(
      "INVENTORY_NOT_AVAILABLE",
      "Hanya boks status AVAILABLE yang bisa di-writeoff.",
      { currentStatus: item.status }
    );
  }

  await db
    .update(tsgInventory)
    .set({
      status: "WRITTEN_OFF",
      writeoffReason: reason,
      writeoffBy: writtenOffBy,
      writeoffAt: new Date(),
    })
    .where(eq(tsgInventory.id, inventoryId));

  return { inventoryId, status: "WRITTEN_OFF" };
}
