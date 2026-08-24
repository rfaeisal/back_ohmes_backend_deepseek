// =============================================================================
// Shift Service — Business Logic Shift Lifecycle
// =============================================================================
// Semua aturan bisnis shift di-enforce di sini.
// Dipanggil dari API route handlers (Next.js Route Handlers).
// =============================================================================

import { eq, and, isNull, sql, inArray } from "drizzle-orm";
import db from "@/db";
import {
  shiftReport,
  shiftMember,
  shiftWaste,
  shiftHandoff,
  tsgBoxSession,
  tsgBoxProcess,
  downtimeLog,
  shiftConsumption,
} from "@/db/schema";
import { machine, shiftTemplate, product } from "@/db/schema/master-product";
import { calculateShiftYield } from "@/lib/calc";
import { writeAudit } from "@/lib/audit";
import { notifyShiftCompleted } from "./fcm.service";

// =============================================================================
// Types
// =============================================================================

export interface StartShiftInput {
  machineId: string;
  productId: string;
  shiftTemplateId: string;
  members: Array<{
    userId: string;
    shiftRoleId: string;
  }>;
  plantId: string;
  createdBy: string;
  /** Handoff spesifik yang mau diklaim (opsional — default: handoff mesin ini) */
  handoffId?: string;
}

export interface EndShiftInput {
  shiftId: string;
  waste: Array<{
    category: "MENIR" | "RIJEKAN" | "DEBU_KASAR" | "DEBU_HALUS";
    kg: number;
    settlementStatus: "PENDING" | "LUNAS";
  }>;
  notes?: string;
  /** Pemakaian material tambahan di level shift (karton, dus, dll) — opsional */
  consumptions?: Array<{
    consumableItemId: string;
    quantity: number;
    note?: string;
  }>;
}

export interface HandoffInput {
  shiftId: string;
  plantId: string;
  sisaTsgKg: number;
  batanganSementaraKg: number;
  note?: string;
  weighedBy: string;
}

// =============================================================================
// Start Shift
// =============================================================================

