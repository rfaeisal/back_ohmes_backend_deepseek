// =============================================================================
// WMS Inbound Service — Receiving TSG + Inventory FIFO
// =============================================================================

import { eq, and, inArray, sql } from "drizzle-orm";
import db from "@/db";
import {
  tsgSupplier,
  tsgReceiving,
  tsgReceivingBox,
  tsgInventory,
  tsgTransferOut,
  tsgTransferOutItem,
  tsgReturnOut,
  tsgReturnOutItem,
} from "@/db/schema";
import { plant } from "@/db/schema/tenancy";
import { writeAudit } from "@/lib/audit";
import { ServiceError } from "./shift.service";
import { notifyReceivingPending } from "./fcm.service";

// =============================================================================
// Types
// =============================================================================

export interface CreateReceivingInput {
  plantId: string;
  supplierId: string;
  supplierDocRef?: string;
  receivedAt: Date;
  receivedBy: string;
  locationCode?: string;
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
    // 1. Receiving header — manual tanpa SJ wajib approval (inventory dibuat saat approve)
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
        source: "MANUAL",
        approvalStatus: "PENDING",
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
      // Inventory dibuat saat approval (approveReceiving)
    }

    return header;
  });

  await writeAudit({
    actorUserId: input.receivedBy,
    action: "tsg.receiving.create",
    entityTable: "tsg_receiving",
    entityId: result.id,
    after: { receivingCode, boxCount: input.boxes.length, approvalStatus: "PENDING" },
  });

  // Push ke Plant Manager pabrik ini (fire-and-forget — gagal tidak
  // menggagalkan receiving). Mobile handoff §1.
  void notifyReceivingPending({
    receivingId: result.id,
    plantId: input.plantId,
    supplierSjId: null, // receiving manual tidak terikat SJ
    boxCount: input.boxes.length,
  });

  return {
    receivingId: result.id,
    receivingCode: result.receivingCode,
    totalBoxCount: input.boxes.length,
    totalWeightKg: totalWeight,
    inventoryCreated: 0,
    approvalStatus: "PENDING",
  };
}

// =============================================================================
// Approve Receiving — manual tanpa SJ: buat inventory setelah disetujui
// =============================================================================

export async function approveReceiving(
  receivingId: string,
  plantId: string,
  actorUserId: string
) {
  const [receiving] = await db
    .select()
    .from(tsgReceiving)
    .where(eq(tsgReceiving.id, receivingId))
    .limit(1);

  if (!receiving) throw new ServiceError("RECEIVING_NOT_FOUND", "Receiving tidak ditemukan.");
  if (receiving.plantId !== plantId) {
    throw new ServiceError("RECEIVING_WRONG_PLANT", "Receiving bukan untuk plant ini.");
  }
  if (receiving.approvalStatus !== "PENDING") {
    throw new ServiceError("RECEIVING_ALREADY_APPROVED", "Receiving sudah di-approve.");
  }

  const boxes = await db
    .select()
    .from(tsgReceivingBox)
    .where(eq(tsgReceivingBox.receivingId, receivingId));

  const count = await db.transaction(async (tx) => {
    for (const b of boxes) {
      await tx.insert(tsgInventory).values({
        plantId: receiving.plantId,
        boxId: b.id,
        tsgType: b.tsgType,
        status: "AVAILABLE",
      });
    }
    await tx
      .update(tsgReceiving)
      .set({ approvalStatus: "APPROVED", approvedBy: actorUserId, approvedAt: new Date() })
      .where(eq(tsgReceiving.id, receivingId));
    return boxes.length;
  });

  await writeAudit({
    actorUserId,
    action: "tsg.receiving.approve",
    entityTable: "tsg_receiving",
    entityId: receivingId,
    before: { approvalStatus: "PENDING" },
    after: { approvalStatus: "APPROVED", boxCount: count },
  });

  return { receivingId, approvalStatus: "APPROVED", inventoryCreated: count };
}

// =============================================================================
// Get Available Inventory (FIFO — tertua di atas)
// =============================================================================

