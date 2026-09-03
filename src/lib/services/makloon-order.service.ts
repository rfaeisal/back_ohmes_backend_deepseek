// =============================================================================
// Makloon Order Service — entitas order makloon (docs/26 §2)
// =============================================================================
// Satu order = pemesan + produk pesanan + satuan akhir + bentuk bahan masuk.
// Receiving (TSG / batangan) menaut ke order; batch & keluaran mewarisi
// tautan; rijek makloon dikelompokkan per order untuk serah terima.
// =============================================================================

import { eq, and, isNull, desc, sql } from "drizzle-orm";
import db from "@/db";
import { makloonOrder } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { ServiceError } from "./shift.service";

export type MakloonFinalForm =
  | "BATANGAN"
  | "PACK"
  | "PACK_WRAP"
  | "SLOP"
  | "BAL"
  | "CARTON_SLOP"
  | "CARTON_BAL";
export type MakloonInputType = "BATANGAN" | "TSG";
export type MakloonOrderStatus = "OPEN" | "RECEIVING" | "PROCESSING" | "DONE";

export interface CreateMakloonOrderInput {
  plantId: string;
  customer: string;
  productName: string;
  tsgType: "REGULER" | "MILD" | "PUTIHAN";
  finalForm: MakloonFinalForm;
  inputType: MakloonInputType;
  notes?: string;
  actorUserId: string;
}

async function nextOrderCode(plantId: string): Promise<string> {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `MKL-${datePart}-`;
  const rows = await db
    .select({ code: makloonOrder.code })
    .from(makloonOrder)
    .where(
      and(
        eq(makloonOrder.plantId, plantId),
        sql`${makloonOrder.code} LIKE ${prefix + "%"}`
      )
    );
  const seq = String(rows.length + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

export async function createMakloonOrder(input: CreateMakloonOrderInput) {
  if (!input.customer.trim()) {
    throw new ServiceError("CUSTOMER_REQUIRED", "Nama pemesan wajib diisi.");
  }
  if (!input.productName.trim()) {
    throw new ServiceError("PRODUCT_REQUIRED", "Nama produk pesanan wajib diisi.");
  }

  const code = await nextOrderCode(input.plantId);

  const [o] = await db
    .insert(makloonOrder)
    .values({
      plantId: input.plantId,
      code,
      customer: input.customer.trim(),
      productName: input.productName.trim(),
      tsgType: input.tsgType,
      finalForm: input.finalForm,
      inputType: input.inputType,
      notes: input.notes?.trim() || null,
    })
    .returning();
  if (!o) throw new ServiceError("CREATE_FAILED", "Gagal membuat order makloon.");

  await writeAudit({
    actorUserId: input.actorUserId,
    action: "makloon_order.create",
    entityTable: "makloon_order",
    entityId: o.id,
    after: {
      code,
      customer: o.customer,
      productName: o.productName,
      tsgType: o.tsgType,
      finalForm: o.finalForm,
      inputType: o.inputType,
    },
  });

  return o;
}

export async function listMakloonOrders(plantId: string, status?: string) {
  return db
    .select()
    .from(makloonOrder)
    .where(
      and(
        eq(makloonOrder.plantId, plantId),
        isNull(makloonOrder.deletedAt),
        ...(status ? [eq(makloonOrder.status, status)] : [])
      )
    )
    .orderBy(desc(makloonOrder.createdAt))
    .limit(200);
}

export async function updateMakloonOrderStatus(
  id: string,
  status: MakloonOrderStatus,
  actorUserId: string
) {
  const [o] = await db
    .select()
    .from(makloonOrder)
    .where(eq(makloonOrder.id, id))
    .limit(1);
  if (!o) throw new ServiceError("ORDER_NOT_FOUND", "Order makloon tidak ditemukan.");

  const [updated] = await db
    .update(makloonOrder)
    .set({ status })
    .where(eq(makloonOrder.id, id))
    .returning();
  if (!updated) throw new ServiceError("UPDATE_FAILED", "Gagal mengubah status order.");

  await writeAudit({
    actorUserId,
    action: "makloon_order.status",
    entityTable: "makloon_order",
    entityId: id,
    before: { status: o.status },
    after: { status },
  });

  return updated;
}
