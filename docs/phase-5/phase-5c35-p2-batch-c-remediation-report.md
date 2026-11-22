# Phase 5C.35 — P2 Batch C Remediation Report (P2-04 + P2-13)

**Tarih:** 2026-11-21  
**Kapsam:** Kullanıcı onaylı “Batch C” — **P2-04 (en kısıtlayıcı rol haritası)** ve **P2-13 (yanıltıcı coverage etiketlerinin kaldırılması)**.  
**Doğrulama modu:** code + typed unit/regression. DB/migration/seed/integration/e2e/build **çalıştırılmadı**.  
**Yedek:** `C:\Users\Hasan\AppData\Local\Temp\opencode\vardiyasystem-batchc-backup-20261121` (1913 dosya, SHA256 `MANIFEST.txt`).  
**Kısıtlar:** test skip’i / eşik / severity değişikliği yok, lint re-baseline yok, migration/DB/secret/git değişikliği yok. Repo git değil; tüm değişiklikler uncommitted.

---

## 1. Uygulanan değişiklikler

### P2-04 — tek kaynak, en kısıtlayıcı rol haritası

| Yüzey | Önce | Sonra |
|---|---|---|
| `backend/src/models/schedule-status.ts` | `VALID_TRANSITIONS` draft→under_review’de `field_supervisor`, `medical_engineer`, `senior_technician`; under_review→approved/rejected’de `supervisor` | Yeni `SCHEDULE_SUBMIT_ROLES` / `SCHEDULE_APPROVER_ROLES` kümeleri tek kaynak. Submit = `supervisor, imaging_director, hospital_admin, system_admin`; approve/reject/publish/archive = `imaging_director, hospital_admin, system_admin`. `canApprove`/`canPublish` bu kümeden türetiliyor |
| `backend/src/modules/schedules/domain/aggregates/schedule.aggregate.ts` | `TRANSITION_ALLOWED_ROLES` sabit map; `medical_engineer`/`senior_technician` submit, `supervisor` approve edebiliyordu | Map, aynı kanonik kümeden **türetiliyor**. `field_supervisor`/`medical_engineer`/`senior_technician` submit edemiyor; `supervisor` submit edebiliyor ama approve/reject/publish edemiyor |
| `backend/src/guards/role-guards.ts` | `ROLE_PERMISSIONS` elle yazılmış, `supervisor.canApprove=true`, `field_supervisor.canSubmit=true` | `workflowPermissions()` helper’ı workflow flag’lerini `canSubmitForReview`/`canApprove`/`canPublish`/`hasMinRole`’dan türetiyor. Üç harita artık aynı kaynaktan geliyor |

**Korunanlar:** `@Roles(MinRole.SUPERVISOR / IMAGING_DIRECTOR / HOSPITAL_ADMIN)` dekoratörleri, `canApprove` strict whitelist’i (project_manager/chief_technician dahil değil), dört-göz (submit ≠ approve), tenant kısıtları, published/archived immutable, `publishByUnit` akışı. `MinRole.FIELD_SUPERVISOR` alias’ı **değiştirilmedi** (diğer modüllerin CRUD erişimi korundu); yalnızca schedule workflow haritası daraltıldı.

**Yeni test:** `backend/src/modules/schedules/__tests__/p2-batch-c-role-map.spec.ts` — 24 pin: kanonik kümeler, legacy `canRoleTransition`, DDD aggregate davranışı, `ROLE_PERMISSIONS` helper türetimi, immutability. Mevcut `5c29-legacy-ddd-authz-alignment.spec.ts` ve `schedule-aggregate.spec.ts` **değiştirilmedi**.

### P2-13 — yanıltıcı “Kademe / coverage%” gösterimlerinin kaldırılması

Kayıtlı asgari kadro gereksinimi modeli olmadığından, gerçek bir gereksinime dayanmayan yüzde ve “eksik gün” iddiaları kaldırıldı:

- `validation-panel.component.ts`: “Kademe %” metriği kaldırıldı.
- `schedule-workspace.component.ts`: “Kademe %” skor kutusu, “Kademe” sekmesi ve coverage görünüm/panel yönlendirmeleri kaldırıldı.
- `view-switcher.component.ts`: “Kademe” görünüm seçeneği kaldırıldı.
- `publish-dialog.component.ts`: “Kapsama %” istatistiği kaldırıldı.
- `coverage-view.component.ts` / `coverage-panel.component.ts`: kurgusal yüzde, cihaz bazlı doluluk ve eksik-tarih listeleri yerine honest “kayıtlı asgari kadro gereksinimi yok” bilgilendirmesi.
- `store/schedule.store.ts`: kullanılmayan `coveragePercent` computed ve score içindeki `coverage` alanı kaldırıldı.

