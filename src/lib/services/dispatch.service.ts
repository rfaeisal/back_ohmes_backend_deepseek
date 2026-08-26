// =============================================================================
// Dispatch Service — Distribusi Basic + Surat Jalan PDF
// =============================================================================

import { eq, and, sql, inArray } from "drizzle-orm";
import db from "@/db";
import { dispatchOrder, dispatchItem, dispatchDocument } from "@/db/schema/dispatch";
import { carton } from "@/db/schema/wms-outbound";
import { plant } from "@/db/schema/tenancy";
import { product } from "@/db/schema/master-product";
import { ServiceError } from "./shift.service";
export { ServiceError } from "./shift.service";

// =============================================================================
// Types
// =============================================================================

export interface CreateDispatchInput {
  plantId: string;
  customerName: string;
  customerAddress: string;
  customerContact?: string;
  driverName?: string;
  vehicleNo?: string;
  cartonIds: string[];
  notes?: string;
  createdBy: string;
}

export interface SuratJalanData {
  orderCode: string;
  plantName: string;
  plantAddress: string;
  customerName: string;
  customerAddress: string;
  customerContact: string;
  driverName: string;
  vehicleNo: string;
  notes: string;
  date: string;
  cartons: Array<{
    code: string;
    productName: string;
    packCount: number;
  }>;
  totalCartons: number;
  totalPacks: number;
}

// =============================================================================
// Create Dispatch Order
// =============================================================================

export async function createDispatchOrder(input: CreateDispatchInput) {
  // Validasi semua karton READY
  const cartons = await db
    .select({ id: carton.id, status: carton.status, code: carton.code })
    .from(carton)
    .where(
      and(
        eq(carton.plantId, input.plantId),
        inArray(carton.id, input.cartonIds)
      )
    );

  if (cartons.length !== input.cartonIds.length) {
    throw new ServiceError("CARTON_NOT_FOUND", "Beberapa karton tidak ditemukan.");
  }

  for (const c of cartons) {
    if (c.status !== "READY") {
      throw new ServiceError(
        "CARTON_NOT_READY",
        `Karton ${c.code} belum READY (status: ${c.status}). Hanya karton READY yang bisa di-dispatch.`
      );
    }
  }

  // Generate order code
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const existing = await db
    .select({ count: sql<number>`count(*)` })
    .from(dispatchOrder)
    .where(and(eq(dispatchOrder.plantId, input.plantId), sql`created_at::date = CURRENT_DATE`));

  const seq = (existing[0]?.count ?? 0) + 1;

  const [plt] = await db
    .select({ code: plant.code })
    .from(plant)
    .where(eq(plant.id, input.plantId))
    .limit(1);

  const orderCode = `DO-${plt?.code ?? "UNK"}-${today}-${String(seq).padStart(3, "0")}`;

  // Create dalam transaksi
  const result = await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(dispatchOrder)
      .values({
        plantId: input.plantId,
        orderCode,
        customerName: input.customerName,
        customerAddress: input.customerAddress,
        customerContact: input.customerContact ?? null,
        driverName: input.driverName ?? null,
        vehicleNo: input.vehicleNo ?? null,
        notes: input.notes ?? null,
      })
      .returning();

    if (!order) throw new Error("ORDER_CREATE_FAILED");

    // Add cartons as dispatch items
    for (const cartonId of input.cartonIds) {
      await tx.insert(dispatchItem).values({
        orderId: order.id,
        plantId: input.plantId,
        cartonId,
      });
    }

    return order;
  });

  return {
    orderId: result.id,
    orderCode: result.orderCode,
    status: "DRAFT",
    cartonCount: input.cartonIds.length,
  };
}

// =============================================================================
// Confirm Dispatch (DRAFT → DISPATCHED)
// =============================================================================

