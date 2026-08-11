# 16 · Observability — Logging, Metrics, Alerts, Dashboards

Panduan observability untuk operasi production. Fokus: **ops harus tahu apa yang terjadi tanpa harus akses production shell**.

Prinsip: **you can't fix what you can't see**. Tanpa observability, downtime tidak terdeteksi sampai user komplain — di industri rokok dengan shift 13 jam, itu terlambat.

---

## 1. Tiga Pilar Observability

| Pilar | Tool | Untuk apa |
|---|---|---|
| **Logging** | Vercel Logs + Sentry breadcrumbs | Apa yang terjadi (event by event) |
| **Metrics** | Vercel Analytics + custom counters | Berapa & seberapa cepat (aggregate) |
| **Tracing** | Sentry Performance Monitoring | Kenapa lambat (span breakdown per request) |

Semua terintegrasi ke **Sentry** sebagai central pane.

---

## 2. Logging Strategy

### 2.1. Log Level
- `debug` — dev only, detail granular (query SQL, state internal). Off di prod.
- `info` — event operasional normal (user action, batch completion). Retention 30 hari.
- `warn` — anomaly non-blocking (retry sukses, deprecated API). Retention 90 hari.
- `error` — bug / gagal request. Retention 1 tahun. Auto-alert.
- `fatal` — sistem down (DB unreachable, out of memory). Auto-page on-call.

### 2.2. Format Log
Structured JSON, konsisten:
```json
{
  "timestamp": "2026-08-10T14:32:11.234+07:00",
  "level": "info",
  "event": "shift.approved",
  "requestId": "req_2a7f9b",
  "userId": "usr_supervisor_a",
  "activeScope": { "type": "PLANT", "id": "PLT-MLG-01" },
  "resource": { "type": "shift", "id": "shf_2b9f1a" },
  "duration_ms": 245,
  "outcome": "success",
  "metadata": { "notes": "OK" }
}
```

Field wajib:
- `timestamp` (ISO 8601 + offset)
- `level`
- `event` (dot-case, mis. `shift.approved`, `qr.invalid`)
- `requestId` (correlation ID)
- `userId` (kalau authenticated)
- `outcome` (`success`/`failure`)

### 2.3. Sensitive Data — Jangan Log
- Password, JWT/refresh token full string.
- Full IP (mask jadi `xxx.xxx.***.***` di external log).
- OTP.
- HMAC secret.
- Payload lengkap yang mungkin ada PII.

Utility helper: `sanitizeForLog(obj)` — auto-strip field sensitif.

### 2.4. Correlation
Setiap request punya `X-Request-Id` header (server-generated kalau tidak ada dari client). Log & trace attach ID ini. Bisa search cross-service.

---

## 3. Metrics

### 3.1. Business Metrics (custom counter)
| Metric | Type | Purpose |
|---|---|---|
| `shift.started` | counter | Volume shift dimulai per hari per plant |
| `shift.approved` | counter | Volume shift APPROVED per hari |
| `shift.reopened` | counter | Volume reopen — anomaly signal |
| `shift.corrected` | counter | Volume CORRECTION — compliance signal |
| `box.opened` | counter | Volume boks dibuka per shift |
| `box.yield_out_of_range` | counter | Boks dengan yield WARNING — quality signal |
| `handoff.created` | counter | Volume handoff — operasional signal |
| `waste.debu_halus_kg` | histogram | Distribusi Debu Halus per shift — waste trend |
| `tsg.inventory.age_days` | histogram | Umur boks di inventory — freshness |
| `dispatch.orders_per_day` | counter | Volume dispatch — throughput |

### 3.2. Technical Metrics (Vercel built-in)
- Request rate (req/min).
- Latency P50 / P95 / P99.
- Error rate (5xx / total).
- Function cold start rate.
- DB connection pool usage.

### 3.3. Metric Cardinality
Tag metric dengan `plantId`, `env`, tapi **jangan** dengan `userId` (cardinality explosion). Untuk user-level, pakai log query.

---

## 4. Tracing (Sentry Performance)

### 4.1. Sample Rate
- Dev: 100%.
- Staging: 50%.
- Prod: 10% (bump sementara ke 50% saat investigasi issue).

### 4.2. Span Instrumentation
Auto-instrument:
- Route Handler (Next.js).
- Drizzle query (via middleware).
- External HTTP (Twilio, FCM).

Manual instrument untuk business logic critical:
```ts
import * as Sentry from '@sentry/nextjs';

await Sentry.startSpan({ name: 'shift.calculateYield' }, async (span) => {
  span.setAttribute('shiftId', shiftId);
  return await calculateYield(...);
});
```

### 4.3. Trace Correlation
Set `X-Trace-Id` header response — user bisa report bug dengan trace ID untuk cepat lookup.

---

## 5. Dashboards

### 5.1. Sentry Dashboards
Buat 4 dashboard:

1. **Operational Health**: request rate, latency P95, error rate, top errors. Refresh 1 menit.
2. **Business Overview**: shift/day, approval throughput, waste avg per plant, top downtime categories.
3. **Multi-Tenant Health**: shift APPROVED per plant per hari (bar chart), plants dengan zero activity (health signal).
4. **Security Log**: LOGIN_FAILED per menit, OTP_FAILED, PERMISSION_DENIED. Anomaly detection.

