# 00 · Brief — Untuk Siapa Aplikasi Mobile Ini

Kontekstual untuk semua anggota tim mobile: siapa pengguna, kenapa mobile, dan apa yang TIDAK termasuk.

---

## 1. Keputusan redesign (2026-08-22)

Aplikasi Flutter dibangun ulang dari nol dengan fokus **bukan operator lantai**, melainkan peran lapangan + monitoring manajemen:

| Role | Scope | Aktivitas utama di mobile |
|---|---|---|
| `AREA_SJ_OFFICER` (petugassj) | REGION | Full flow Surat Jalan supplier di **gudang supplier**: buat SJ → scan label = assign jenis + berat → tandai SHIPPED |
| `GUDANG_INBOUND` | PLANT | Receiving TSG di pabrik: scan label boks datang → validasi jumlah vs SJ → terima |
| `PLANT_MANAGER` | PLANT | Monitoring: dashboard pabrik + kondisi stok TSG. Aksi ringan: approve shift, approve receiving, writeoff, transfer, FIFO override |
| `AREA_COORDINATOR` | REGION | Monitoring: dashboard area + kondisi stok TSG |
| `AREA_QA` | REGION | Read-only: dashboard area + kondisi stok TSG |
| `SUPERADMIN` | GLOBAL | Teknis bisa login (2FA + sesi pendek), jarang |

**Yang TIDAK di mobile** (pakai web/tablet):

| Role | Kenapa |
|---|---|
| `OPERATOR_KECER`, `OPERATOR_MEMBER` | Tablet web `/tablet` sudah ada & lebih ergonomis untuk entry boks per shift. Alur produksi shift (start/end, buka boks, timbang, waste) TIDAK dibangun di Flutter. |
| `SHIFT_SUPERVISOR` | Approval shift via web (`/admin/approvals`) |
| `GUDANG_OUTBOUND` | Fase 5 (cartoning) — web |
| `EKSPEDISI` | Fase 6 (dispatch) — web |
| `HQ_ADMIN`, `HQ_ANALYST`, `HQ_AUDITOR` | Web dashboard + report |

Rasional lengkap: `docs/catatan-diskusi.md` §15.

## 2. Device target

- Android 8+ (min API 26) — mayoritas petugas lapangan.
- iOS 13+ — manager/koordinator yang lebih senior.
- Layar 5.5"–7" — **bukan tablet** (tablet pakai web).
- Kamera untuk QR scan wajib.

## 3. Kondisi lapangan (desain harus memperhitungkan)

- Sinyal 4G kadang drop di gudang supplier / area produksi → **offline-first** untuk alur SJ & receiving (queue + sync, lihat `05-offline-sync.md`).
- Tangan kotor / sarung tangan → target tap besar (≥48dp, aksi utama 56dp+).
- Baterai — app harus efisien.

## 4. Prinsip kerja

1. **Kalkulasi server-side** — yield, berat per batang, semua kalkulasi produksi = server. Client hanya kirim input mentah.
2. **Single-session mobile** — 1 user = 1 sesi mobile. Pindah device via revoke SUPERADMIN.
3. **API-first** — semua via REST `/api/v1/*` (web & mobile konsumsi endpoint sama).
4. **QR = jangan di-parse client** — kirim URI utuh ke `POST /qr/resolve`.

## 5. Bukan scope mobile

- Input produksi shift (operator) — tablet web.
- Pool label printing — web area office (printer XPrinter).
- Master data CRUD, user management — web (HQ_ADMIN / SUPERADMIN).
- Cartoning, dispatch, report cukai — web.
- CORRECTION shift — web (HQ_AUDITOR).

## 6. Dokumen lanjutan

- Role & permission: [`01-rbac-mobile.md`](./01-rbac-mobile.md)
- Auth & sesi: [`02-auth-session.md`](./02-auth-session.md)
- Kontrak API: [`03-api-contract.md`](./03-api-contract.md)
