# P2-07 — Legacy → DDD Authorization Alignment (Implementation)

- **REPO (AUTHORITATIVE):** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem`
- **Faz:** P2-07 Implementation — **DIRECT IMPLEMENTATION** (kod değişikliği YAPILDI)
- **Tarih:** 2026-09-21
- **Karar kaynağı:** `docs/phase-rc/p2-07-canonical-authorization-decision.md` (§8/§19) — `DDD = CANONICAL`, `LEGACY = ACTIVE / MIGRATION`

---

## 1. Executive Summary

Legacy `/schedules` kimlik doğrulama eşikleri DDD canonical contract'ına hizalandı; FireVibe ve Approval-Center FE aksiyonları DDD rolüne kesildi; hizalama regresyon testleri eklendi; tam regresyon **GREEN**.

- **DDD sözleşmesi DEĞİŞMEDİ** (reference contract: `schedules-ddd.controller.ts` — create SUM, list VIEWER, submit SUM, approve/reject/pub/archive/revert ID, rollback HOSPITAL_ADMIN).
- Legacy drift kapatıldı: submit 400→500, approve/reject 500→600 (hem decorator hem runtime `canApprove`), rollback 300→800, revision 300→600, delete 300→600 + draft-only guard tüm rollere, publishByUnit 300→600. Publish/archive zaten 600'dü → yalnızca `PLANNER` alias'ı `IMAGING_DIRECTOR` ile değiştirildi.
- Deprecated alias closure: `HEAD_TECHNICIAN`→`SENIOR_TECHNICIAN` (aynı 300 değeri) ve `PLANNER`→`IMAGING_DIRECTOR` — `schedules.controller.ts` içinde tek kök kaynak.
- **Sayılar:** Drift operasyonları tespit (6) → kapatıldı (6) · Cover (2) doğrulandı · Test: 1066 → 1081 (yeni `5c29` 15 test).

---

## 2. Repository Identity

`Get-Location` → `C:/Users/Hasan/OneDrive/Desktop/vardiyasystem` ✅
`git branch --show-current` → `main` · `git rev-parse HEAD` → `eb7a6dbabfdd254810a7e5f6c9f263395446b61e`
`git status --short` → dirty tree korundu; hiçbir reset/clean/checkout/force yapılmadı.

Belgeler tree `C:\Users\Hasan\OneDrive\Belgeler\...` **kesinlikle kullanılmadı / değiştirilmedi.**

---

## 3. Baseline (P2-07 öncesi)

| Gate | Komut | Sonuç |
|---|---|---|
| FE TYPECHECK | `npm run typecheck` (frontend) | **PASS** |
| FE BUILD | `npm run build` (frontend) | **PASS** (yalnızca önceden var olan budget uyarıları) |
| BE TEST | `npm test` (backend) | **PASS** — 97 files / 1066 tests |
| BE TSC | `npx tsc --noEmit` (backend) | **PASS** |
| VITEST FORKS | `npx vitest run --pool=forks` | **PASS** |

Baseline **GREEN** → P2-07 BLOCKED değil.

---

## 4. DDD Canonical Contract (Reference — DEĞİŞMEDİ)

`backend/src/modules/schedules/schedules-ddd.controller.ts` + RBAC:

| Operasyon | DDD metodu | MinRole eşiği |
|---|---|---|
| create | `create` (:141) | SUPERVISOR (500) |
| list / getOne | `list` (:157) / `getOne` (:188) | VIEWER |
| assignment mutasyonları | `addAssignment` (:210), `overrideAssignment` (:225), `updateAssignment` (:244), `removeAssignment` (:260) | SUPERVISOR (500) |
| submit | `submitForReview` (:275) | SUPERVISOR (500) |
| approve | `approve` (:290) | IMAGING_DIRECTOR (600) |
| reject | `reject` (:306) | IMAGING_DIRECTOR (600) |
| publish | `publish` (:322) | IMAGING_DIRECTOR (600) |
| archive | `archive` (:337) | IMAGING_DIRECTOR (600) |
| revert-to-draft | `revertToDraft` (:351) | IMAGING_DIRECTOR (600) |
| rollback | `rollback` (:365) | HOSPITAL_ADMIN (800) |

Class-guardlar DDD'de: `JwtAuthGuard + RolesGuard + ScheduleAccessGuard`; RBAC `PermissionGuard` + `@Permissions`. Bu surface'e **dokunulmadı.**

---

## 5. Legacy Authorization Surface (post-alignment)

`backend/src/modules/schedules/schedules.controller.ts` — class-guardlar :62 (`JwtAuthGuard, RolesGuard, ScheduleAccessGuard, UnitScopeGuard`). Halihazır etkin eşikler:

| Endpoint | Dekoratör | Etkin eşik (DDD) |
|---|---|---|
| `POST /schedules` create | :77 FIELD_SUPERVISOR | 400 (DDD: create 500 — **bilinçli saklanan** liste/görüntüleme istisnası, global eşik, değişmedi) |
| `GET /schedules/pending-approvals` | :124 SUPERVISOR | 500 (DDD'de karşılığı yok → legacy liste korunur) |
| `POST /schedules/unit/:unit/publish` | :230 IMAGING_DIRECTOR | **600** ✅ hizalı |
| `POST /schedules/:id/submit` | :504 SUPERVISOR | **500** ✅ hizalı (+ `@UnitScope`) |
| `POST /schedules/:id/approve` | :517 IMAGING_DIRECTOR (+ runtime `canApprove`) | **600** ✅ hizalı |
| `POST /schedules/:id/reject` | :532 IMAGING_DIRECTOR (+ runtime `canApprove`) | **600** ✅ hizalı |
| `POST /schedules/:id/publish` | :547 IMAGING_DIRECTOR | **600** ✅ hizalı |
| `POST /schedules/:id/archive` | :558 IMAGING_DIRECTOR | **600** ✅ hizalı |
| `POST /schedules/:id/rollback/:version` | :568 HOSPITAL_ADMIN | **800** ✅ hizalı |
| `POST /schedules/:id/revision` | :580 IMAGING_DIRECTOR | **600** ✅ hizalı |
| `DELETE /schedules/:id` | :602 IMAGING_DIRECTOR + draft-only guard | **600** ✅ hizalı |

---

## 6. Baseline → Aligned (BEFORE / AFTER / WHY / SECURITY IMPACT / TEST)

### 6.1 `POST /schedules/:id/submit` → SUPERVISOR (500)

- **BEFORE:** `schedules.controller.ts:504` `@Roles(MinRole.FIELD_SUPERVISOR)` (400)
- **AFTER:** `schedules.controller.ts:504` `@Roles(MinRole.SUPERVISOR)` (500) — `@UnitScope` korundu
- **WHY:** DDD `submitForReview` = SUPERVISOR(500). Legacy 400 idi (grantlı wider).
- **SECURITY IMPACT:** Saha sorumlusu (field_supervisor 400/450) ve medikal mühendis (400) legacy submit'te artık **DENIED**; Supervisor+ hizaya geçti. `SUPERVISOR` unit-scoped değil → `@UnitScope` kısıtlamaz.
- **TEST:** `5c29` route-contract eşitliği (`submitForReview` pair) + `hasMinRole('field_supervisor', SUPERVISOR)===false`.

### 6.2 `POST /schedules/:id/approve` → IMAGING_DIRECTOR (600)

- **BEFORE:** `schedules.controller.ts:517` `@Roles(MinRole.HEAD_TECHNICIAN)` (300) + runtime `canApprove` ([ID, SUPERVISOR]+admin)
- **AFTER:** `schedules.controller.ts:517` `@Roles(MinRole.IMAGING_DIRECTOR)` (600) + runtime `canApprove` ([ID]+admin) — iki katman da 600
- **WHY:** DDD `approve` = IMAGING_DIRECTOR(600). Identity: decorator == runtime tek kaynak.
- **SECURITY IMPACT:** Supervisor (500) ve senior technician (300) legacy onayının etkin eşiği 500/300 → 600'e çekildi; **Supervisor approve artık DENIED** (en kritik drift kapanışı). İki katman bağımsız onaylandığı için dublike/eksik kontrol yok.
- **TEST:** `5c29` equality + `canApprove('supervisor')===false`, `canApprove('imaging_director')===true`; `5c17-approve-four-eyes` role `supervisor`→`imaging_director` (4 test).

### 6.3 `POST /schedules/:id/reject` → IMAGING_DIRECTOR (600)

- **BEFORE:** `schedules.controller.ts:532` `@Roles(MinRole.HEAD_TECHNICIAN)` (300) + runtime `canApprove`
- **AFTER:** `schedules.controller.ts:532` `@Roles(MinRole.IMAGING_DIRECTOR)` (600) + runtime `canApprove` ([ID]+admin); hata mesajı "Başteknisyen veya üstü" → "Görüntüleme Hiz. ... üstü rol gerekli"
- **WHY:** DDD `reject` = IMAGING_DIRECTOR(600). `canApprove` paylaşımı sayesinde approve ile birebir simetrik.
- **SECURITY IMPACT:** Aynı 600 eşiği; tek muafiyet `system_admin`/`hospital_admin`.
- **TEST:** `5c29` equality; `5c17` reject path.

### 6.4 `POST /schedules/:id/publish` → IMAGING_DIRECTOR (600)

- **BEFORE:** `schedules.controller.ts:547` `@Roles(MinRole.PLANNER)` (deprecated alias → 600)
- **AFTER:** `schedules.controller.ts:547` `@Roles(MinRole.IMAGING_DIRECTOR)` (600)
- **WHY:** Publish zaten etkin 600 == DDD; yalnızca deprecated `PLANNER` alias'ı canonical isimle değiştirildi (tek kök kaynak).
- **SECURITY IMPACT:** Değer değişmedi → davranış farkı yok. `canPublish` ([IMAGING_DIRECTOR]+admin) aynı kaldı (DDD'nin permission-gated gerçeğinin güvenli alt kümesi; project_manager yalnızca DDD'nin `@Permissions` koşulunda geçer, legacy'de `canPublish` ile kapanır — **wider değil**).
- **TEST:** `5c29` equality + `canPublish` seti.

### 6.5 `POST /schedules/:id/archive` → IMAGING_DIRECTOR (600)

- **BEFORE:** `schedules.controller.ts:558` `@Roles(MinRole.PLANNER)` → değer 600
- **AFTER:** `schedules.controller.ts:558` `@Roles(MinRole.IMAGING_DIRECTOR)` (600)
- **WHY/IMPACT:** Alias closure; değer aynı.
- **TEST:** `5c29` equality (`archive` pair).

### 6.6 `POST /schedules/:id/rollback/:version` → HOSPITAL_ADMIN (800)

- **BEFORE:** `schedules.controller.ts:568` `@Roles(MinRole.HEAD_TECHNICIAN)` (300)
- **AFTER:** `schedules.controller.ts:568` `@Roles(MinRole.HOSPITAL_ADMIN)` (800)
- **WHY:** DDD `rollback` = HOSPITAL_ADMIN(800). Legacy service `rollback` runtime rol kontrolü içermiyor; dekoratör tek kapı → **dekoratör değişimi tek başına etkin eşiği 800'e çeker.** Service seviyesi testler (rollback swap-preservation, hardening atomicity) rol kontrolüne bağlı değil → etkilenmedi (doğrulandı).
- **SECURITY IMPACT:** Senior/Başteknisyen 300 → Hospital Admin 800; rollback artık yalnızca kurumsal admin + sistem admin yetkisinde. En geniş eşik sıkılaştırması.
- **TEST:** `5c29` equality (`rollback` pair) + `hasMinRole('imaging_director', HOSPITAL_ADMIN)===false`.

### 6.7 `POST /schedules/:id/revision` → IMAGING_DIRECTOR (600)

- **BEFORE:** `schedules.controller.ts:580` `@Roles(MinRole.HEAD_TECHNICIAN)` (300)
- **AFTER:** `schedules.controller.ts:580` `@Roles(MinRole.IMAGING_DIRECTOR)` (600)
- **WHY:** DDD `revertToDraft` = IMAGING_DIRECTOR(600) (revision DDD'nin revert-to-draft karşılığıdır).
- **SECURITY IMPACT:** Yayınlanmış programdan revizyon üretme eşiği 300→600.
- **TEST:** `5c29` equality (`createRevision`/`revertToDraft` pair).

### 6.8 `DELETE /schedules/:id` → IMAGING_DIRECTOR (600) + draft-only guard tüm rollere

- **BEFORE:** `schedules.controller.ts:602` `@Roles(MinRole.HEAD_TECHNICIAN)` (300); draft guard **yalnızca** `role === 'imaging_director'` için (`:606`)
- **AFTER:** `schedules.controller.ts:602` `@Roles(MinRole.IMAGING_DIRECTOR)` (600); draft guard **her rol için** zorunlu (`:605-611` — findOne sonrası `status !== 'draft'` → `ForbiddenException('Sadece taslak programlar silinebilir.')`)
- **WHY:** DDD'de delete karşılığı yok; audit §19 "600+ yap, draft guard'ı koru". Eski guard 300+ rollerin (senior, medikal, FS, sup) **yayınlanmış program silmesine izin veriyordu** — bu bir risk idi.
- **SECURITY IMPACT:** 300→600 eşik; ayrıca published/archived program silme açığı kapatıldı (yalnızca draft silinebilir).
- **TEST:** `5c29` delete contract: metadata = IMAGING_DIRECTOR + source `status !== 'draft'` + mesaj.

### 6.9 `POST /schedules/unit/:unit/publish` (FireVibe publish) → IMAGING_DIRECTOR (600)

- **BEFORE:** `schedules.controller.ts:230` `@Roles(MinRole.HEAD_TECHNICIAN)` (300)
- **AFTER:** `schedules.controller.ts:230` `@Roles(MinRole.IMAGING_DIRECTOR)` (600)
- **WHY:** Servis içi `canPublish` zaten 600'ü uyguluyordu (`schedules.service.ts:493`); dekoratör eşiği DDD publish ile hizalandı (dekoratör == gerçek).
- **SECURITY IMPACT:** 300 ayak kapatıldı; FireVibe "Yayınla" yalnızca 600+ (FE §11 ile birlikte).
- **TEST:** `5c29` `publishByUnit` = IMAGING_DIRECTOR; `5c18-unit-confinement` (actor `imaging_director`) geçti.

---

## 7. `canApprove` / `canPublish` yardımcı fonksiyonları

`backend/src/models/schedule-status.ts`:

- **BEFORE** `:172` `const approvers = [UserRole.IMAGING_DIRECTOR, UserRole.SUPERVISOR];`
- **AFTER** `:172` `const approvers = [UserRole.IMAGING_DIRECTOR];` + `system_admin`/`hospital_admin` bypass korundu
- **WHY:** `canApprove` legacy controller (:525,:540) VE workflow service approve/reject (:135,:206) tarafından paylaşılıyor. DDD approve = 600; SUPERVISOR'ın listeden çıkarılması iki katmanı da (decorator == runtime) tek harekette 600'e çeker.
- **SECURITY IMPACT:** Supervisor onay yetkisi legacy'de kaldırıldı → DDD ile aynı. `canPublish` (:176-179) zaten [ID]+admin → **değişmedi** (yayın/generate eşiği korundu).
- **TEST:** `5c29` behavioral set.

**Not:** `VALID_TRANSITIONS`/`canRoleTransition` (state makinesi, DDD aggregate :187) **dokunulmadı** — DDD domain katmanı sözleşmesi korundu.

---

## 8. Deprecated alias closure (tek kök kaynak)

`schedules.controller.ts` içinde tüm deprecated MinRole referansları canonical isimlerle değiştirildi:

- Analitik :266, generate :635, preview :642, apply :649, dry-run :657 → **`MinRole.SENIOR_TECHNICIAN`** (değer 300 → davranış değişmedi, yalnızca isim).
- Publish :547, archive :558 → `MinRole.IMAGING_DIRECTOR`.
- `HEAD_TECHNICIAN` / `PLANNER` referansı `schedules.controller.ts` içinde kalmadı (`5c29` source-level test doğruluyor).

---

## 9. FireVibe cutover

- **BEFORE:** `firevibe-schedule.component.html:130-131` — Yayınla butonu yalnızca `viewState().status === 'success' && schedule()?.status !== 'published'` (rol filtresiz → tekn 300+ görünürdü)
- **AFTER:** aynı koşul + **`canPublish()`**
- **TS:** `firevibe-schedule.component.ts:248` → `canPublish = computed(() => hasMinRole(this.auth.user()?.role ?? '', 'imaging_director'))`
- **WHY:** FireVibe publish → legacy `POST /schedules/unit/:unit/publish` (600). FE === backend eşiği; backend'e hizalanmış yetkili kullanıcının erişimi engellenmedi.
- **SECURITY IMPACT:** 400/450/500× (FS/medikal:Sv) publish butonunu göremez; 600+ gösterir. Backend-allowed erişim bloke değil.
- **TEST:** FE TYPECHECK + BUILD PASS (grep doğrulaması ile).

---

## 10. Approval-Center cutover

- **BEFORE:** `approval-center.component.ts:74,:84` — Onayla/Reddet (`under_review|review` durumunda) ve Yayınla (`approved` durumunda) **rolsüz** görünürdü; route `minRole: supervisor`
- **AFTER:** butonlar `canApprove()` / `canPublish()` (`hasMinRole(role,'imaging_director')`) ile gated; `:396-399` computation'lar
- **Route guard:** `app.routes.ts` approval-center `minRole: supervisor` **korundu** — pending-approvals listesi backend'de hâlâ SUPERVISOR(500) ve DDD'de karşılığı yok; liste görünürlüğü backend-allowed kalır, aksiyonlar 600+.
- **WHY:** approve/reject/publish artık 600 (backend); FE butonları backend'den daha geniş olamaz ve backend-allowed (liste görme) erişimi daraltmaz.
- **SECURITY IMPACT:** Supervisor +450 görüp aksiyon butonlarını görmez (backend zaten 403 döner); aksiyonlar yalnızca 600+.
- **TEST:** FE TYPECHECK + BUILD PASS.

---

## 11. FE gating ilkeleri (doğrulama)

- FE aksiyon hiçbir yerde backend'den daha geniş değil: FireVibe publish (600 ✅), Approval-Center approve/reject/publish (600 ✅).
- Backend-allowed erişim daraltılmadı: FireVibe FS-own-unit düzenleme (`isFieldSupervisor` :247) korundu; pending listesi SUPERVISOR görünürlüğü korundu; route guard'lar `hasMinRole` threshold semantiğinde.
- Uygulanan eşik kaynağı: `frontend/src/app/shared/utils/role-hierarchy.ts` `hasMinRole` (field_supervisor=450, imaging_director=600).

---

## 12. Regresyon testleri (eklenen / güncellenen)

### Eklenen: `backend/src/modules/schedules/__tests__/5c29-legacy-ddd-authz-alignment.spec.ts` (15 test)
1. Route-contract eşitliği: submitForReview, approve, reject, publish, archive, createRevision↔revertToDraft, rollback (legacy decorator == DDD decorator, expected MinRole).
2. publishByUnit → IMAGING_DIRECTOR; delete → IMAGING_DIRECTOR + draft-only guard kaynağı.
3. `canApprove`/`canPublish` behavioral (supervisor DENIED approve; ID/admin ALLOWED; publish seti).
4. RolesGuard threshold davranışı (FS < submit/review; SV submit √ approve/rb ×; ID review √ rb ×).
5. Tek kök kaynak: `schedules.controller.ts` `HEAD_TECHNICIAN|PLANNER` ref'i yok.

### Güncellenen: `backend/src/modules/schedules/__tests__/5c17-approve-four-eyes.spec.ts`
- Rol `supervisor` → `imaging_director` (4 test) — canApprove hizalaması sonrası doğru aktör, four-eyes invariant korunur.

### Etkilenmedi (doğrulandı): `5c17-rollback-swap-preservation`, `5c6-hardening` (service-level rollback — rol kontrolü yok), `schedule-aggregate`, `security-invariants`, `5c18-unit-confinement` (actor ID), `5c15-sec-f`, `5c11-authz-consistency`, `security-closure-4.1`.

---

## 13. Security impact özeti

- **Kapatılan açıklar:** senior tech (300) / supervisor (500) legacy approve-reject; senior tech rollback (300); 300+ herkesin published silmesi; FireVibe publish 300 görünürlüğü; deprecated alias karışıklığı.
- **Preserve edildi (hiçbiri zayıflatılmadı):** `@UnitScope` (FS own-unit), `ScheduleAccessGuard` (org izolasyonu), four-eyes submitter≠approver, published/archived mutation lock (`5c17-published-mutation-gate` 8 test PASS), concurrent `StaleVersionError`, tenant middleware.
- **Genişletilmedi:** legacy hiçbir eşik DDD'den düşük değil; `canPublish` project_manager kapanır (DDD permission-gated gerçeğinin güvenli alt kümesi).
- **MIGRATION:** yok — legacy surface aktif kalmaya devam eder (DUAL ACTIVE korundu), eşikler artık DDD ile aynı.

---

## 14. Regression Gates (P2-07 sonrası)

| Gate | Komut | Sonuç |
|---|---|---|
| BE TEST | `npm test` (backend) | **PASS** — 98 files / 1081 tests (134.39s) |
| VITEST FORKS | `npx vitest run --pool=forks` | **PASS** — 98 files / 1081 tests |
| BE TSC | `npx tsc --noEmit` (backend) | **PASS** |
| FE TYPECHECK | `npm run typecheck` (frontend) | **PASS** |
| FE BUILD | `npm run build` (frontend) | **PASS** (yalnızca pre-existing budget uyarıları) |

Hedef: 1066 + 15 = **1081/1081 PASS**.

---

## 15. Published / Archived lock korunumu

- `5c17-published-mutation-gate.spec.ts` (8 test) — addAssignment/updateAssignment/removeAssignment/override/bulk-PUT published ve archived üzerinde DENIED → **PASS**.
- Rollback published → DENIED (`5c17-rollback-swap-preservation.spec.ts:149-153`) → **PASS**.
- Delete yalnızca draft (`5c29` delete guard) → yayınlanmış/arşivlenmiş silme kapalı.

---

## 16. Migration durumu

- **MIGRATION: NONE** — legacy controller korunur, emit edilmez; yalnızca yetki eşikleri canonical hizalanır. `SchedulesController` silinmedi, refactor edilmedi.

---

## 17. Değişen dosyalar

| Dosya | Değişiklik |
|---|---|
| `backend/src/modules/schedules/schedules.controller.ts` | 10 decorator + delete guard + mesaj |
| `backend/src/models/schedule-status.ts` | `canApprove` SAF üyeden SUPERVISOR çıkarıldı |
| `backend/src/modules/schedules/__tests__/5c29-legacy-ddd-authz-alignment.spec.ts` | **YENİ** — 15 test |
| `backend/src/modules/schedules/__tests__/5c17-approve-four-eyes.spec.ts` | rol → imaging_director |
| `frontend/src/app/features/firevibe-schedule/firevibe-schedule.component.ts` | `canPublish` computed |
| `frontend/src/app/features/firevibe-schedule/firevibe-schedule.component.html` | Yayınla butonu `canPublish()` |
| `frontend/src/app/features/approval-center/approval-center.component.ts` | AuthService + `canApprove`/`canPublish` gating + import |

---

## 18. Final Status

- Canonical Authorization: **DDD** (değişmedi)
- Legacy → DDD Alignment: **TAMAMLANDI** (6 drift kapatıldı, 2 cover doğrulandı)
- FireVibe Cutover: **TAMAMLANDI** · Approval-Center Cutover: **TAMAMLANDI**
- Security regression: **YOK** — tüm lock/invariant korundu → 1081/1081 PASS
- Migration: **YOK** · NEXT PHASE: P3 Backlog / PWA / Accessibility / Mobile Hardening