export async function confirmDispatch(orderId: string, dispatchedBy: string) {
  const [order] = await db
    .select()
    .from(dispatchOrder)
    .where(eq(dispatchOrder.id, orderId))
    .limit(1);

  if (!order) throw new ServiceError("ORDER_NOT_FOUND", "Dispatch order tidak ditemukan.");
  if (order.status !== "DRAFT") {
    throw new ServiceError("ORDER_NOT_DRAFT", "Hanya order status DRAFT yang bisa di-dispatch.");
  }

  // Get cartons in this order
  const items = await db
    .select({ cartonId: dispatchItem.cartonId })
    .from(dispatchItem)
    .where(eq(dispatchItem.orderId, orderId));

  await db.transaction(async (tx) => {
    // Update order status
    await tx
      .update(dispatchOrder)
      .set({ status: "DISPATCHED", dispatchedAt: new Date(), dispatchedBy })
      .where(eq(dispatchOrder.id, orderId));

    // Update all cartons → DISPATCHED
    for (const item of items) {
      await tx
        .update(carton)
        .set({ status: "DISPATCHED" })
        .where(eq(carton.id, item.cartonId));
    }
  });

  return { orderId, status: "DISPATCHED", cartonsDispatched: items.length };
}

// =============================================================================
// Build Surat Jalan Data (untuk PDF generation)
// =============================================================================

export async function buildSuratJalanData(orderId: string): Promise<SuratJalanData> {
  const [order] = await db
    .select()
    .from(dispatchOrder)
    .where(eq(dispatchOrder.id, orderId))
    .limit(1);

  if (!order) throw new ServiceError("ORDER_NOT_FOUND", "Dispatch order tidak ditemukan.");

  const [plt] = await db
    .select({ name: plant.name, address: plant.address })
    .from(plant)
    .where(eq(plant.id, order.plantId))
    .limit(1);

  const items = await db
    .select({
      cartonCode: carton.code,
      packCount: carton.actualPackCount,
      productName: sql<string>`COALESCE(${product.brand} || ' ' || ${product.variant}, ${product.brand})`,
    })
    .from(dispatchItem)
    .innerJoin(carton, eq(dispatchItem.cartonId, carton.id))
    .innerJoin(product, eq(carton.productId, product.id))
    .where(eq(dispatchItem.orderId, orderId));

  return {
    orderCode: order.orderCode,
    plantName: plt?.name ?? "",
    plantAddress: plt?.address ?? "",
    customerName: order.customerName,
    customerAddress: order.customerAddress,
    customerContact: order.customerContact ?? "",
    driverName: order.driverName ?? "-",
    vehicleNo: order.vehicleNo ?? "-",
    notes: order.notes ?? "",
    date: new Date().toISOString().slice(0, 10),
    cartons: items.map((i) => ({
      code: i.cartonCode,
      productName: i.productName ?? "-",
      packCount: i.packCount,
    })),
    totalCartons: items.length,
    totalPacks: items.reduce((s, i) => s + i.packCount, 0),
  };
}

// =============================================================================
// Generate Surat Jalan Doc Number + Store
// =============================================================================

export async function generateSuratJalanDocument(
  orderId: string,
  generatedBy: string
) {
  const data = await buildSuratJalanData(orderId);

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  const [order] = await db
    .select({ plantId: dispatchOrder.plantId })
    .from(dispatchOrder)
    .where(eq(dispatchOrder.id, orderId))
    .limit(1);

  const docNumber = `SJ-${today}-${String(Date.now() % 1000).padStart(3, "0")}`;

  const [doc] = await db
    .insert(dispatchDocument)
    .values({
      orderId,
      plantId: order!.plantId,
      docType: "SURAT_JALAN",
      docNumber,
      pdfUrl: `/api/v1/dispatch/documents/${docNumber}/download`,
      generatedBy,
    })
    .returning();

  return {
    docId: doc!.id,
    docNumber,
    pdfUrl: doc!.pdfUrl,
    generatedAt: doc!.generatedAt,
    suratJalanData: data,
  };
}
