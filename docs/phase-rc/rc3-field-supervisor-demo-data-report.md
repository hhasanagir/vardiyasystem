# RC-3 — Saha Rolü / Erişim Hizalaması + Demo Verisi Temizliği (READ-ONLY AUDIT)

- **CDNS:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem` (AUTHORITATIVE)
- **Non-canonical (hiç kullanılmadı):** `C:\Users\Hasan\OneDrive\Belgeler\GitHub\vardiyasystem`
- **Mod:** READ-ONLY audit — kod değişikliği YAPILMADI
- **Tarih:** 2026-09-21

---

## 1. Executive Summary

RC-2 baseline **GREEN** (FE build/typecheck PASS, BE 97 dosya/1066 test PASS, BE tsc PASS). RC-3 kapsamındaki tüm bulgular canonical repo üzerinde doğrulandı.

- **P1 CONFIRMED:** FIELD_SUPERVISOR backend'de `MinRole.FIELD_SUPERVISOR`(400) ile açık olan **11 FE yüzeyinden** frontend `roleGuard minRole:'supervisor'`(500) + nav `isSupervisor` listesi nedeniyle **kilitli**. Root cause: FE route guard değerleri backend `MinRole` eşikleri yerine sabit `'supervisor'` rol adıyla seçilmiş; FE'de zaten hazır olan `field_supervisor`=450 hiyerarşi değeri ve `unitAccessGuard`/`RbacService` kullanılmamış.
- **Demo/hardcoded veri CONFIRMED:** approval-center (befixed compliance şeridi), performance (May-2026 sabit metrikler), smart-recommendations (sahte motor isimli 6 statik öneri + ölü "Uygula/X" butonları + "Yapay zeka destekli" iddiası). Üçü de **MISLEADING DATA**, hiçbiri açıkça demo olarak işaretli değil.
- **Diğer P2/P3 bulguları yeniden doğrulandı** (F-2..F-8+): FireVibe statü etiket drift'i, published-lock eksikliği, discoverability, enum drift, PWA prefix eşleşmesi, a11y, mobil.
- **Yeni bulgu (P2):** legacy `/schedules` ile DDD `/schedules-ddd` onay/yayın eşikleri farklı (HEAD_TECHNICIAN/PLANNER vs IMAGING_DIRECTOR) → aynı işlem için iki farklı yetki sınırı.

**Sayılar (audit sonu):** P0=0 · P1=1 · P2=7 · P3=8

**Durum:** FIELD_SUPERVISOR erişim hizalaması = **PARTIAL** (root cause CONFIRMED, implementasyon henüz yapılmadı — plan aşağıda). Demo veri temizliği = **PARTIAL** (teyit edildi, düzeltme implementasyon fazına bırakıldı). IMPLEMENTATION = **NOT STARTED**.

---

## 2. Repository Identity

`Get-Location` → `C:/Users/Hasan/OneDrive/Desktop/vardiyasystem`

`git rev-parse --show-toplevel` → `C:/Users/Hasan/OneDrive/Desktop/vardiyasystem` ✅
`git branch --show-current` → `main`
`git rev-parse HEAD` → `eb7a6dbabfdd254810a7e5f6c9f263395446b61e`
`git status --short` → 135 satır (dirty, korundu — hiçbir reset/clean/checkout/force yapılmadı)

---

## 3. RC-2 Baseline (yeniden koşuldu — 2026-09-21)

| Gate | Komut | Sonuç |
|---|---|---|
| FE BUILD | `npm run build` (frontend) | **PASS** (exit 0; yalnız budget WARNING'leri: `plan-page.component…274.21kB/200`, `chunk…320.86kB/200`, `main-NX672PVR 200.82kB/200` vb.) |
| FE TYPECHECK | `npm run typecheck` | **PASS** (exit 0) |
| BE TEST | `npm test` (backend) | **PASS** — `97 files / 1066 tests` (DB container `vardiya-postgres` healthy, 5432 açık) |
| BE TSC | `npx tsc --noEmit` | **PASS** (exit 0) |

RC-2 baseline **GREEN** → RC-3 BLOCKED DEĞİL.

---

## 4. Authorization Architecture (canonical akış)

```text
Authentication          → JwtAuthGuard (BE: modules/auth/guards/jwt-auth.guard)
Role                    → UserRole enum (BE: src/models/schedule-status.ts:30-35) / FE user.role + RBAC roles
RBAC                    → RbacService (FE: services/rbac.service.ts:57-106, GET /rbac/me/permissions) / BE PermissionGuard + RBAC roles (modules/rbac)
Organization scope      → tenant middleware (infrastructure/prisma/middleware) + UnitScopeService.organizationId (modules/rbac/services/unit-scope.service.ts:62-71,107-141)
Unit scope              → UnitScopeGuard (modules/rbac/guards/unit-scope.guard.ts:29-71) + resolveReadScope (unit-scope.service.ts:155-173)
Permission              → ROLE_PERMISSIONS (backend role-guards.ts:45-101) + permission strings (FE rbacGuard auth.guard.ts:104-122)
Data access             → controller @Roles(MinRole.X) (BE) / FE route guards + nav visible
Mutation authorization  → @Roles + UnitScopeGuard/@UnitScope + read-scope deny (BE authoritative)
Frontend route guard    → roleGuard / rbacGuard / unitAccessGuard (FE auth.guard.ts:32-122)
Frontend action guard   → hasMinRole / ROLE_HIERARCHY / has-permission.directive (FE)
Audit                   → audit-log (BE audit.guard.ts:9 MinRole.SUPERVISOR; 5c9/5c14 scope tests)
```

**BE guard semantiği:** `RolesGuard` = `hasMinRole(userRole, minRequired)` (backend/guards/role-guards.ts:28-30, auth/guards/roles.guard.ts:37) → threshold (`>=`). `MinRole.FIELD_SUPERVISOR = UserRole.MEDICAL_ENGINEER (400)` (guards/min-role.ts:36) — yani backend, medikal mühendis VE saha sorumlusu dahil ≥400 her rolü FIELD_SUPERVISOR seviyeli uçlara kabul eder. `UnitScopeGuard` saha sorumlusunu tek birime, SUPERVISOR+ rollerini tenant içi tüm birimlere açar; NULL-org fail-closed (unit-scope.service.ts:120-122,168-170).

**FE guard semantiği:** `roleGuard` aynı `>=` threshold (auth.guard.ts:95-98) ama FE ROLE_HIERARCHY kopyası (auth.guard.ts:6-21 / shared/utils/role-hierarchy.ts:1-16). `'supervisor'` FE'de 500, `'field_supervisor'` 450. FE `unitAccessGuard` saha sorumlusunu kendi birimine sabitler (auth.guard.ts:32-63).

---

## 5. SUPERVISOR vs FIELD_SUPERVISOR — Yüzey Matrisi

Legends: **BE eşik**: rol eşiği (MinRole) ve scope; `FS`=FIELD_SUPERVISOR(400+), `SV`=SUPERVISOR(500+), `V`=VIEWER(50+). FE: route guard değeri (kaynak `app.routes.ts`).

| Surface | FE route (guard) | BE controller (Roles) | Org | Unit | Beklenen / Fark |
| --- | --- | --- | --- | --- | --- |
| dashboard | açık (authGuard) | `/analytics/dashboard` V (analytics:21), `/schedules/dashboard/stats` V (schedules:422) | ✔ org scoped | — | **TUTARLI** |
| FireVibe / firevibe-schedule | **guard YOK** (:131-137) | legacy `/schedules` read V, write FS/SV, publish HEAD_TECH (:77,216,229,451,464,616) | ✔ | read unit-scoped | FE açık üst kontrolü yok (P2-03); BE yetkili |
| schedules (workspace) | SV (:140-142) | `/schedules-ddd` create SV, read V, assign SV, approve/publish/archive ID (600), rollback HOSP_ADMIN | ✔ | read unit-scoped | **TUTARLI** (feature SV+ gerçu.; FE SV=BE SV) |
| duty-roster | SV (:150-152) | `@Roles('…supervisor','senior_technician')` (:21) | ? | ? | FE, senior_technician'ı fazla engelliyor (P3-04) |
| employees | SV + `personnel.read` (:161-163) | `/personnel` list V + UnitScopeGuard (:41,49-50,105-106) | ✔ | unit-scoped | **FE over-restrict**: FS kendi birim personelini okuyabilir (P1 alt maddesi) |
| reports | SV + `analytics.read` (:190-192) | `/insights/dashboard` SV (insights:28) | ✔ | — | **TUTARLI** |
| performance | SV (:201-203) | (hardcoded; gerçek BE source yok) | — | — | demo veri (P2-05) |
| fairness-analysis | SV (:212-214) | analytics (SV bazlı) | ✔ | — | TUTARLI (BE SV) |
| audit | SV (:223-225) | audit-log SV (audit.guard:9) | ✔ | org | **TUTARLI** |
| trainings | SV (:234-236) | training: read V / write HEAD_TECH | — | — | FE over-restrict (güvenli yön) |
| skills | SV (:244-246) | skill: read V / write HEAD_TECH | — | — | FE over-restrict (güvenli yön) |
| approval-center | SV (:256-258) | pending-approvals SV (schedules:124); approve HEAD_TECH (legacy:517) / ID (ddd:290) | ✔ | — | görünür eşik tutarlı; legacy/DDD ayrışması P2-07 |
| management-dashboard | SV (:285-287) | `/analytics` overview/workload/overtime/device-utilization SV (:31,46,61,76) | ✔ | — | **TUTARLI** |
| shifts | SV (:334-336) | shifts: read V / write HEAD_TECH | — | — | FE over-restrict (güvenli yön) |
| command-center | SV (:345-347) | `/command-center/snapshot` V (command-center:21) | — | — | **FE over-restrict** (P3-05) |
| kpi-overview | SV (:365-367) | analytics/insights SV bazlı | ✔ | — | TUTARLI |
| smart-recommendations | SV (:376-378) | `/recommendations` GET V, apply/dismiss HEAD_TECH (:21,28,35) | — | — | FE over-restrict + ölü buton (P2-06/P3-06) |
| **enterprise/assets + assets + assets/:id** | **SV (:389-413)** | `/assets` **FS** (asset-management:35-121) | ✔(service) | service | **P1** |
| **enterprise/biomedical** | **SV (:422-424)** | `/biomedical`, `faults`, `calibration`, `biomedical-kpi` **FS** | ✔(service) | service | **P1** |
| **enterprise/consumables** | **SV (:433-435)** | `/consumables` **FS** (8 uç) | ✔(service) | service | **P1** |
| **enterprise/procurement** | **SV (:444-446)** | `/procurement` **FS** (11 uç) | ✔(service) | service | **P1** |
| **enterprise/contracts** | **SV (:455-457)** | `/contracts` **FS** (5 uç) | ✔(service) | service | **P1** |
| **enterprise/suppliers** | **SV (:466-468)** | `/suppliers` **FS** (4 uç) | ✔(service) | service | **P1** |
| **enterprise/quality** | **SV (:477-479)** | `/quality/records*` **FS** (9 uç) | ✔(service) | service | **P1** |
| **enterprise/radiation-safety** | **SV (:488-490)** | `/radiation*` **FS** (5 uç) | ✔(service) | service | **P1** |
| **enterprise/inventory** | **SV (:499-501)** | `/inventory` + `/smart-inventory` **FS** (toplam 17+ uç) | ✔(service) | service | **P1** |
| **supervisor-center** | **SV (:509-511)** | `/supervisor-center/dashboard`, `/shift-coverage` **FS** (supervisor-center:29,44) | ✔ resolveReadScope | ✔ field→unit, sup→org | **P1 ANA** |

---

## 6. P1 Root Cause

**P1-01 — FIELD_SUPERVISOR, backend'in açtığı supervisor seviyeli yüzeylerden frontend'de kilitli**

- **STATUS:** CONFIRMED
- **SEVERITY:** P1
- **CANONICAL FILE(s):**
  - `frontend/src/app/app.routes.ts:509-511` (supervisor-center → `roleGuard, data:{minRole:'supervisor'}`)
  - `frontend/src/app/app.routes.ts:389-501` (enterprise/… 9 surface → `minRole:'supervisor'`)
  - `frontend/src/app/layouts/main-layout/main-layout.component.ts:283-286` (`isSupervisor` listesi `field_supervisor` İÇERMEZ; `medical_engineer` içerir)
  - `frontend/src/app/guards/auth.guard.ts:6-21` (FE hiyerarşi: field_supervisor=450, supervisor=500)
  - `backend/src/guards/min-role.ts:36` (`FIELD_SUPERVISOR = MEDICAL_ENGINEER 400`)
  - `backend/src/modules/supervisor-center/supervisor-center.controller.ts:29,44`; `asset-management/…:35-121`; `biomedical/…`; `consumables/…`; `procurement/…`; `contracts/…`; `suppliers/…`; `quality/…:35-97`; `radiation-safety/…:26-58`; `inventory/…`; `smart-inventory/…` → hepsi `@Roles(MinRole.FIELD_SUPERVISOR)`
- **EVIDENCE:** FE `roleGuard` (`hasMinRole('field_supervisor','supervisor')` = `450 >= 500` → **false**) yüzeyi bloke eder; aynı uçlar BE'de `hasMinRole('field_supervisor','medical_engineer'=400)` = true. Nav'da `isSupervisor` listesi (285) saha sorumlusunu içermezken FE hiyerarşi haritası (auth.guard.ts:13) 450 değerini zaten tanımlar — yani "eksik seviye" değil, **eşik sapması**.
- **USER IMPACT:** Saha sorumlusu (first-class rol; migration'larda ekli) Radyoloji Operasyon Merkezi'ne ve 9 enterprise yüzeyine FE'de ulaşamaz → `/app/dashboard`'a yönlendirilir; görev tanımı (birim saya yönetimi, kalite, sarf, radyasyon, envanter) FE'den kullanılamaz.
- **SECURITY IMPACT:** Erişim aşımı **değil** (BE hâlâ yetkili: `@Roles(FS)` + UnitScopeGuard/tenant-org + NULL-org fail-closed). Etki, rol stratejisinin FE'de yarım kalmasıdır. FE guard'ı düşürmek BE'yi zayıflatmaz **ancak** FE'nin hangi birimi göstereceğini bilmesini gerektirir → rapora bakınız: güvenlik sınırı için koşullar (Bölüm 20).
- **RECOMMENDED ACTION (implementasyon fazında):** backend `MinRole.FIELD_SUPERVISOR`(=400) ile hizalı FE min seviyesi kullan: bu rotalar için `data:{minRole:'field_supervisor'}` + saha sorumlusu için `RbacService.fieldSupervisorUnitId()` tabanlı filtre (`unitAccessGuard` deseni). Nav `isSupervisor` listesine `field_supervisor` ekle; `medical_engineer` içi FE engeli koru (BE 400 verir ama FE daha katı kalabilir — fail-closed, least privilege OK). Skip yöntemi: `'supervisor'` eşiğini global düşürmek ve "field_supervisor'ı supervisor kabul et" YASAK (Bölüm 6-16 prensipleri).

---

## 7. Route Guard Analysis (`roleGuard minRole:'supervisor'` kullanımları — 27 adet)

Tüm list: app.routes.ts `:140 (schedules), :150 (duty-roster), :161 (employees), :190 (reports), :201 (performance), :212 (fairness), :223 (audit), :234 (trainings), :244 (skills), :256 (approval-center), :285 (management-dashboard), :334 (shifts), :345 (command-center), :365 (kpi-overview), :376 (smart-recommendations), :389/:400/:411 (assets*), :422 (biomedical), :433 (consumables), :444 (procurement), :455 (contracts), :466 (suppliers), :477 (quality), :488 (radiation-safety), :499 (inventory), :509 (supervisor-center)`.

Aşağıda her kuşa özgü 6 soru (özet tablosu):

| Route | (1) Neden supervisor? | (2) FS BE'de erişebiliyor mu? | (3) Permission? | (4) Unit scope nasıl? | (5) Mutation mı? | (6) Guard değişirse sınır bozulur mu? |
| --- | --- | --- | --- | --- | --- | --- |
| supervisor-center | ürün "operasyon merkezi" → SV | **EVET** (BE FS 400, resolveReadScope) | Yok (BE'de rol+scope) | FS→unit, SV→org (BE) | okuma | **HAYIR** (BE `@Roles(FS)`+UNIT_scope yetkili; FE 'field_supervisor'=450 ≤ SV'ler geçer) |
| enterprise/10 surface | aynı "isletme" grubu | **EVET** (BE FS 400) | Yok (BE rol+service scope) | service-scoped (actor unit) | okuma+yazma | **HAYIR** — BE aynı eşikte; FE asla BE'nin onaylamadığı uç açamaz |
| employees | personel yönetimi | okuma: **EVET** (list V, unit-scoped) | `personnel.read` (rbacGuard) | BE unit-scoped | okuma (yazma SV) | FE guard'ı SV→FS indirmek BE ile uyumludur (yazma hâlâ SV) |
| reports/management-dashboard/kpi/insights | analitik yönetim | **HAYIR** (BE SV 500) | analytics.read (reports) | org | okuma | **EVET** bozulur → **değiştirme** (SV'de kalsın) |
| performance/fairness | yönetim analitiği | **HAYIR** (BE SV; demo veri) | — | org | okuma | **EVET** → SV'de kalsın |
| approval-center | onay iş akışı | liste SV (BE 500) → **HAYIR** (FS canApprove=false role-guards:76-80) | — | org | approve=HEAD_TECH legacy / ID ddd | FE SV korunmalı; kaldırma yok |
| audit | denetim | **HAYIR** (BE SV) | — | org | okuma | koru |
| schedules (workspace) | DDD çalışma yüzeyi | create SV → **HAYIR** (maa-only) | — | BE unit-scoped read | okuma+mutation | koru (create/assign SV) |
| trainings/skills/shifts | yönetim | yazma HEAD_TECH okuma V | — | — | okuma+yazma | genişletme riskli; mevcut FE SV katılığı korunabilir (güvenli) |
| command-center | canlı izleme | **EVET** (BE V 50!) | — | — | okuma | FE SV→aşağı açılabilir ama kapsam dışı (P3-05) |
| smart-recommendations | AI öneri | okuma **EVET** (V); apply HEAD_TECH | — | — | okuma (+mutation yok) | butonlar ölü (P2-06); FE SV korunabilir |
| duty-roster | nöbet listesi | senior_technician BE'de var, FS **yok** (roster:21) | — | — | okuma (yazma+ admin) | FS için açma; senior tech için P3-04 |

**Sonuç:** P1 kapsamı = **süpervizör-center + enterprise (9) + employees(list)** yüzeyleri (BE FS/du ZOT). Analitik/onay/audit/workspace/denetim SV'de kalmaya devam edecek.

---

## 8. Backend Authorization Analysis

- `RolesGuard` threshold (role-guards.ts:28-30; auth/guards/roles.guard.ts:37).
- İkili onay hattı (P2-07 kanıtı):
  - **legacy** `/schedules`: `@Post(':id/approve') @Roles(MinRole.HEAD_TECHNICIAN)` (schedules.controller:516-517), reject :531-532, publish `@Roles(MinRole.PLANNER)` :546-547, archive :557-558, delete/rollback HEAD_TECH.
  - **DDD** `/schedules-ddd`: approve/reject/publish/archive/revert `@Roles(MinRole.IMAGING_DIRECTOR)` (schedules-ddd:289-337).
- `MinRole.PLANNER = IMAGING_DIRECTOR(600)` (min-role.ts:38); `HEAD_TECHNICIAN = SENIOR_TECHNICIAN(300)` (min-role.ts:32).
- Sonuç: aynı "onayla/yayınla" işlemi için iki controller iki farklı sınır (300/600 ve 600/600) — FE approval-center'ın hangi hatta bağlandığına göre yetki görünümü değişir. **P2-07.**

---

## 9. Unit Scope Analysis

- `isStrictlyUnitScoped` (unit-scope.service.ts:53-59): sadece FIELD_SUPERVISOR (legacy role VEYA RBAC ataması) — `UNIT_SCOPED_ROLES` legacy listesinde (min-role.ts:53-57) senior_technician/medical_engineer da var (list-read paritesi).
- `resolveReadScope` (155-173): FS → `{unitId: strictUnit, org, denyAll:false}`; FS unitsiz → `denyAll:true` (fail-closed); SV+ → org-only; lamp org NULL → fail-closed.
- `canAccessUnit` (107-141): NULL org fail-closed (yalnızca platform SYSTEM_ADMIN); cross-org false; unit-scoped actor için exact unit zorunlu.
- FE tarafında unit çözümü `RbacService.getFieldSupervisorUnitType()` (rbac.service.ts:128-139) + `unitAccessGuard` (auth.guard.ts:32-63) üzerinden sadece plan rotalarında; supervisor-center/enterprise rotalarında FE unit-sepeti YOK → P1 düzeltmesi bu deseni supervisor yüzeylerine taşımalı.

---

## 10. Permission Analysis

- BE `ROLE_PERMISSIONS` (role-guards.ts:45-101): FS `canView/canEdit/canSubmit/canRollback/canCreateRevision/canViewAudit=true`, `canApprove/canReject/canPublish/canArchive=false` (76-80). SV `canApprove/canReject=true, canPublish=false, canArchive=false` (71-75). Yayın/arşiv yetkisi kimseye `RolePermissions`'ta yok; publish aslında IMAGING_DIRECTOR/HOSPITAL_ADMIN hattında (ddd) yapılıyor.
- FE `rbacGuard` yalnızca 3 rotada: employees (`personnel.read`), reports (`analytics.read`), settings (`organization.update`). Supervisor-center/enterprise permission-guard'sız — BE rol+scope yeterli.
- BE `/rbac/me/permissions` (rbac.controller:106) + PermissionGuard mevcut → FE permission altyapısı çalışır durumda (P1 düzeltmesi buna dayanabilir).

---

## 11. FireVibe Lifecycle

- Statü pill'i `scheduleStatusLabel()` (firevibe-schedule.component.ts:904-916): map `draft/submitted/approved/published/rejected/archived`. `submitted` gerçek enum'da yok; `under_review`/`generated`/`validated` **eksik** → `under_review` pill'i ham İngilizce gösterir. **P2-01 (CONFIRMED).**
- `publish()` (1694-1713) yayınlı iken erken return + html:130-131 buton gizleme mevcut.
- Grid mutasyonları yayın durumunu DENETLEMEZ (aşağıda Bölüm 12).

---

## 12. Published Lock

**F-3 yeniden doğrulama — CONFIRMED:**

- `canRemove` (firevibe-schedule.component.ts:1289-1293): yalnızca drawer+hücre+atama varlığına bakar; **status kontrolü yok**.
- `removeFromDrawerCell` (1267-1287): **status/rol kontrolü yok** (yalnızca confirm + API call).
- Drawer assign/override (958, 956-979), drag/drop, context-menu, device-off (616), izin/mesai — hiçbiri `schedule.status === 'published'|'archived'` kontrolü yapmaz.
- DDD workspace doğru kilidi taşır: `isEditable` = draft|rejected|generated|validated, `isPublished` = published|archived (schedule.store.ts:93-100); publish-dialog yayın sonrası değişiklik uyarısı.
- Backend yetkili: `5c17-published-mutation-gate` testleri green (97/1066 içinde) → yayın sonrası mutation 409 alır (schedule-auto-generator.service.ts:514 "published/archived immutable").
- **SORU cevabı:** FireVibe'da edit/drag/context-menu/delete/reassign gerçekten engellenmiyor; FE yalnızca "Yayınla" butonunu gizliyor; BE zorluyor. FE/BE zorlaması **uyumsuz** (FE tamamına izin veriyor, BE reddediyor) → kullanıcı hatası deneyimi. Backend authoritative kalmalı (dokunulmayacak); FE `isPublished` gating eklenmeli (P2-02).

---

## 13. Hardcoded Compliance Data

**approval-center.component.ts:403-408 — CONFIRMED (MISLEADING DATA)**

```ts
readonly complianceChecks = signal([
  { label: 'Zorunlu Onaylar', passed: true },
  { label: 'Rol Doğrulama', passed: true },
  { label: 'Kısıt Kontrolü', passed: true },
  { label: 'Adalet Eşiği', passed: false },
]);
```

- **Production API'den mi?** Hayır. **Statik demo mu?** Evet — signal init sabit dizidan. **Gerçek compliance gibi mi gösteriliyor?** Evet (publish modalı içinde publish gating listesi olarak render ediliyor; `Adalet Eşiği` sabit `passed:false`).
- **Kaldırılmalı mı / API'ye bağlanmalı mı?** Bağlanmalı: `validationResult`/`ScheduleAlertService` (BE `GET /schedules/:id/alerts`) veya en azından açıkça "örnek" etiketi.
- **Recommendation:** gerçek doğrulama sonucuna bağla; yoksa gizle (P2-04).

---

## 14. Performance Demo Data

**performance.component.ts:420-442 — CONFIRMED (MISLEADING DATA)**

- :421 `private api = inject(ApiService)` — inject edilmiş, **kullanılmıyor** (dead code).
- :426-432 `metrics = signal([5 birim … totalScore …])` sabit.
- :434-442 `trendData = signal([2026-05-01 … 05-07])` sabit (tarihler geçmiş ayda hardcoded).
- **Production data?** Hayır. **Demo?** Evet. **Gerçek BE kaynağı?** Performans endpoint yok (analytics/insights SV var ama bu bileşen hiçbirini çağırmıyor). **Kullanıcı gerçek KPI sanabilir mi?** Evet — `/app/performance` banner'ı yönetim analitiği olarak sunuyor.
- **Recommendation:** `/analytics`/`/insights` ile besle veya birim verisi yoksunluğunda açık "örnek veri" etiketi + live veri boşken boş-state (P2-05).

---

## 15. Smart Recommendations

**smart-recommendations.component.ts:160-167, :91-94, :28 — CONFIRMED (MISLEADING DATA + DEAD CODE)**

- :28 `Yapay zeka destekli vardiya optimizasyon� �nerileri` — "AI destekli" iddiası.
- :160-167 6 statik öneri, sahte motor isimleri (`Fatigue Engine`, `Coverage Engine`, `Fairness Engine`, `Training Engine`, `Compliance Engine`), sabit `createdAt` ("2 saat önce" vb.), gerçek isim/işlem işleçleri yok.
- :91-94 `@if (rec.actionable) { <button class="rec-apply">Uygula</button> <button class="rec-dismiss">X</button> }` — **hiçbir `(click)` handler'ı yok** → ölü butonlar.
- **BE kaynağı:** `/recommendations` GET V (recommendations.controller:21) + apply/dismiss HEAD_TECH (:28,:35) var — bileşen bunlara bağlı değil.
- **Malicious UX?** Doğrudan yalan değil ama "Yapay zeka destekli" + sahte motor adları + işlemsiz Uygula butonları ürünü canlımış gibi gösteriyor (P2-06).

---

## 16. Status / Enum Drift

**CONFIRMED (F-2 ailesi):**

| Kaynak | Durum kümesi |
| --- | --- |
| `backend schedule.aggregate.ts:17-20` | draft, under_review, approved, published, rejected (+archived?) — aggregate'i da oku |
| `frontend scheduling/models/schedule.models.ts:1` | draft, generated, validated, under_review, approved, published, archived, rejected (8) |
| `frontend FireVibe label map ts:907-914` | draft, submitted(!!), approved, published, rejected, archived (6; submitted ölü anahtar) |
| `backend domain/enums/index.ts:64,82` | draft, under_review, approved, published, archived, rejected (6) — **generated/validated yok** |
| `schedule.store.ts:93-100` | isEditable: draft/rejected/generated/validated; isPublished: published/archived |

`generated`/`validated` sadece scheduling tarafında; FireVibe `submitted` ile çalışıyor (örn. legacy `submitForReview` → `submitted`?). Tek bir canonical vocabulary yok. **Ne yapılmalı:** tek kaynak tip (`ScheduleStatus`) tanımlayıp üç kullanım yerine hizala; FireVibe map'ine `under_review: 'İncelemede'` ekleyip `submitted`'ı kaldır; BE aggregate/enums farkını da kapat (implementasyon fazı).

---

## 17. PWA

**CONFIRMED (P3-02):**

- `ngsw-config.json` dataGroups: `/api/schedules**`, `/api/schedules/my-shifts`, `/api/my-day`, `/api/personnel**`, `/api/devices**`, `/api/units**`, `/api/schedule-configs**`, `/api/notifications**`, `/api/analytics**`, `/api/insights**` (34-102) — **`/v1` prefiksi YOK**.
- Yalnızca `/api/v1/attendance...`, `/api/v1/shift-tasks**, /api/v1/handover-notes**, /api/v1/device-incidents**` doğru (105-142).
- Runtime: `environments.ts:3 / environments.prod.ts:3` → `apiUrl: '/api/v1'`; `offline.interceptor.ts:10-13` `/api/v1/...` kullanıyor.
- **Sonuç:** ana veri grupları (schedules/personnel/devices/units/analytics) SW cache'inden eşleşmez; offline/PWA cache edilmezken birkaç alt grup eşleşir. P3 (performans/UX, güvenlik etkisi yok).

---

## 18. Accessibility

**Light canonical audit:**

- Altyapı mevcut: `core/directives/{skip-link, aria-live, focus-trap}.directive.ts` (+`has-permission`).
- FireVibe: kapsamlı `aria-label` kullanımı (html:35-113), `role` kullanımı tablo/satırlarında; klavye kısayolları mevcut (Ctrl+C/V/F/Del/Z).
- **Gerçek açıklar (P3-07):** bağlam menüsü `role="menu"` altında öğeler `role="menuitem"` değil; sürükle-bırak tray klavye eşleniği yok (mobil hariç); odak trap drawer'larda direktifle sağlanıyor (ok). Drag/keyboard'a alternatif (hücre üzerinden tuşla ata) read-only denetimde net görünmedi.
- Mevcut altyapı yeniden yazılmayacak; yalnızca eksikler raporlandı.

---

## 19. Mobile

**CONFIRMED (P3-01) — mobile-day-view.component.ts:31-33, 84-88:**

- Gün kartları yalnızca `assignments` üzerinden inşa edilir; `weekend`/`holiday`/`unitClosed`/`deviceOff` bilgisi hiç render edilmez.
- Boş gün: `Bu gun icin atama bulunmuyor.` — kapalı gün ile planlanmamış gün **ayırt edilemez** (tek "kapalı" state'e indirgenmiş). FireVibe ana gridi ise ayırt ediyor (device-off vs unit-closed vs tatil) — mobil görünüm bu ayrımı yitiriyor.

---

## 20. Implementation / Test Results

**Bu oturumda implementasyon yapılmadı (READ-ONLY).** Test sonuçları yalnızca RC-2 baseline tekrarından gelir (Bölüm 3: 4/4 PASS).

### Implementation Plan (P1 doğrulandığı için üretildi — uygulanmadı)

| Alan | İçerik |
| --- | --- |
| **P1 root cause** | FE rota+nav eşikleri backend `MinRole` yerine sabit `'supervisor'(500)` kullanıyor; FE `field_supervisor=450` + `unitAccessGuard`/`RbacService` hazır ama supervisor yüzeylerinde kullanılmıyor. |
| **Affected files** | `frontend/src/app/app.routes.ts` (:389-517), `frontend/src/app/layouts/main-layout/main-layout.component.ts` (:283-286, 338-348), gerekirse yeni `frontend/src/app/guards/field-supervisor-scope.guard.ts` (RbacService tabanlı). BE = **dokunulmayacak** (authoritative). |
| **Security boundary** | BE `@Roles(MinRole.FIELD_SUPERVISOR)` + UnitScopeGuard + NULL-org fail-closed korunur; FE sadece BE'nin tanıdığı eşiğe iner; FE asla BE'den yüksek yetki üretmez. `reports/management-dashboard/audit/approval-center/schedules` SV'de kalır (BE SV). |
| **Minimal fix** | 1) FE ROLE_HIERARCHY'de zaten var olan `field_supervisor=450` üzerinden bu rotalara `data:{minRole:'field_supervisor'}`; 2) nav `isSupervisor` listesine `field_supervisor`; 3) supervisor-center/enterprise bileşenlerine `RbacService.fieldSupervisorUnitId()` ile unit filtresi (unitAccessGuard deseni); 4) `medical_engineer` FE'de kapalı kalır (fail-closed konservatif — BE 400 verir ama FE kapıyı açmaz). |
| **Tests required (BE mevcut)** | `npm test` (97/1066 — access/scope testleri hazır); FE için ek: route-guard + nav görünürlük üniti. Senaryo: FS-doğru-unit OK; FS-yanlış-unit DENIED; FS-yanlış-org DENIED; unauth DENIED; SV read OK; yazma hâlâ SV/ID sınırında. |
| **Regression risks** | FE guard daraltması yok (genişletme yapılıyor); nav genişlemesi yalnızca FS için; `employees` list işlemi yalnızca read — yazma eşiği SV korunur. `medical_engineer` kapsama riski yok (FE daha katı). |
| **Rollback** | Yalnızca FE dosyası değişir → tek dosya geri alma; migration YOK; BE değişikliği YOK; mevcut dirty tree korunur. |

---

## 21. Remaining Findings (kanonik özet)

| ID | Severity | Status | Area | Canonical file:line | Kısa açıklama |
| --- | --- | --- | --- | --- | --- |
| P1-01 | P1 | CONFIRMED | RBAC/FE | app.routes.ts:389-517; main-layout:283-286; supervisor-center.controller:29,44; enterprise controllers | FS, backend'in açtığı 11 FE yüzeyinden kilitli |
| P2-01 | P2 | CONFIRMED | FireVibe | firevibe-schedule.component.ts:904-916 vs schedule.models.ts:1 | statü label drift (`submitted` ölü, `under_review/generated/validated` eksik) |
| P2-02 | P2 | CONFIRMED | FireVibe | ts:1267-1293,1694-1697; html:130 | published-lock eksik (grid hâlâ düzenlenebilir; BE 409 verir) |
| P2-03 | P2 | CONFIRMED | FireVibe | app.routes.ts:131-137; main-layout (link yok) | guard'sız + nav'da yok (discoverability; BE read V ile sınırlı) |
| P2-04 | P2 | CONFIRMED | Demo | approval-center.component.ts:403-408 | hardcoded compliance (Adalet Eşiği sabit false) |
| P2-05 | P2 | CONFIRMED | Demo | performance.component.ts:420-442 | hardcoded metrik trend; ölü ApiService |
| P2-06 | P2 | CONFIRMED | Demo | smart-recommendations:160-167, template:91-94, :28 | hardcoded öneri + ölü Uygula/X + "Yapay zeka" iddiası |
| P2-07 | P2 | CONFIRMED | RBAC drift | schedules.controller:516-547 vs schedules-ddd:289-337 | legacy approve HEAD_TECH(300)/PLANNER vs DDD ID(600) |
| P3-01 | P3 | CONFIRMED | Mobile | mobile-day-view:31-33 | kapalı günler "atama yok" diye tekilleşiyor |
| P3-02 | P3 | CONFIRMED | PWA | ngsw-config.json:32-143 vs environments.ts:3 | `/api/...` vs `/api/v1/...` eşleşmesi çalışmıyor |
| P3-03 | P3 | CONFIRMED | Nav | main-layout:332-337; routes:161-303 | employees/reports/settings her rolde görünür ama guard engeller → dead-end |
| P3-04 | P3 | PARTIALLY | RBAC/FE | duty-roster.controller:21 vs app.routes:150-152 | senior_technician BE'de var FE'de yok (over-restrict) |
| P3-05 | P3 | PARTIALLY | RBAC/FE | command-center.controller:21 vs app.routes:345-347 | snapshot VIEWER'a açık; FE supervisor'da |
| P3-06 | P3 | PARTIALLY | RBAC/FE | recommendations:21,28 vs app.routes:376-378 | okuma VIEWER açık; FE supervisor'da + ölü butonlar |
| P3-07 | P3 | PARTIALLY | A11y | FireVibe html (context menu) | menuitem roles + drag klavye eşleniği eksik |
| P3-08 | P3 | PARTIALLY | RBAC/FE | personnel.controller:41,49-50 vs app.routes:161-163 | employees read V açık; FE 'supervisor'+permission engelliyor |

---

## 22. Next Phase Recommendation

**NEXT PHASE = RC-4 (POR AĞILAR / ERİŞİM HİZALAMA IMPLEMENTASYONU + DEMO VERİSİ TEMİZLİĞİ)**

1. RC-3 audit'inde kanıtlanan P1-01'i uygula (yalnızca FE: `minRole:'field_supervisor'` + nav + unit-scope; BE sabit).
2. P2-04/05/06 demo verisini gerçek source'a bağla veya açık placeholder etiketi + ölü butonları kaldır.
3. P2-01/02/03 FireVibe statü/kilit/erisim düzeltiği; P2-07 legacy/DDD tutarlılığını ürün kararı olarak netleştir.
4. P3 paketi (PWA prefix, mobile kapalı-gün, nav dead-end) — opsiyonel.
5. RC-4 sonunda her şey için FE `npm run build/typecheck` + BE `npm test/vitest/tsc` yeniden; 6 senaryo (SV, FS-doğru unit, FS-yanlış unit, FS-yanlış org, unauth, insufficient permission) test edilecek.

---

### Final çıktı

```text
RC-3 COMPLETE

AUTHORITATIVE REPOSITORY VERIFIED

RC-2 BASELINE
FE BUILD     = PASS
FE TYPECHECK = PASS
BE TEST      = PASS
BE TSC       = PASS

P1 = 1
P2 = 7
P3 = 8

FIELD_SUPERVISOR ACCESS ALIGNMENT = PARTIAL   (root cause CONFIRMED; implementation NOT STARTED — plan Bölüm 20)
DEMO DATA CLEANUP = PARTIAL                  (officially confirmed; fix left to RC-4)

IMPLEMENTATION = NOT STARTED

REPORT = docs/phase-rc/rc3-field-supervisor-demo-data-report.md

NEXT PHASE = RC-4 (Erişim Hizalama Implementasyonu + Demo Verisi Temizliği)

STOP
```