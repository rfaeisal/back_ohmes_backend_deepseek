import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { plant } from "./tenancy";
import { user } from "./identity";
import { carton } from "./wms-outbound";

// =============================================================================
// Enums
// =============================================================================

export const dispatchStatusEnum = pgEnum("dispatch_status", [
  "DRAFT",
  "DISPATCHED",
  "DELIVERED",
]);

export const dispatchDocTypeEnum = pgEnum("dispatch_doc_type", [
  "SURAT_JALAN",
  "INVOICE",
]);

// =============================================================================
// Dispatch Order — surat jalan ke customer
// =============================================================================

export const dispatchOrder = pgTable(
  "dispatch_order",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id),
    orderCode: text("order_code").notNull(), // 'DO-MLG-20260810-001'
    customerName: text("customer_name").notNull(),
    customerAddress: text("customer_address").notNull(),
    customerContact: text("customer_contact"),
    driverName: text("driver_name"),
    vehicleNo: text("vehicle_no"),
    status: dispatchStatusEnum("status").notNull().default("DRAFT"),
    orderedAt: timestamp("ordered_at").notNull().defaultNow(),
    dispatchedAt: timestamp("dispatched_at"),
    dispatchedBy: uuid("dispatched_by").references(() => user.id),
    deliveredAt: timestamp("delivered_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => ({
    uniqueOrderCodePerPlant: unique().on(t.plantId, t.orderCode),
    idxPlantStatus: index("idx_dispatch_plant_status").on(t.plantId, t.status),
  })
);

// =============================================================================
// Dispatch Item — mapping karton ke dispatch order
// =============================================================================

export const dispatchItem = pgTable("dispatch_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => dispatchOrder.id, { onDelete: "cascade" }),
  plantId: uuid("plant_id")
    .notNull()
    .references(() => plant.id),
  cartonId: uuid("carton_id")
    .notNull()
    .references(() => carton.id)
    .unique(), // 1 karton = 1 dispatch
  addedAt: timestamp("added_at").notNull().defaultNow(),
});

// =============================================================================
// Dispatch Document — PDF surat jalan
// =============================================================================

export const dispatchDocument = pgTable(
  "dispatch_document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => dispatchOrder.id, { onDelete: "cascade" }),
    plantId: uuid("plant_id")
      .notNull()
      .references(() => plant.id),
    docType: dispatchDocTypeEnum("doc_type").notNull(),
    docNumber: text("doc_number").notNull(), // 'SJ-MLG-20260810-001'
    pdfUrl: text("pdf_url").notNull(), // path to Blob/S3
    generatedAt: timestamp("generated_at").notNull().defaultNow(),
    generatedBy: uuid("generated_by")
      .notNull()
      .references(() => user.id),
  },
  (t) => ({
    uniqueDocNumber: unique().on(t.plantId, t.docType, t.docNumber),
  })
);
