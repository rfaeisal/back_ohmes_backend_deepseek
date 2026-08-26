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

    // Jalankan saat boot, lalu ulangi tiap 24 jam
    await run();
    setInterval(() => { void run(); }, 24 * 60 * 60 * 1000);
  }
}
