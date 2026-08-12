// test-shift-workflow.cjs — E2E test: Login → Start Shift → Produksi → Tutup Shift → Approve → Laporan
const path = require("path");
const pwPath = path.resolve(__dirname, "node_modules/.pnpm/playwright@1.62.1/node_modules/playwright/index.js");
const { chromium } = require(pwPath);

const BASE = "http://localhost:3001";

// Credentials
const CREDS = {
  operator:   { username: "kecer",      password: "12345678" },
  supervisor: { username: "supervisor", password: "12345678" },
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

  try {
    // =========================================================================
    // STEP 1: LOGIN OPERATOR
    // =========================================================================
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("STEP 1: Login sebagai kecer (OPERATOR_KECER)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const page = await context.newPage();
    await page.goto(`${BASE}/tablet/login`, { waitUntil: "networkidle" });
    console.log("  ✓ Halaman login terbuka");

    const loginRes = await context.request.post(`${BASE}/api/v1/auth/login`, {
      headers: { "Content-Type": "application/json" },
      data: { ...CREDS.operator, deviceType: "WEB" },
    });
    const loginData = await loginRes.json();
    if (!loginData.accessToken) {
      console.log(`  ✗ Login gagal: ${loginData.error?.message}`);
      await browser.close(); return;
    }
    console.log(`  ✓ Login OK → ${(loginData.roles || []).map(r => r.code).join(", ")}`);

    const accessToken = loginData.accessToken;
    await page.evaluate((t) => { localStorage.setItem("accessToken", t.accessToken); localStorage.setItem("refreshToken", t.refreshToken); }, loginData);
    await page.goto(`${BASE}/tablet`, { waitUntil: "networkidle" });
    await sleep(2000);
    console.log(`  ✓ Redirect: ${page.url()}`);

    // =========================================================================
    // STEP 2: CEK DATA
    // =========================================================================
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("STEP 2: Cek mesin, shift, inventory");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const machinesRes = await context.request.get(`${BASE}/api/v1/machines`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const machines = (await machinesRes.json()).data || [];
    console.log(`  Mesin: ${machines.length}`);
    machines.forEach(m => console.log(`    ${m.code} — ${m.name}`));

    const shiftsRes = await context.request.get(`${BASE}/api/v1/shifts?status=RUNNING&limit=50`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const activeShifts = (await shiftsRes.json()).data || [];
    const activeIds = new Set(activeShifts.map(s => s.machineId));
    const target = machines.find(m => !activeIds.has(m.id)) || machines[0];
    console.log(`  Shift aktif: ${activeShifts.length}, Target: ${target?.code}`);

    const invRes = await context.request.get(`${BASE}/api/v1/tsg-inventory/available?limit=5`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const inventory = (await invRes.json()).data || [];
    console.log(`  Inventory TSG: ${inventory.length} boks`);

    if (!target) { console.log("  ⚠ Tidak ada mesin"); await browser.close(); return; }

    // =========================================================================
    // STEP 3: START SHIFT
    // =========================================================================
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("STEP 3: Mulai shift baru");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const [tplRes, prodRes, usersRes, rolesRes] = await Promise.all([
      context.request.get(`${BASE}/api/v1/shift-templates`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      context.request.get(`${BASE}/api/v1/products`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      context.request.get(`${BASE}/api/v1/users`, { headers: { Authorization: `Bearer ${accessToken}` } }),
      context.request.get(`${BASE}/api/v1/shift-roles`, { headers: { Authorization: `Bearer ${accessToken}` } }),
    ]);
    const templates = (await tplRes.json()).data || [];
    const products = (await prodRes.json()).data || [];
    const users = (await usersRes.json()).data || [];
    const roles = (await rolesRes.json()).data || [];

    const members = users.slice(0, 2).map(u => ({
      userId: u.id,
      shiftRoleId: roles.find(r => r.code === "ketua_kecer")?.id || roles[0]?.id,
    }));

    console.log(`  Tpl: ${templates[0]?.name}, Produk: ${products[0]?.code}, Member: ${members.length}`);

    const startRes = await context.request.post(`${BASE}/api/v1/shifts/start`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      data: { machineId: target.id, productId: products[0].id, shiftTemplateId: templates[0].id, members },
    });
    const startData = await startRes.json();
    if (!startData.shiftId) { console.log(`  ✗ Gagal: ${startData.error?.message}`); await browser.close(); return; }

    const shiftId = startData.shiftId;
    console.log(`  ✓ SHIFT DIMULAI! ID: ${shiftId}`);

    // =========================================================================
    // STEP 4: PRODUKSI
    // =========================================================================
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("STEP 4: Produksi — buka boks & timbang");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    let boxData = null;
    if (inventory.length > 0) {
      const box = inventory[0];
      console.log(`  ➤ Buka: ${box.boxCode} (${box.weightKg} kg)`);

      const boxRes = await context.request.post(`${BASE}/api/v1/shifts/${shiftId}/boxes`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        data: { inventoryBoxId: box.inventoryId },
      });
      boxData = await boxRes.json();
      console.log(`  Box [${boxRes.status()}]: #${boxData.boxNumber} ${boxData.boxCode}`);

      if (boxData.boxId) {
        const outputKg = parseFloat((parseFloat(box.weightKg) * 1.12).toFixed(2));
        console.log(`  ➤ Timbang: ${box.weightKg}kg → ${outputKg}kg`);

        const weighRes = await context.request.patch(`${BASE}/api/v1/boxes/${boxData.boxId}`, {
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          data: { outputWeightKg: outputKg },
        });
        const weighData = await weighRes.json();
        console.log(`  ✓ Yield: ${weighData.yieldPct}% (${weighData.indicator})`);
      }
    } else {
      console.log("  ⚠ Tidak ada inventory TSG");
    }

    // =========================================================================
    // STEP 5: LOG CONSUMPTION, DOWNTIME, MAINTENANCE
    // =========================================================================
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("STEP 5: Catat pemakaian, downtime, maintenance");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    // Fetch consumable & sparepart IDs from DB (seed creates consistent data)
    const { execSync } = require("child_process");
    const getIds = (table) => {
      const out = execSync(`docker exec mes_dev_postgres psql -U mes_user -d mes_dev -t -c "SELECT id, code, name FROM ${table} ORDER BY code;"`, { encoding: "utf8" });
      return out.trim().split("\n").map(line => {
        const parts = line.trim().split("|").map(s => s.trim());
        return { id: parts[0], code: parts[1], name: parts[2] };
      });
    };
    const consumables = getIds("consumable_item");
    const spareparts = getIds("sparepart");

    // Log consumption — bobbin + lem
    if (boxData?.boxId && consumables.length >= 4) {
      const bobbin = consumables.find(c => c.code?.includes("BOBBIN"));
      const lem = consumables.find(c => c.code?.includes("LEM"));
      if (bobbin && lem) {
        for (const item of [{ id: bobbin.id, name: bobbin.name, qty: 3 }, { id: lem.id, name: lem.name, qty: 2 }]) {
          const cr = await context.request.post(`${BASE}/api/v1/boxes/${boxData?.boxId}/consumption`, {
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
            data: { consumableItemId: item.id, quantity: item.qty, note: `Test ${item.name}` },
          });
          console.log(`  ✓ Consumable: ${item.name} x${item.qty} [${cr.status()}]`);
        }
      }
    }

    // Log downtime — 2 events
    for (const dt of [{ cat: "GANTI_MATERIAL", dur: 10, desc: "Ganti bobbin habis" }, { cat: "KENDALA_MESIN", dur: 15, desc: "Motor macet" }]) {
      const dr = await context.request.post(`${BASE}/api/v1/shifts/${shiftId}/downtime`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        data: { category: dt.cat, durationMinutes: dt.dur, description: dt.desc, linkedBoxId: boxData.boxId },
      });
      console.log(`  ✓ Downtime: ${dt.cat} ${dt.dur} menit [${dr.status()}]`);
    }

    // Log maintenance — 2 events
    if (spareparts.length >= 2) {
      for (const sp of [{ id: spareparts[0].id, name: spareparts[0].name, qty: 1, note: "Ganti pisau aus" }, { id: spareparts[1].id, name: spareparts[1].name, qty: 2, note: "Ganti nylon sobek" }]) {
        const mr = await context.request.post(`${BASE}/api/v1/shifts/${shiftId}/maintenance`, {
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
          data: { sparepartId: sp.id, quantity: sp.qty, note: sp.note },
        });
        console.log(`  ✓ Maintenance: ${sp.name} x${sp.qty} [${mr.status()}]`);
      }
    }

    // =========================================================================
    // STEP 6: END SHIFT
    // =========================================================================
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("STEP 6: Akhiri shift");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const endRes = await context.request.patch(`${BASE}/api/v1/shifts/${shiftId}/end`, {
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      data: {
        waste: [
          { category: "MENIR", kg: 0.5, settlementStatus: "PENDING" },
          { category: "RIJEKAN", kg: 0.3, settlementStatus: "PENDING" },
          { category: "DEBU_KASAR", kg: 0.2, settlementStatus: "PENDING" },
          { category: "DEBU_HALUS", kg: 0.1, settlementStatus: "PENDING" },
        ],
        notes: "Test E2E — " + new Date().toISOString(),
      },
    });
    const endData = await endRes.json();
    console.log(`  [${endRes.status()}] Status: ${endData.status || endData.error?.message}`);

    // =========================================================================
    // STEP 6: APPROVE (SUPERVISOR)
    // =========================================================================
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("STEP 7: Approve shift (Supervisor)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const supLogin = await context.request.post(`${BASE}/api/v1/auth/login`, {
      headers: { "Content-Type": "application/json" },
      data: { ...CREDS.supervisor, deviceType: "WEB" },
    });
    const supData = await supLogin.json();
    const supToken = supData.accessToken;
    console.log(`  Login: ${supToken ? "✓ SHIFT_SUPERVISOR" : "✗"}`);

    if (supToken) {
      const approveRes = await context.request.post(`${BASE}/api/v1/shifts/${shiftId}/approve`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${supToken}` },
        data: { reviewNotes: "Auto-approved by E2E test" },
      });
      const approveData = await approveRes.json();
      console.log(`  [${approveRes.status()}] ${approveData.status || approveData.error?.message}`);
    }

    // =========================================================================
    // STEP 7: LAPORAN
    // =========================================================================
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("STEP 8: Laporan per shift");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    if (supToken) {
      const detailRes = await context.request.get(`${BASE}/api/v1/shifts/${shiftId}`, {
        headers: { Authorization: `Bearer ${supToken}` },
      });
      const d = await detailRes.json();

      console.log(`\n  ┌─── DETAIL SHIFT ───────────────`);
      console.log(`  │ ID     : ${shiftId}`);
      console.log(`  │ Status : ${d.status}`);
      console.log(`  │ Produk : ${d.productName}`);
      console.log(`  │ Mesin  : ${d.machineCode}`);
      console.log(`  │ Mulai  : ${d.actualStart}`);
      console.log(`  │ Selesai: ${d.actualEnd || "-"}`);
      (d.boxes || []).forEach(b => {
        console.log(`  │ Boks #${b.boxNumber}: ${b.boxCode} | ${b.tsgWeightKg}kg → ${b.outputWeightKg}kg | yield ${b.yieldPct}%`);
      });
      if (d.waste?.length) {
        const tw = d.waste.reduce((s, w) => s + parseFloat(w.kg || 0), 0);
        console.log(`  │ Waste  : ${d.waste.map(w => `${w.category}=${w.kg}kg`).join(", ")} (total: ${tw}kg)`);
      }
      console.log(`  └─────────────────────────────────\n`);

      // Screenshot UI laporan
      await page.evaluate((t) => localStorage.setItem("accessToken", t), supToken);
      await page.goto(`${BASE}/admin/reports/shifts`, { waitUntil: "networkidle" });
      await sleep(3000);
      await page.screenshot({ path: "/tmp/laporan-shift.png", fullPage: true });
      console.log("  ✓ Screenshot: /tmp/laporan-shift.png");
    }

    // =========================================================================
    // RANGKUMAN
    // =========================================================================
    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("         ✅ FULL WORKFLOW SELESAI");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`  Shift ID : ${shiftId}`);
    console.log(`  Flow     : Login → Start → Buka Boks → Timbang → End → Approve → Laporan`);
    console.log(`  Screenshot: /tmp/laporan-shift.png`);

  } catch (err) {
    console.error("❌ ERROR:", err.message);
  } finally {
    await browser.close();
  }
}

main();
