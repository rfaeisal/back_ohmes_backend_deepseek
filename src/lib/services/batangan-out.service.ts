// =============================================================================
// Batangan Out Service — batangan keluar sebagai produk final (docs/26 §6)
// =============================================================================
// Produk final #1: batangan keluar untuk kebutuhan INTERNAL (antar pabrik /
// keperluan pabrik) dan order MAKLOON (mis. PT. B — TSG masuk → batangan
// keluar). Batch makloon mewariskan order + customer secara otomatis.
// =============================================================================

import { eq, and, desc, sql } from "drizzle-orm";
import db from "@/db";
import { batanganOut, batch, makloonOrder, user } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { ServiceError } from "./shift.service";

export type BatanganOutDestination = "INTERNAL" | "MAKLOON" | "LAIN";

export interface CreateBatanganOutInput {
  plantId: string;
  batchId: string;
  qtyKg: number;
  batangEst?: number;
  destinationType: BatanganOutDestination;
  destinationName?: string;
  docRef?: string;
  notes?: string;
  actorUserId: string;
}

export async function createBatanganOut(input: CreateBatanganOutInput) {
  if (input.qtyKg <= 0 || input.qtyKg > 10000) {
    throw new ServiceError("INVALID_KG", "Berat keluar harus 0-10000 kg.");
  }

  const [b] = await db
    .select()
    .from(batch)
    .where(and(eq(batch.id, input.batchId), eq(batch.plantId, input.plantId)))
    .limit(1);
  if (!b) throw new ServiceError("BATCH_NOT_FOUND", "Batch tidak ditemukan untuk pabrik ini.");

  // Tujuan & order: batch makloon mewarisi order (serah terima ke pemesan)
  let effType: BatanganOutDestination = input.destinationType;
  let effName = input.destinationName?.trim() || null;
  let effOrderId: string | null = null;
  if (b.makloonOrderId) {
    const [order] = await db
      .select({ id: makloonOrder.id, customer: makloonOrder.customer })
      .from(makloonOrder)
      .where(eq(makloonOrder.id, b.makloonOrderId))
      .limit(1);
    if (!order) {
      throw new ServiceError("ORDER_NOT_FOUND", "Order makloon batch ini tidak ditemukan.");
    }
    effType = "MAKLOON";
    effName = order.customer;
    effOrderId = order.id;
  } else if (!effName) {
    throw new ServiceError("DESTINATION_REQUIRED", "Nama tujuan wajib diisi.");
  }

  // Sisa batangan tersedia = batanganKg − Σ keluar sebelumnya
  const outRows = await db
    .select({ qtyKg: batanganOut.qtyKg })
    .from(batanganOut)
    .where(eq(batanganOut.batchId, input.batchId));
  const alreadyOut = outRows.reduce((s, r) => s + Number(r.qtyKg), 0);
  const remaining = Number(b.batanganKg) - alreadyOut;
  if (input.qtyKg > remaining + 0.001) {
    throw new ServiceError(
      "BATANGAN_INSUFFICIENT",
      `Sisa batangan batch ${b.code} tinggal ${Math.round(remaining * 1000) / 1000} kg — tidak cukup untuk ${input.qtyKg} kg.`
    );
  }

  const [out] = await db
    .insert(batanganOut)
    .values({
      plantId: input.plantId,
      batchId: input.batchId,
      qtyKg: String(input.qtyKg),
      batangEst: input.batangEst ?? null,
      destinationType: effType,
      destinationName: effName!,
      makloonOrderId: effOrderId,
      docRef: input.docRef?.trim() || null,
      notes: input.notes?.trim() || null,
      outBy: input.actorUserId,
    })
    .returning();
  if (!out) throw new ServiceError("CREATE_FAILED", "Gagal mencatat batangan keluar.");

  await writeAudit({
    actorUserId: input.actorUserId,
    action: "batangan_out.create",
    entityTable: "batangan_out",
    entityId: out.id,
    after: {
      batchCode: b.code,
      qtyKg: input.qtyKg,
      destinationType: effType,
      destinationName: effName,
      makloonOrderId: effOrderId,
    },
  });

  return { ...out, qtyKg: Number(out.qtyKg) };
}

export async function getBatanganOutDetail(id: string) {
  const [out] = await db
    .select()
    .from(batanganOut)
    .where(eq(batanganOut.id, id))
    .limit(1);
  if (!out) return null;

  const [b] = out.batchId
    ? await db
        .select({ code: batch.code, batanganKg: batch.batanganKg })
        .from(batch)
        .where(eq(batch.id, out.batchId))
        .limit(1)
    : [undefined];

  const [order] = out.makloonOrderId
    ? await db
        .select({ code: makloonOrder.code, productName: makloonOrder.productName })
        .from(makloonOrder)
        .where(eq(makloonOrder.id, out.makloonOrderId))
        .limit(1)
    : [undefined];

  const [actor] = await db
    .select({ name: user.fullName })
    .from(user)
    .where(eq(user.id, out.outBy))
    .limit(1);

  return {
    ...out,
    qtyKg: Number(out.qtyKg),
    batchCode: b?.code ?? null,
    batanganKg: b ? Number(b.batanganKg) : null,
    orderCode: order?.code ?? null,
    productName: order?.productName ?? null,
    outByName: actor?.name ?? null,
  };
}

export async function listBatanganOuts(plantId: string, limit = 100) {
  const rows = await db
    .select({
      id: batanganOut.id,
      batchId: batanganOut.batchId,
      batchCode: batch.code,
      batanganKg: batch.batanganKg,
      qtyKg: batanganOut.qtyKg,
      batangEst: batanganOut.batangEst,
      destinationType: batanganOut.destinationType,
      destinationName: batanganOut.destinationName,
      makloonOrderId: batanganOut.makloonOrderId,
      orderCode: makloonOrder.code,
      docRef: batanganOut.docRef,
      notes: batanganOut.notes,
      outAt: batanganOut.outAt,
      outByName: sql<string>`(SELECT u.full_name FROM "user" u WHERE u.id = ${batanganOut.outBy})`.mapWith(String),
    })
    .from(batanganOut)
    .leftJoin(batch, eq(batanganOut.batchId, batch.id))
    .leftJoin(makloonOrder, eq(batanganOut.makloonOrderId, makloonOrder.id))
    .where(eq(batanganOut.plantId, plantId))
    .orderBy(desc(batanganOut.outAt))
    .limit(limit);

  return rows.map((r) => ({ ...r, qtyKg: Number(r.qtyKg), batanganKg: Number(r.batanganKg ?? 0) }));
}
