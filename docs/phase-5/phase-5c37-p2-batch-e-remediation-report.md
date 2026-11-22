# Phase 5C.37 — P2 Batch E (Altyapı/Performans) Kapanış Raporu

**Tarih:** 2026-11-22  
**Kapsam:** P2-09 (Redis-backed job status/dedupe) ve P2-15 (apply batch validation).  
**Onay:** Kullanıcı `onaylıyorum` ile Batch E/F ve DB-backed doğrulamayı onayladı. DB/worker erişimi olmadığı için doğrulama yalnızca kod/unit seviyesinde yapıldı.  
**Öncesi yedek:** `C:\Users\Hasan\AppData\Local\Temp\opencode\vardiyasystem-batchE-backup-20261122\MANIFEST.txt` (1762 dosya).

---

## 1. Uygulanan değişiklikler

### P2-09 — Redis-backed job status ve atomik dedupe

| Dosya | Değişiklik |
|---|---|
| `backend/src/modules/schedules/job-queue/schedule-job-status.service.ts` | In-memory `Map` kaldırıldı. `REDIS_CLIENT` üzerinden Redis'e geçildi. `SET NX` ile org + schedule + type bazında atomik tek job claim; record/organization/schedule/dedupe key'leri `RedisKeyNamespace.QUEUE` altında ve org'lu; 24s record TTL, 1s dedupe TTL; terminal durumlarda dedupe serbest bırakılması; tenant-scoped schedule listeleri; Redis hatasında `503 ServiceUnavailable` ile fail-closed. **In-memory fallback yok.** |
| `backend/src/modules/schedules/job-queue/schedule-job-queue.service.ts` | Dedupe kontrolü artık `create()` içindeki atomik Redis claim. Job payload'larına `organizationId/userId` taşınıyor. |
| `backend/src/modules/schedules/job-queue/schedule-job.processor.ts` | Status çağrıları `async/await` ile zincirlendi; fail-closed worker davranışı korundu. |
| `backend/src/modules/schedules/schedules-ddd.controller.ts` | Job status/schedule listesi çağrıları async. System admin dışındaki kullanıcılar için schedule listesi kendi tenant index'ine sabitlendi. |

### P2-15 — Apply sırasında tek seferlik validasyon context'i

| Dosya | Değişiklik |
|---|---|
| `backend/src/modules/schedules/schedule-validation.service.ts` | `validateAssignmentsBatch()` eklendi. Schedule, personel, cihaz, template, grup, tatil, device-off ve blocked-date context'leri **bir kez** yükleniyor; adaylar aynı `ConstraintEngine` ile sırayla doğrulanıyor. Önceki kabul edilen adaylar working set'e ekleniyor; blocking ihlal tüm apply'i reddediyor. |
| `backend/src/modules/schedules/schedule-auto-generator.service.ts` | `apply()` artık her satır için `validateAssignment()` çağırmak yerine tek `validateAssignmentsBatch()` çağrısı yapıyor. Coverage gate, CAS/version bump, conflict-skip ve `createMany` transaction'ı korundu. |
| Mevcut 4 spec mock'u | `validateAssignmentsBatch` mock'u eklendi; test semantiği zayıflatılmadı, yalnızca yeni çağrı yüzeyi yansıtıldı. |
| `backend/src/modules/schedules/__tests__/p2-batch-e-infrastructure.spec.ts` | **Yeni**, 6 test: tenant ayrımı + atomik dedupe, lifecycle/dedupe release, Redis down fail-closed, sabit sayıda context query, batch içi duplicate blocking, apply'da tek batch validasyon çağrısı. |

---

## 2. Doğrulama kanıtı

| Gate | Sonuç |
|---|---|
| Backend typecheck (`npm run typecheck`) | **PASS** |
| Backend lint (`npm run lint`) | **4072 error**, 8988 warning; baseline `maxErrors: 4075`; **PASS (3 error altında)**. Re-baseline yapılmadı. |
| Hedef testler (24 dosya, Batch E+F birleşik) | **288/288 PASS** |
| Yeni Batch E spec | **6/6 PASS** |
| Backend full suite (`npx vitest run`) | **1275 PASS / 10 FAIL / 1285**; 117 test dosyası geçti, 1 dosya (`device-off.spec.ts`) DB erişimsizliği nedeniyle failed. |
| Frontend typecheck | **PASS** |
| Frontend test (`npx vitest run`) | **157/157 PASS** |
| Frontend lint | **0 error / 397 warning** |

Lint sırasındaBatch E/F tarafından tanıtılan 74 yeni ESLint error'u tespit edilip düzeltildi; final sayı baseline'ın 3 altında. Bu düzeltmeler testleri zayıflatmadı; yalnızca tip/mock yazımını iyileştirdi.

---

## 3. Bilinen sınırlar

- PostgreSQL `localhost:5432` erişilebilir değil (`Test-NetConnection ... False`). DB-backed migration/seed/integration/e2e/build doğrulaması yapılmadı.
- Redis `localhost:6379` erişilebilir değil (`Test-NetConnection ... False`). P2-09 gerçek Redis üzerinde doğrulanmadı; fake Redis unit testleri mevcut.
- 10 backend test hatası `PrismaClientInitializationError: Can't reach database server at localhost:5432` kaynaklı ve Batch D'den beri aynı.
- Repo git değil; commit/push/history/gitleaks doğrulaması yok.
- Go-live değerlendirmesi: **NOT READY**.

---

## 4. Güvenlik/kapsam kontrolleri

- Migration, Prisma schema, seed, `.env`, secret veya git değişikliği yok.
- Backend lint baseline dosyası değiştirilmedi (`eslint-baseline.json` korundu).
- Test skip, severity düşürme, eşik değişikliği veya coverage gate zayıflatması yok.
- WebSocket/JWT, four-eyes, tenant fail-closed, published/archived immutability ve DDD kanonik yön korundu.
