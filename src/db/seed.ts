// =============================================================================
// Seed Data — Fase 0 Foundation
// =============================================================================
// Seed data untuk 1 company, 1 region, 1 pilot plant, 3 machines,
// 1 product (Hummer STD), 3 shift templates, 2 suppliers, roles + permissions.
//
// Usage: pnpm db:seed
// =============================================================================

import { eq } from "drizzle-orm";
import db from "@/db";
import {
  company,
  region,
  plant,
} from "@/db/schema/tenancy";
import {
  user,
  role,
  permission,
  rolePermission,
  authPolicy,
} from "@/db/schema/identity";
import {
  product,
  plantProduct,
  machine,
  machineTemplate,
  consumableItem,
  sparepart,
  shiftRole,
  shiftTemplate,
  rejectReason,
} from "@/db/schema/master-product";
import { tsgSupplier } from "@/db/schema/wms-inbound";

async function seed() {
  console.log("🌱 Seeding database...\n");

  // Idempotent check — skip if already seeded
  const [existingCompany] = await db.select({ id: company.id }).from(company).limit(1);
  if (existingCompany) {
    console.log("⏭ Database already seeded — skipping.\n");
    return;
  }

  // ===========================================================================
  // 1. TENANCY
  // ===========================================================================
  console.log("📦 Tenancy...");
  const [comp] = await db
    .insert(company)
    .values({ code: "HMR", name: "Hummer Group" })
    .returning();
  console.log(`  ✓ Company: ${comp!.code}`);

  const [reg] = await db
    .insert(region)
    .values({
      companyId: comp!.id,
      code: "AREA-JATIM",
      name: "Area Jawa Timur",
    })
    .returning();
  console.log(`  ✓ Region: ${reg!.code}`);

  const [plt] = await db
    .insert(plant)
    .values({
      regionId: reg!.id,
      code: "PLT-MLG-01",
      name: "Pabrik Malang 1",
      timezone: "Asia/Jakarta",
      address: "Jl. Industri No. 1, Malang",
    })
    .returning();
  console.log(`  ✓ Plant: ${plt!.code}\n`);

  // ===========================================================================
  // 2. ROLES
  // ===========================================================================
  console.log("👤 Roles...");
  const rolesData = [
    { code: "SUPERADMIN", name: "Super Admin", scopeLevel: "GLOBAL", isPrivileged: true },
    { code: "HQ_ADMIN", name: "HQ Admin", scopeLevel: "COMPANY", isPrivileged: false },
    { code: "HQ_ANALYST", name: "HQ Analyst", scopeLevel: "COMPANY", isPrivileged: false },
    { code: "HQ_AUDITOR", name: "HQ Auditor", scopeLevel: "COMPANY", isPrivileged: false },
    { code: "AREA_COORDINATOR", name: "Koordinator Area", scopeLevel: "REGION", isPrivileged: false },
    { code: "AREA_QA", name: "Area QA", scopeLevel: "REGION", isPrivileged: false },
    { code: "PLANT_MANAGER", name: "Plant Manager", scopeLevel: "PLANT", isPrivileged: false },
    { code: "SHIFT_SUPERVISOR", name: "Supervisor Pabrik", scopeLevel: "PLANT", isPrivileged: false },
    { code: "OPERATOR_KECER", name: "Operator Kecer", scopeLevel: "PLANT", isPrivileged: false },
    { code: "OPERATOR_MEMBER", name: "Anggota Tim", scopeLevel: "PLANT", isPrivileged: false },
    { code: "GUDANG_INBOUND", name: "Gudang Inbound", scopeLevel: "PLANT", isPrivileged: false },
    { code: "GUDANG_OUTBOUND", name: "Gudang Outbound", scopeLevel: "PLANT", isPrivileged: false },
    { code: "EKSPEDISI", name: "Ekspedisi", scopeLevel: "PLANT", isPrivileged: false },
  ] as const;

  const roleMap = new Map<string, string>();
  for (const r of rolesData) {
    const [inserted] = await db.insert(role).values(r).returning();
    roleMap.set(r.code, inserted!.id);
  }
  console.log(`  ✓ ${rolesData.length} roles created`);

  // Auth policy untuk SUPERADMIN
  const superadminRoleId = roleMap.get("SUPERADMIN")!;
  await db.insert(authPolicy).values({
    roleId: superadminRoleId,
    accessTokenTtlMinutes: 5,
    refreshTokenTtlDays: 7,
    require2fa: true,
    maxActiveAssignments: 3,
  });
  console.log(`  ✓ SUPERADMIN auth policy (5m JWT, 2FA)\n`);

  // ===========================================================================
  // 3. PERMISSIONS
  // ===========================================================================
  console.log("🔑 Permissions...");
  const permissionsData = [
    // Shift
    "shift.start", "shift.member.assign", "shift.box.open", "shift.box.weigh",
    "shift.consumption.log", "shift.downtime.log", "shift.maintenance.log",
    "shift.waste.input", "shift.waste.settle", "shift.end", "shift.handoff.create",
    "shift.approve", "shift.reopen", "shift.correct", "shift.view", "shift.export",
    // HLP & Batch
    "hlp.pack", "batch.view",
    // TSG & WMS Inbound
    "tsg.receiving.create", "tsg.receiving.view", "tsg.inventory.view",
    "tsg.inventory.allocate", "tsg.inventory.allocate.override", "tsg.inventory.writeoff",
    // WMS Outbound
    "finishedgoods.receive", "finishedgoods.dispute", "finishedgoods.view",
    "cartoning.create", "cartoning.add_pack", "cartoning.close", "cartoning.view",
    // Distribusi
    "dispatch.order.create", "dispatch.order.dispatch", "dispatch.order.view",
    "dispatch.document.generate",
    // SUPERADMIN
    "super.bypass_rls", "super.impersonate", "super.force_logout",
    "super.session.view", "super.session.revoke", "super.reset_password",
    "super.audit.read_all", "super.audit.security",
    "super.superadmin.assign", "super.database.migrate",
    // Master Data
    "masterdata.machine.edit", "masterdata.product.edit", "masterdata.plant-product.assign",
    "masterdata.machine-template.edit", "masterdata.consumable.edit",
    "masterdata.sparepart.edit", "masterdata.shift-role.edit",
    "masterdata.shift-template.edit", "masterdata.downtime-category.edit",
    "masterdata.reject-reason.edit", "masterdata.plant.edit",
    "masterdata.tsg-supplier.edit",
    // Dashboard & Report
    "dashboard.plant.view", "dashboard.area.view", "dashboard.hq.view",
    "report.export_cukai", "report.export_operational",
    // User & Audit
    "user.create", "user.assign_scope", "user.revoke_scope", "audit.read",
  ];

  const permMap = new Map<string, string>();
  for (const code of permissionsData) {
    const [inserted] = await db
      .insert(permission)
      .values({ code, description: null })
      .returning();
    permMap.set(code, inserted!.id);
  }
  console.log(`  ✓ ${permissionsData.length} permissions created\n`);

  // ===========================================================================
  // 4. ROLE ↔ PERMISSION ASSIGNMENTS
  // ===========================================================================
  console.log("🔗 Role-Permission assignments...");

  const rolePerms: Record<string, string[]> = {
    SUPERADMIN: permissionsData, // All permissions
    HQ_ADMIN: [
      "shift.reopen", "shift.view", "shift.export",
      "batch.view", "hlp.pack",
      "tsg.receiving.view", "tsg.inventory.view",
      "finishedgoods.view", "cartoning.view",
      "dispatch.order.view",
      "masterdata.machine.edit", "masterdata.product.edit", "masterdata.plant-product.assign",
      "masterdata.machine-template.edit", "masterdata.consumable.edit",
      "masterdata.sparepart.edit", "masterdata.shift-role.edit",
      "masterdata.shift-template.edit", "masterdata.downtime-category.edit",
      "masterdata.reject-reason.edit", "masterdata.plant.edit",
      "masterdata.tsg-supplier.edit",
      "dashboard.plant.view", "dashboard.area.view", "dashboard.hq.view",
      "report.export_cukai", "report.export_operational",
      "user.create", "user.assign_scope", "user.revoke_scope", "audit.read",
    ],
    HQ_ANALYST: [
      "shift.view", "batch.view", "shift.export",
      "tsg.receiving.view", "tsg.inventory.view",
      "finishedgoods.view", "cartoning.view",
      "dispatch.order.view",
      "dashboard.plant.view", "dashboard.area.view", "dashboard.hq.view",
      "report.export_cukai", "report.export_operational", "audit.read",
    ],
    HQ_AUDITOR: [
      "shift.correct", "shift.view", "batch.view",
      "finishedgoods.view", "cartoning.view",
      "dashboard.plant.view", "dashboard.area.view", "dashboard.hq.view",
      "report.export_cukai", "report.export_operational", "audit.read",
    ],
    AREA_COORDINATOR: [
      "shift.view", "shift.export", "batch.view",
      "dashboard.plant.view", "dashboard.area.view",
      "report.export_operational", "audit.read",
    ],
    AREA_QA: [
      "shift.view", "batch.view",
      "dashboard.plant.view", "dashboard.area.view",
    ],
    PLANT_MANAGER: [
      "shift.start", "shift.member.assign", "shift.box.open", "shift.box.weigh",
      "shift.consumption.log", "shift.downtime.log", "shift.maintenance.log",
      "shift.waste.input", "shift.waste.settle", "shift.end", "shift.handoff.create",
      "shift.approve", "shift.reopen", "shift.view", "shift.export",
      "hlp.pack", "batch.view",
      "tsg.receiving.create", "tsg.receiving.view", "tsg.inventory.view",
      "tsg.inventory.allocate", "tsg.inventory.allocate.override",
      "tsg.inventory.writeoff",
      "finishedgoods.receive", "finishedgoods.dispute", "finishedgoods.view",
      "cartoning.create", "cartoning.add_pack", "cartoning.close", "cartoning.view",
      "dispatch.order.create", "dispatch.order.dispatch", "dispatch.order.view",
      "dispatch.document.generate",
      "masterdata.plant-product.assign", "masterdata.shift-role.edit",
      "masterdata.shift-template.edit",
      "dashboard.plant.view",
      "report.export_operational", "audit.read",
    ],
    SHIFT_SUPERVISOR: [
      "shift.member.assign", "shift.box.open", "shift.box.weigh",
      "shift.consumption.log", "shift.downtime.log", "shift.maintenance.log",
      "shift.waste.input", "shift.end", "shift.handoff.create",
      "shift.approve", "shift.reopen", "shift.view",
      "hlp.pack", "batch.view",
      "dashboard.plant.view", "audit.read",
    ],
    OPERATOR_KECER: [
      "shift.start", "shift.member.assign", "shift.box.open", "shift.box.weigh",
      "shift.consumption.log", "shift.downtime.log", "shift.maintenance.log",
      "shift.waste.input", "shift.end", "shift.handoff.create",
      "shift.view",
      "hlp.pack", "batch.view",
      "dashboard.plant.view",
      "tsg.inventory.view", "tsg.inventory.allocate",
    ],
    OPERATOR_MEMBER: [
      "shift.view", "batch.view", "dashboard.plant.view",
    ],
    GUDANG_INBOUND: [
      "tsg.receiving.create", "tsg.receiving.view", "tsg.inventory.view",
      "tsg.inventory.allocate", "tsg.inventory.writeoff",
      "shift.waste.settle", "shift.view", "batch.view",
      "dashboard.plant.view",
    ],
    GUDANG_OUTBOUND: [
      "finishedgoods.receive", "finishedgoods.dispute", "finishedgoods.view",
      "cartoning.create", "cartoning.add_pack", "cartoning.close", "cartoning.view",
      "shift.view", "dashboard.plant.view",
    ],
    EKSPEDISI: [
      "dispatch.order.create", "dispatch.order.dispatch", "dispatch.order.view",
      "dispatch.document.generate",
      "finishedgoods.view", "cartoning.view",
      "shift.view", "dashboard.plant.view",
    ],
  };

  for (const [roleCode, permCodes] of Object.entries(rolePerms)) {
    const roleId = roleMap.get(roleCode);
    if (!roleId) {
      console.warn(`  ⚠ Role ${roleCode} not found, skipping`);
      continue;
    }
    for (const permCode of permCodes) {
      const permId = permMap.get(permCode);
      if (!permId) {
        console.warn(`  ⚠ Permission ${permCode} not found, skipping`);
        continue;
      }
      await db.insert(rolePermission).values({ roleId, permissionId: permId }).onConflictDoNothing();
    }
  }
  console.log("  ✓ Role-permission assignments done\n");

  // ===========================================================================
  // 5. MASTER DATA
  // ===========================================================================
  console.log("🏭 Master Data...");

  // Product
  const [prd] = await db
    .insert(product)
    .values({
      code: "PRD-HMR-STD",
      brand: "Hummer",
      variant: "STD",
    })
    .returning();
  console.log(`  ✓ Product: ${prd!.brand} ${prd!.variant}`);

  // PlantProduct
  await db.insert(plantProduct).values({
    plantId: plt!.id,
    productId: prd!.id,
  });

  // Machines
  const machinesData = [
    { plantId: plt!.id, code: "MKR-01", name: "Maker 1", type: "MAKER" as const },
    { plantId: plt!.id, code: "MKR-02", name: "Maker 2", type: "MAKER" as const },
    { plantId: plt!.id, code: "HLP-01", name: "HLP 1", type: "HLP" as const },
  ];
  const machineMap = new Map<string, string>();
  for (const m of machinesData) {
    const [inserted] = await db.insert(machine).values(m).returning();
    machineMap.set(m.code, inserted!.id);
  }
  console.log(`  ✓ ${machinesData.length} machines`);

  // MachineTemplate untuk Hummer di Maker
  await db.insert(machineTemplate).values({
    productId: prd!.id,
    machineType: "MAKER",
    yieldMinPct: "110.00",
    yieldMaxPct: "114.00",
    targetBeratPerBatangGram: "1.020",
    isCurrent: true,
  });
  console.log("  ✓ MachineTemplate (Hummer MAKER: 110-114%)");

  // Consumable Items
  const consumablesData = [
    { code: "item_BOBBIN_HMR", name: "Bobbin Hummer", unit: "roll", productId: prd!.id },
    { code: "item_FILTER_HMR", name: "Filter Hummer", unit: "roll", productId: prd!.id },
    { code: "item_TIPPING_HMR", name: "Tipping Hummer", unit: "roll", productId: prd!.id },
    { code: "item_LEM_HMR", name: "Lem Hummer", unit: "kg", productId: prd!.id },
  ];
  for (const c of consumablesData) {
    await db.insert(consumableItem).values(c);
  }
  console.log(`  ✓ ${consumablesData.length} consumable items`);

  // Spareparts
  const sparepartsData = [
    { code: "sp_PISAU_FILTER", name: "Pisau Filter", unit: "unit" },
    { code: "sp_NYLON", name: "Nylon", unit: "meter" },
    { code: "sp_BELT_MAKER", name: "Belt Maker", unit: "unit" },
  ];
  for (const s of sparepartsData) {
    await db.insert(sparepart).values(s);
  }
  console.log(`  ✓ ${sparepartsData.length} spareparts`);

  // Shift Roles
  const shiftRolesData = [
    { plantId: null, code: "ketua_kecer", name: "Ketua Kecer", canApproveShift: false, canEndShift: true, displayOrder: 1 },
    { plantId: null, code: "operator", name: "Operator", canApproveShift: false, canEndShift: false, displayOrder: 2 },
    { plantId: null, code: "pembantu", name: "Pembantu", canApproveShift: false, canEndShift: false, displayOrder: 3 },
  ];
  for (const sr of shiftRolesData) {
    await db.insert(shiftRole).values(sr);
  }
  console.log(`  ✓ ${shiftRolesData.length} shift roles`);

  // Shift Templates
  const shiftTemplatesData = [
    { plantId: plt!.id, code: "shift_siang", name: "Shift Siang", startTime: "05:30", durationMinutes: 660, displayOrder: 1 },
    { plantId: plt!.id, code: "shift_malam", name: "Shift Malam", startTime: "16:30", durationMinutes: 780, displayOrder: 2 },
  ];
  for (const st of shiftTemplatesData) {
    await db.insert(shiftTemplate).values(st);
  }
  console.log(`  ✓ ${shiftTemplatesData.length} shift templates`);

  // Reject Reasons
  const rejectReasonsData = [
    { code: "BATANG_PATAH", name: "Batang Patah" },
    { code: "BATANG_KERIPUT", name: "Batang Keriput" },
    { code: "LEM_TIDAK_REFER", name: "Lem Tidak Rekat" },
    { code: "FILTER_LONGGAR", name: "Filter Longgar" },
  ];
  for (const rr of rejectReasonsData) {
    await db.insert(rejectReason).values(rr);
  }
  console.log(`  ✓ ${rejectReasonsData.length} reject reasons\n`);

  // ===========================================================================
  // 6. WMS INBOUND MASTER — Suppliers
  // ===========================================================================
  console.log("🚛 WMS Inbound — Suppliers...");
  const suppliersData = [
    { code: "SUP-JAWA-01", name: "Supplier Jawa 1", contactPerson: "Pak Harun", contactPhone: "081234567890", address: "Jl. Tembakau No. 1, Jember" },
    { code: "SUP-JAWA-02", name: "Supplier Jawa 2", contactPerson: "Bu Sari", contactPhone: "081234567891", address: "Jl. Tembakau No. 2, Bondowoso" },
  ];
  for (const s of suppliersData) {
    await db.insert(tsgSupplier).values(s);
  }
  console.log(`  ✓ ${suppliersData.length} suppliers\n`);

  // ===========================================================================
  // 7. WMS INBOUND — Sample Receiving Data
  // ===========================================================================
  console.log("📦 WMS Inbound — Sample Receiving...");
  const { tsgReceiving, tsgReceivingBox, tsgInventory } = await import("@/db/schema/wms-inbound");

  const sampleReceivings = [
    {
      supplierId: suppliersData[0] ? undefined : undefined,
      boxes: [
        { code: "TSG-20260811-001", weight: "29.75", type: "REGULER" as const },
        { code: "TSG-20260811-002", weight: "30.10", type: "REGULER" as const },
        { code: "TSG-20260811-003", weight: "29.80", type: "MILD" as const },
        { code: "TSG-20260811-004", weight: "30.25", type: "MILD" as const },
        { code: "TSG-20260811-005", weight: "29.90", type: "REGULER" as const },
      ],
      docRef: "SJ-081-2026",
      receivedAt: new Date("2026-08-11T05:00:00+07:00"),
    },
    {
      supplierId: undefined,
      boxes: [
        { code: "TSG-20260811-101", weight: "28.50", type: "PUTIHAN" as const },
        { code: "TSG-20260811-102", weight: "29.15", type: "PUTIHAN" as const },
        { code: "TSG-20260811-103", weight: "28.80", type: "PUTIHAN" as const },
      ],
      docRef: "SJ-045-2026",
      receivedAt: new Date("2026-08-11T06:30:00+07:00"),
    },
  ];

  const [sup1] = await db.select({ id: tsgSupplier.id }).from(tsgSupplier).where(eq(tsgSupplier.code, "SUP-JAWA-01")).limit(1);
  const [sup2] = await db.select({ id: tsgSupplier.id }).from(tsgSupplier).where(eq(tsgSupplier.code, "SUP-JAWA-02")).limit(1);
  const [adminUser] = await db.select({ id: user.id }).from(user).where(eq(user.username, "admin")).limit(1);

  if (sup1 && sup2 && adminUser) {
    (sampleReceivings[0] as any).supplierId = sup1.id;
    (sampleReceivings[1] as any).supplierId = sup2.id;

    let seq = 0;
    for (const recv of sampleReceivings) {
      seq++;
      const totalWeight = recv.boxes.reduce((s, b) => s + parseFloat(b.weight), 0);
      const [header] = await db.insert(tsgReceiving).values({
        plantId: plt!.id,
        supplierId: recv.supplierId as any,
        receivingCode: `RCV-20260811-0${seq}`,
        receivedAt: recv.receivedAt,
        receivedBy: adminUser.id,
        totalBoxCount: recv.boxes.length,
        totalWeightKg: totalWeight.toFixed(2),
        supplierDocRef: recv.docRef,
      } as any).returning();

      for (let i = 0; i < recv.boxes.length; i++) {
        const box = recv.boxes[i]!;
        const [rb] = await db.insert(tsgReceivingBox).values({
          receivingId: header!.id,
          plantId: plt!.id,
          boxCode: box.code,
          weightKg: box.weight,
          boxSeq: i + 1,
          tsgType: box.type as any,
          receivedAt: recv.receivedAt,
        } as any).returning();

        await db.insert(tsgInventory).values({
          plantId: plt!.id,
          boxId: rb!.id,
          tsgType: box.type as any,
          status: "AVAILABLE",
        } as any);
      }
    }
    console.log(`  ✓ ${sampleReceivings.length} sample receivings (${sampleReceivings.reduce((s, r) => s + r.boxes.length, 0)} boxes)\n`);
  }

  // ===========================================================================
  // DONE
  // ===========================================================================
  console.log("✅ Seed complete! Jalankan 'pnpm seed:superadmin' untuk membuat SUPERADMIN pertama.\n");
  console.log("   Login dengan SUPERADMIN di /api/v1/auth/login");
  console.log("   Plant ID pilot: ", plt!.id);
  console.log("   Product ID:     ", prd!.id);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
