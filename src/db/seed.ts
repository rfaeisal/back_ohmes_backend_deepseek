// =============================================================================
// Seed Data — Fase 0–6 Foundation
// =============================================================================
// Seed data untuk development: 1 company, 1 region, 1 pilot plant, 3 machines,
// 1 product (Hummer STD), 2 shift templates, 2 suppliers, 13 roles + permissions,
// 7 test users, 8 sample TSG boxes di inventory.
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
  userAssignment,
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
import { tsgSupplier, tsgReceiving, tsgReceivingBox, tsgInventory } from "@/db/schema/wms-inbound";
import { hashPassword } from "@/lib/auth";

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
      code: "PLT-PMK-01",
      name: "Pabrik Kadur 1",
      timezone: "Asia/Jakarta",
      address: "Jl. Industri No. 1, Kadur",
    })
    .returning();
  console.log(`  ✓ Plant: ${plt!.code}\n`);

  const plantId = plt!.id;

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
    { code: "AREA_SJ_OFFICER", name: "Petugas Label Area", scopeLevel: "REGION", isPrivileged: false },
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
    "tsg.receiving.create", "tsg.receiving.view", "tsg.receiving.approve", "tsg.inventory.view",
    "tsg.inventory.allocate", "tsg.inventory.allocate.override", "tsg.inventory.writeoff",
    "tsg.inventory.transfer",
    // Surat Jalan Supplier
    "supplier.sj.create", "supplier.sj.view", "supplier.sj.label", "supplier.sj.pool",
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
    SUPERADMIN: permissionsData,
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
      "tsg.inventory.view", "tsg.receiving.view",
      "supplier.sj.create", "supplier.sj.view", "supplier.sj.label",
    ],
    AREA_SJ_OFFICER: [
      "supplier.sj.create", "supplier.sj.view", "supplier.sj.label", "supplier.sj.pool",
      "tsg.receiving.view", "shift.view", "batch.view",
      "dashboard.area.view",
    ],
    AREA_QA: [
      "shift.view", "batch.view",
      "dashboard.plant.view", "dashboard.area.view",
      "tsg.inventory.view", "tsg.receiving.view",
    ],
    PLANT_MANAGER: [
      "shift.start", "shift.member.assign", "shift.box.open", "shift.box.weigh",
      "shift.consumption.log", "shift.downtime.log", "shift.maintenance.log",
      "shift.waste.input", "shift.waste.settle", "shift.end", "shift.handoff.create",
      "shift.approve", "shift.reopen", "shift.view", "shift.export",
      "hlp.pack", "batch.view",
      "tsg.receiving.create", "tsg.receiving.view", "tsg.receiving.approve", "tsg.inventory.view",
      "tsg.inventory.allocate", "tsg.inventory.allocate.override",
      "tsg.inventory.writeoff", "tsg.inventory.transfer",
      "supplier.sj.view",
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
      "tsg.inventory.view", "tsg.receiving.view",
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
      "tsg.inventory.allocate", "tsg.inventory.writeoff", "tsg.inventory.transfer",
      "supplier.sj.view",
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
  // 5. TEST USERS
  // ===========================================================================
  console.log("👥 Test Users...");
  const testUsers: Array<{
    username: string; fullName: string; password: string; email: string;
    roleCode: string; scopeType: "GLOBAL" | "COMPANY" | "REGION" | "PLANT"; scopeId: string;
  }> = [
    { username: "admin", fullName: "admin", password: process.env.SUPERADMIN_DEFAULT_PASSWORD || "CHANGE_ME_admin", email: "admin@hummer.example", roleCode: "SUPERADMIN", scopeType: "GLOBAL", scopeId: "00000000-0000-0000-0000-000000000000" },
    { username: "kecer", fullName: "Pak Kecer", password: "12345678", email: "kecer@gmail.com", roleCode: "OPERATOR_KECER", scopeType: "PLANT", scopeId: plantId },
    { username: "anggotatim", fullName: "Pak Anggota Tim", password: "12345678", email: "anggotatim@gmail.com", roleCode: "OPERATOR_MEMBER", scopeType: "PLANT", scopeId: plantId },
    { username: "supervisor", fullName: "Pak Supervisor", password: "12345678", email: "paksuper@gmail.com", roleCode: "SHIFT_SUPERVISOR", scopeType: "PLANT", scopeId: plantId },
    { username: "gudangin", fullName: "Mbak Gudang", password: "12345678", email: "mbakgudang@gmail.com", roleCode: "GUDANG_INBOUND", scopeType: "PLANT", scopeId: plantId },
    { username: "gudangout", fullName: "Mbok Gudang", password: "12345678", email: "mbokgudang@gmail.com", roleCode: "GUDANG_OUTBOUND", scopeType: "PLANT", scopeId: plantId },
    { username: "ekspedisi", fullName: "Pak Ekspedisi", password: "12345678", email: "ekspedisi@gmail.com", roleCode: "EKSPEDISI", scopeType: "PLANT", scopeId: plantId },
    { username: "plantmanager", fullName: "Pak Plant Manager", password: "12345678", email: "plantmanager@hummer.example", roleCode: "PLANT_MANAGER", scopeType: "PLANT", scopeId: plantId },
    { username: "areaqa", fullName: "Bu Area QA", password: "12345678", email: "areaqa@hummer.example", roleCode: "AREA_QA", scopeType: "REGION", scopeId: reg!.id },
    { username: "area.koordinator", fullName: "Area Koordinator", password: "12345678", email: "erik@hummer.example", roleCode: "AREA_COORDINATOR", scopeType: "REGION", scopeId: reg!.id },
    { username: "petugassj", fullName: "Petugas Label SJ", password: "12345678", email: "petugassj@hummer.example", roleCode: "AREA_SJ_OFFICER", scopeType: "REGION", scopeId: reg!.id },
    { username: "hqadmin", fullName: "Pak HQ Admin", password: "12345678", email: "hqadmin@hummer.example", roleCode: "HQ_ADMIN", scopeType: "COMPANY", scopeId: comp!.id },
    { username: "hqanalyst", fullName: "Bu HQ Analyst", password: "12345678", email: "hqanalyst@hummer.example", roleCode: "HQ_ANALYST", scopeType: "COMPANY", scopeId: comp!.id },
    { username: "hqauditor", fullName: "Pak HQ Auditor", password: "12345678", email: "pakhqauditor@gmail.com", roleCode: "HQ_AUDITOR", scopeType: "COMPANY", scopeId: comp!.id },
  ];

  for (const tu of testUsers) {
    const passwordHash = await hashPassword(tu.password);
    const [newUser] = await db
      .insert(user)
      .values({
        username: tu.username,
        fullName: tu.fullName,
        email: tu.email,
        passwordHash,
        isActive: true,
      })
      .returning();

    const roleId = roleMap.get(tu.roleCode)!;
    await db.insert(userAssignment).values({
      userId: newUser!.id,
      scopeType: tu.scopeType,
      scopeId: tu.scopeId,
      roleId,
      assignedBy: newUser!.id,
    });
  }
  console.log(`  ✓ ${testUsers.length} test users created`);
  console.log(`  Passwords: semua 12345678 (admin: SUPERADMIN_DEFAULT_PASSWORD env var)\n`);

  // ===========================================================================
  // 6. MASTER DATA
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
    plantId: plantId,
    productId: prd!.id,
  });

  // Machines
  const machinesData = [
    { plantId: plantId, code: "MKR-01", name: "Maker 1", type: "MAKER" as const },
    { plantId: plantId, code: "MKR-02", name: "Maker 2", type: "MAKER" as const },
    { plantId: plantId, code: "HLP-01", name: "HLP 1", type: "HLP" as const },
  ];
  for (const m of machinesData) {
    await db.insert(machine).values(m);
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
    { code: "item_BOBIN_BLK", name: "Bobbin", unit: "roll", productId: prd!.id },
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
    { code: "sp_PISAU_FILTER", name: "Pisau Filter", unit: "pcs" },
    { code: "sp_NYLON", name: "Nylon", unit: "meter" },
    { code: "sp_BELT_MAKER", name: "Belt Maker", unit: "pcs" },
    { code: "sp_GARNITUR", name: "Garnitur", unit: "pcs" },
    { code: "sp_PISAU_SIGARET", name: "Pisau Sigaret", unit: "pcs" },
    { code: "sp_PISAU_TIPING", name: "Pisau Tiping", unit: "pcs" },
    { code: "sp_TIMING_BELT_367_L", name: "Timing Belt 367 L", unit: "pcs" },
    { code: "sp_TIMING_BELT_345_L", name: "Timing Belt 345 L", unit: "pcs" },
    { code: "sp_TIMING_BELT_285_L", name: "Timing Belt 285 L", unit: "pcs" },
    { code: "sp_TIMING_BELT_480_H", name: "Timing Belt 480 H", unit: "pcs" },
    { code: "sp_TIMING_BELT_255_L", name: "Timing Belt 255 L", unit: "pcs" },
    { code: "sp_TIMING_BELT_187_L", name: "Timing Belt 187 L", unit: "pcs" },
    { code: "sp_TIMING_BELT_4_96", name: "Timing Belt 4*96", unit: "pcs" },
    { code: "sp_TIMING_BELT_4_140", name: "Timing Belt 4*140", unit: "pcs" },
    { code: "sp_TIMING_BELT_390", name: "Timing Belt 390", unit: "pcs" },
    { code: "sp_TEFLON", name: "Teflon", unit: "pcs" },
    { code: "sp_SPRING_BAJA", name: "Spring Baja", unit: "pcs" },
    { code: "sp_PLAT_LEAGER", name: "Plat Leager", unit: "pcs" },
    { code: "sp_VAN_BELT_A_35", name: "Van Belt A-35", unit: "pcs" },
    { code: "sp_VAN_BELT_K_27", name: "Van Belt K-27", unit: "pcs" },
    { code: "sp_VAN_BELT_A_33", name: "Van Belt A-33", unit: "pcs" },
    { code: "sp_VAN_BELT_K_15", name: "Van Belt K-15", unit: "pcs" },
    { code: "sp_VAN_BELT_K_18", name: "Van Belt K-18", unit: "pcs" },
    { code: "sp_FLAT_BELT_1740_15", name: "Flat Belt 1740*15", unit: "pcs" },
    { code: "sp_FLAT_BELT_1450_25", name: "Flat Belt 1450*25", unit: "pcs" },
    { code: "sp_FLAT_BELT_1740_12", name: "Flat Belt 1740*12", unit: "pcs" },
    { code: "sp_FLAT_BELT_1470_25", name: "Flat Belt 1470*25", unit: "pcs" },
    { code: "sp_TONGPIS", name: "Tongpis", unit: "pcs" },
    { code: "sp_METALPOT", name: "Metalpot", unit: "pcs" },
    { code: "sp_GRINDING_STONE", name: "Grinding Stone", unit: "pcs" },
    { code: "sp_KARET_PELONTAR", name: "Karet Pelontar", unit: "pcs" },
    { code: "sp_ROUND_BELT", name: "Round Belt", unit: "pcs" },
    { code: "sp_SIKAT_EKSKREATUR", name: "Sikat Ekskreatur", unit: "pcs" },
    { code: "sp_SIKAT_TIPING", name: "Sikat Tiping", unit: "pcs" },
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
    { plantId: plantId, code: "shift_pagi", name: "Pagi", startTime: "07:00", durationMinutes: 480, displayOrder: 1 },
    { plantId: plantId, code: "shift_sore", name: "Sore", startTime: "15:00", durationMinutes: 480, displayOrder: 2 },
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
  // 7. WMS INBOUND MASTER — Suppliers
  // ===========================================================================
  console.log("🚛 WMS Inbound — Suppliers...");
  const suppliersData = [
    { code: "SUP-JAWA-01", name: "Supplier Jawa 1", contactPerson: "Pak Harun", contactPhone: "081234567890", address: "Jl. Tembakau No. 1, Jember" },
    { code: "SUP-JAWA-02", name: "Supplier Jawa 2", contactPerson: "Bu Sari", contactPhone: "081234567891", address: "Jl. Tembakau No. 2, Bondowoso" },
    { code: "SUP-INTERNAL", name: "Reproses Internal (Rijekan)", contactPerson: "Produksi Pabrik", contactPhone: "-", address: "Internal" },
  ];
  for (const s of suppliersData) {
    await db.insert(tsgSupplier).values(s);
  }
  console.log(`  ✓ ${suppliersData.length} suppliers\n`);

  // ===========================================================================
  // 8. WMS INBOUND — Sample Receiving Data
  // ===========================================================================
  console.log("📦 WMS Inbound — Sample Receiving...");

  const [sup1] = await db.select({ id: tsgSupplier.id }).from(tsgSupplier).where(eq(tsgSupplier.code, "SUP-JAWA-01")).limit(1);
  const [sup2] = await db.select({ id: tsgSupplier.id }).from(tsgSupplier).where(eq(tsgSupplier.code, "SUP-JAWA-02")).limit(1);
  const [adminUser] = await db.select({ id: user.id }).from(user).where(eq(user.username, "admin")).limit(1);

  if (sup1 && sup2 && adminUser) {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // e.g. "20260812"

    const sampleReceivings = [
      {
        supplierId: sup1.id,
        boxes: [
          { code: `TSG-${today}-001`, weight: "29.75", type: "REGULER" as const },
          { code: `TSG-${today}-002`, weight: "30.10", type: "REGULER" as const },
          { code: `TSG-${today}-003`, weight: "29.80", type: "MILD" as const },
          { code: `TSG-${today}-004`, weight: "30.25", type: "MILD" as const },
          { code: `TSG-${today}-005`, weight: "29.90", type: "REGULER" as const },
        ],
        docRef: "SJ-081-2026",
        receivedAt: new Date(),
      },
      {
        supplierId: sup2.id,
        boxes: [
          { code: `TSG-${today}-101`, weight: "28.50", type: "PUTIHAN" as const },
          { code: `TSG-${today}-102`, weight: "29.15", type: "PUTIHAN" as const },
          { code: `TSG-${today}-103`, weight: "28.80", type: "PUTIHAN" as const },
        ],
        docRef: "SJ-045-2026",
        receivedAt: new Date(),
      },
    ];

    let seq = 0;
    for (const recv of sampleReceivings) {
      seq++;
      const totalWeight = recv.boxes.reduce((s, b) => s + parseFloat(b.weight), 0);
      const [header] = await db.insert(tsgReceiving).values({
        plantId: plantId,
        supplierId: recv.supplierId as any,
        receivingCode: `RCV-${today}-0${seq}`,
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
          plantId: plantId,
          boxCode: box.code,
          weightKg: box.weight,
          boxSeq: i + 1,
          tsgType: box.type as any,
          receivedAt: recv.receivedAt,
        } as any).returning();

        await db.insert(tsgInventory).values({
          plantId: plantId,
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
  console.log("✅ Seed complete!\n");
  console.log("   Test accounts:");
  console.log("   ┌──────────────────┬──────────────────┬─────────────────────┐");
  console.log("   │ Username         │ Password         │ Role                │");
  console.log("   ├──────────────────┼──────────────────┼─────────────────────┤");
  console.log("   │ kecer            │ 12345678         │ OPERATOR_KECER      │");
  console.log("   │ anggotatim       │ 12345678         │ OPERATOR_MEMBER     │");
  console.log("   │ supervisor       │ 12345678         │ SHIFT_SUPERVISOR    │");
  console.log("   │ gudangin         │ 12345678         │ GUDANG_INBOUND      │");
  console.log("   │ gudangout        │ 12345678         │ GUDANG_OUTBOUND     │");
  console.log("   │ ekspedisi        │ 12345678         │ EKSPEDISI           │");
  console.log("   │ plantmanager     │ 12345678         │ PLANT_MANAGER       │");
  console.log("   │ areaqa           │ 12345678         │ AREA_QA             │");
  console.log("   │ area.koordinator │ 12345678         │ AREA_COORDINATOR    │");
  console.log("   │ hqadmin          │ 12345678         │ HQ_ADMIN            │");
  console.log("   │ hqanalyst        │ 12345678         │ HQ_ANALYST          │");
  console.log("   │ hqauditor        │ 12345678         │ HQ_AUDITOR          │");
  console.log("   │ admin            │ (env var)        │ SUPERADMIN          │");
  console.log("   └──────────────────┴──────────────────┴─────────────────────┘");
  console.log("");
  console.log(`   Plant: ${plt!.code} (${plt!.id})`);
  console.log(`   Product: ${prd!.code} (${prd!.id})`);
  console.log("   OTP bypass: 000000 (development)\n");
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  });
