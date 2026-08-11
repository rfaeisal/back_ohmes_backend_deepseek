# 15 · Testing Strategy

Strategi testing overall untuk MES + WMS Hummer. Cover unit, integration, e2e, dan performance. Target: **coverage ≥ 80%** di service layer, **100% RLS test** untuk isolation, dan **E2E happy path** untuk semua fitur produksi.

---

## 1. Testing Pyramid

```
              ┌─────────────────┐
              │      E2E        │  ← Playwright · ~5% test suite
              │   (Browser)     │
              ├─────────────────┤
              │  Integration    │  ← API + DB · ~25% test suite
              │   (API + RLS)   │
              ├─────────────────┤
              │      Unit       │  ← Vitest · ~70% test suite
              │  (Logic pure)   │
              └─────────────────┘
```

**Rasio target**: 70% unit / 25% integration / 5% E2E. Kalau kebalik — investigate (mungkin unit di-skip / integration over-tested).

---

## 2. Tools

| Layer | Tool | Rasional |
|---|---|---|
| Unit | Vitest | Fast, TS-native, jest-compatible |
| Integration (API+DB) | Vitest + testcontainers | Real PostgreSQL, real RLS |
| E2E (browser) | Playwright | Cross-browser, headless, video record |
| Load / Performance | k6 | Simple JS scripting, cloud + local |
| Type checking | tsc `--noEmit` | Bagian dari CI |
| Coverage | Vitest coverage (c8) | Threshold enforce di CI |

---

## 3. Unit Test

### 3.1. Scope
- **Pure functions**: kalkulasi yield, berat per batang, waste total, age calculation.
- **Formatter / parser**: date, currency, QR URI parser.
- **Validation logic**: zod schemas.
- **Helper utils**: idempotency-key generator, HMAC computation.

### 3.2. Convention
- File: `<name>.test.ts` di sebelah source (co-located).
- Struktur: `describe > it > expect`.
- Naming: `it('should <expected behavior> when <condition>')`.

### 3.3. Contoh
```ts
// src/lib/calc/yield.test.ts
import { describe, it, expect } from 'vitest';
import { calculateYieldPct, getYieldIndicator } from './yield';

describe('calculateYieldPct', () => {
  it('should return correct percentage', () => {
    expect(calculateYieldPct(16.85, 15.20)).toBeCloseTo(110.86, 2);
  });

  it('should throw if tsgWeightKg is 0', () => {
    expect(() => calculateYieldPct(10, 0)).toThrow('DIVIDE_BY_ZERO');
  });
});

describe('getYieldIndicator', () => {
  it('should return NORMAL within range', () => {
    expect(getYieldIndicator(112, { min: 110, max: 114 })).toBe('NORMAL');
  });
  it('should return WARNING below min', () => {
    expect(getYieldIndicator(105, { min: 110, max: 114 })).toBe('WARNING');
  });
});
```

### 3.4. Target
- Coverage ≥ 80% pada `src/lib/**`.
- Semua business rule function ada test.

---

## 4. Integration Test

### 4.1. Scope
- **API endpoint**: request → response, cek payload + status.
- **RLS policy**: user scope X tidak lihat data scope Y.
- **Database transactions**: rollback saat error, commit saat success.
- **Business rule enforcement**: mis. shift APPROVED tidak bisa UPDATE.

### 4.2. Setup
- **Testcontainers PostgreSQL 16** — spawn fresh DB per test file.
- Migrate + seed data test.
- Cleanup: DB dropped per test file.

### 4.3. Konvensi
- File: `<endpoint>.integration.test.ts` di `tests/integration/`.
- Setup helper: `createTestApp()`, `createTestUser(role, plantId)`, `withScope(plantIds)`.

### 4.4. Contoh
```ts
// tests/integration/shift-start.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, createTestUser } from '../helpers';

describe('POST /api/v1/shifts/start', () => {
  const app = createTestApp();

  it('should create shift RUNNING with correct payload', async () => {
    const user = await createTestUser('OPERATOR_KECER', 'PLT-MLG-01');
    const res = await app.post('/api/v1/shifts/start', {
      body: { machineId: 'mch_mkr01', productId: 'prd_hmr_std', shiftTemplateId: 'tpl_malam', members: [...] },
      auth: user.token,
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('RUNNING');
  });

  it('should return 403 for user without shift.start permission', async () => {
    const user = await createTestUser('HQ_ANALYST', null);
    const res = await app.post('/api/v1/shifts/start', { body: {...}, auth: user.token });
    expect(res.status).toBe(403);
  });

  it('should not leak shift from other plant (RLS)', async () => {
    const userA = await createTestUser('OPERATOR_KECER', 'PLT-MLG-01');
    await app.post('/api/v1/shifts/start', {...}, { auth: userA.token });

    const userB = await createTestUser('OPERATOR_KECER', 'PLT-KDR-01');
    const listRes = await app.get('/api/v1/shifts', { auth: userB.token });
    expect(listRes.body.data).toHaveLength(0);
  });
});
```

