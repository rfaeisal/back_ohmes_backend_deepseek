# Runbook — Deploy ke Coolify (server 192.168.13.231) + Cloudflare Tunnel

Panduan deploy `back_ohmes_backend_deepseek` ke Coolify dengan **database
fully internal** (tanpa port publik — migrasi & seed dijalankan otomatis
oleh entrypoint container saat deploy).

Target: `https://ohmes.fzdev.my.id` (zone `fzdev.my.id` di Cloudflare).

Prasyarat satu kali (sudah beres di server ini): Docker, Coolify, Traefik
(`coolify-proxy`), cloudflared tunnel, GitHub App integration. Detail:
lihat panduan CutiSmart `docs/panduan-deploy-project-baru-di-coolify.md`.

---

## 1. Cloudflare — tambah hostname (2 menit)

1. dash.cloudflare.com → **Zero Trust → Networks → Tunnels** → tunnel existing.
2. Tab **Public Hostnames → Add a public hostname**:
   - Subdomain: `ohmes`
   - Domain: `fzdev.my.id`
   - Type: `HTTP`
   - URL: `coolify-proxy:80`  ← persis, tanpa protokol
3. Save. Cek **DNS → Records**: CNAME `ohmes` → `*.cfargotunnel.com`, status Proxied (orange).
4. **SSL/TLS zone `fzdev.my.id`**: mode `Flexible`/`Full` — **bukan Full Strict** (origin HTTP).

## 2. Coolify — provision database (5 menit)

1. UI Coolify → pilih Project → **Add Resource → Database → PostgreSQL**.
2. Nama: `ohmes-db` · Image `postgres:16` · isi **User** (mis. `mes_admin`) +
   **Password** (generate & simpan) · Database name: `mes_prod`.
3. **Tanpa public port** — biarkan internal.
4. Save & Start → catat **connection string internal** Coolify:
   `postgresql://mes_admin:<password>@<uuid>:5432/mes_prod`

## 3. Coolify — application (5 menit)

1. **Add Resource → Application** → Private Repository (GitHub App) →
   `rfaeisal/back_ohmes_backend_deepseek` · branch `main`.
2. Konfigurasi build:
   - Build Pack: **Dockerfile**
   - Ports Exposes: `3000`
   - Health Check Path: `/api/v1/health`
3. Tab **General → Domains**: `https://ohmes.fzdev.my.id` (dengan https://).
   **PENTING**: matikan toggle **"Redirect HTTP to HTTPS"** — tunnel cloudflared
   masuk ke origin via HTTP (`coolify-proxy:80`), kalau redirect aktif request
   loop `307` ke URL yang sama. Setelah Save → **Redeploy** (label Traefik baru
   terbentuk saat container recreate; UI tidak selalu minta redeploy — cek
   "Changes pending" dan redeploy manual). Jangan tambah domain `www` kalau
   DNS-nya tidak dibuat di Cloudflare.
4. Tab **Environment Variables** — dua kelompok:

   **Build-time** (centang "Build Variable ✓"):
   | Var | Nilai |
   |---|---|
   | NEXT_PUBLIC_APP_ENV | `production` |
   | NEXT_PUBLIC_APP_NAME | `MES + WMS Hummer` |
   | NEXT_PUBLIC_BASE_URL | `https://ohmes.fzdev.my.id` |
   | NEXT_PUBLIC_APP_VERSION | `0.1.0` |

   **Runtime** (default, tanpa centang Build):
   | Var | Nilai |
   |---|---|
   | DATABASE_URL | `postgresql://mes_app:<MES_APP_DB_PASSWORD>@<host-coolify-db>:5432/mes_prod` |
   | DATABASE_MIGRATION_URL | `postgresql://mes_admin:<password-coolify>@<host-coolify-db>:5432/mes_prod` |
   | MES_APP_DB_PASSWORD | generate: `openssl rand -hex 24` |
   | SUPERADMIN_DEFAULT_PASSWORD | generate (min 12) — password awal akun `admin` |
   | JWT_SECRET | `openssl rand -hex 32` |
   | JWT_ISSUER | `mes.hummer` |
   | JWT_AUDIENCE | `mes.hummer.api` |
   | HMAC_KEY_ENCRYPTION | `openssl rand -hex 32` |
   | OTP_BYPASS_CODE | `000000` (SEMENTARA — hapus saat Twilio 2FA aktif) |
   | LOG_LEVEL | `info` |
   | FEATURE_WMS_INBOUND / FEATURE_MOBILE_QR / FEATURE_WMS_OUTBOUND / FEATURE_DISPATCH | `true` |

   Catatan: host DB = hostname internal yang diberikan Coolify (bukan localhost).

## 4. Deploy & verifikasi

1. Klik **Deploy** → entrypoint otomatis: migrasi → ganti password
   `mes_app` → seed idempotent → server start. Log di tab Deployments.
2. Verifikasi:
   ```bash
   curl -sI https://ohmes.fzdev.my.id/api/v1/health   # 200
   curl -s -X POST https://ohmes.fzdev.my.id/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"admin","password":"<SUPERADMIN_DEFAULT_PASSWORD>","deviceType":"WEB","otp":"000000"}'
   ```
3. **Auto-deploy**: aplikasi → General → Webhook → Auto Deploy (opsional).

## 5. Troubleshooting cepat

- **404 dari Cloudflare**: cek Public Hostname URL = `coolify-proxy:80` persis.
- **502/503**: `docker logs <container> --tail 100` — biasanya env kurang /
  migrasi gagal (cek log entrypoint di awal deploy).
- **`ERR_MODULE_NOT_FOUND ... imported from /alter-app-role.mjs`**: script
  entrypoint tidak bisa resolve `node_modules` dari root container — sudah
  difix (script dipindah ke `/app/alter-app-role.mjs`). Kalau muncul lagi,
  cek `COPY` path script di Dockerfile.
- **Deploy stuck di git/GitHub**: `docker exec coolify php artisan
  horizon:terminate` → retry Deploy.
- **Build OOM/exit 255**: server 3.8 GB — swap sudah disiapkan; kalau
  tetap fail, `docker builder prune -af` lalu retry.

## 6. Setelah up — checklist pasca-deploy

- [ ] Login admin + ganti password via change-password
- [ ] Login petugas (`petugassj`) → cek alur pool label
- [ ] Cek RLS: login 2 user beda plant tidak saling lihat data
- [ ] Matikan `OTP_BYPASS_CODE` setelah Twilio terpasang
- [ ] Backup DB Coolify (Settings → Backups) — retensi cukai 10 tahun!