export async function startShift(input: StartShiftInput) {
  // 1. Validasi mesin — hanya MAKER yang bisa mulai shift produksi
  const [machineInfo] = await db
    .select({ type: machine.type })
    .from(machine)
    .where(eq(machine.id, input.machineId))
    .limit(1);

  if (!machineInfo) {
    throw new ServiceError("MACHINE_NOT_FOUND", "Mesin tidak ditemukan di master data.");
  }
  if (machineInfo.type !== "MAKER") {
    throw new ServiceError(
      "MACHINE_NOT_MAKER",
      "Shift produksi hanya bisa dimulai di mesin MAKER. Mesin HLP punya alur sendiri."
    );
  }

  // 2. Validasi mesin tidak sedang RUNNING
  const [activeShift] = await db
    .select({ id: shiftReport.id })
    .from(shiftReport)
    .where(
      and(
        eq(shiftReport.machineId, input.machineId),
        eq(shiftReport.status, "RUNNING")
      )
    )
    .limit(1);

  if (activeShift) {
    throw new ServiceError(
      "MACHINE_HAS_RUNNING_SHIFT",
      "Mesin masih memiliki shift aktif. Akhiri shift sebelumnya dulu.",
      { activeShiftId: activeShift.id }
    );
  }

  // 2. Validasi produk terdaftar di plant
  // (via plant_product — simplified untuk sekarang)

  // 3. Validasi minimal 1 anggota dengan canEndShift
  // (via shift_role — simplified)

  // 4. Cek ShiftHandoff unclaimed — eksplisit via handoffId ATAU auto untuk mesin ini
  const [unclaimedHandoff] = await db
    .select()
    .from(shiftHandoff)
    .where(
      and(
        isNull(shiftHandoff.claimedByShiftId),
        input.handoffId
          ? eq(shiftHandoff.id, input.handoffId)
          : eq(shiftHandoff.machineId, input.machineId)
      )
    )
    .orderBy(shiftHandoff.weighedAt)
    .limit(1);

  // 5. Create shift report dalam transaksi
  const result = await db.transaction(async (tx) => {
    // Create shift
    const [created] = await tx
      .insert(shiftReport)
      .values({
        plantId: input.plantId,
        machineId: input.machineId,
        productId: input.productId,
        shiftTemplateId: input.shiftTemplateId,
        reportDate: new Date().toISOString().slice(0, 10),
        actualStart: new Date(),
        status: "RUNNING",
        createdBy: input.createdBy,
      })
      .returning();

    if (!created) throw new Error("SHIFT_CREATE_FAILED");

    // Create members
    for (const member of input.members) {
      await tx.insert(shiftMember).values({
        shiftReportId: created.id,
        userId: member.userId,
        shiftRoleId: member.shiftRoleId,
      });
    }

    // Claim handoff jika ada
    if (unclaimedHandoff) {
      await tx
        .update(shiftHandoff)
        .set({
          claimedByShiftId: created.id,
          claimedAt: new Date(),
        })
        .where(eq(shiftHandoff.id, unclaimedHandoff.id));

      // Buat boks partial otomatis dari sisa TSG handoff
      await tx.insert(tsgBoxProcess).values({
        shiftReportId: created.id,
        plantId: created.plantId,
        boxNumber: 1,
        boxCode: `HANDOFF-${unclaimedHandoff.fromShiftId.slice(0, 8)}`,
        tsgWeightKg: String(unclaimedHandoff.sisaTsgKg),
        isPartial: true,
        handoffId: unclaimedHandoff.id,
        openedAt: new Date(),
      });
    }

    return { shift: created, claimedHandoff: unclaimedHandoff ?? null };
  });

  await writeAudit({
    actorUserId: input.createdBy,
    action: "shift.start",
    entityTable: "shift_report",
    entityId: result.shift.id,
    after: { machineId: input.machineId, productId: input.productId, status: "RUNNING" },
  });

  return result;
}

// =============================================================================
// End Shift
// =============================================================================