### 4.5. RLS Test — Mandatory
Untuk **setiap tabel operasional baru**, wajib ada test:
- User scope plant A → SELECT dari plant B → 0 rows.
- User scope plant A → INSERT ke plant B → 403 atau constraint error.
- User scope region → cover semua plant di region.
- User scope company → cover semua plant di company.
- SUPERADMIN dengan bypass_rls → cover semua.

---

## 5. E2E Test (Playwright)

### 5.1. Scope
- **Golden path per fitur**: login → operasi utama → logout.
- **User journey lintas role**: mis. operator create shift → supervisor approve.
- **Multi-device / multi-scope switch**.

Skip di E2E: micro-interaction, edge case (itu integration test).

### 5.2. Konvensi
- File: `<feature>.e2e.spec.ts` di `tests/e2e/`.
- Base URL: `staging.mes.hummer.example` atau local `pnpm dev`.
- Screenshot on failure otomatis.
- Video record (headless: only on failure; headed: always).

### 5.3. Contoh Scenarios (Fase 1)
- **Login flow**:
  - OPERATOR_KECER login sukses.
  - SUPERADMIN login dengan 2FA (dev: dummy OTP).
  - Single-session: user login di device 1 → device 2 dapat 409.
- **Shift lifecycle**:
  - Start shift → open boks → weigh → end shift dengan waste + handoff.
  - Approve shift oleh supervisor.
- **RBAC UI**:
  - Operator tidak lihat tombol "Approve".
  - HQ_ANALYST tidak bisa mutate.
- **Multi-scope switch**:
  - User dengan 2 scope → switch → refresh cached data.

### 5.4. Target
- ≥ 1 E2E per fitur utama.
- Run E2E di CI staging setelah deploy.

---

## 6. Performance / Load Test (k6)

### 6.1. Scope
- **API endpoint kritikal**: shift start, box open, box weigh.
- **Dashboard rollup**: Area dashboard load < 3s dengan 30 pabrik data.
- **Concurrent shifts**: 30 pabrik × 3 shift paralel × 30 boks per shift.

### 6.2. Skenario
```js
// tests/perf/box-open.k6.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 50,           // 50 concurrent users (mimic 50 pabrik operator)
  duration: '5m',
  thresholds: {
    'http_req_duration': ['p(95)<800'],  // 95% < 800ms
    'http_req_failed': ['rate<0.01'],    // <1% error
  },
};

export default function () {
  const res = http.post('https://staging.mes.hummer.example/api/v1/shifts/xxx/boxes', ...);
  check(res, { 'status is 201': (r) => r.status === 201 });
}
```

### 6.3. Target
- P95 latency < 800ms untuk semua endpoint operasional.
- P99 < 2s.
- Error rate < 1%.

Run: **sebelum major release**, bukan di setiap CI.

---

## 7. Testing Multi-Tenant (Critical)

Kategori khusus karena high-risk. Setiap fitur baru **wajib** dites lintas plant:

### 7.1. Cross-Plant Isolation
```ts
it('user plant A cannot see data plant B', async () => {
  await seedShiftInPlant('PLT-MLG-01');
  const userB = await createTestUser('OPERATOR_KECER', 'PLT-MLG-02');
  const res = await app.get('/api/v1/shifts', { auth: userB.token });
  expect(res.body.data).toHaveLength(0);
});
```

### 7.2. Cross-Region Aggregation
```ts
it('AREA_COORDINATOR sees all plants in region', async () => {
  await seedShiftInPlant('PLT-MLG-01');
  await seedShiftInPlant('PLT-KDR-01');
  const user = await createTestUser('AREA_COORDINATOR', 'AREA-JATIM');
  const res = await app.get('/api/v1/shifts', { auth: user.token });
  expect(res.body.data.length).toBeGreaterThanOrEqual(2);
});
```

### 7.3. LOCKED Immutability
```ts
it('cannot update APPROVED shift', async () => {
  const shift = await createApprovedShift();
  const res = await app.patch(`/api/v1/shifts/${shift.id}`, {
    body: { notes: 'try edit' },
  });
  expect(res.status).toBe(409);  // atau 403
});
```

