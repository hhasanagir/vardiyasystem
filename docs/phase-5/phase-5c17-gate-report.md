# VARDİYAOS — PHASE 5C.17 — P0/P1 SECURITY REMEDIATION GATE REPORT

> Salt-okunur implementation gate raporu. Bu fazda hiçbir kod, test, schema, migration
> veya veritabanı değişikliği yapılmamıştır. Rapor Desktop'taki AUTHORITATIVE repo
> üzerinde doğrudan okuma ile üretilmiştir.

---

## 1. Executive Summary

5C.16 FINAL REPORT'daki 2 P0 + 5 P1 bulgunun tamamı **mevcut ve istismar edilebilir**
durumdadır. Hiçbiri önceki fazlarda kapatılmamış.

- P0 AU-01 (personnel cross-tenant list) — **DOĞRULANDI**, kök neden kesin.
- P0 AU-02 (devices cross-tenant list) — **DOĞRULANDI**, kök neden kesin.
- P1 UA4-1 (status mutation bypass via PUT) — **DOĞRULANDI**, kök neden kesin.
- P1 UA8-1 (published schedule mutation) — **DOĞRULANDI**, kök neden kesin.
- P1 UA5-1 (rollback → swap cascade delete) — **DOĞRULANDI**, migration gerektirmez (kod+davranış fix); published koruması workflow path'te zaten var.
- P1 UA6-1 (export 500) — **DOĞRULANDI**, ek kök neden: FE unit UUID'si gönderiyor, service `type` üzerinden eşliyor.
- P1 UA3-1 (workflow approve four-eyes eksik) — **DOĞRULANDI**, DDD path korumalı, legacy/workflow path korumasız.

Mevcut güvenlik test altyapısı kapsamlıdır (`unit-scope-authz`, `5c10-device-off-swap-scope`,
`5c15-sec-f-cross-endpoint`, `unit-scope-guard-failclosed`, `5c9-export-scope`...) ancak
**bu 7 boşluğu hiçbiri kapsamıyor**. Test planı doğrudan mevcut altyapıya eklenebilir.

---

## 2. Repository Identity / Git State