export async function endShift(input: EndShiftInput) {
  // 1. Validasi shift status RUNNING
  const [shift] = await db
    .select()
    .from(shiftReport)
    .where(eq(shiftReport.id, input.shiftId))
    .limit(1);

  if (!shift) throw new ServiceError("SHIFT_NOT_FOUND", "Shift tidak ditemukan.");
  if (shift.status !== "RUNNING") {
    throw new ServiceError(
      "SHIFT_NOT_RUNNING",
      "Hanya shift dengan status RUNNING yang bisa diakhiri."
    );
  }

  // 2. Validasi 4 kategori waste lengkap
  const categories: string[] = input.waste.map((w) => w.category);
  const requiredCategories: string[] = ["MENIR", "RIJEKAN", "DEBU_KASAR", "DEBU_HALUS"];
  for (const cat of requiredCategories) {
    if (!categories.includes(cat)) {
      throw new ServiceError(
        "WASTE_INCOMPLETE",
        `Kategori waste ${cat} wajib diisi.`
      );
    }
  }

  // 3. Cek tidak ada boks aktif tanpa handoff (bisa lebih dari satu — sesi multi-boks)
  const activeBoxes = await db
    .select({ id: tsgBoxProcess.id })
    .from(tsgBoxProcess)
    .where(
      and(
        eq(tsgBoxProcess.shiftReportId, input.shiftId),
        isNull(tsgBoxProcess.completedAt)
      )
    );

  if (activeBoxes.length > 0) {
    // Cek apakah handoff sudah dibuat
    const [handoff] = await db
      .select()
      .from(shiftHandoff)
      .where(eq(shiftHandoff.fromShiftId, input.shiftId))
      .limit(1);

    if (!handoff) {
      throw new ServiceError(
        "SHIFT_HAS_ACTIVE_BOX",
        "Masih ada boks aktif. Timbang atau buat handoff terlebih dahulu.",
        { activeBoxIds: activeBoxes.map((b) => b.id) }
      );
    }
  }

  // 4. Insert waste + consumptions + update shift dalam transaksi
  await db.transaction(async (tx) => {
    for (const w of input.waste) {
      // UPSERT: shift yang di-reopen lalu di-end ulang sudah punya baris waste
      // dari end pertama — insert polos menabrak unique (shift_report_id,
      // category). End ulang = revisi angka waste.
      await tx
        .insert(shiftWaste)
        .values({
          shiftReportId: input.shiftId,
          category: w.category as "MENIR" | "RIJEKAN" | "DEBU_KASAR" | "DEBU_HALUS",
          kg: String(w.kg),
          settlementStatus: w.settlementStatus as "PENDING" | "LUNAS",
        })
        .onConflictDoUpdate({
          target: [shiftWaste.shiftReportId, shiftWaste.category],
          set: {
            kg: String(w.kg),
            settlementStatus: w.settlementStatus as "PENDING" | "LUNAS",
          },
        });
    }

    for (const c of input.consumptions ?? []) {
      await tx.insert(shiftConsumption).values({
        shiftReportId: input.shiftId,
        plantId: shift.plantId,
        consumableItemId: c.consumableItemId,
        quantity: String(c.quantity),
        note: c.note ?? null,
        loggedBy: shift.createdBy,
      });
    }

    await tx
      .update(shiftReport)
      .set({
        status: "COMPLETED",
        actualEnd: new Date(),
        notes: input.notes ?? shift.notes,
      })
      .where(eq(shiftReport.id, input.shiftId));
  });

  await writeAudit({
    actorUserId: shift.createdBy,
    action: "shift.end",
    entityTable: "shift_report",
    entityId: input.shiftId,
    before: { status: "RUNNING" },
    after: { status: "COMPLETED" },
  });

  // Push ke Plant Manager pabrik ini (fire-and-forget — gagal tidak
  // menggagalkan end shift). Mobile handoff §1.
  void notifyShiftCompleted({
    shiftId: shift.id,
    plantId: shift.plantId,
    machineId: shift.machineId,
    reportDate: shift.reportDate,
  });

  return { shiftId: input.shiftId, status: "COMPLETED" };
}

// =============================================================================
// Handoff
// =============================================================================

export async function createHandoff(input: HandoffInput) {
  // Validasi shift RUNNING
  const [shift] = await db
    .select()
    .from(shiftReport)
    .where(eq(shiftReport.id, input.shiftId))
    .limit(1);

  if (!shift || shift.status !== "RUNNING") {
    throw new ServiceError(
      "SHIFT_NOT_RUNNING",
      "Hanya shift RUNNING yang bisa buat handoff."
    );
  }

  // Validasi ada boks aktif (bisa lebih dari satu — sesi multi-boks)
  const activeBoxes = await db
    .select({ id: tsgBoxProcess.id })
    .from(tsgBoxProcess)
    .where(
      and(
        eq(tsgBoxProcess.shiftReportId, input.shiftId),
        isNull(tsgBoxProcess.completedAt)
      )
    );

  if (activeBoxes.length === 0) {
    throw new ServiceError(
      "NO_ACTIVE_BOX",
      "Tidak ada boks aktif untuk di-handoff."
    );
  }

  // Validasi berat > 0
  if (input.sisaTsgKg <= 0 || input.batanganSementaraKg <= 0) {
    throw new ServiceError(
      "INVALID_WEIGHT",
      "Berat sisa TSG dan batangan sementara harus > 0."
    );
  }

  // Create handoff + tutup boks aktif (sisa pindah ke shift berikutnya)
  const handoff = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(shiftHandoff)
      .values({
        fromShiftId: input.shiftId,
        machineId: shift.machineId,
        plantId: input.plantId,
        sisaTsgKg: String(input.sisaTsgKg),
        batanganSementaraKg: String(input.batanganSementaraKg),
        weighedAt: new Date(),
        weighedBy: input.weighedBy,
        note: input.note ?? null,
      })
      .returning();

    // Tutup semua boks aktif tanpa timbangan (sisa sudah di-handoff)
    await tx
      .update(tsgBoxProcess)
      .set({ completedAt: new Date() })
      .where(
        inArray(
          tsgBoxProcess.id,
          activeBoxes.map((b) => b.id)
        )
      );

    // Sesi OPEN di shift ini ditutup via handoff (tidak ditimbang kolektif)
    await tx
      .update(tsgBoxSession)
      .set({ status: "HANDOFF", weighedAt: new Date() })
      .where(
        and(
          eq(tsgBoxSession.shiftReportId, input.shiftId),
          eq(tsgBoxSession.status, "OPEN")
        )
      );

    return created;
  });

  return handoff;
}