### 7.4. Correction Flow
```ts
it('HQ_AUDITOR can create correction for LOCKED shift', async () => {
  const shift = await createApprovedShift();
  const auditor = await createTestUser('HQ_AUDITOR', 'HMR');
  const res = await app.post(`/api/v1/shifts/${shift.id}/correct`, {
    body: { correctionFields: [...] },
    auth: auditor.token,
  });
  expect(res.status).toBe(201);
  // Verify original shift unchanged
  const original = await getShift(shift.id);
  expect(original.notes).toBe(shift.notes);
});
```

---

## 8. Coverage & Enforcement

### 8.1. Threshold di CI
```json
// vitest.config.ts
coverage: {
  provider: 'v8',
  thresholds: {
    lines: 80,
    branches: 75,
    functions: 80,
    statements: 80,
  },
}
```

CI fail kalau coverage < threshold.

### 8.2. Coverage Exclusion
- Config files, migration files, seed scripts → excluded.
- UI presentation (React components) → target lebih rendah (60%), fokus di logic.

---

## 9. Manual Testing Checklist

Selain otomatis, wajib manual test sebelum release major:

### 9.1. Fase 1 Release
- [ ] Operator kecer real (bukan dev) coba full shift di tablet pilot.
- [ ] Supervisor pabrik approve → data masuk rollup.
- [ ] Handoff antar 2 shift berurutan bersih.
- [ ] Staff gudang inbound terima 20 boks TSG < 10 menit.
- [ ] SUPERADMIN revoke sesi mobile → user bisa login di device baru.

### 9.2. Sebelum Rollout Multi-Pabrik (Fase 2)
- [ ] 3 pabrik pilot × 2 shift paralel → tidak ada data contamination.
- [ ] Dashboard Area load < 3s dengan 3 pabrik.
- [ ] Notif approval > 2 jam → supervisor terima.

---

## 10. Testing Data

### 10.1. Fixture Convention
- Seed sintetis di `tests/fixtures/`.
- Faker library untuk data generator (mis. nama user, kode boks).
- Deterministik (fixed seed) supaya test reproducible.

### 10.2. Data Sensitif
- **Jangan** copy data production ke dev/test.
- Kalau perlu real-like data untuk pilot testing → generate sintetis atau anonymize.

---

## 11. CI Pipeline (Testing Stage)

```yaml
# .github/workflows/ci.yml
jobs:
  test:
    steps:
      - run: pnpm lint             # ESLint
      - run: pnpm typecheck        # tsc --noEmit
      - run: pnpm test:unit        # Vitest unit
      - run: pnpm test:integration # Vitest integration (dengan testcontainers)
      - run: pnpm test:coverage    # Coverage report + threshold enforce
  e2e:
    needs: [deploy-preview]
    steps:
      - run: pnpm test:e2e         # Playwright on preview URL
```

---

## 12. Testing per Modul (Rekapan)

| Modul | Unit | Integration | E2E |
|---|:---:|:---:|:---:|
| Auth (login, refresh, single-session) | ✅ | ✅ | ✅ |
| Shift lifecycle | ✅ | ✅ | ✅ |
| Boks TSG + inventory | ✅ | ✅ | ✅ |
| Event log (consumables, downtime, maintenance) | ✅ | ✅ | — |
| Waste 4 kategori | ✅ | ✅ | ✅ |
| Handoff | ✅ | ✅ | ✅ |
| Approval + LOCKED | ✅ | ✅ | ✅ |
| CORRECTION | ✅ | ✅ | — |
| WMS Inbound (receiving, FIFO) | ✅ | ✅ | ✅ |
| WMS Outbound (Fase 5) | ✅ | ✅ | ✅ |
| Dispatch (Fase 6) | ✅ | ✅ | ✅ |
| QR resolve | ✅ | ✅ | — |
| Mobile local queue (di Flutter side) | ✅ | ✅ | ✅ |
| SUPERADMIN privileged | ✅ | ✅ | ✅ |
| RLS cross-plant | — | ✅ | — |

---

## 13. Referensi

- [`04-data-model.md`](./04-data-model.md) §9 — RLS policy yang harus di-test.
- [`05-rbac-matrix.md`](./05-rbac-matrix.md) §7 — RBAC testing strategy.
- [`06-api-spec.md`](./06-api-spec.md) — endpoint contract yang di-test.
- [`14-deployment-infra.md`](./14-deployment-infra.md) §7 — CI pipeline.
- [`CONTRIBUTING.md`](../CONTRIBUTING.md) — pre-push checklist.
