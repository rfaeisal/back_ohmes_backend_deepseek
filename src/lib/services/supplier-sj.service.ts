// =============================================================================
// Supplier SJ Service — Surat Jalan Supplier: pre-label & pre-weigh di supplier
// =============================================================================

import { eq, and, isNull, sql } from "drizzle-orm";
import db from "@/db";
import {
  supplierSj,
  supplierSjBox,
  tsgSupplier,
  tsgReceiving,
  tsgReceivingBox,
  tsgInventory,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { ServiceError } from "./shift.service";

// =============================================================================
// Types
// =============================================================================

export interface CreateSupplierSjInput {
  sjNumber: string;
  supplierId: string;
  plantId: string;
  labels: Array<{ tsgType: "REGULER" | "MILD" | "PUTIHAN"; count: number }>;
  actorUserId: string;
}

export interface WeighSjBoxInput {
  supplierSjId: string;
  boxCode: string;
  supplierWeightKg: number;
  actorUserId: string;
}

export interface ReceiveFromSjInput {
  supplierSjId: string;
  plantId: string;
  actorUserId: string;
  /** Label yang discan petugas gudang inbound saat validasi jumlah (opsional — default semua boks SJ) */
  verifiedBoxCodes?: string[];
}

// =============================================================================
// Create SJ + generate label QR per jenis TSG
// =============================================================================

export async function createSupplierSj(input: CreateSupplierSjInput) {
  if (!input.sjNumber.trim()) {
    throw new ServiceError("INVALID_SJ_NUMBER", "Nomor surat jalan wajib diisi.");
  }
  const totalLabels = input.labels.reduce((s, l) => s + l.count, 0);
  if (totalLabels < 1 || totalLabels > 500) {
    throw new ServiceError("INVALID_LABEL_COUNT", "Total label harus 1–500.");
  }
  for (const l of input.labels) {
    if (l.count < 1) {
      throw new ServiceError("INVALID_LABEL_COUNT", "Jumlah label per jenis minimal 1.");
    }
  }

  // Validasi supplier
  const [supplier] = await db
    .select({ id: tsgSupplier.id })
    .from(tsgSupplier)
    .where(eq(tsgSupplier.id, input.supplierId))
    .limit(1);
  if (!supplier) throw new ServiceError("SUPPLIER_NOT_FOUND", "Supplier tidak ditemukan.");

  // Nomor SJ manual tidak boleh dobel per supplier
  const [existing] = await db
    .select({ id: supplierSj.id })
    .from(supplierSj)
    .where(
      and(
        eq(supplierSj.supplierId, input.supplierId),
        eq(supplierSj.sjNumber, input.sjNumber.trim()),
        isNull(supplierSj.deletedAt)
      )
    )
    .limit(1);
  if (existing) {
    throw new ServiceError("SJ_NUMBER_EXISTS", "Nomor surat jalan sudah terdaftar untuk supplier ini.");
  }

  // Kode label: SJL-<YYYYMMDD>-<seq 4 digit, urutan global per hari>
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `SJL-${datePart}-`;
  const existingToday = await db
    .select({ code: supplierSjBox.boxCode })
    .from(supplierSjBox)
    .where(sql`${supplierSjBox.boxCode} LIKE ${prefix + "%"}`);
  const startSeq = existingToday.length + 1;

  const result = await db.transaction(async (tx) => {
    const [sj] = await tx
      .insert(supplierSj)
      .values({
        sjNumber: input.sjNumber.trim(),
        supplierId: input.supplierId,
        plantId: input.plantId,
        status: "DRAFT",
        createdBy: input.actorUserId,
      })
      .returning();

    const labels: string[] = [];
    let seq = startSeq;
    for (const l of input.labels) {
      for (let i = 0; i < l.count; i++) {
        const boxCode = `${prefix}${String(seq).padStart(4, "0")}`;
        seq += 1;
        await tx.insert(supplierSjBox).values({
          supplierSjId: sj!.id,
          plantId: input.plantId,
          boxCode,
          tsgType: l.tsgType,
        });
        labels.push(boxCode);
      }
    }

    return { sj, labels };
  });

  await writeAudit({
    actorUserId: input.actorUserId,
    action: "supplier_sj.create",
    entityTable: "supplier_sj",
    entityId: result.sj!.id,
    after: { sjNumber: input.sjNumber.trim(), labelCount: result.labels.length },
  });

  return {
    sjId: result.sj!.id,
    sjNumber: result.sj!.sjNumber,
    status: result.sj!.status,
    labels: result.labels,
  };
}

// =============================================================================
// Scan label + input berat timbangan supplier
// =============================================================================

export async function weighSupplierSjBox(input: WeighSjBoxInput) {
  const [sj] = await db
    .select()
    .from(supplierSj)
    .where(eq(supplierSj.id, input.supplierSjId))
    .limit(1);
  if (!sj) throw new ServiceError("SJ_NOT_FOUND", "Surat jalan tidak ditemukan.");
  if (sj.status !== "DRAFT") {
    throw new ServiceError("SJ_NOT_DRAFT", "Hanya surat jalan berstatus DRAFT yang bisa diisi timbangan.");
  }
  if (input.supplierWeightKg <= 0 || input.supplierWeightKg > 100) {
    throw new ServiceError("INVALID_BOX_WEIGHT", "Berat boks harus 0-100 kg.");
  }

  const [box] = await db
    .select()
    .from(supplierSjBox)
    .where(
      and(
        eq(supplierSjBox.supplierSjId, input.supplierSjId),
        eq(supplierSjBox.boxCode, input.boxCode)
      )
    )
    .limit(1);
  if (!box) {
    throw new ServiceError("LABEL_NOT_FOUND", "Label tidak ditemukan di surat jalan ini.");
  }
  if (box.supplierWeightKg != null) {
    throw new ServiceError(
      "LABEL_ALREADY_WEIGHED",
      `Label ${box.boxCode} sudah ditimbang (${box.supplierWeightKg} kg).`
    );
  }

  const [updated] = await db
    .update(supplierSjBox)
    .set({
      supplierWeightKg: String(input.supplierWeightKg),
      enteredBy: input.actorUserId,
      enteredAt: new Date(),
    })
    .where(eq(supplierSjBox.id, box.id))
    .returning();

  await db
    .update(supplierSj)
    .set({ updatedAt: new Date() })
    .where(eq(supplierSj.id, input.supplierSjId));

  await writeAudit({
    actorUserId: input.actorUserId,
    action: "supplier_sj.box.weigh",
    entityTable: "supplier_sj_box",
    entityId: box.id,
    after: { boxCode: box.boxCode, supplierWeightKg: input.supplierWeightKg },
  });

  return updated;
}

// =============================================================================
// Mark SHIPPED — truk berangkat (wajib semua boks sudah tertimbang)
// =============================================================================

export async function markSupplierSjShipped(sjId: string, actorUserId: string) {
  const [sj] = await db
    .select()
    .from(supplierSj)
    .where(eq(supplierSj.id, sjId))
    .limit(1);
  if (!sj) throw new ServiceError("SJ_NOT_FOUND", "Surat jalan tidak ditemukan.");
  if (sj.status !== "DRAFT") {
    throw new ServiceError("SJ_NOT_DRAFT", "Hanya surat jalan DRAFT yang bisa ditandai dikirim.");
  }

  const boxes = await db
    .select({ id: supplierSjBox.id, supplierWeightKg: supplierSjBox.supplierWeightKg })
    .from(supplierSjBox)
    .where(and(eq(supplierSjBox.supplierSjId, sjId), isNull(supplierSjBox.deletedAt)));

  const unweighed = boxes.filter((b) => b.supplierWeightKg == null).length;
  if (unweighed > 0) {
    throw new ServiceError("SJ_HAS_UNWEIGHED_BOXES", `Masih ada ${unweighed} label yang belum ditimbang.`);
  }

  await db
    .update(supplierSj)
    .set({ status: "SHIPPED", shippedAt: new Date(), updatedAt: new Date() })
    .where(eq(supplierSj.id, sjId));

  await writeAudit({
    actorUserId,
    action: "supplier_sj.ship",
    entityTable: "supplier_sj",
    entityId: sjId,
    before: { status: "DRAFT" },
    after: { status: "SHIPPED", boxCount: boxes.length },
  });

  return { sjId, status: "SHIPPED", boxCount: boxes.length };
}

// =============================================================================
// Receive dari SJ — pabrik verifikasi → receiving + inventory + SJ RECEIVED
// =============================================================================

export async function receiveFromSupplierSj(input: ReceiveFromSjInput) {
  const [sj] = await db
    .select()
    .from(supplierSj)
    .where(eq(supplierSj.id, input.supplierSjId))
    .limit(1);
  if (!sj) throw new ServiceError("SJ_NOT_FOUND", "Surat jalan tidak ditemukan.");
  if (sj.plantId !== input.plantId) {
    throw new ServiceError("SJ_WRONG_PLANT", "Surat jalan ini ditujukan ke pabrik lain.");
  }
  if (sj.status !== "SHIPPED") {
    throw new ServiceError("SJ_NOT_SHIPPED", "Surat jalan belum berstatus SHIPPED.");
  }

  const boxes = await db
    .select()
    .from(supplierSjBox)
    .where(and(eq(supplierSjBox.supplierSjId, input.supplierSjId), isNull(supplierSjBox.deletedAt)));
  if (boxes.length === 0) throw new ServiceError("SJ_EMPTY", "Surat jalan tidak punya label.");

  // Validasi jumlah boks (opsional): label yang discan harus persis = label di SJ
  // TODO (tahap berikutnya): validasi berat saat receiving (timbang ulang/spot-check)
  if (input.verifiedBoxCodes && input.verifiedBoxCodes.length > 0) {
    const sjCodes = new Set(boxes.map((b) => b.boxCode));
    const verified = new Set(input.verifiedBoxCodes);
    const missing = boxes.filter((b) => !verified.has(b.boxCode)).map((b) => b.boxCode);
    const unknown = input.verifiedBoxCodes.filter((c) => !sjCodes.has(c));

    if (missing.length > 0 || unknown.length > 0) {
      throw new ServiceError(
        "SJ_COUNT_MISMATCH",
        missing.length > 0
          ? `Jumlah boks tidak sesuai SJ — ${missing.length} label belum terverifikasi.`
          : `Ada label yang bukan bagian dari SJ ini (${unknown.length}).`,
        { missingBoxCodes: missing, unknownBoxCodes: unknown, sjBoxCount: boxes.length, verifiedCount: input.verifiedBoxCodes.length }
      );
    }
    if (verified.size !== boxes.length) {
      throw new ServiceError(
        "SJ_COUNT_MISMATCH",
        `Jumlah boks tidak sesuai SJ — terverifikasi ${verified.size}, seharusnya ${boxes.length}.`,
        { sjBoxCount: boxes.length, verifiedCount: verified.size }
      );
    }
  }

  // receivingCode mengikuti pola createReceiving (RCV-<date>-<seq>)
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
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
  const totalWeight = boxes.reduce((s, b) => s + Number(b.supplierWeightKg ?? 0), 0);

  const result = await db.transaction(async (tx) => {
    const [header] = await tx
      .insert(tsgReceiving)
      .values({
        plantId: input.plantId,
        supplierId: sj.supplierId,
        receivingCode,
        receivedAt: new Date(),
        receivedBy: input.actorUserId,
        totalBoxCount: boxes.length,
        totalWeightKg: String(totalWeight),
        supplierDocRef: sj.sjNumber,
        source: "SJ",
        approvalStatus: "APPROVED", // SJ = sudah terverifikasi label & jumlah di gudang supplier
        notes: `Dari Surat Jalan Supplier ${sj.sjNumber}`,
      })
      .returning();
    if (!header) throw new Error("RECEIVING_CREATE_FAILED");

    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i]!;
      const [rb] = await tx
        .insert(tsgReceivingBox)
        .values({
          receivingId: header.id,
          plantId: input.plantId,
          boxCode: b.boxCode,
          weightKg: String(b.supplierWeightKg ?? 0),
          boxSeq: i + 1,
          tsgType: b.tsgType,
          receivedAt: new Date(),
        })
        .returning();
      if (!rb) throw new Error("BOX_CREATE_FAILED");

      await tx.insert(tsgInventory).values({
        plantId: input.plantId,
        boxId: rb.id,
        tsgType: b.tsgType,
        status: "AVAILABLE",
      });
    }

    await tx
      .update(supplierSj)
      .set({ status: "RECEIVED", receivedAt: new Date(), updatedAt: new Date() })
      .where(eq(supplierSj.id, input.supplierSjId));

    return header;
  });

  await writeAudit({
    actorUserId: input.actorUserId,
    action: "supplier_sj.receive",
    entityTable: "supplier_sj",
    entityId: input.supplierSjId,
    before: { status: "SHIPPED" },
    after: { status: "RECEIVED", receivingCode },
  });

  return {
    receivingId: result.id,
    receivingCode,
    totalBoxCount: boxes.length,
    totalWeightKg: totalWeight,
    inventoryCreated: boxes.length,
    sjStatus: "RECEIVED",
  };
}