**Korunanlar:** Backend `COVERAGE_MISSING` üretimi, `schedule-coverage.service.ts`, coverage gate ve ilgili tüm testler (`5c26-*`, `5c28-apply-coverage-gate`, `conflict-validation`) **hiç değiştirilmedi**. Yalnızca sunum katmanındaki otoriter görünüm iddiası kaldırıldı; kural politikası zayıflatılmadı.

---

## 2. Değişiklik kapsamı (yedek manifestsine göre)

Toplam **11 dosya**: 10 modified + 1 new. Backend coverage gate/test dosyaları, migration, şema, secret ve yapılandırma dosyaları değişmedi.

```
MODIFIED backend/src/guards/role-guards.ts
MODIFIED backend/src/models/schedule-status.ts
MODIFIED backend/src/modules/schedules/domain/aggregates/schedule.aggregate.ts
NEW      backend/src/modules/schedules/__tests__/p2-batch-c-role-map.spec.ts
MODIFIED frontend/src/app/features/scheduling/components/coverage-panel/coverage-panel.component.ts
MODIFIED frontend/src/app/features/scheduling/components/coverage-view/coverage-view.component.ts
MODIFIED frontend/src/app/features/scheduling/components/publish-dialog/publish-dialog.component.ts
MODIFIED frontend/src/app/features/scheduling/components/validation-panel/validation-panel.component.ts
MODIFIED frontend/src/app/features/scheduling/components/view-switcher/view-switcher.component.ts
MODIFIED frontend/src/app/features/scheduling/pages/schedule-workspace/schedule-workspace.component.ts
MODIFIED frontend/src/app/features/scheduling/store/schedule.store.ts
```

---

## 3. Doğrulama kapıları

| Kapı | Sonuç |
|---|---|
| Backend `npm run typecheck` | ✅ PASS |
| Backend `npm run lint` | ✅ PASS — **4075 error / 8709 warning**; baseline `maxErrors: 4075` korundu, re-baseline yok. Warning farkı (+3) yalnızca yeni düzenlenen satırlardaki prettier uyarılarıdır; error sayısı birebir aynı |
| Backend hedefli (yeni spec + 5c29 + aggregate) | ✅ **58/58 PASS** |
| Backend full `npx vitest run` | ⚠️ **1245 PASS / 10 FAIL / 1255 total** — 10 hata yalnızca `device-off.spec.ts`, sebep `Can't reach database server at localhost:5432` (Batch C öncesi de aynı, DB gerektirir) |
| Frontend `npm run typecheck` | ✅ PASS |
| Frontend `npx vitest run` | ✅ **157/157 PASS** |
| Frontend `npm run lint` | ✅ **0 error / 397 warning** |

---

## 4. Korunan invariantlar

- Tenant fail-closed, org/unit kısıtları, WebSocket jti blacklist ve handler bazlı yetkilendirme: dokunulmadı.
- Dört-göz, `publishByUnit`, published/archived immutable: dokunulmadı.
- CAS + transaction (Batch B), DDD save CAS, strictest-wins violation policy (P1-A4), bilinmeyen kural fail-closed: dokunulmadı.
- Async job fail-closed 503 (P1-A3): dokunulmadı.
- Emek hukuku / NDK yorumları doğrulanmış mevzuat olarak sunulmadı.
- Migration, DB, secret, git, build, e2e/Playwright: çalıştırılmadı / değiştirilmedi.

---

## 5. Açık maddeler ve sonraki adım

Batch C kapanmıştır. Kalan onaylı kararlar **uygulama onayı beklemektedir**:

- **Batch D** — P2-14 (tatil BLOCKING kuralı), P2-11 (greedy hard haftalık cap), P2-18 (48h gece streak, DDD kanonik) + çapraz-yol regresyonları.
- **Batch E** — P2-09 (Redis-backed job status/dedupe), P2-15 (apply N+1 + batch validation).
- **Batch F** — P2-01/02/03 (DDD kanonik geçiş, optimizer kusurları, feature-flag rollout).

30 Nov 2026 go-live değerlendirmesi: **hazır değil**. Batch D/E/F uygulanıp DB-backed doğrulama (PostgreSQL erişimi sağlandığında) tamamlanana kadar bu sonuç korunur. P3 ayrı onay gerektirir; başlatılmadı.
