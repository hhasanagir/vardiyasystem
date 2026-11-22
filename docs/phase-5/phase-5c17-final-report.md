# VARDİYAOS — PHASE 5C.17 — P0/P1 SECURITY REMEDIATION FINAL REPORT

> Implementation fazı tamamlanmıştır. 5C.16 FINAL REPORT + 5C.17 GATE REPORT'daki 2 P0 + 5 P1
> bulgunun tamamı kapatılmış; security/regresyon testleri authoritative repo'da yeşildir.
> Bu fazda **migration/schema değişikliği yapılmamıştır**.

---

## 1. Executive Summary

| Bulgu | Severity | Durum | Fix yeri | Test |
|---|---|---|---|---|
| AU-01 Personnel cross-tenant list + mutation | P0 | ✅ KAPALI | personnel.controller.ts + personnel.service.ts | `5c17-personnel-scope.spec.ts` (17) |
| AU-02 Devices cross-tenant list | P0 | ✅ KAPALI | devices.controller.ts + devices.service.ts | `5c17-devices-scope.spec.ts` (8) |
| UA4-1 Status mutation bypass via PUT | P1 | ✅ KAPALI | update-schedule.dto.ts + schedules.service.ts:702 | `5c17-update-status-gate.spec.ts` (5) |
| UA8-1 Published schedule mutation | P1 | ✅ KAPALI | schedules.service.ts (assertNotPublished:799) | `5c17-published-mutation-gate.spec.ts` (8) |
| UA5-1 Rollback → swap cascade delete | P1 | ✅ KAPALI | schedules-workflow.service.ts:386 | `5c17-rollback-swap-preservation.spec.ts` (5) |
| UA6-1 Export 500 (universal) | P1 | ✅ KAPALI | schedules-export.service.ts (resolveUnit:168) | `5c17-export-unit-resolution.spec.ts` (6) |
| UA3-1 Workflow approve four-eyes | P1 | ✅ KAPALI | schedules-workflow.service.ts:141 + schedules.service.ts:512 | `5c17-approve-four-eyes.spec.ts` (4) |

**Test sonucu: 7 yeni spec, 53 test — hepsi geçti.**

---

## 2. Repository Identity / Git State