### 5.2. In-App Dashboards
Bagian dari Fase 4 (HQ Analytics). Data source: materialized view + realtime query. Beda dari operational dashboard — audience business, bukan tech.

---

## 6. Alerts

### 6.1. Alert Rules
| Alert | Threshold | Severity | Notify |
|---|---|---|---|
| **App down** | 5xx > 5% dalam 5 menit | P1 | On-call page (WA + phone) |
| **DB unreachable** | connection error 30s | P1 | On-call page |
| **Auth failure spike** | LOGIN_FAILED > 20/menit | P2 | Security channel |
| **Approval backlog** | shift COMPLETED > 4 jam belum APPROVED | P3 | Plant manager |
| **Slow endpoint** | P95 > 2s selama 10 menit | P2 | Dev channel |
| **Rate limit spike** | RATE_LIMIT_HIT > 100/menit | P3 | Investigate DDoS |
| **Migration failed** | CI migration step fail | P2 | Dev channel |
| **Disk full (DB)** | > 85% capacity | P2 | Ops channel |
| **Backup missed** | > 25 jam sejak last backup | P1 | On-call |
| **Privileged action** | SUPERADMIN action | Info | SUPERADMIN channel (self-policing) |

### 6.2. Channel
- **P1 (Critical, page)**: WhatsApp group #incident + phone call fallback.
- **P2 (High, urgent)**: WhatsApp group #alerts.
- **P3 (Medium, business hours)**: WhatsApp group #ops-notify.
- **Info**: log-only, viewable di dashboard.

### 6.3. Escalation
- On-call responden gagal ack dalam 15 menit → escalate ke backup on-call.
- Backup gagal ack 15 menit → escalate ke tech lead.
- Detail rotasi: [`17-operations-runbook.md`](./17-operations-runbook.md) §On-Call.

---

## 7. Health Check Endpoint

### `GET /api/v1/health`
Public endpoint (tidak butuh auth) untuk uptime monitoring:
```json
{
  "status": "ok",
  "version": "1.2.0",
  "uptime": 12345,
  "checks": {
    "database": "ok",
    "redis": "ok",
    "storage": "ok"
  },
  "timestamp": "2026-08-10T14:32:11+07:00"
}
```

Gunakan untuk:
- Vercel deployment health check.
- Uptime monitoring (UptimeRobot / BetterUptime).
- Load balancer health check (kalau future migrate ke non-Vercel).

Kalau salah satu `checks` fail → status `degraded` (200 OK tapi warning) atau `down` (503).

---

## 8. SLO (Service Level Objectives)

### 8.1. Availability
- **Production**: 99.5% uptime bulanan (~3.5 jam downtime tolerated).
- **Maintenance window**: 03:00-05:00 WIB (di antara shift MALAM end & SIANG start di pabrik 2-shift).

### 8.2. Latency
- P50 < 300ms
- P95 < 800ms
- P99 < 2000ms

### 8.3. Error Rate
- < 1% 5xx per hari.
- 0% data leak cross-plant (RLS violation).

### 8.4. Data
- 100% shift APPROVED punya audit log complete.
- 0 hilang data operasional (backup + retention 10 tahun).

### 8.5. Response Time (Human)
- P1 incident: response < 15 menit.
- P2 incident: response < 1 jam.
- P3 incident: response < 4 jam business hours.

---

## 9. Retention Policy

| Data | Retention | Purpose |
|---|---|---|
| Log `info`/`warn` | 90 hari | Debug recent issues |
| Log `error`/`fatal` | 1 tahun | Post-mortem, compliance |
| Metrics (raw) | 30 hari | Recent analysis |
| Metrics (aggregated hourly/daily) | 2 tahun | Trend analysis |
| Traces | 7 hari (Sentry Business plan) | Performance investigation |
| Security log | 2 tahun | Compliance |
| Audit log | 10 tahun | Cukai regulator |

Setelah retention expired, delete otomatis lewat lifecycle policy.

---

## 10. Log Query Recipes

### 10.1. Find slow shift approvals
```
event:"shift.approved" duration_ms:>1000
```

### 10.2. Failed logins in last hour
```
event:"login.failed" @timestamp:[now-1h TO now]
| stats count by username, ipAddressMasked
```

### 10.3. RLS violations (should be 0)
```
event:"rls.violation"
```
Kalau ada > 0 → security incident, investigate immediately.

### 10.4. SUPERADMIN activity feed
```
is_privileged:true
| sort by @timestamp desc
```

---

## 11. Observability Checklist Per Fitur Baru

Setiap PR yang tambah endpoint / business logic wajib:
- [ ] Emit log event dengan `event` name konsisten.
- [ ] Trace span kalau logic complex (multi-step, external call).
- [ ] Metric counter kalau ada value untuk trending.
- [ ] Alert rule kalau ada threshold operasional (mis. approval backlog).
- [ ] Update dashboard kalau perlu.

---

## 12. Referensi

- [`14-deployment-infra.md`](./14-deployment-infra.md) §9 — Sentry setup.
- [`17-operations-runbook.md`](./17-operations-runbook.md) — incident response berbasis alert.
- [`SECURITY.md`](../SECURITY.md) §4 — security log detail.