- **Authoritative repo:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem`
- Git: tek commit "Initial commit"; tüm kaynak untracked (`??` / `AM` / `AD` / `A`).
- `backend/prisma/schema.prisma` ve `migrations/**` git'te tracklenmemiş → koruma kural bazlı.
- Bu fazda hiçbir git komutu çalıştırılmadı (salt-okunur inceleme).

---

## 3. P0 Findings Verification

### AU-01 — Personnel cross-tenant read/list exposure — P0 — **DOĞRULANDI**

| Alan | Değer |
|---|---|
| Severity | P0 (veri ifşası, cross-tenant) |
| Endpoint | `GET /personnel` (list), ayrıca mutation etki analizi aşağıda |
| Controller | `backend/src/modules/personnel/personnel.controller.ts:54-79` (`findAll`) |
| Service | `backend/src/modules/personnel/personnel.service.ts:32-90` (`findAll`) |
| Authorization Path | `UnitScopeGuard` → `resolveReadScope` → **yalnızca `scoped.unitId` uygulanır; `scoped.organizationId` servise hiç aktarılmaz** |
| Data Scope | Supervisor için `resolveReadScope` → `{ unitId: null, organizationId: L, denyAll: false }` (unit-scope.service.ts:124-142). Controller sadece `scoped.unitId` kullanır → org filtresiz tüm DB personeli |
| Exploitability | Kolay: herhangi bir org'un supervisor/görüntüleyici `GET /personnel` → tüm org'ların personel kayıtları (name, email, phone, role, unit) döner |
| Root Cause | `findAll` servis fonksiyonu `where`'e `organizationId` hiç koymuyor; controller `scoped.organizationId`'yi iletmiyor |

**Mutation etki analizi (aynı P0 ailesi):**
- `POST /personnel` (`personnel.controller.ts:103-109`): scope kontrolü hiç yok; `create` (service:170-267) `unitId`'yi global `findFirst` ile çözer, org regulasyonu yok → supervisor başka org birimine personel açabilir.
- `PUT /personnel/:id` (`controller:111-117`): `@UnitScope` yok; `update` (service:269-362) `findUnique({id})` ile çeker, org eşleştirmesi yok → cross-org personel güncelleme mümkün.
- `DELETE /personnel/:id` (`controller:119-125`): aynı — org filtre yok.
- `GET /personnel/:id` ve `GET /personnel/:id/workload`: `@UnitScope({entityType:'personnel',idParam:'id'})` ile guard'ı devreye sokar (guard: resolveTargetUnitId → canAccessUnit org+unit denetimi) — bunlar çoğunlukla korumalı. `findOne` org param da ekler (servis:144-168). Ana açık **list** yolunda.

### AU-02 — Devices cross-tenant read/list exposure — P0 — **DOĞRULANDI**

| Alan | Değer |
|---|---|
| Severity | P0 (envanter ifşası, cross-tenant) |
| Endpoint | `GET /devices`, `GET /devices/unit/:unitCode` |
| Controller | `backend/src/modules/devices/devices.controller.ts:16-36` |
| Service | `backend/src/modules/devices/devices.service.ts:26-90` |
| Authorization Path | Yalnızca `JwtAuthGuard` + `RolesGuard` (`controller:11`) — **`UnitScopeGuard` hiç eklenmemiş** |
| Data Scope | `findAll` where: yalnız `unit.type` + `isActive`; unit global `findFirst({type})` (service:30-32). org filtresi yok |
| Exploitability | Kolay: herhangi bir org'un kullanıcısı `GET /devices` → tüm org'ların cihaz envanteri (code, mode, skills) |
| Root Cause | Devices controller'da scope resolution mekanizmasının hiç kullanılmaması |

---

## 4. P1 Findings Verification

### UA4-1 — Status transition bypass via PUT — P1 — **DOĞRULANDI**

| Alan | Değer |
|---|---|
| Severity | P1 (workflow bypass, yetki genişlemesi) |
| Endpoint | `PUT /schedules/:id` |
| Controller | `schedules.controller.ts:419-431` — `@Roles(MinRole.FIELD_SUPERVISOR)` (medical_engineer ≥254'e kadar), `@UnitScope(serviceType:'schedule', idParam:'id')` |
| Service | `schedules.service.ts:690-783` (`update`) |
| Authorization Path | Guard yalnız unit/org. `update()` `status: dto.status` (line 742) doğrudan yazar; `canPublish`, `canRoleTransition`, `isValidTransition` **hiç çağrılmaz** |
| Data Scope | Client dilediği `status` ('draft'|'under_review'|'approved'|'published'...) gönderebilir; `published` gönderilirse `publishedAt` da damgalanır (744) |
| Exploitability | Kolay: field_supervisor `PUT {"status":"published"}` → onay/DDD akışı tamamen atlanır |
| Root Cause | Legacy `update()` state machine öncesinden kalma; transition doğrulaması devreden çıkmış. Workflow path doğru: `submitForReview`/`approve`/`reject`/`publish` hepsi `isValidTransition` + `canApprove`/`canPublish` kullanıyor (workflow servisi) ve DDD v1 domain state machine kullanıyor |

### UA8-1 — Published schedule mutation — P1 — **DOĞRULANDI**

| Alan | Değer |
|---|---|
| Severity | P1 (yayınlanmış plan veri bozulması) |
| Endpoint | `POST /schedules/:id/assignments`, `PUT /schedules/:id/assignments/:assignmentId`, `DELETE /schedules/:id/assignments/:assignmentId`, ayrıca `PUT /schedules/:id` (assignments + status) |
| Controller | `schedules.controller.ts:433-484`, `419-431` |
| Service | `schedules.service.ts:1326+` (`addAssignment`), `updateAssignment`, `removeAssignment`, `update` |
| Authorization Path | Guard unit/org + `validateAssignmentDetailed` (constraint). **`isPublished`/`isEditable` kontrolü yok** |
| Data Scope | Published schedule'a field_supervisor + atama ekleme/silme/değiştirme serbest |
| Exploitability | Kolay; FE'de `isEditable`/butonlar yayınlanmış paket için kitleme var ama BE authoritative enforcement yok |
| Root Cause | `addAssignment` (1965'e kadar fonksiyon) schedule load'undan sonra `status` kontrolü yapmıyor; `isEditable`/`isPublished` state machine fonksiyonları (schedule-status.ts:163-169) mevcut ama mutasyon zincirinde kullanılmıyor |

### UA5-1 — Rollback → swap data loss — P1 — **DOĞRULANDI** (published korumalı; draft/rejected yolunda veri kaybı)

| Alan | Değer |
|---|---|
| Severity | P1 (swap history/approval verisi kaybı) |
| Endpoint | `POST /schedules/:id/rollback/:version` |
| Controller | `schedules.controller.ts:550-560` → `workflowService.rollback` (workflow:381-458) |
| Service | `workflowService.rollback` + `schedules.service.ts:1943` (ikincil path, controller kullanmıyor) |
| Authorization Path | `isEditable(schedule.status)` → published için BLOCK (388-392) ✓. Rollback tx: `assignment.deleteMany` (405) → `SwapRequest.fromAssignment` `onDelete: Cascade` (schema) → **schedule'daki atamalara bağlı tüm swap requestleri silinir** |
| Exploitability | Draft/rejected bir schedule rollback edildiğinde pending/approved swap'ler cascade silinir (geri alınamaz). "Yanlış cascade" değil, bilinçsiz tasarım sonucu |
| Root Cause | Swap `fromAssignmentId` → `Assignment` `onDelete: Cascade` (schema.prisma SwapRequest). Rollback `deleteMany` atamaları tamamen siler |
| Migration | **Gerekmez.** Swap tarihçesi koruması kod+beyin seviyesinde çözülür (bkz. section 9) |

### UA6-1 — Export 500 — P1 — **DOĞRULANDI** (universal kırık)

| Alan | Değer |
|---|---|
| Severity | P1 (fonksiyonel blok — tüm exportlar 500) |
| Endpoint | `GET /schedules/export/excel`, `GET /schedules/export/pdf` |
| Controller | `schedules.controller.ts:358-402` (`enforceUnitReadScope` scope check sağlam) |
| Service | `schedules-export.service.ts:135-168` (`getExportData`) |
| Authorization Path | `enforceUnitReadScope` (controller:329-356) → org/unit confine OK. Ancak servise **orijinal `unit` param** geçilir (372), resolve edilmiş unitId değil |
| Data Scope | `getExportData` line 137: `unit.findFirst({ where: { type: unitType.toUpperCase() as any } })` |
| Exploitability | **Tüm cihazlar 500.** FE `getExportExcelUrl(unit,...)` `vs.schedule.unit` = **UUID** gönderir (firevibe:1654 → schedule.service:1530-1534). UUID `.toUpperCase()` → geçersiz enum → Prisma validation error → 500. Ayrıca küçük harf type ('mr') gelirse bile `.toUpperCase()` ('MR') enum'da yok (UnitType enum lowercase: `mr,bt,rontgen,nukleer,onkoloji,...`) |
| Root Cause | İki katmanlı: (a) `.toUpperCase()` + `type` eşlemesi enum ile uyumsuz; (b) servis girdisi "unit type" kabul edip FE gerçekte UUID geçiyor → hiçbir girdiyle çalışmaz |

### UA3-1 — Workflow approve four-eyes — P1 — **DOĞRULANDI**

| Alan | Değer |
|---|---|
| Severity | P1 (self-approval, governance ihlali) |
| Endpoint | `POST /schedules/:id/approve` (workflow path) |
| Controller | `schedules.controller.ts:499-512` → `workflowService.approve` (workflow:128-188) |
| Service vs DDD | Workflow `approve`: yalnız `canApprove` (131) + `isValidTransition` (135). **`submittedBy !== approver` kontrolü yok**. DDD `schedule-application.service.ts:157-168`: four-eyes kontrolü VAR (161-163) |
| Authorization Path | Supervisor submit edip (submit sonrası under_review) aynı supervisor `approve` yapabilir (sup canApprove setinde: `canApprove` imaging_director+supervisor+admin) |
| Exploitability | Orta: supervisor kendi planını onaylayabilir; DDD path korumalı olduğundan akış tutarsız |
| Root Cause | DDD v1 domain (`Schedule.submitForReview`/`approve`) four-eyes invariant'ını taşıyor; legacy/workflow path'i aynı invariant'ı implement etmiyor |

---

## 5. Detailed Authorization / Data Flow

```
ROLE → RBAC ASSIGNMENT → ORGANIZATION → UNIT SCOPE → PERMISSION
   └─ min-role (controller @Roles)
   └─ UnitScopeGuard (yalnız @UnitScope decorator olan rotalarda)
        └─ isStrictlyUnitScoped (RBAC FIELD_SUPERVISOR dahil)
             └─ unit eşleşme + org eşleşme (canAccessUnit)
        └─ resolveReadScope  (list okumaları için unitId/org)
```

**Boşluk analizi:**
- PERSONEL list: `resolveReadScope` çağrılıyor ama dönüşünün yalnız yarısı kullanılıyor (org atılıyor) → zincirin köprüsü kırık.
- DEVICE: zincire hiç bağlanmamış (guard dışında).
- SCHEDULE status: `PUT` controller'ı `update()`'e gidiyor; `status` yazımı workflow/DDD'yi tamamen baypas ediyor. Unit/org guard iyi, **mutasyon yetki katmanı eksik**.
- SCHEDULE assignment: same — constraint engine çalışıyor, **status invariant'ı eksik**.
- ROLLBACK: unit/org ve isEditable guard İYİ; **swap tarihçesi** korumasız.
- EXPORT: org/unit confine İYİ; **servis girdi eşleme katmanı** bozuk.
- FOUR-EYES: workflow path'te **eksik**.

---

## 6. Root Cause Analysis (özet)

| Bulgu | Kök neden kategorisi |
|---|---|
| AU-01 | `resolveReadScope().organizationId`'nin servise taşınmaması (genel listeleme) + mutation endpoint'lerinde scope guard hiç kullanılmaması |
| AU-02 | Devices controller'da `UnitScopeGuard`/`resolveReadScope` kullanılmaması |
| UA4-1 | `update()`'in state machine'den kopuk legacy mutation path olarak kalması |
| UA8-1 | `addAssignment`/`updateAssignment`/`removeAssignment`'ın `isEditable`/`isPublished` geçidinden geçmemesi |
| UA5-1 | Rollback `deleteMany` → cascade `SwapRequest` silinmesi (bilinçsiz tasarım) |
| UA6-1 | `toUpperCase()` enum uyumsuzluğu + servis girdi sözleşmesinin (type vs UUID) FE ile eşleşmemesi |
| UA3-1 | DDD invariant'ının legacy/workflow path'e taşınmaması (paralel kod yolları tutarsızlığı) |

---

## 7. Proposed Minimal Remediation (design only — kod onay sonrası)

Bölüm 5'teki mevcut mekanizmalar yeniden kullanılır; yeni paralel authz sistemi YOK.

| ID | Minimal Fix (tasarım) |
|---|---|
| AU-01 | (a) `personnel.findAll` servis imzasına `organizationId?: string` ekle → `where.organizationId`; controller `scoped.organizationId`'yi aktar. Ayrıca `scoped.denyAll` zaten var (fail-closed ✓). (b) `create`/`update`/`delete`'e: alınan unit'in org'su → `canAccessUnit`; `update`/`delete` için hedef personelin unit/org'sunu `resolveTargetScope('personnel', id)` ile çek, strict-unit ise eşleştir, org mismatch → 403. `UnitScope` decorator'ları mevcut guard üzerinden eklenebilir. |
| AU-02 | Devices controller'a `UnitScopeService` + (listelerde) `resolveReadScope().organizationId` where'e; unit çözümleri `findFirst({type})` yerine resolve edilmiş unitId + org kontrolü; istersek `@UnitScope({entityType:'device',...})` guard da kullanılabilir (guard 'device' entity destekliyor — unit-scope.service.ts:163-166). |
| UA4-1 | `UpdateScheduleDto.status`'ü kaldır (ya da `update()` içine `isValidTransition(current, dto.status)` + rol `canRoleTransition`/`canPublish` gate'i). Öneri: status mutation'ı yalnız workflow/DDD endpoint'leri üzerinden yapılsın; `PUT` normal veri güncellemesi olsun. `publishedAt` yalnız workflow `publish`'te. |
| UA8-1 | `addAssignment`/`updateAssignment`/`removeAssignment`'a girişte `isPublished(schedule.status)` && `!isEditable` → `ConflictException` (yayınlanmış program sürüm düzenlenemez, revizyon aç). `PUT /:id` ile gelen `assignments` tam değişimi de aynı geçitten geçir. |
| UA5-1 | Rollback içinde `deleteMany` yerine: (a) atamaları silmeden snapshot restore etmek yerine `tx.assignment.deleteMany` + swap'lere zarar vermeyen yaklaşım — swap request'lerini ya (i) atama id'lerini koruyarak güncelle (değiştirme değil), ya (ii) rollback öncesi swap'leri ayrı bir "history" kopyasına snapshot'la (audit). En düşük riskli: rollback'te `fromAssignment` ilişkisi kurulu swap'leri `status:'cancelled'` + `rollbackNote` ile işaretle, silme. |
| UA6-1 | `getExportData` girdiyi unit id/code/type OR ile çöz (uygulama `findByUnitType` deseni); `where: { type: unit.type }` (resolve edilen gerçek enum). `toUpperCase()` kaldır. Controller resolve edilen `unit.id`'yi servise geçirebilir. |
| UA3-1 | `workflowService.approve`'a: `submittedBy` kaydını (approvalData) oku → `submittedBy === user.id` → 403. DDD'deki invariant'ın aynısı. |

---

## 8. Files Expected to Change (implementation fazı için — bu fazda değişmedi)

Backend:
- `backend/src/modules/personnel/personnel.controller.ts`
- `backend/src/modules/personnel/personnel.service.ts`
- `backend/src/modules/devices/devices.controller.ts`
- `backend/src/modules/devices/devices.service.ts`
- `backend/src/modules/schedules/schedules.service.ts` (update, addAssignment, updateAssignment, removeAssignment, rollback)
- `backend/src/modules/schedules/schedules-workflow.service.ts` (approve four-eyes, rollback swap koruması)
- `backend/src/modules/schedules/schedules-ddd.controller.ts` → (yalnızca değerlendirme; değişiklik beklenmez)
- `backend/src/modules/schedules/schedules-export.service.ts`
- `backend/src/modules/schedules/dto/update-schedule.dto.ts` (status kaldırma veya opsiyonel `statusAllowed`)

Frontend (yalnız destekleyici — backend authoritative):
- `frontend/src/app/services/schedule.service.ts` (export URL; gerekirse — FE zaten UUID yolluyor, backend düzeltince yeterli)

Schema/migration: **DEĞİŞMEZ** (bkz. 9).

---

## 9. Migration Impact

- **Schema değişikliği GEREKMEZ.** `SwapRequest` cascade koruması kod seviyesinde çözülür.
- `schema.prisma` ve `migrations/**` dokunulmaz.
- Risksen seed: yok. DB write: yok.

---

## 10. Test Plan

Mevcut test dizinleri: `backend/src/modules/rbac/__tests__/`, `backend/src/modules/schedules/__tests__/`,
`backend/src/modules/personnel/`, `backend/src/modules/audit-log/`, `backend/src/modules/swap-requests/`.
Yeni testler mevcut Vitest + mock-prisma altyapısını kullanır.

**AU-01 (list + mutation):**
- SUPERVISOR same-org → PASS (org filtresi = own org)
- SUPERVISOR cross-org → DENY (404/boş list)
- FIELD_SUPERVISOR same-unit → PASS
- FIELD_SUPERVISOR other-unit → DENY
- FIELD_SUPERVISOR cross-org → DENY
- unresolved scope → DENY (fail-closed, `originAll` zaten true)
- `POST/PUT/DELETE /personnel/:id` cross-org → 403
- `schedule-versions` regression: `personnel.service.findAll` varyantlarını eden mevcut spec uyumu

**AU-02:**
- SUPERVISOR same-org PASS; cross-org DENY; FIELD_SUPERVISOR same-unit PASS / other-unit DENY / cross-org DENY
- `GET /devices/unit/:code` cross-org → DENY
- device → unit → organization zincir testi

**UA4-1:**
- field_supervisor `PUT {"status":"published"}` → DENY (403 veya 400)
- authorized publish (DDD/workflow publish) → PASS
- normal update (assignments alan) status kısmına dokunmaz → PASS
- publish-by-id workflow (`POST :id/publish`) require `canPublish` → mevcut testler korunur

**UA8-1:**
- published schedule'a addAssignment → DENY (409 conflict, mevcut isEditable beklenir)
- draft → addAssignment PASS
- published `PUT /:id` assignments full → DENY
- unauthorized role → 403, audit log yazılır

**UA5-1:**
- rollback draft schedule → assignments geri gelir; **pending swap'ler korunur/cancelled+note**
- rollback published → 400 (mevcut `isEditable` guard — korunmalı, test var `5c6-hardening`)
- tx bütünlüğü (snapshot eksik → hata → assignment silinmez)

**UA6-1:**
- Docker: tüm UnitType değerleri için export excel/pdf döner, 500 yok
- geçersiz enum/unit → 404 (safeguard)
- scope testleri (5c9-export-scope) korunur, EXPORT servis level gerçek DB/mock ile

**UA3-1:**
- requester approval kendi planı → 403
- ikinci yetkili actor → PASS
- yetkisiz role → 403
- org/unit confine korunur (workflow approve'ta guard zaten var)
- DDD four-eyes mevcut testleri (`5c9-ddd-controller-scope`) korunur

Threshold sabit kalır; yeni assertion'lar eklenir mevcut düşürülmez.

---

## 11. Regression Risk

| Bulgu | Risk | Azaltma |
|---|---|---|
| AU-01 list fix | supervisor'ların "tüm birimler personel listesi" davranışı bozulabilir mi? → hayır: supervisor org-scope'lu olduğundan yalnız kendi org'su döner (beklenen davranış) | mevcut `5c15-sec-f` + yeni matrix testi |
| AU-01 mutation fix | create/update akışında unit resolve davranışı | yalnız cross-org durumlarda 403; FE aynı org zaten çalışır |
| UA4-1 | FE `PUT` ile status gönderiyor olabilir → FE'de status değişimini uygun endpoint'e kaydırmak | `schedule.service.ts` + plan/firevibe çağrıları ile diff kontrolü |
| UA8-1 | firevibe drag-and-drop published schedule'da devre dışı kalmış olabilir → FE zaten buton kitleliyor | orta |
| UA5-1 | rollback sonrası snapshot data restore'u etkilenmesin (assignments data eşit kalır) | yalnız swap tarihçesi; feature'da swap silinme davranışına bağımlılık yok |
| UA6-1 | export CSV/PDF formatı değişmez (yalnız data-source düzeldi) | format testi |
| UA3-1 | supervisor'ın kendi planını onaylamasına bağımlılık (yok) | düşük |

---

## 12. Security Invariants (korunacak — DEĞİŞMEZ)

- SUPERVISOR ≠ FIELD_SUPERVISOR (birleştirilmeyecek).
- FIELD_SUPERVISOR: strict single-unit; null/unresolved unit → FAIL CLOSED.
- Cross-tenant erişim her zaman DENY.
- `isValidTransition`/`canApprove`/`canPublish` state machine (schedule-status.ts) KORUNACAK — PUT path'e taşınacak, değiştirilmeyecek.
- Constraint engine, greedy/optimizer motorları KORUNACAK.
- Backend authoritative; FE defense-in-depth ikincildir.
- Audit zinciri (`@Log`, workflow upsertApproval) korunacak.

---

## 13. Implementation Sequence (onay sonrası)

1. AU-01 (personnel list + mutation scope) → test matrix → tsc/nest build + vitest
2. AU-02 (devices scope) → test matrix → vitest
3. UA4-1 (update status gate) → test → FE diff kontrolü (PUT status kullanımı yoksa düşük risk)
4. UA8-1 (published mutation gate) → test
5. UA6-1 (export fix) → tüm unit tipleri test
6. UA5-1 (swap history koruma) → rollback testleri
7. UA3-1 (approve four-eyes) → workflow testleri
8. Tam suite: FE tsc, BE tsc, nest build, ng prod build, vitest full (876/877 baseline korunur; 5b3 timing flake izole 12/12).

---

## 14. Approval Gate

Gereken (READY için tümü karşılandı):
- [x] P0 AU-01 root cause kesin (org taşınmıyor + mutation scope'suz)
- [x] P0 AU-02 root cause kesin (guard yok, org filtresi yok)
- [x] P1 root cause'ların tamamı doğrulandı (4, UA8-1, UA5-1, UA6-1, UA3-1)
- [x] Minimal remediation tasarımı net (section 7)
- [x] Değişecek dosyalar net (section 8)
- [x] Migration ihtiyacı net (gereksiz)
- [x] Test planı net (section 10)
- [x] Security invariants korunuyor (section 12)

---

IMPLEMENTATION GATE = READY

Bu fazda HİÇBİR kod/test/schema değişikliği yapılmadı. Yukarıdaki plan uygulanmayacaktır
kullanıcı açık onayı gelene kadar.

**STOP — Awaiting explicit implementation approval.**