export async function getAvailableInventory(
  plantIds: string[],
  limit = 20
) {
  const items = await db
    .select({
      inventoryId: tsgInventory.id,
      boxId: tsgInventory.boxId, // id tsg_receiving_box — untuk generate QR asli
      boxCode: tsgReceivingBox.boxCode,
      weightKg: tsgReceivingBox.weightKg,
      tsgType: tsgReceivingBox.tsgType,
      locationCode: tsgInventory.locationCode,
      fifoOverrideAt: tsgInventory.fifoOverrideAt,
      createdAt: tsgInventory.createdAt,
      // Pabrik pemilik boks — untuk filter/kolom di laporan lintas pabrik
      plantId: tsgInventory.plantId,
      plantCode: plant.code,
      plantName: plant.name,
      // Asal supplier boks — untuk default supplier di form retur
      supplierId: tsgReceiving.supplierId,
      supplierName: tsgSupplier.name,
    })
    .from(tsgInventory)
    .innerJoin(tsgReceivingBox, eq(tsgInventory.boxId, tsgReceivingBox.id))
    .innerJoin(tsgReceiving, eq(tsgReceivingBox.receivingId, tsgReceiving.id))
    .leftJoin(tsgSupplier, eq(tsgReceiving.supplierId, tsgSupplier.id))
    .innerJoin(plant, eq(tsgInventory.plantId, plant.id))
    .where(
      and(
        inArray(tsgInventory.plantId, plantIds),
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

// =============================================================================
// FIFO Override Inventory — otorisasi pakai boks di luar urutan FIFO
// =============================================================================
// Mobile handoff §6: permission `tsg.inventory.allocate.override` sudah
// di-seed untuk PLANT_MANAGER + SUPERADMIN. Alasan wajib dicatat (compliance)
// + audit log. Tidak mengubah status — boks tetap AVAILABLE dan boleh diambil
// operator di luar urutan FIFO dengan bukti otorisasi ini.
// =============================================================================

export async function overrideFifoInventory(
  inventoryId: string,
  reason: string,
  overriddenBy: string,
  isPrivileged = false
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
      "Hanya boks status AVAILABLE yang bisa di-override FIFO.",
      { currentStatus: item.status }
    );
  }

  const appliedAt = new Date();

  await db
    .update(tsgInventory)
    .set({
      fifoOverrideReason: reason,
      fifoOverrideBy: overriddenBy,
      fifoOverrideAt: appliedAt,
    })
    .where(eq(tsgInventory.id, inventoryId));

  await writeAudit({
    actorUserId: overriddenBy,
    action: "tsg.inventory.fifo_override",
    entityTable: "tsg_inventory",
    entityId: inventoryId,
    after: { reason, appliedAt: appliedAt.toISOString() },
    isPrivileged,
  });

  return { overrideId: inventoryId, appliedAt: appliedAt.toISOString() };
}

// =============================================================================
// TSG Transfer Out — kirim TSG ke pabrik lain (eksternal)
// =============================================================================

export interface CreateTsgTransferInput {
  plantId: string;
  destinationName: string;
  inventoryBoxIds: string[];
  notes?: string;
  sentBy: string;
}

export async function createTsgTransfer(input: CreateTsgTransferInput) {
  if (input.inventoryBoxIds.length === 0) {
    throw new ServiceError("EMPTY_BOXES", "Pilih minimal 1 boks.");
  }

  // Validasi semua boks AVAILABLE
  const inventoryBoxes: Array<{ inventoryId: string; boxCode: string; weightKg: number }> = [];
  for (const invId of input.inventoryBoxIds) {
    const [inv] = await db
      .select({
        id: tsgInventory.id,
        status: tsgInventory.status,
        boxId: tsgInventory.boxId,
      })
      .from(tsgInventory)
      .where(and(eq(tsgInventory.id, invId), eq(tsgInventory.plantId, input.plantId)))
      .limit(1);

    if (!inv) throw new ServiceError("INVENTORY_NOT_FOUND", `Boks ${invId} tidak ditemukan.`);
    if (inv.status !== "AVAILABLE") {
      throw new ServiceError(
        "INVENTORY_NOT_AVAILABLE",
        `Boks tidak dalam status AVAILABLE.`,
        { inventoryId: invId, currentStatus: inv.status }
      );
    }
    const [rb] = await db
      .select({ boxCode: tsgReceivingBox.boxCode, weightKg: tsgReceivingBox.weightKg })
      .from(tsgReceivingBox)
      .where(eq(tsgReceivingBox.id, inv.boxId))
      .limit(1);
    inventoryBoxes.push({ inventoryId: inv.id, boxCode: rb?.boxCode ?? "-", weightKg: Number(rb?.weightKg ?? 0) });
  }

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const existingCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(tsgTransferOut)
    .where(
      and(
        eq(tsgTransferOut.plantId, input.plantId),
        sql`created_at::date = CURRENT_DATE`
      )
    );
  const seq = Number(existingCount[0]?.count ?? 0) + 1;
  const transferCode = `TRF-${today}-${String(seq).padStart(2, "0")}`;

  const totalWeight = inventoryBoxes.reduce((s, b) => s + b.weightKg, 0);

  const result = await db.transaction(async (tx) => {
    const [header] = await tx
      .insert(tsgTransferOut)
      .values({
        plantId: input.plantId,
        destinationName: input.destinationName,
        transferCode,
        totalBoxCount: inventoryBoxes.length,
        totalWeightKg: String(totalWeight),
        notes: input.notes ?? null,
        sentBy: input.sentBy,
      })
      .returning();

    if (!header) throw new Error("TRANSFER_CREATE_FAILED");

    for (let i = 0; i < inventoryBoxes.length; i++) {
      const b = inventoryBoxes[i]!;
      await tx.insert(tsgTransferOutItem).values({
        transferId: header.id,
        plantId: input.plantId,
        inventoryId: b.inventoryId,
        boxCode: b.boxCode,
        weightKg: String(b.weightKg),
        seq: i + 1,
      });

      // Update status inventory → TRANSFERRED
      await tx
        .update(tsgInventory)
        .set({ status: "TRANSFERRED", usedAt: new Date() })
        .where(eq(tsgInventory.id, b.inventoryId));
    }

    return header;
  });

  return {
    transferId: result.id,
    transferCode: result.transferCode,
    totalBoxCount: inventoryBoxes.length,
    totalWeightKg: Math.round(totalWeight * 100) / 100,
  };
}

export async function listTsgTransfers(plantId: string, limit = 50) {
  const transfers = await db
    .select({
      id: tsgTransferOut.id,
      transferCode: tsgTransferOut.transferCode,
      destinationName: tsgTransferOut.destinationName,
      totalBoxCount: tsgTransferOut.totalBoxCount,
      totalWeightKg: tsgTransferOut.totalWeightKg,
      notes: tsgTransferOut.notes,
      sentAt: tsgTransferOut.sentAt,
      sentByName: sql<string>`u.full_name`.mapWith(String),
    })
    .from(tsgTransferOut)
    .leftJoin(sql`"user" u`, eq(tsgTransferOut.sentBy, sql`u.id`))
    .where(eq(tsgTransferOut.plantId, plantId))
    .orderBy(sql`${tsgTransferOut.sentAt} DESC`)
    .limit(Math.min(limit, 200));

  // Attach items
  for (const t of transfers) {
    const items = await db
      .select({
        id: tsgTransferOutItem.id,
        boxCode: tsgTransferOutItem.boxCode,
        weightKg: tsgTransferOutItem.weightKg,
      })
      .from(tsgTransferOutItem)
      .where(eq(tsgTransferOutItem.transferId, t.id))
      .orderBy(tsgTransferOutItem.seq);
    (t as any).items = items;
  }

  return { data: transfers };
}

// =============================================================================
// TSG Return Out — retur TSG ke supplier
// =============================================================================

export interface CreateTsgReturnInput {
  plantId: string;
  supplierId: string;
  inventoryBoxIds: string[];
  reason: string;
  notes?: string;
  returnedBy: string;
}

export async function createTsgReturn(input: CreateTsgReturnInput) {
  if (input.inventoryBoxIds.length === 0) {
    throw new ServiceError("EMPTY_BOXES", "Pilih minimal 1 boks.");
  }
  if (!input.reason.trim()) {
    throw new ServiceError("REASON_REQUIRED", "Alasan retur wajib diisi.");
  }

  const [supplier] = await db
    .select({ id: tsgSupplier.id })
    .from(tsgSupplier)
    .where(eq(tsgSupplier.id, input.supplierId))
    .limit(1);
  if (!supplier) throw new ServiceError("SUPPLIER_NOT_FOUND", "Supplier tidak ditemukan.");

  const inventoryBoxes: Array<{ inventoryId: string; boxCode: string; weightKg: number }> = [];
  for (const invId of input.inventoryBoxIds) {
    const [inv] = await db
      .select({
        id: tsgInventory.id,
        status: tsgInventory.status,
        boxId: tsgInventory.boxId,
        // Asal supplier boks — retur wajib ke supplier asal (dokumen retur harus konsisten)
        supplierId: tsgReceiving.supplierId,
      })
      .from(tsgInventory)
      .innerJoin(tsgReceivingBox, eq(tsgInventory.boxId, tsgReceivingBox.id))
      .innerJoin(tsgReceiving, eq(tsgReceivingBox.receivingId, tsgReceiving.id))
      .where(and(eq(tsgInventory.id, invId), eq(tsgInventory.plantId, input.plantId)))
      .limit(1);

    if (!inv) throw new ServiceError("INVENTORY_NOT_FOUND", `Boks ${invId} tidak ditemukan.`);
    if (inv.status !== "AVAILABLE") {
      throw new ServiceError("INVENTORY_NOT_AVAILABLE", "Boks tidak dalam status AVAILABLE.", { inventoryId: invId, currentStatus: inv.status });
    }
    const [rb] = await db
      .select({ boxCode: tsgReceivingBox.boxCode, weightKg: tsgReceivingBox.weightKg })
      .from(tsgReceivingBox)
      .where(eq(tsgReceivingBox.id, inv.boxId))
      .limit(1);
    if (inv.supplierId !== input.supplierId) {
      throw new ServiceError(
        "SUPPLIER_MISMATCH",
        `Boks ${rb?.boxCode ?? invId} berasal dari supplier lain — retur wajib ke supplier asal boks.`,
        { inventoryId: invId, boxSupplierId: inv.supplierId, returnSupplierId: input.supplierId }
      );
    }
    inventoryBoxes.push({ inventoryId: inv.id, boxCode: rb?.boxCode ?? "-", weightKg: Number(rb?.weightKg ?? 0) });
  }

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const existingCount = await db
    .select({ count: sql<number>`count(*)` })
    .from(tsgReturnOut)
    .where(
      and(
        eq(tsgReturnOut.plantId, input.plantId),
        sql`created_at::date = CURRENT_DATE`
      )
    );
  const seq = Number(existingCount[0]?.count ?? 0) + 1;
  const returnCode = `RTR-${today}-${String(seq).padStart(2, "0")}`;

  const totalWeight = inventoryBoxes.reduce((s, b) => s + b.weightKg, 0);

  const result = await db.transaction(async (tx) => {
    const [header] = await tx
      .insert(tsgReturnOut)
      .values({
        plantId: input.plantId,
        supplierId: input.supplierId,
        returnCode,
        totalBoxCount: inventoryBoxes.length,
        totalWeightKg: String(totalWeight),
        reason: input.reason.trim(),
        notes: input.notes ?? null,
        returnedBy: input.returnedBy,
      })
      .returning();

    if (!header) throw new Error("RETURN_CREATE_FAILED");

    for (let i = 0; i < inventoryBoxes.length; i++) {
      const b = inventoryBoxes[i]!;
      await tx.insert(tsgReturnOutItem).values({
        returnId: header.id,
        plantId: input.plantId,
        inventoryId: b.inventoryId,
        boxCode: b.boxCode,
        weightKg: String(b.weightKg),
        seq: i + 1,
      });

      await tx
        .update(tsgInventory)
        .set({ status: "RETURNED", usedAt: new Date() })
        .where(eq(tsgInventory.id, b.inventoryId));
    }

    return header;
  });

  return {
    returnId: result.id,
    returnCode: result.returnCode,
    totalBoxCount: inventoryBoxes.length,
    totalWeightKg: Math.round(totalWeight * 100) / 100,
  };
}

export async function listTsgReturns(plantId: string, limit = 50) {
  const returns = await db
    .select({
      id: tsgReturnOut.id,
      returnCode: tsgReturnOut.returnCode,
      supplierName: tsgSupplier.name,
      supplierCode: tsgSupplier.code,
      totalBoxCount: tsgReturnOut.totalBoxCount,
      totalWeightKg: tsgReturnOut.totalWeightKg,
      reason: tsgReturnOut.reason,
      notes: tsgReturnOut.notes,
      returnedAt: tsgReturnOut.returnedAt,
      returnedByName: sql<string>`u.full_name`.mapWith(String),
    })
    .from(tsgReturnOut)
    .leftJoin(tsgSupplier, eq(tsgReturnOut.supplierId, tsgSupplier.id))
    .leftJoin(sql`"user" u`, eq(tsgReturnOut.returnedBy, sql`u.id`))
    .where(eq(tsgReturnOut.plantId, plantId))
    .orderBy(sql`${tsgReturnOut.returnedAt} DESC`)
    .limit(Math.min(limit, 200));

  for (const r of returns) {
    const items = await db
      .select({
        id: tsgReturnOutItem.id,
        boxCode: tsgReturnOutItem.boxCode,
        weightKg: tsgReturnOutItem.weightKg,
      })
      .from(tsgReturnOutItem)
      .where(eq(tsgReturnOutItem.returnId, r.id))
      .orderBy(tsgReturnOutItem.seq);
    (r as any).items = items;
  }

  return { data: returns };
}

export async function getTsgReturnDetail(returnId: string) {
  const [r] = await db
    .select({
      id: tsgReturnOut.id,
      returnCode: tsgReturnOut.returnCode,
      supplierName: tsgSupplier.name,
      supplierCode: tsgSupplier.code,
      supplierAddress: tsgSupplier.address,
      totalBoxCount: tsgReturnOut.totalBoxCount,
      totalWeightKg: tsgReturnOut.totalWeightKg,
      reason: tsgReturnOut.reason,
      notes: tsgReturnOut.notes,
      returnedAt: tsgReturnOut.returnedAt,
      returnerName: sql<string>`u.full_name`.mapWith(String),
      plantCode: plant.code,
      plantName: plant.name,
    })
    .from(tsgReturnOut)
    .leftJoin(tsgSupplier, eq(tsgReturnOut.supplierId, tsgSupplier.id))
    .leftJoin(sql`"user" u`, eq(tsgReturnOut.returnedBy, sql`u.id`))
    .leftJoin(plant, eq(tsgReturnOut.plantId, plant.id))
    .where(eq(tsgReturnOut.id, returnId))
    .limit(1);

  if (!r) return null;

  const items = await db
    .select({
      id: tsgReturnOutItem.id,
      boxCode: tsgReturnOutItem.boxCode,
      weightKg: tsgReturnOutItem.weightKg,
      tsgType: tsgReceivingBox.tsgType,
      // Asal supplier per boks — dicetak di dokumen Berita Acara Retur
      supplierName: tsgSupplier.name,
    })
    .from(tsgReturnOutItem)
    .leftJoin(tsgReceivingBox, sql`${tsgReceivingBox.boxCode} = ${tsgReturnOutItem.boxCode}`)
    .leftJoin(tsgReceiving, eq(tsgReceivingBox.receivingId, tsgReceiving.id))
    .leftJoin(tsgSupplier, eq(tsgReceiving.supplierId, tsgSupplier.id))
    .where(eq(tsgReturnOutItem.returnId, returnId))
    .orderBy(tsgReturnOutItem.seq);

  return { ...r, items };
}

// =============================================================================
// Laporan TSG Keluar — gabungan transfer + retur
// =============================================================================

export async function listTsgOutReport(
  plantId: string,
  params: { from?: string; to?: string; type?: string }
) {
  const entries: any[] = [];

  // Transfer out
  const transfers = await db
    .select({
      id: tsgTransferOut.id,
      transferCode: tsgTransferOut.transferCode,
      destinationName: tsgTransferOut.destinationName,
      totalBoxCount: tsgTransferOut.totalBoxCount,
      totalWeightKg: tsgTransferOut.totalWeightKg,
      notes: tsgTransferOut.notes,
      sentAt: tsgTransferOut.sentAt,
      sentByName: sql<string>`u.full_name`.mapWith(String),
    })
    .from(tsgTransferOut)
    .leftJoin(sql`"user" u`, eq(tsgTransferOut.sentBy, sql`u.id`))
    .where(eq(tsgTransferOut.plantId, plantId))
    .orderBy(sql`${tsgTransferOut.sentAt} DESC`);

  for (const t of transfers) {
    const items = await db
      .select({ boxCode: tsgTransferOutItem.boxCode, weightKg: tsgTransferOutItem.weightKg })
      .from(tsgTransferOutItem)
      .where(eq(tsgTransferOutItem.transferId, t.id))
      .orderBy(tsgTransferOutItem.seq);
    entries.push({
      id: t.id,
      type: "TRANSFER",
      code: t.transferCode,
      counterpart: t.destinationName,
      date: t.sentAt,
      byName: t.sentByName,
      boxCount: t.totalBoxCount,
      weightKg: Number(t.totalWeightKg),
      notes: t.notes,
      items,
      printUrl: `/admin/gudang/transfer/${t.id}/print`,
    });
  }

  // Return out
  const returns = await db
    .select({
      id: tsgReturnOut.id,
      returnCode: tsgReturnOut.returnCode,
      supplierName: tsgSupplier.name,
      totalBoxCount: tsgReturnOut.totalBoxCount,
      totalWeightKg: tsgReturnOut.totalWeightKg,
      reason: tsgReturnOut.reason,
      notes: tsgReturnOut.notes,
      returnedAt: tsgReturnOut.returnedAt,
      returnedByName: sql<string>`u.full_name`.mapWith(String),
    })
    .from(tsgReturnOut)
    .leftJoin(tsgSupplier, eq(tsgReturnOut.supplierId, tsgSupplier.id))
    .leftJoin(sql`"user" u`, eq(tsgReturnOut.returnedBy, sql`u.id`))
    .where(eq(tsgReturnOut.plantId, plantId))
    .orderBy(sql`${tsgReturnOut.returnedAt} DESC`);

  for (const r of returns) {
    const items = await db
      .select({ boxCode: tsgReturnOutItem.boxCode, weightKg: tsgReturnOutItem.weightKg })
      .from(tsgReturnOutItem)
      .where(eq(tsgReturnOutItem.returnId, r.id))
      .orderBy(tsgReturnOutItem.seq);
    entries.push({
      id: r.id,
      type: "RETUR",
      code: r.returnCode,
      counterpart: r.supplierName,
      date: r.returnedAt,
      byName: r.returnedByName,
      boxCount: r.totalBoxCount,
      weightKg: Number(r.totalWeightKg),
      notes: r.reason,
      items,
      printUrl: `/admin/gudang/return/${r.id}/print`,
    });
  }

  // Filter
  let filtered = entries;
  if (params.type && params.type !== "ALL") {
    filtered = filtered.filter((e) => e.type === params.type);
  }
  if (params.from) {
    filtered = filtered.filter((e) => e.date && new Date(e.date).toISOString().slice(0, 10) >= params.from!);
  }
  if (params.to) {
    filtered = filtered.filter((e) => e.date && new Date(e.date).toISOString().slice(0, 10) <= params.to!);
  }

  filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const summary = {
    totalOut: filtered.length,
    totalBoxes: filtered.reduce((s, e) => s + e.boxCount, 0),
    totalWeightKg: Math.round(filtered.reduce((s, e) => s + e.weightKg, 0) * 100) / 100,
    totalTransfer: filtered.filter((e) => e.type === "TRANSFER").length,
    totalReturn: filtered.filter((e) => e.type === "RETUR").length,
  };

  return { summary, data: filtered };
}
