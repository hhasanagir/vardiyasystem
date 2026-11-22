# Phase 5C.33 — P2 Batch B Remediation Report (safe code-only)

**Tarih:** 2026-11-21  
**Kapsam:** Kullanıcı onaylı “Batch B (güvenli code-only)” — P2-05, P2-06, P2-07, P2-08.  
**Doğrulama modu:** code + typed unit/regression. DB/migration/seed/integration/e2e/build çalıştırılmadı.

---

## 1. Kapsam kararı

Denetim kaynağı: `docs/phase-5/phase-5c24-readonly-audit-report.md` (P2-01…P2-18).

Batch B’ye alınanlar (ürün/politika/mimari kararı gerektirmeyen, mevcut sözleşmeyi koruyan bütünlük düzeltmeleri):

| ID | Denetim bulgusu | Batch B yaklaşımı |
|---|---|---|
| P2-05 | Legacy workflow transition’ları version precondition’suz | Tüm legacy workflow geçişleri atomik CAS + version bump |
| P2-06 | Legacy workflow yazmaları transaction’sız, audit fire-and-forget | State + approval/snapshot + audit tek transaction; audit hataları yutulmuyor |
| P2-07 | DDD publish snapshot üretmiyor → DDD rollback 404 | DDD publish, snapshot’ı `save` transaction’ında yazıyor |
| P2-08 | DDD rollback swapRequest’leri iptal etmiyor | Swap iptali `save` transaction’ında, CAS sonrası ve assignment yazımlarından önce |

Kapsam dışı (karar/mimari/DB veya ayrı onay gerekir): P2-01, P2-02 kalanı, P2-03, P2-04, P2-09, P2-11 greedy hard-cap kalanı, P2-13, P2-14, P2-15, P2-18 ve tüm P3 maddeleri.

---

## 2. Uygulanan değişiklikler

### 2.1 P2-05 — atomik version precondition

`backend/src/modules/schedules/schedules-workflow.service.ts`

- Yeni `commitTransition(...)` helper’ı `updateMany({ where: { id, version } })` ile CAS uyguluyor; mismatch ise `ConflictException (409)`.
- CAS başarılı olmadan hiçbir approval/snapshot/audit yan yazması yapılmıyor.
- Version, her geçişte aynı statement içinde `{ increment: 1 }` ile ilerliyor. Bu, eski okunan version ile ikinci geçişin sessizce başarılı olmasını engeller.
- Kapsanan geçişler: `submitForReview`, `approve`, `reject`, `publish`, `archive`, `rollback`, `createRevision`.
- Rollback’te CAS, swap iptali ve assignment silme/yazma işlemlerinden **önce** kontrol ediliyor.

**Gözlemlenebilir not:** Legacy workflow transition’ları artık version değerini bir artırıyor (önce sabit bırakıyordu). Bu, CAS’ın fail-closed çalışması için gerekli davranış değişikliğidir; RBAC, durum makinesi, four-eyes ve eşikler değişmedi.

### 2.2 P2-06 — transaction ve audit bütünlüğü

- `commitTransition` içinde state row, approval upsert ve audit kaydı aynı `Prisma.$transaction` içinde.
- `publish` içinde pre-publish snapshot, state update, approval ve audit aynı transaction’da.
- `createRevision` içinde snapshot, version bump ve audit aynı transaction’da.
- `rollback` içinde CAS, swap cancel, assignment restore ve audit aynı transaction’da.
- `auditLog.log(...)` artık `await` ediliyor ve opsiyonel `Prisma.TransactionClient` alıyor (`backend/src/modules/audit-log/audit-log.service.ts`). Audit hatası yutulmuyor; transaction’ı başarısız hale getiriyor.
- `upsertApproval` / `createSnapshot` artık transaction client ile çağrılabiliyor.

### 2.3 P2-07 — DDD publish snapshot

`backend/src/modules/schedules/domain/repositories/schedule-repository.port.ts` ve `infrastructure/prisma-schedule.repository.ts`

- `ScheduleSaveOptions` eklendi: `snapshot?: { userId, comment? }`.
- `save(...)`, snapshot seçeneği verildiğinde `(scheduleId, version)` unique key üzerine `scheduleSnapshot.upsert` yapıyor; snapshot yazımı `save` transaction’ının içinde.
- `ScheduleApplicationService.publish(...)`, `persist(...)` çağrısına `snapshot: { userId, comment: 'DDD publish snapshot' }` geçiyor.
- Snapshot, publish anındaki mevcut version ve assignment kümesini içeriyor; DDD rollback’in hedef version bulamaması (404) engelleniyor.

### 2.4 P2-08 — DDD rollback swap iptali