// =============================================================================
// Approve
// =============================================================================

export async function approveShift(
  shiftId: string,
  approvedBy: string,
  reviewNotes?: string
) {
  const [shift] = await db
    .select()
    .from(shiftReport)
    .where(eq(shiftReport.id, shiftId))
    .limit(1);

  if (!shift) throw new ServiceError("SHIFT_NOT_FOUND", "Shift tidak ditemukan.");
  if (shift.status !== "COMPLETED") {
    throw new ServiceError(
      "SHIFT_NOT_COMPLETED",
      "Hanya shift COMPLETED yang bisa di-approve."
    );
  }
  if (shift.createdBy === approvedBy) {
    throw new ServiceError(
      "SELF_APPROVAL",
      "Tidak bisa approve shift sendiri. Harus supervisor lain."
    );
  }

  const [updated] = await db
    .update(shiftReport)
    .set({
      status: "APPROVED",
      approvedBy,
      approvedAt: new Date(),
      reviewNotes: reviewNotes ?? null,
    })
    .where(eq(shiftReport.id, shiftId))
    .returning();

  await writeAudit({
    actorUserId: approvedBy,
    action: "shift.approve",
    entityTable: "shift_report",
    entityId: shiftId,
    before: { status: "COMPLETED" },
    after: { status: "APPROVED", reviewNotes },
  });

  return updated;
}

// =============================================================================
// Reopen (COMPLETED → RUNNING, pre-approval only)
// =============================================================================

export async function reopenShift(shiftId: string, reason: string) {
  const [shift] = await db
    .select()
    .from(shiftReport)
    .where(eq(shiftReport.id, shiftId))
    .limit(1);

  if (!shift) throw new ServiceError("SHIFT_NOT_FOUND", "Shift tidak ditemukan.");
  if (shift.status !== "COMPLETED") {
    throw new ServiceError(
      "SHIFT_NOT_COMPLETED",
      "Hanya shift COMPLETED yang bisa di-reopen."
    );
  }

  await db
    .update(shiftReport)
    .set({ status: "RUNNING", notes: reason })
    .where(eq(shiftReport.id, shiftId));

  return { shiftId, status: "RUNNING" };
}

// =============================================================================
// Get Shift Detail
// =============================================================================

