// =============================================================================
// Supplier SJ Service — Surat Jalan Supplier: pool label + pre-weigh di supplier
// =============================================================================
// v1.1: label pool generik dicetak di area office (web), di-assign ke SJ saat
// scan di gudang supplier (scan = assign + jenis + berat). Kode label memakai
// format kode boks TSG existing: TSG-<YYYYMMDD>-<NNN>.
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
  makloonOrder,
} from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { ServiceError } from "./shift.service";
export { ServiceError } from "./shift.service";

// =============================================================================
// Types
// =============================================================================

export type TsgType = "REGULER" | "MILD" | "PUTIHAN";

export interface CreateSupplierSjInput {
  sjNumber: string;
  supplierId: string;
  plantId: string;
  actorUserId: string;
}

export interface GeneratePoolLabelsInput {
  count: number;
  actorUserId: string;
}

export interface WeighSjBoxInput {
  supplierSjId: string;
  boxCode: string;
  tsgType?: TsgType; // wajib saat assign (label pool); mengikuti assign pertama untuk panggilan berikutnya
  supplierWeightKg: number;
  actorUserId: string;
}

export interface VoidSjLabelInput {
  boxCode: string;
  actorUserId: string;
  /** SUPERADMIN (isPrivileged) boleh mengelola pool milik petugas lain */
  isPrivileged?: boolean;
  /** Alasan VOID (label rusak, hilang, dsb) — disimpan ke DB + audit */
  reason?: string;
}

export interface ReceiveFromSjInput {
  supplierSjId: string;
  plantId: string;
  actorUserId: string;
  /** Label yang discan petugas gudang inbound saat validasi jumlah (opsional — default semua boks SJ) */
  verifiedBoxCodes?: string[];
  /** TSG milik makloon (0031) — diteruskan ke inventory & batch */
  isMakloon?: boolean;
  makloonCustomer?: string;
  makloonTarget?: "PACK" | "PACK_WRAP" | "SLOP" | "BAL" | "KARTON";
  /** Order makloon (docs/26 §2) — customer/target disalin dari order */
  makloonOrderId?: string;
}

// =============================================================================
// Helper — sequence kode boks global (pool + receiving manual harus unik)
// =============================================================================

// db client maupun drizzle transaction (PgTransaction) sama-sama punya select()
type QueryExecutor = Pick<typeof db, "select">;

async function nextBoxCodes(count: number, exec: QueryExecutor): Promise<string[]> {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `TSG-${datePart}-`;

  // Ambil kode hari ini dari BOTH tabel: supplier_sj_box (pool/assign) + tsg_receiving_box (manual)
  const sjRows = await exec
    .select({ boxCode: supplierSjBox.boxCode })
    .from(supplierSjBox)
    .where(sql`${supplierSjBox.boxCode} LIKE ${prefix + "%"}`);
  const rcvRows = await exec
    .select({ boxCode: tsgReceivingBox.boxCode })
    .from(tsgReceivingBox)
    .where(sql`${tsgReceivingBox.boxCode} LIKE ${prefix + "%"}`);

  let maxSeq = 0;
  for (const r of [...sjRows, ...rcvRows]) {
    const m = /-(\d+)$/.exec(r.boxCode);
    if (m?.[1]) maxSeq = Math.max(maxSeq, parseInt(m[1], 10));
  }

  const codes: string[] = [];
  for (let i = 1; i <= count; i++) {
    codes.push(`${prefix}${String(maxSeq + i).padStart(3, "0")}`);
  }
  return codes;
}

// =============================================================================
// Create SJ (tanpa label — boks masuk saat scan/assign)
// =============================================================================

