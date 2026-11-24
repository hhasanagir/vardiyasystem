# PHASE 5C.31 — P1 Remediation (A2 / A3 / A4) Kapanış Raporu

**Repo:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem` (authoritative)
**Önceki faz:** 5C.24 read-only denetim → P0 tamamlandı → P1 onayı alındı (A1/A5/A6/A7 zaten FIXED).
**Kapsam:** yalnızca `phase-5c24-readonly-audit-report.md` P1 satırlarından **A2, A3, A4**. P2’ye geçilmedi.
**Yedek:** `C:\Users\Hasan\AppData\Local\Temp\opencode\vardiyasystem-p1-backup-20261120-221654` (SHA256 `MANIFEST.txt`).
**Kısıtlar:** migration/DB/secret/git değişikliği yok; test skip’i, sayı eşiği değişikliği, re-baseline yok. Repo git değil; tüm değişiklikler uncommitted.

## Uygulanan değişiklikler

### P1-A2 — Gerçek üretim akışı (sahte süre/sayı kaldırıldı)
- `generate-dialog.component.ts`: `Math.random()` süre/sayı üretimi kaldırıldı. Akış artık
  `generateSchedule` → `applyGeneratedSchedule(scheduleId, assignments, expectedVersion)` →
  `cmd.loadSchedule` → `cmd.validate`. İstatistikler sunucu yanıtından, süre `Date.now()` farkından geliyor.
  Birim tipi çözümlenemezse veya üretim boş dönerse **fail-closed** (hiçbir apply yapılmaz).
- `rbac.service.ts`: `resolveUnitTypeById(unitId)` eklendi (unit UUID/code → tip; çözülemezse `undefined`).
- `schedule.service.ts`: `applyGeneratedSchedule` opsiyonel `expectedVersion` alıyor (CAS).
- Yeni regresyon: `__tests__/generate-dialog.real-flow.spec.ts` (4 test).

### P1-A3 — Async job’lar fail-closed
- `schedule-job.processor.ts`: `simulateWork` ve `generated/validated/exported/reportGenerated: true`
  sahte success flag’leri kaldırıldı. Tüm `ScheduleJobType` için `ServiceUnavailableException`;
  `jobStatusService.complete` hiçbir yoldan çağrılmıyor, hata `fail` olarak kaydediliyor.
- `schedules-ddd.controller.ts`: `enqueueGenerate` / `enqueueExport` artık `await assertAsyncJobsUnavailable(...)`
  ile 503 döndürüyor (BullMQ production worker bağlı değil). Senkron uç noktalar korundu.
  Job provenance kodu (`organizationId`, `userId`) queue servisinde değişmedi.
- Yeni regresyon: `__tests__/p1-a3-job-fail-closed.spec.ts` (5 test).

### P1-A4 — Tek violation policy kaynağı (strictest-wins)
- Yeni `types/violation-policy.ts`: `VIOLATION_POLICY` tek kaynak; `policyFor()` bilinmeyen kuralı
  BLOCKING / non-overridable sayar. Çelişkili 5 kural (`TIME_OVERLAP`, `NOT_NIGHT_ELIGIBLE`,
  `REST_RULE_VIOLATION`, `GROUP_SLOT_OCCUPIED`, `PERSON_DEVICE_NOT_ALLOWED`) BLOCKING / `false`.
  `OFF_DAY_CONFLICT`, `REQUIRED_REST_NOT_MET` WARNING / `true` olarak kaldı. Hiçbir kural zayıflatılmadı.
- `hard-constraints.ts`, `constraint-engine.ts`, `schedules.service.ts` bu policy üzerinden normalize ediyor;
  gate flag’leri normalize edilmiş violation listesinden türetiliyor.
- **Uyumluluk düzeltmesi:** `DeviceSkillsConstraint` önce `/every()` (ALL) kullanıyordu; optimizer
  `/some()` (ANY) kullanıyor ve mevcut GATE 6 / Golden 6 testleri ANY semantiğini doğruluyor.
  A4 ile birlikte bu uyumsuzluk görünür hale geldi (BLOCKING yanlış pozitif üretiyordu). Constraint
  ANY semantiğine hizalandı; eşleşen skill olmayan personel için ihlâl **BLOCKING** kalıyor.
- Yeni regresyon: `__tests__/p1-a4-violation-policy.spec.ts` (6 test).

## Lint gate regresyonu (kapatıldı)
İlk P1 taramasında 4081 error (baseline 4075) görüldü. Yedek dosyalarla aynı ESLint kapsamında
karşılaştırıp **yalnızca yeni 14 error** izole edildi ve kaynağında düzeltildi:
- 2 yeni spec dosyasındaki `require()` / unsafe `Object.create` / gereksiz `as never` kullanımları,
- processor `require-await` + `prefer-promise-reject-errors`,
- controller uç noktalarında `require-await` ve kullanılmayan `req` parametresi.

Re-baseline **yapılmadı**; `eslint-baseline.json` değişmedi.

## Doğrulama kanıtı

| Katman | Komut | Sonuç |
|---|---|---|
| Backend typecheck | `npm run typecheck` | PASS |
| Backend lint gate | `npm run lint` | **PASS — 4066 error / 8479 warning** (baseline 4075’in 9 altında) |
| Hedefli (A2) | `vitest run generate-dialog.real-flow.spec.ts rbac.service.spec.ts` | 4/4 + ilgili RBAC testleri PASS |
| Hedefli (A3/A4/güvenlik) | A3 + A4 + constraint-engine + security-closure-4.1 | **53/53 PASS** |
| Validation/constraint geniş | 5b4-preseeding + A4 + constraint-engine + enforcement + schedule-validation + conflict-validation | **82/82 PASS** |
| Backend full suite | `npm test` | **1191/1201 PASS** (107 dosyadan 106 geçti) |
| Frontend typecheck | `npm run typecheck` | PASS |
| Frontend full suite | `npm test` | **157/157 PASS** (19 dosya; P0 sonrası 153 → +4 A2 testi) |
| Frontend lint | `npm run lint` | **PASS — 0 error / 397 warning** |

Backend full suite’de kalan **10 hata** yalnızca `src/modules/schedules/__tests__/device-off.spec.ts`
içindeki `PrismaClientInitializationError: Can't reach database server at localhost:5432`
kaynaklıdır; ortamda PostgreSQL bulunmadığından veritabanı-backed testler çalıştırılamadı.
A3/A4 sonrası yeniden ortaya çıkan tek regresyon (`5b4-preseeding.spec.ts` ANY skill) yukarıdaki
kısıt uyum düzeltmesiyle kapatıldı; full suite son koşusunda tekrar görünmedi.

## Kapsam dışı / doğrulanamayan
- Build, e2e/Playwright, migration, seed, Docker/K8s ve DB-backed integration çalıştırılmadı.
- Repo git olmadığından commit/push/history/gitleaks doğrulaması yapılamadı.
- Emek hukuku / NDK yorumları doğrulanmış mevzuat olarak sunulmadı.
- **P2 başlatılmadı** — ayrı kullanıcı onayı bekleniyor.