export async function getShiftDetail(shiftId: string) {
  const [shift] = await db
    .select({
      id: shiftReport.id,
      plantId: shiftReport.plantId,
      machineId: shiftReport.machineId,
      productId: shiftReport.productId,
      shiftTemplateId: shiftReport.shiftTemplateId,
      reportDate: shiftReport.reportDate,
      actualStart: shiftReport.actualStart,
      actualEnd: shiftReport.actualEnd,
      status: shiftReport.status,
      createdBy: shiftReport.createdBy,
      approvedBy: shiftReport.approvedBy,
      approvedAt: shiftReport.approvedAt,
      reviewNotes: shiftReport.reviewNotes,
      notes: shiftReport.notes,
    })
    .from(shiftReport)
    .where(eq(shiftReport.id, shiftId))
    .limit(1);

  if (!shift) throw new ServiceError("SHIFT_NOT_FOUND", "Shift tidak ditemukan.");

  // Get related data with resolved names
  const members = await db
    .select({
      id: shiftMember.id, userId: shiftMember.userId, shiftRoleId: shiftMember.shiftRoleId,
      leaveMinutes: shiftMember.leaveMinutes, note: shiftMember.note,
      userName: sql<string>`u.full_name`.mapWith(String),
      roleName: sql<string>`sr.name`.mapWith(String),
    })
    .from(shiftMember)
    .leftJoin(sql`"user" u`, eq(shiftMember.userId, sql`u.id`))
    .leftJoin(sql`shift_role sr`, eq(shiftMember.shiftRoleId, sql`sr.id`))
    .where(eq(shiftMember.shiftReportId, shiftId));

  // Get machine code & shift template name
  const [machineInfo] = await db.select({ code: machine.code }).from(machine).where(eq(machine.id, shift.machineId)).limit(1);
  const [templateInfo] = await db.select({ name: shiftTemplate.name }).from(shiftTemplate).where(eq(shiftTemplate.id, shift.shiftTemplateId)).limit(1);
  const [productInfo] = await db.select({ brand: product.brand, code: product.code }).from(product).where(eq(product.id, shift.productId)).limit(1);

  const wastes = await db.select().from(shiftWaste).where(eq(shiftWaste.shiftReportId, shiftId));
  const boxes = await db.select().from(tsgBoxProcess).where(eq(tsgBoxProcess.shiftReportId, shiftId)).orderBy(tsgBoxProcess.boxNumber);
  const handoffs = await db.select().from(shiftHandoff).where(eq(shiftHandoff.fromShiftId, shiftId));

  // Consumption, downtime, maintenance (pakai raw SQL — kolom snake_case)
  const consumptionsRaw = await db.execute(
    sql`SELECT tbc.*, ci.name as item_name FROM tsg_box_consumption tbc LEFT JOIN consumable_item ci ON ci.id = tbc.consumable_item_id WHERE tbc.tsg_box_id IN (SELECT id FROM tsg_box_process WHERE shift_report_id = ${shiftId}::uuid)`
  );

  const downtimes = await db.select().from(downtimeLog).where(eq(downtimeLog.shiftReportId, shiftId));

  const maintenancesRaw = await db.execute(
    sql`SELECT me.*, sp.name as item_name FROM maintenance_event me LEFT JOIN sparepart sp ON sp.id = me.sparepart_id WHERE me.shift_report_id = ${shiftId}::uuid`
  );

  const consumptions = Array.isArray(consumptionsRaw)
    ? consumptionsRaw.map((r: any) => ({
        id: r.id, boxId: r.tsg_box_id || r.box_id, consumableItemId: r.consumable_item_id,
        quantity: r.quantity, note: r.note, itemName: r.item_name,
      }))
    : ((consumptionsRaw as any)?.rows || []).map((r: any) => ({
        id: r.id, boxId: r.tsg_box_id || r.box_id, consumableItemId: r.consumable_item_id,
        quantity: r.quantity, note: r.note, itemName: r.item_name,
      }));

  // Shift-level consumption (dicatat saat akhiri shift — karton, dus, dll)
  const shiftConsRaw = await db.execute(
    sql`SELECT sc.*, ci.name as item_name FROM shift_consumption sc LEFT JOIN consumable_item ci ON ci.id = sc.consumable_item_id WHERE sc.shift_report_id = ${shiftId}::uuid`
  );
  const shiftConsumptions = (Array.isArray(shiftConsRaw) ? shiftConsRaw : (shiftConsRaw as any)?.rows || [])
    .map((r: any) => ({
      id: r.id,
      consumableItemId: r.consumable_item_id,
      quantity: r.quantity,
      note: r.note,
      itemName: r.item_name,
      isShiftLevel: true,
    }));

  const maintenances = Array.isArray(maintenancesRaw)
    ? maintenancesRaw.map((r: any) => ({
        id: r.id, sparepartId: r.sparepart_id, quantity: r.quantity,
        note: r.note, itemName: r.item_name,
      }))
    : ((maintenancesRaw as any)?.rows || []).map((r: any) => ({
        id: r.id, sparepartId: r.sparepart_id, quantity: r.quantity,
        note: r.note, itemName: r.item_name,
      }));

  const yieldPct = calculateShiftYield({
    boxes: boxes.filter((b) => b.outputWeightKg && b.tsgWeightKg).map((b) => ({
      outputWeightKg: Number(b.outputWeightKg), tsgWeightKg: Number(b.tsgWeightKg),
    })),
  });

  return {
    ...shift,
    machineCode: machineInfo?.code,
    shiftTemplateName: templateInfo?.name,
    productName: productInfo ? `${productInfo.brand} ${productInfo.code}` : null,
    members,
    wastes,
    boxes,
    handoffs,
    consumptions,
    shiftConsumptions,
    downtimes,
    maintenances,
    yieldPct,
  };
}