export async function createSupplierSj(input: CreateSupplierSjInput) {
  if (!input.sjNumber.trim()) {
    throw new ServiceError("INVALID_SJ_NUMBER", "Nomor surat jalan wajib diisi.");
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

  const [sj] = await db
    .insert(supplierSj)
    .values({
      sjNumber: input.sjNumber.trim(),
      supplierId: input.supplierId,
      plantId: input.plantId,
      status: "DRAFT",
      createdBy: input.actorUserId,
    })
    .returning();
  if (!sj) throw new ServiceError("SJ_CREATE_FAILED", "Gagal membuat surat jalan.");

  // Sisa pool label yang bisa di-assign (label AVAILABLE milik petugas ini)
  const [poolCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(supplierSjBox)
    .where(
      and(
        eq(supplierSjBox.labelStatus, "AVAILABLE"),
        eq(supplierSjBox.createdBy, input.actorUserId),
        isNull(supplierSjBox.deletedAt)
      )
    );

  await writeAudit({
    actorUserId: input.actorUserId,
    action: "supplier_sj.create",
    entityTable: "supplier_sj",
    entityId: sj.id,
    after: { sjNumber: input.sjNumber.trim(), status: "DRAFT" },
  });

  return {
    sjId: sj.id,
    sjNumber: sj.sjNumber,
    status: sj.status,
    poolAvailable: poolCount?.count ?? 0,
  };
}

// =============================================================================
// Generate Pool Labels — cetak di area office (web), belum terikat SJ
// =============================================================================

export async function generatePoolLabels(input: GeneratePoolLabelsInput) {
  if (input.count < 1 || input.count > 500) {
    throw new ServiceError("POOL_COUNT_INVALID", "Jumlah label harus 1–500.");
  }

  const { boxCodes, firstInsertedId, available } = await db.transaction(async (tx) => {
    // Sequence global wajib melihat SEMUA kode boks hari ini. RLS SELECT policy
    // supplier_sj_box hanya memperlihatkan label milik creator
    // (plant_id IS NULL AND created_by = current_user_id), jadi petugas lain /
    // SUPERADMIN akan salah hitung dari nol dan tabrak unique constraint.
    // Bypass RLS (GUC app-level) hanya untuk komputasi sequence + insert
    // di transaksi ini.
    await tx.execute(sql.raw(`SET LOCAL app.bypass_rls = 'true'`));

    const codes = await nextBoxCodes(input.count, tx);

    const inserted = await tx
      .insert(supplierSjBox)
      .values(
        codes.map((boxCode) => ({
          boxCode,
          supplierSjId: null, // pool — belum terikat SJ
          plantId: null, // pool — pabrik tujuan menyusul saat assign
          tsgType: null, // pool — jenis dipilih saat scan
          labelStatus: "AVAILABLE" as const,
          createdBy: input.actorUserId,
        }))
      )
      .returning({ id: supplierSjBox.id });

    // Sisa pool = global (inventaris bersama area office, bukan per-petugas) —
    // dihitung di dalam transaksi yang sama supaya ikut bypass RLS.
    const [poolCount] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(supplierSjBox)
      .where(
        and(
          eq(supplierSjBox.labelStatus, "AVAILABLE"),
          isNull(supplierSjBox.deletedAt)
        )
      );

    return {
      boxCodes: codes,
      firstInsertedId: inserted[0]!.id,
      available: poolCount?.count ?? 0,
    };
  });

  await writeAudit({
    actorUserId: input.actorUserId,
    action: "supplier_sj.pool.generate",
    entityTable: "supplier_sj_box",
    entityId: firstInsertedId,
    after: { count: input.count, firstBoxCode: boxCodes[0], lastBoxCode: boxCodes[boxCodes.length - 1] },
  });

  return { boxCodes, available };
}

// =============================================================================
// Scan label = assign ke SJ + pilih jenis + input berat (satu langkah)
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
    .where(eq(supplierSjBox.boxCode, input.boxCode))
    .limit(1);
  if (!box) {
    throw new ServiceError("LABEL_NOT_FOUND", "Label tidak ditemukan.");
  }
  // Pool = inventaris bersama area office (migrasi 0010, SOP §3.2) — label
  // pool cetakan petugas lain boleh di-assign. Scope di-enforce RLS
  // p_sjb_update, bukan filter createdBy di level aplikasi.
  if (box.labelStatus === "VOID") {
    throw new ServiceError("LABEL_VOIDED", `Label ${box.boxCode} sudah ditandai hilang/rusak.`);
  }
  if (box.supplierSjId != null && box.supplierSjId !== input.supplierSjId) {
    throw new ServiceError("LABEL_ALREADY_ASSIGNED", `Label ${box.boxCode} sudah terikat surat jalan lain.`);
  }
  if (box.supplierSjId === input.supplierSjId && box.supplierWeightKg != null) {
    throw new ServiceError(
      "LABEL_ALREADY_WEIGHED",
      `Label ${box.boxCode} sudah ditimbang (${box.supplierWeightKg} kg).`
    );
  }

  const isAssign = box.supplierSjId == null; // pool label → assign sekarang
  if (isAssign && !input.tsgType) {
    throw new ServiceError("INVALID_TSG_TYPE", "Jenis TSG wajib dipilih saat label di-assign.");
  }

  const [updated] = await db
    .update(supplierSjBox)
    .set({
      ...(isAssign
        ? {
            supplierSjId: input.supplierSjId,
            plantId: sj.plantId, // plant mengikuti SJ
            tsgType: input.tsgType!,
            labelStatus: "ASSIGNED" as const,
          }
        : {}),
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
    action: isAssign ? "supplier_sj.box.assign" : "supplier_sj.box.weigh",
    entityTable: "supplier_sj_box",
    entityId: box.id,
    after: {
      boxCode: box.boxCode,
      tsgType: updated!.tsgType,
      supplierWeightKg: input.supplierWeightKg,
      labelStatus: updated!.labelStatus,
    },
  });

  return updated;
}

// =============================================================================
// VOID label — hanya label AVAILABLE (hilang/rusak di gudang)
// =============================================================================

export async function voidSupplierSjLabel(input: VoidSjLabelInput) {
  const [box] = await db
    .select()
    .from(supplierSjBox)
    .where(eq(supplierSjBox.boxCode, input.boxCode))
    .limit(1);
  if (!box) throw new ServiceError("LABEL_NOT_FOUND", "Label tidak ditemukan.");
  // Isolasi pool label di level kode (role DB superuser → RLS bypass);
  // SUPERADMIN (isPrivileged) boleh mengelola pool milik siapa pun.
  if (!input.isPrivileged && box.supplierSjId == null && box.createdBy !== input.actorUserId) {
    throw new ServiceError("LABEL_NOT_FOUND", "Label tidak ditemukan.");
  }
  if (box.labelStatus !== "AVAILABLE") {
    throw new ServiceError(
      "LABEL_NOT_AVAILABLE",
      `Label ${box.boxCode} tidak bisa di-VOID (status: ${box.labelStatus}).`
    );
  }

  const reason = input.reason?.trim() || null;
  const [updated] = await db
    .update(supplierSjBox)
    .set({
      labelStatus: "VOID",
      voidReason: reason,
      voidedAt: new Date(),
      voidedBy: input.actorUserId,
    })
    .where(eq(supplierSjBox.id, box.id))
    .returning();

  await writeAudit({
    actorUserId: input.actorUserId,
    action: "supplier_sj.box.void",
    entityTable: "supplier_sj_box",
    entityId: box.id,
    before: { labelStatus: "AVAILABLE" },
    after: { labelStatus: "VOID", boxCode: box.boxCode, voidReason: reason },
  });

  return {
    boxCode: updated!.boxCode,
    labelStatus: updated!.labelStatus,
    voidReason: updated!.voidReason,
    voidedAt: updated!.voidedAt,
  };
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

  if (boxes.length === 0) {
    throw new ServiceError("SJ_EMPTY", "Surat jalan belum punya boks. Scan label terlebih dahulu.");
  }

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

  // Order makloon (docs/26 §2): kalau di-link, customer & target disalin dari
  // order (input free-text diabaikan) dan order naik status → RECEIVING.
  let effIsMakloon = input.isMakloon ?? false;
  let effCustomer = input.makloonCustomer?.trim() || null;
  // Kolom makloon_target bebas teks — nilai order (mis. BATANGAN) boleh disimpan
  let effTarget: string | null = input.makloonTarget ?? null;
  let effOrderId: string | null = null;
  if (input.makloonOrderId) {
    const [order] = await db
      .select()
      .from(makloonOrder)
      .where(eq(makloonOrder.id, input.makloonOrderId))
      .limit(1);
    if (!order || order.plantId !== input.plantId) {
      throw new ServiceError("ORDER_NOT_FOUND", "Order makloon tidak ditemukan untuk pabrik ini.");
    }
    if (order.inputType !== "TSG") {
      throw new ServiceError(
        "ORDER_INPUT_MISMATCH",
        `Order ini menerima bahan masuk ${order.inputType} — bukan TSG.`
      );
    }
    effIsMakloon = true;
    effCustomer = order.customer;
    effTarget = order.finalForm === "CARTON_SLOP" ? "SLOP" : order.finalForm === "CARTON_BAL" ? "BAL" : order.finalForm;
    effOrderId = order.id;
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
        supplierSjId: sj.id, // link balik ke SJ (mobile handoff v2.2.3 §4)
        receivingCode,
        receivedAt: new Date(),
        receivedBy: input.actorUserId,
        totalBoxCount: boxes.length,
        totalWeightKg: String(totalWeight),
        supplierDocRef: sj.sjNumber,
        source: "SJ",
        approvalStatus: "APPROVED", // SJ = sudah terverifikasi label & jumlah di gudang supplier
        isMakloon: effIsMakloon,
        makloonCustomer: effCustomer,
        makloonTarget: effTarget,
        makloonOrderId: effOrderId,
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
          tsgType: b.tsgType ?? "REGULER",
          receivedAt: new Date(),
        })
        .returning();
      if (!rb) throw new Error("BOX_CREATE_FAILED");

      await tx.insert(tsgInventory).values({
        plantId: input.plantId,
        boxId: rb.id,
        tsgType: b.tsgType ?? "REGULER",
        isMakloon: effIsMakloon,
        makloonCustomer: effCustomer,
        makloonTarget: effTarget,
        makloonOrderId: effOrderId,
        status: "AVAILABLE",
      });
    }

    await tx
      .update(supplierSj)
      .set({ status: "RECEIVED", receivedAt: new Date(), updatedAt: new Date() })
      .where(eq(supplierSj.id, input.supplierSjId));

    // Order makloon naik status: OPEN → RECEIVING (docs/26 §2.1)
    if (effOrderId) {
      await tx
        .update(makloonOrder)
        .set({ status: "RECEIVING" })
        .where(and(eq(makloonOrder.id, effOrderId), eq(makloonOrder.status, "OPEN")));
    }

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
