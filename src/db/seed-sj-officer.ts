// =============================================================================
// Seed Petugas Label Area (AREA_SJ_OFFICER) — idempotent
// =============================================================================
// Menambahkan role, permissions, dan test user untuk fitur Surat Jalan Supplier
// tanpa re-seed penuh (bisa dijalankan berulang kali — aman).
//
// Usage: pnpm tsx src/db/seed-sj-officer.ts
// =============================================================================

import db from "@/db";
import { role, permission, rolePermission, user, userAssignment } from "@/db/schema/identity";
import { region } from "@/db/schema/tenancy";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";

const NEW_PERMISSIONS = [
  "supplier.sj.create",
  "supplier.sj.view",
  "supplier.sj.label",
  "supplier.sj.pool",
  "tsg.receiving.approve",
];

const OFFICER_PERMISSIONS = [
  "supplier.sj.create",
  "supplier.sj.view",
  "supplier.sj.label",
  "supplier.sj.pool",
  "tsg.receiving.view",
  "shift.view",
  "batch.view",
  "dashboard.area.view",
];

async function bootstrap() {
  console.log("🏷️ Seeding role Petugas Label Area (AREA_SJ_OFFICER)...\n");

  // 1. Permissions baru (skip kalau sudah ada) + muat SEMUA permission yang
  //    akan digrant — bug lama: permMap hanya diisi NEW_PERMISSIONS sehingga
  //    permission existing (shift.view, dashboard.area.view, dst) ter-skip
  //    diam-diam padahal log bilang "✓ N permissions".
  const permMap = new Map<string, string>();
  for (const code of NEW_PERMISSIONS) {
    const [existing] = await db.select().from(permission).where(eq(permission.code, code)).limit(1);
    if (existing) {
      permMap.set(code, existing.id);
    } else {
      const [inserted] = await db.insert(permission).values({ code, description: null }).returning();
      permMap.set(code, inserted!.id);
      console.log(`  + permission ${code}`);
    }
  }
  for (const code of OFFICER_PERMISSIONS) {
    if (permMap.has(code)) continue;
    const [existing] = await db.select().from(permission).where(eq(permission.code, code)).limit(1);
    if (existing) permMap.set(code, existing.id);
  }

  // 2. Role baru (skip kalau sudah ada)
  let [officerRole] = await db.select().from(role).where(eq(role.code, "AREA_SJ_OFFICER")).limit(1);
  if (!officerRole) {
    [officerRole] = await db
      .insert(role)
      .values({ code: "AREA_SJ_OFFICER", name: "Petugas Label Area", scopeLevel: "REGION", isPrivileged: false })
      .returning();
    console.log("  + role AREA_SJ_OFFICER");
  }

  // 3. Link role ↔ permissions (idempotent)
  for (const code of OFFICER_PERMISSIONS) {
    const permId = permMap.get(code);
    if (permId) {
      await db
        .insert(rolePermission)
        .values({ roleId: officerRole!.id, permissionId: permId })
        .onConflictDoNothing();
    }
  }
  console.log(`  ✓ ${OFFICER_PERMISSIONS.length} permissions untuk AREA_SJ_OFFICER\n`);

  // 4. Tambah permission tambahan untuk role yang sudah ada (approve + view SJ)
  const [coordRole] = await db.select().from(role).where(eq(role.code, "AREA_COORDINATOR")).limit(1);
  if (coordRole) {
    for (const code of OFFICER_PERMISSIONS) {
      const permId = permMap.get(code);
      if (permId) {
        await db.insert(rolePermission).values({ roleId: coordRole.id, permissionId: permId }).onConflictDoNothing();
      }
    }
    console.log("  ✓ AREA_COORDINATOR juga bisa kelola Surat Jalan\n");
  }

  const [pmRole] = await db.select().from(role).where(eq(role.code, "PLANT_MANAGER")).limit(1);
  const [giRole] = await db.select().from(role).where(eq(role.code, "GUDANG_INBOUND")).limit(1);
  const approvePermId = permMap.get("tsg.receiving.approve");
  const sjViewPermId = permMap.get("supplier.sj.view");
  if (pmRole && approvePermId) {
    await db.insert(rolePermission).values({ roleId: pmRole.id, permissionId: approvePermId }).onConflictDoNothing();
    console.log("  ✓ PLANT_MANAGER bisa approve receiving manual");
  }
  if (giRole && sjViewPermId) {
    await db.insert(rolePermission).values({ roleId: giRole.id, permissionId: sjViewPermId }).onConflictDoNothing();
    console.log("  ✓ GUDANG_INBOUND bisa lihat Surat Jalan");
  }

  // 5. Test user petugassj (skip kalau sudah ada)
  const [existingUser] = await db.select().from(user).where(eq(user.username, "petugassj")).limit(1);
  if (existingUser) {
    console.log("\n  ✓ User petugassj sudah ada — skip.");
    return;
  }

  const [firstRegion] = await db.select().from(region).limit(1);
  if (!firstRegion) {
    console.error("❌ Tidak ada region di database. Jalankan db:seed dulu.");
    process.exit(1);
  }

  const passwordHash = await hashPassword("12345678");
  const [newUser] = await db
    .insert(user)
    .values({
      username: "petugassj",
      fullName: "Petugas Label SJ",
      email: "petugassj@hummer.example",
      passwordHash,
      isActive: true,
    })
    .returning();

  await db.insert(userAssignment).values({
    userId: newUser!.id,
    scopeType: "REGION",
    scopeId: firstRegion.id,
    roleId: officerRole!.id,
    assignedBy: newUser!.id,
  });

  console.log("  ✓ User petugassj dibuat (password 12345678, scope AREA)\n");
  console.log("✅ Selesai.");
}

bootstrap()
  .catch((e) => {
    console.error("❌ Gagal:", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    // Jangan panggil process.exit() di sini — memotong flush stdout & query async
    // yang belum selesai. Biarkan pool koneksi drain secara alami.
  });
