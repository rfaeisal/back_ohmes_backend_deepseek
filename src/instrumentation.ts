// =============================================================================
// Instrumentation — hook boot server (backlog #4: auto-cleanup sesi expired)
// =============================================================================
// user_session tumbuh tiap login tanpa pembersihan. cleanupExpiredSessions()
// sudah ada di lib/auth tapi tidak ada yang memanggil berkala. Di container
// Coolify (proses panjang) ini cukup: jalankan saat boot + tiap 24 jam.
// =============================================================================

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { cleanupExpiredSessions } = await import("@/lib/auth");
    const { closeIdleHlpShifts } = await import("@/lib/services/hlp-session.service");

    const run = async () => {
      try {
        const removed = await cleanupExpiredSessions();
        if (removed > 0) {
          console.log(`[cleanup-session] ${removed} sesi expired di-revoke otomatis.`);
        }
      } catch (err) {
        console.error("[cleanup-session] gagal:", err);
      }
    };

    // Sesi HLP idle (docs/23 §2.1): tutup otomatis — angka idle env,
    // default 6 jam (open question §7.2)
    const runHlpIdle = async () => {
      try {
        const idleHours = parseInt(process.env.HLP_SHIFT_IDLE_HOURS || "6", 10);
        const closed = await closeIdleHlpShifts(idleHours);
        if (closed > 0) {
          console.log(`[hlp-session] ${closed} sesi HLP idle >${idleHours} jam di-tutup otomatis.`);
        }
      } catch (err) {
        console.error("[hlp-session] auto-tutup idle gagal:", err);
      }
    };

    // Jalankan saat boot, lalu ulangi berkala (sesi 24 jam, HLP idle tiap jam)
    await run();
    await runHlpIdle();
    setInterval(() => { void run(); }, 24 * 60 * 60 * 1000);
    setInterval(() => { void runHlpIdle(); }, 60 * 60 * 1000);
  }
}