- `ScheduleSaveOptions.cancelSwapRequestsReason` eklendi.
- Repository, CAS sonrası ve assignment yazımlarından önce ilgili `SwapRequest` satırlarını `CANCELLED` yapıyor.
- `ScheduleApplicationService.rollback(...)`, `persist(...)` çağrısına `cancelSwapRequestsReason: 'DDD rollback to vX: ...'` geçiyor.
- Stale version durumunda hiçbir swap veya assignment yazısı yapılmıyor.
- Legacy rollback’in 5C.17 swap-cancel davranışı korundu ve CAS ile güçlendirildi.

---

## 3. Test kanıtı

Yeni regression spec:  
`backend/src/modules/schedules/__tests__/p2-batch-b-workflow-integrity.spec.ts` — **9/9 PASS**

Kapsam:
1. Approve stale version → 409, approval/audit yazılmaz.
2. Rollback stale version → 409, swap/assignment yazılmaz.
3. Approve approval+audit transaction client üzerinden yazılır.
4. Audit hatası yutulmaz.
5. DDD publish repository’ye snapshot option geçirir.
6. Repository snapshot’ı transaction içinde yazar.
7. DDD rollback swap-cancel reason geçirir.
8. Repository swap’ları CAS sonrası, assignment’lardan önce iptal eder.
9. CAS başarısızsa swap’lere dokunulmaz.

Güncellenen mevcut spec’ler (yeni davranışa uyum; iddia zayıflatılmadı, skip/eşik değişmedi):
- `5c17-approve-four-eyes.spec.ts`
- `5c17-rollback-swap-preservation.spec.ts`
- `5c25-availability-enforcement.spec.ts`
- `5c6-hardening.spec.ts`
- `security-invariants.spec.ts` (save çağrı şekli korundu)

Hedefli çalıştırma: **28/28 PASS** (yeni spec + güncellenen workflow/CAS/repository spec’leri).

---

## 4. Gate sonuçları

### Backend

| Gate | Sonuç |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — **4075 error / 8706 warning**, baseline `maxErrors: 4075`; re-baseline yapılmadı |
| Hedefli regression | 28/28 PASS |
| Full `npx vitest run` | **1221 PASS / 10 FAIL / 1231 total** |

Kalan 10 hata yalnızca `src/modules/schedules/__tests__/device-off.spec.ts` içindir ve ortamda PostgreSQL olmadığı için `Can't reach database server at localhost:5432` hatasıyla DB-backed çalışır. Bu hatalar Batch B öncesinde de aynıydı; kod kaynaklı regresyon yok.

### Frontend

| Gate | Sonuç |
|---|---|
| `npm run typecheck` | PASS |
| `npx vitest run` | 157/157 PASS (19 dosya) |
| `npm run lint` | 0 error / 397 warning |

---

## 5. Güvenlik / sözleşme kontrolleri

- Tenant kısıtları (`assertScheduleTenant`, middleware `where` kısıtları) genişletilmedi.
- Four-eyes fail-closed (`submittedBy` zorunlu, gönderen ≠ onaylayan) korundu.
- `publishByUnit`, draft→onay akışı ve published/archived immutable davranışı korundu.
- RBAC roller, `MinRole` eşikleri, violation severity/eşikleri ve override kuralları değiştirilmedi.
- `AVAILABLE_OVER_BLOCKING` ve fail-closed sıkılaştırmaları geriletildi.
- Migration, DB şeması, secret, git geçmişi değişmedi.
- Emek hukuku / NDK yorumları doğrulanmış mevzuat olarak sunulmadı.

---

## 6. Yedek ve geri alma

Batch B öncesi yedek:  
`C:\Users\Hasan\AppData\Local\Temp\opencode\vardiyasystem-p2batchb-backup-20261121`

- 1533 dosya
- SHA256 `MANIFEST.txt`
- `node_modules`, `dist`, `coverage` hariç

---

## 7. Açık maddeler ve sonraki adım

Batch B ile kapanan: **P2-05, P2-06, P2-07, P2-08**.

Açık kalan P2 maddeleri: **P2-01, P2-02 (kalan), P2-03, P2-04, P2-09, P2-11 (greedy hard weekly cap), P2-13, P2-14, P2-15, P2-18**.

Bu maddeler sırasıyla tek-motor mimarisi, ürün/politika kararı, RBAC policy, Redis/worker kararı, additive migration ve performans mimarisi gerektirir. **P3 için ayrı kullanıcı onayı koşulu korunuyor.**

**Go-live notu:** 30 Nov 2026 için genel değerlendirme, açık P2 karar maddeleri ve DB-backed doğrulama yapılmadığı için “ hazır ” değildir. Batch B yalnızca workflow bütünlüğü kapsamında code-level iyileştirme sağlar.
