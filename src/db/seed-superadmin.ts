// =============================================================================
// SUPERADMIN Bootstrap — CLI script
// =============================================================================
// Membuat SUPERADMIN pertama (bukan lewat UI).
// Password auto-generated dan di-print sekali di terminal.
//
// Usage: pnpm seed:superadmin --username admin --email admin@hummer.example
// =============================================================================

import db from "@/db";
import { user, role, userAssignment } from "@/db/schema/identity";
import { eq } from "drizzle-orm";
import { hashPassword } from "@/lib/auth";

function generatePassword(): string {
  // 16 karakter: huruf besar, kecil, angka
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function parseArgs(): { username: string; email: string } {
  const args = process.argv.slice(2);
  let username = "";
  let email = "";

  for (const arg of args) {
    if (arg.startsWith("--username=")) {
      username = arg.split("=")[1]!;
    } else if (arg === "--username" && args.length > args.indexOf(arg) + 1) {
      username = args[args.indexOf(arg) + 1]!;
    }
    if (arg.startsWith("--email=")) {
      email = arg.split("=")[1]!;
    } else if (arg === "--email" && args.length > args.indexOf(arg) + 1) {
      email = args[args.indexOf(arg) + 1]!;
    }
  }

  if (!username || !email) {
    console.error("❌ Usage: pnpm seed:superadmin --username <username> --email <email>");
    process.exit(1);
  }

  return { username, email };
}

async function bootstrap() {
  const { username, email } = parseArgs();

  console.log("🔐 Bootstrapping SUPERADMIN...\n");

  // 1. Cari role SUPERADMIN
  const [superadminRole] = await db
    .select()
    .from(role)
    .where(eq(role.code, "SUPERADMIN"))
    .limit(1);

  if (!superadminRole) {
    console.error("❌ Role SUPERADMIN belum ada. Jalankan pnpm db:seed dulu.");
    process.exit(1);
  }

  // 2. Cek jumlah SUPERADMIN aktif (max 3)
  const activeSuperadmins = await db
    .select()
    .from(userAssignment)
    .where(eq(userAssignment.roleId, superadminRole.id));

  if (activeSuperadmins.length >= 3) {
    console.error("❌ SUPERADMIN_LIMIT_REACHED: Sudah ada 3 SUPERADMIN aktif.");
    console.error("   Revoke salah satu dulu sebelum menambah baru.");
    process.exit(1);
  }

  // 3. Generate password
  const password = generatePassword();
  const passwordHash = await hashPassword(password);

  // 4. Create user
  const [newUser] = await db
    .insert(user)
    .values({
      username,
      passwordHash,
      fullName: username,
      email,
      isActive: true,
    })
    .returning();

  if (!newUser) {
    console.error("❌ Gagal membuat user.");
    process.exit(1);
  }

  // 5. Assign SUPERADMIN role dengan scope GLOBAL
  await db.insert(userAssignment).values({
    userId: newUser.id,
    scopeType: "GLOBAL",
    scopeId: "00000000-0000-0000-0000-000000000000", // placeholder untuk GLOBAL
    roleId: superadminRole.id,
    assignedBy: newUser.id, // self-assigned (bootstrap)
  });

  // 6. Print credentials ONCE
  console.log("══════════════════════════════════════════════════");
  console.log("  SUPERADMIN CREATED");
  console.log("══════════════════════════════════════════════════");
  console.log(`  Username:  ${username}`);
  console.log(`  Password:  ${password}`);
  console.log(`  Email:     ${email}`);
  console.log("══════════════════════════════════════════════════");
  console.log("");
  console.log("⚠️  SIMPAN PASSWORD INI — hanya muncul sekali.");
  console.log("⚠️  SUPERADMIN wajib 2FA saat login.");
  console.log("   Di dev: gunakan OTP '000000' (dummy).");
  console.log("");
  console.log(`  Login: POST /api/v1/auth/login`);
  console.log(`  Body:  { "username": "${username}", "password": "***", "otp": "000000", "deviceType": "WEB" }`);
  console.log("");
}

bootstrap()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ Bootstrap failed:", err);
    process.exit(1);
  });