// =============================================================================
// List Shifts
// =============================================================================

export async function listShifts(params: {
  plantId?: string;
  status?: string;
  from?: string;
  to?: string;
  limit?: number;
  cursor?: string;
}) {
  const conditions = [];

  if (params.plantId) {
    conditions.push(eq(shiftReport.plantId, params.plantId));
  }
  if (params.status) {
    conditions.push(eq(shiftReport.status, params.status as "RUNNING" | "COMPLETED" | "APPROVED"));
  }

  const limit = Math.min(params.limit ?? 50, 200);

  const shifts = await db
    .select()
    .from(shiftReport)
    .where(and(...conditions))
    .orderBy(sql`${shiftReport.reportDate} DESC, ${shiftReport.actualStart} DESC`)
    .limit(limit);

  // Agregat boks + yield per shift (untuk kolom tabel laporan)
  if (shifts.length > 0) {
    const shiftIds = shifts.map((s) => s.id).filter(Boolean);
    const boxAgg = await db
      .select({
        shiftReportId: tsgBoxProcess.shiftReportId,
        boxesCount: sql<number>`CAST(COUNT(${tsgBoxProcess.id}) AS INTEGER)`.mapWith(Number),
        tsgTotal: sql<number>`COALESCE(SUM(${tsgBoxProcess.tsgWeightKg}::decimal), 0)`.mapWith(Number),
        outputTotal: sql<number>`COALESCE(SUM(${tsgBoxProcess.outputWeightKg}::decimal), 0)`.mapWith(Number),
      })
      .from(tsgBoxProcess)
      .where(inArray(tsgBoxProcess.shiftReportId, shiftIds))
      .groupBy(tsgBoxProcess.shiftReportId);

    const boxMap = new Map(boxAgg.map((b) => [b.shiftReportId, b]));
    for (const s of shifts) {
      const agg = boxMap.get(s.id);
      (s as any).boxesCount = agg?.boxesCount ?? 0;
      (s as any).yieldPct = agg && agg.tsgTotal > 0
        ? Math.round((agg.outputTotal / agg.tsgTotal) * 10000) / 100
        : null;
    }
  }

  // Kode mesin per shift (kolom tabel approval/laporan)
  if (shifts.length > 0) {
    const machineIds = [...new Set(shifts.map((s) => s.machineId).filter(Boolean))];
    const machines = machineIds.length > 0
      ? await db
          .select({ id: machine.id, code: machine.code })
          .from(machine)
          .where(inArray(machine.id, machineIds))
      : [];
    const machineMap = new Map(machines.map((m) => [m.id, m.code]));
    for (const s of shifts) {
      (s as any).machineCode = machineMap.get(s.machineId) ?? null;
    }
  }

  return { data: shifts, pagination: { hasMore: shifts.length === limit } };
}

// =============================================================================
// Error Class
// =============================================================================

export class ServiceError extends Error {
  public code: string;
  public details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.details = details;
  }
}