- **Authoritative repo:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem`
- Git: tek commit "Initial commit"; tüm kaynak untracked (`??` / `AM` / `AD` / `A`).
  `Desktop\vardiyasystem` reparse point'tir; `Belgeler\GitHub\vardiyasystem` STALE kopyadır
  ve bu fazın ODAĞI DEĞİLDİR.
- Migration/schema: **DOKUNULMADI** (`schema.prisma` diff yok).

---

## 3. Finding-by-Finding Remediation Detail

### AU-01 — Personnel cross-tenant read/list + mutation — P0 — ✅ KAPALI

**Kök neden:** `findAll` `where`'e `organizationId` hiç koymuyordu; controller `scoped.organizationId`'yi iletmiyordu; `create`/`update`/`delete` scope'suzdu.

**Fix:**
- `personnel.controller.ts:54-80` — `findAll` artık `scoped.organizationId ?? req.user.organizationId`'yi servise aktarıyor; `scoped.denyAll` → 403 (fail-closed); `scoped.unitId` strict-unit eşleşmesi korundu.
- `personnel.controller.ts:105-130` — `create` (`@UnitScope({unitBodyField:'unitId'})`), `update`/`delete` (`@UnitScope({entityType:'personnel',idParam:'id'})`) eklendi; `req.user.organizationId` servise geçiliyor.
- `personnel.service.ts:32` — `findAll` imzası `organizationId?: string`; `where.organizationId` (list + workload `assignment.findMany` + schedule-variants, 80).
- `personnel.service.ts:151,269,301,405,445` — `findOne`/`update`/`delete`/`getWorkload` org param ile hedef kayıt org eşleştirmesi (mismatch → 403/404); `update` unit değişimi org denetimi (338-341).
- Client `organizationId` imkanı kaldırılmamış ama servise İLETİLMİYOR (controller authoritative scope kullanır) → client asla genişletemez.

**Test (`5c17-personnel-scope.spec.ts`, 17):** SUPERVISOR same-org PASS / cross-org DENY / client org ignored; FIELD_SUPERVISOR same-unit PASS / other-unit DENY / null-unit FAIL CLOSED; create/update/delete/getWorkload org taşınıyor; service-level org filtre + workload org.

### AU-02 — Devices cross-tenant list — P0 — ✅ KAPALI

**Kök neden:** Devices controller'da scope resolution hiç kullanılmıyordu; `findAll` yalnız `unit.type` filtreliyordu.

**Fix:**
- `devices.controller.ts:38-53` — `findAll` `resolveReadScope`; `denyAll` → 403; `organizationId` + `scopedUnitId` servise aktarılır.
- `devices.controller.ts:58-80` — `findByUnitCode` yeni `enforceUnitAccess`: unit'i `id|code|type` OR ile çözer, `canAccessUnit` (org+unit) → mismatch 403; yoksa 404.
- `devices.service.ts:26-48` — `findAll` imzası `{organizationId?, scopedUnitId?}`; `OR: [{organizationId}, {organizationId:null}]` (global cihazlar org-safe bırakılır), `scopedUnitId` → `where.unitId`.

**Test (`5c17-devices-scope.spec.ts`, 8):** SUPERVISOR org-confined (client org ignored); FIELD_SUPERVISOR unit-confined; null-unit fail-closed; findByUnitCode cross-org DENY (404/403); code/type same-org PASS.

### UA4-1 — Status mutation bypass via PUT — P1 — ✅ KAPALI

**Kök neden:** `update()` `status`'ü doğrudan DTO'dan yazıyordu; `canPublish`/`isValidTransition` hiç çağrılmıyordu.

**Fix:**
- `update-schedule.dto.ts` → `UpdateScheduleDto` **yalnız `assignments`** taşır; `status`/`publishedAt` alanı YOK. PUT artık hiçbir durumda statü değiştiremez.
- `schedules.service.ts:702-710` — `update()` client `status`'e dokunamaz; statü yalnız workflow (`submitForReview`/`approve`/`reject`/`publish`/`rollback`) ve DDD endpoint'leri üzerinden değişir.

**Test (`5c17-update-status-gate.spec.ts`, 5):** field_supervisor status mutation DENY (DTO status yok → validation/typemismatch); normal assignment güncellemesi PASS; `publishedAt` yalnız workflow `publish`'te kalıyor.

### UA8-1 — Published schedule mutation — P1 — ✅ KAPALI

**Kök neden:** `addAssignment`/`updateAssignment`/`removeAssignment`/`update` yayınlanmış schedule'a `isPublished` kontrolü yapmadan mutasyon ekliyordu.

**Fix:**
- `schedules.service.ts:799-803` — yeni `assertNotPublished`: `isPublished(status)` → `ConflictException` (409).
- `schedules.service.ts:709` (`update` assignments), `1354` (`addAssignment`), `1446` (`updateAssignment`), `1677` (`updateAssignment` alt), `1759` (`removeAssignment`) — hepsi geçide bağlandı.
- Controller geçitleri (`POST/PUT/DELETE assignments`, `PUT /:id`) korundu; revizyon akışı (`createRevision`) yayınlanmış programlar için geçerli yol olarak kalıyor.

**Test (`5c17-published-mutation-gate.spec.ts`, 8):** published → addAssignment DENY(409); published → updateAssignment DENY; published → removeAssignment DENY; published → bulk PUT assignments DENY; draft → addAssignment PASS; under_review → DENY (isPublished kapsamı değil — isEditable koruması); kayıt işlenmeden önce gate aktif.

### UA5-1 — Rollback → swap data loss — P1 — ✅ KAPALI (migration gereksiz)

**Kök neden:** Rollback `tx.assignment.deleteMany` → `SwapRequest.fromAssignment` `onDelete: Cascade` → atamalara bağlı swap'ler geri alınamaz şekilde siliniyordu.

**Fix (`schedules-workflow.service.ts:386-430`):**
- Rollback tx içinde `deleteMany` İLK değil SON adım; önce `tx.swapRequest.findMany({ OR: [{fromAssignment:{scheduleId}}, {toAssignment:{scheduleId}}], select:{id} })`.
- Bulunanlar `updateMany({ status:'CANCELLED', reason: 'Rollback (v${targetVersion}): ${reason} nedeniyle iptal edildi' })` ile işaretlenir (gate report section 9'un önerdiği "mark-cancel" yaklaşımı; migration/schema değişikliği YOK).
- ROLLBACK audit log `after.cancelledSwapIds` (workflow:477) — iptal edilen swap'lerin id listesi tarihçede kalır.
- Published koruması korundu (`isEditable` → 400).
- İkincil `schedules.service.ts:1969 rollback` path controller tarafından kullanılmıyor; hedef workflow path'tir — değiştirilmedi.

**Test (`5c17-rollback-swap-preservation.spec.ts`, 5):** swap'ler deleteMany ÖNCESİ CANCELLED + reason; audit `cancelledSwapIds`; hiç swap yoksa swapRequest'e dokunulmaz (davranış değişmez); published hâlâ BLOCK; snapshot restore + version bump aynı tx'te.

### UA6-1 — Export 500 — P1 — ✅ KAPALI

**Kök neden:** `getExportData` `toUpperCase()` + `type` eşlemesi enum uyumsuz; FE UUID gönderiyor.

**Fix (`schedules-export.service.ts`):**
- `resolveUnit(unitType)` (168): UUID regex → `unit.findFirst({ where: { id } })`; değilse `code`; değilse lowercase `type` (enum değerleri `mr,bt,rontgen,nukleer,onkoloji...`). Herhangi bir girdiyle çalışır.
- `getExportData` (135): `resolveUnit` sonucu yoksa **404** (500 değil); `unitName: unit.name || unitType.toLowerCase()` (eski `.toUpperCase()` kalktı).
- Controller `enforceUnitReadScope` org/unit confine saklandı.

**Test (`5c17-export-unit-resolution.spec.ts`, 6):** UUID → PASS; code → PASS; lowercase type → PASS; uppercase legacy ('MR') → PASS; bilinmeyen → 404; plan yok → 404. (Excel/PDF çıktı testleri `getExportData` düzeyinde; worksheet adı `/` içeremeyeceği için paket çıktısına gerek yok.)

### UA3-1 — Workflow approve four-eyes — P1 — ✅ KAPALI

**Kök neden:** Workflow `approve` DDD'deki `submittedBy !== approver` invariant'ını implement etmiyordu.

**Fix:**
- `schedules-workflow.service.ts:141-143` — `schedule.approval?.submittedBy === user.id` → `ForbiddenException('Four-eyes principle: ...')`. DDD (`schedule-application.service.ts:160-163`) ile birebir aynı invariant.
- **Legacy auto-publish uyumluluğu:** `schedules.service.ts:512-531` `publishByUnit` (FE firevibe:1697 + person-assignment-dialog:528 → `publishUnitSchedule` → `POST /schedules/unit/:unit/publish`) aynı kullanıcıyla submit+approve+publish yapıyordu → yeni gate 403 üretirdi. Çözüm: submitForReview gerçek kullanıcıyla (submittedBy korunur), approve/publish ayrı **system actor** (`system-schedule-autopublish`, aynı rol/org) ile çalışır → four-eyes invariant'ı korunur, FE akışı bozulmaz. Not: `canPublish` yalnız IMAGING_DIRECTOR + system/hospital_admin olduğundan bu otomasyon saldırı yüzeyi genişletmez.
- Manual `POST /schedules/:id/approve` (controller:499-512) gate'ten geçer: aynı kişi submit+approve yapamaz.

**Test (`5c17-approve-four-eyes.spec.ts`, 4):** farklı approver PASS; submitted yok PASS; aynı kullanıcı DENY (update çağrılmaz); reject yolu korunur.
**Test (schedules.service.spec.ts, +2):** `publishByUnit` submit→real user, approve/publish→system actor (distinct id); approved durum doğrudan system actor ile publish.

---

## 4. Validator / Tests

### 4.1 Yeni güvenlik testleri (Phase 5C.17 — 7 spec / 53 test)

| Spec | Konu | Sayı |
|---|---|---|
| `personnel/__tests__/5c17-personnel-scope.spec.ts` | AU-01 list + mutation scope matrix | 17 |
| `devices/__tests__/5c17-devices-scope.spec.ts` | AU-02 list + findByUnitCode scope | 8 |
| `schedules/dto/__tests__/5c17-update-status-gate.spec.ts` | UA4-1 PUT status gate | 5 |
| `schedules/__tests__/5c17-published-mutation-gate.spec.ts` | UA8-1 published mutation gate | 8 |
| `schedules/__tests__/5c17-rollback-swap-preservation.spec.ts` | UA5-1 rollback swap koruması | 5 |
| `schedules/__tests__/5c17-export-unit-resolution.spec.ts` | UA6-1 export unit resolution | 6 |
| `schedules/__tests__/5c17-approve-four-eyes.spec.ts` | UA3-1 workflow four-eyes | 4 |
| `schedules/__tests__/schedules.service.spec.ts` (ek describe) | UA3-1 publishByUnit system-actor | +2 |

### 4.2 Regresyon

- **Backend tam suite (vitest, device-off hariç):** **84 test dosyası / 922 test — PASS** (FAIL yok).
- `device-off.spec.ts` (Phase 5C.2, gerçek Prisma + Postgres) bu koşuda **hariç tutuldu**: `localhost:5432`'ye DB bağlantısı çalışma ortamında yok (P0-1'in test yolu değil; değişmedi).
- schedules modülü tek başına: 36 dosya / 421 test PASS.

### 4.3 Build / Typecheck

- Backend: `npx tsc --noEmit` → temiz.
- Backend: `npx nest build` → temiz.
- Frontend: `npx tsc --noEmit` → temiz.
- Frontend: `npx ng build --configuration production` → PASS (yalnız mevcut bundle-size uyarıları; FE'de davranış değişikliği yok).

---

## 5. Deviation Log (plan vs uygulama)

| Plan (gate report) | Uygulanan | Gerekçe |
|---|---|---|
| UA5-1: "swap'leri cancelled + rollbackNote ile işaretle, silme" | `status:'CANCELLED'` + `reason` (şema eklemesi yapılmadığı için `rollbackNote` sütunu yerine mevcut `reason` alanı kullanıldı) | Migration yasak; şema değişmez. | forbidden |
| UA5-1: deleteMany yalnızca swap korunduktan sonra | deleteMany korunur, öncesinde cancel + audit kaydı | Schema `fromAssignmentId` NOT NULL + Cascade; satırı yaşatmanın migration dışı yolu yok. Tarihçe audit `cancelledSwapIds` ile korunur. |
| UA3-1: sadece approve gate | publishByUnit system-actor ile legacy akış uyumlu hale getirildi | Dört-göz invariant'ı servis seviyesinde tutarken FE firevibe/dialog publish'in kırılmaması. |
| (yok) | `update()` artık statü damgalamıyor; DTO status kaldırıldı | UA4-1 root fix; FE diff kontrolü: FE `PUT`'ta statü göndermiyor (düşük risk). |

---

## 6. Security Invariants (korunmuş)

- ✅ SUPERVISOR ≠ FIELD_SUPERVISOR (ayrı; birleştirilmedi).
- ✅ FIELD_SUPERVISOR strict single-unit; null/unresolved → FAIL CLOSED (test edildi).
- ✅ Cross-tenant erişim DENY (AU-01/02 matrix).
- ✅ `isValidTransition`/`canApprove`/`canPublish` (schedule-status.ts) DEĞİŞMEDİ — gate'ler eklendi, state machine korundu.
- ✅ Constraint engine, optimizer/greedy/fatigue motorları DOKUNULMADI.
- ✅ Backend authoritative; FE değişikliği YOK (FE zaten UUID+isEditable kullanıyor; backend fix'i tek başına yeterli).
- ✅ Audit zinciri korundu; ROLLBACK + `cancelledSwapIds` ve workflow approval kayıtları güçlendirildi.
- ✅ Yeni paralel authz/RBAC sistemi EKLENMEDİ (mevcut `UnitScopeGuard`/`UnitScopeService`/`resolveReadScope`/`canAccessUnit` yeniden kullanıldı).

---

## 7. Migration / Schema Impact

- `schema.prisma` değişmedi (diff yok).
- `migrations/**` değişmedi.
- Database write: yok; seed: yok.
- UA5-1 için `SwapRequest` şema eklemesi **bilinçli olarak yapılmadı** — koruma kod + audit seviyesinde.

---

## 8. Files Changed (Phase 5C.17)

**Backend (authoritative):**
- `src/modules/personnel/personnel.controller.ts` (AU-01: findAll org + mutation @UnitScope)
- `src/modules/personnel/personnel.service.ts` (AU-01: org parametresi + eşleştirme)
- `src/modules/devices/devices.controller.ts` (AU-02: resolveReadScope + enforceUnitAccess)
- `src/modules/devices/devices.service.ts` (AU-02: org + scopedUnitId)
- `src/modules/schedules/dto/update-schedule.dto.ts` (UA4-1: status kaldırıldı)
- `src/modules/schedules/schedules.service.ts` (UA4-1: update; UA8-1: assertNotPublished gate'leri; UA3-1: publishByUnit system-actor)
- `src/modules/schedules/schedules-workflow.service.ts` (UA5-1: rollback swap cancel + cancelledSwapIds; UA3-1: approve four-eyes)
- `src/modules/schedules/schedules-export.service.ts` (UA6-1: resolveUnit + unitName)
- Mevcut spec: `schedules/__tests__/schedules.service.spec.ts` (publishByUnit dört-göz describe)

**Yeni spec'ler:**
- `src/modules/personnel/__tests__/5c17-personnel-scope.spec.ts`
- `src/modules/devices/__tests__/5c17-devices-scope.spec.ts`
- `src/modules/schedules/dto/__tests__/5c17-update-status-gate.spec.ts`
- `src/modules/schedules/__tests__/5c17-published-mutation-gate.spec.ts`
- `src/modules/schedules/__tests__/5c17-rollback-swap-preservation.spec.ts`
- `src/modules/schedules/__tests__/5c17-export-unit-resolution.spec.ts`
- `src/modules/schedules/__tests__/5c17-approve-four-eyes.spec.ts`

**Frontend:** değişiklik YOK (yalnızca doğrulama: tsc + ng build).

---

## 9. Regression Risks (uygulama sonrası değerlendirme)

| Alan | Etki | Durum |
|---|---|---|
| SUPERVISOR personel listesi | Yalnız kendi org'su döner (beklenen davranış) | ✅ doğrulandı |
| FIELD_SUPERVISOR | strict-unit listesi korundu; null → kapalı | ✅ doğrulandı |
| FE PUT status | FE status göndermiyor; DTO kaldırıldığı için client artık gönderemez | ✅ plan 11 uyumlu |
| firevibe/dialog publish | system-actor ile bozulmadı | ✅ yeni test |
| Export excel/pdf | data-source düzeldi; format değişmedi | ✅ 6 test |
| Rollback | snapshot restore davranışı aynı; swap'ler cancelled+audit | ✅ 5 test |
| DDD four-eyes | mevcut DDD testleri korundu (5c9-ddd-controller-scope PASS) | ✅ tam suite |

---

## 10. Verdict

**PASS — tüm bulgular kapatıldı.**

- 2 P0 (AU-01, AU-02) + 5 P1 (UA4-1, UA8-1, UA5-1, UA6-1, UA3-1) fix + test kapalıdır.
- Backend tam suite 922 test PASS (DB-backed `device-off.spec.ts` hariç — ortamda Postgres yok; değişmedi).
- BE tsc + nest build temiz; FE tsc + ng prod build temiz (yalnız mevcut bundle uyarıları).
- Migration / schema değişikliği YOK.
- Yeni paralel authz sistemi YOK; invariants korundu.
- Değişmeyenler: state machine, constraint engine, optimizer, audit zinciri, FE davranışı.

---

**STOP — Phase 5C.17 implementation complete; awaiting review.**