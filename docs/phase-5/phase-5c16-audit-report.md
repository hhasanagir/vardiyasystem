# PHASE 5C.16 — Product Hardening Re-Audit (READ-ONLY) / FINAL REPORT

> Yöntem: AUDIT → REPORT → STOP. Bu rapor salt-okunur gözlemlerden oluşur;
> hiçbir kod, schema, veritabanı, test veya git değişikliği yapılmamıştır.
> Uygulama yalnızca kullanıcının açık onayı sonrası yapılabilir.

Kaynak ağaç: `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem` (yetkili repo).
Git baseline tek commit; tüm kaynaklar reposuz takipsiz (`??`/`AM/AD/A`),
`schema.prisma`/`migrations` git'te tracklenmemekte → koruma kural bazlıdır.

## VERDICT: **BLOCKED** — P0 bulgular mevcut; onay öncesi uygulama yapılamaz.

P0: 2 (cross-tenant veri sızıntısı) · P1: 5 · P2: 4 · P3: 5
Implementation gate: yalnız P0/P1 fix önerileri kullanıcıya sunulur, onay sonrası 5C.16 (implementation) açılır. 5C.17'ye geçilmez.

---

## 1. Baseline & Repo Integrity
- Tek commit; tüm kaynak (backend+frontend) untracked. → disk diff ile doğrulama yapıldı; git üzerinden korunamadığı için protected hash listesi işletimsel olarak geçerli.
- Kardeş ağaç `..\Belgeler\GitHub\vardiyasystem` eski; iki subagent bu ağaçta çalışıp hatalı bulgular üretti. Tüm mevcut bulgular Desktop'ta elle yeniden doğrulandı (yalnız doğrulananlar rapora alındı).

## 2. User-Flow Trace (UI → Route → Guard → Service → Prisma)
- Plan/supervizor/firevibe/approval/dashboard: rotalar parent `authGuard` birlikte; `unitAccessGuard` plan rotalarında aktif.
- Duplicate/offset browser not: hiçbir akışta P0 engeli yok. AU-04/UA2-1 harici tüm rotalar backend'de karşılık bulur.

## 3. UI-State & Session
- `cellNotes`/izin/fazla/cihaz-off durumları yalnızca FE signal-map'lerde; persist yok (UI-4, P3).
- Toast altyapısı: global `<app-toast-container/>` mount'lu + ToastService signal render aktif; PrimeNG `messageService` boşta (P3, kanal ikiliği).

## 4. Scheduling Domain
- Status state machine `schedule-status.ts` tanımlı; `canPublish` yalnız imaging_director+admin.
- **Geçiş doğrulaması service`te çalışmıyor:** `schedules.service.ts:690+ update()` doğrudan `status: dto.status` set eder, `canRoleTransition`/`canPublish` hiç çağrılmaz (UA4-1, P1).
- DDD v1 four-eyes kontrolü mevcut (`schedule-application.service.ts:161-162`); workflow path `approve` (`schedules-workflow.service.ts:128`) four-eyes'sız → kendi planını onaylamak mümkün (UA3-1, P1).

## 5. Cross-Tenant Enumeration (CRITICAL — P0)
| ID | Bulgu | Kanıt | Risk |
|----|-------|-------|------|
| AU-01 | GET /personnel: supervisor+ tüm organizasyonların personelini listeler | `personnel.controller.ts:54-79` `scoped.organizationId` iletilmiyor; `personnel.service.ts:32-41` where org içermiyor | PHI/irtibat bilgileri cross-org ifşa |
| AU-02 | GET /devices: guard yalnızca JwtAuthGuard+RolesGuard, org scope yok | `devices.controller.ts findAll/findByUnitCode`; `device.service.findAll(unit/isActive)` | Cihaz envanteri cross-org ifşa |

Fix → implementation gate (her iki servise `organizationId` where + controller'ın scope geçirmesi).

## 6. Scheduling Mutation (P1)
- UA8-1: `addAssignment` (`schedules.service.ts:1326`) published schedule'a serbest mutasyon — `isEditable`/`isPublished` kontrolü yok (isEditable yalnız draft/rejected, ama service tarafında enforce edilmiyor).
- UA5-1: `rollback` (`:1943`) `deleteMany` assignments; `SwapRequest.fromAssignment` `onDelete: Cascade` → pending/approved swap kayıtları yok edilir. Ayrıca `bumpScheduleVersion` + ayrı `version: {increment:1}` → versiyon çift artar (GPU-1, P3/minor).

## 7. Swap Requests (P2)
- UA2-1: BE DTO `fromAssignmentId`/`targetPersonnelId`; FE `subswap-requests.component.ts:225-226` `requesterShiftId`/`targetEmployeeId` → create bozuk/row oluşmaz. FE `'pending'` vs BE `'PENDING'` (schema default) → approve/reject butonları hiç tetiklenmez. BE tarafı sağlam: scope `fromAssignment→schedule→unit/org` zincirinden türetiliyor. Backend kalır, FE düzeltilir (gate).

## 8. Export (P1)
- UA6-1: `schedules-export.service.ts:137` `unit.findFirst({where:{type: unitType.toUpperCase() as any}})` — `UnitType` enum lowercase (`mr`, `bt`, …) → Prisma validation hatası → **tüm exportlar 500**. Controller `enforceUnitReadScope` yine de mevcut (org check OK); düzeltme enum değerleriyle eşlemeli.

## 9. Dashboard (P2)
- AU-04: `dashboard.service.ts:302` `/schedules/activities` ve `:358` `/schedules/live-metrics` — backend'de rota yok → 404; `:228` `/schedules/dashboard/stats` console.warn "not available yet" placeholder.
- AU-03 (P1 minor): `getDashboardStats` (`schedules.service.ts:2265`) `allAssignments`/`todayAssignments` org filtresiz (cross-tenant toplam); `pendingRequests` `status:'pending'` vs DB `'PENDING'` → daima 0 (AU-03/UI-6, P2).

## 10. Audit & Unit Scope (P2)
- `audit-log.controller.ts:35-46 resolveOrgOrDeny` org-kısıtlı (Task7 "org'suz" iddiası Desktop'ta geçersiz). `flag`/`unflag` ise id-bazlı, org doğrulanmıyor (P2).
- AU-06: `resolveUnitScope` `findFirst OR[id,code,type]` org filtresiz → iki org aynı `type` taşır, yanlış birim eşleşebilir ve zaten yanlış org id'si ile 403 (P2).

## 11-12. Performance & FE Architecture
- Dashboard yük başına +4 404 istek (P2/performans notu).
- `core/api` vs `services/api` ikiliği rapor-seviyesinde korunur; refactor bu fazda YOK (raporda belirtilir — faz talebi gerektir).
- Build: `ng build --production` exit 0 (chunk 200k eşiği 13.25k aşımı uyarısı, NG8107); BE tsc/nest build temiz; vitest 876/877 (bilinen 5b3 timing flake, izole 12/12 PASS).

## 13. UX (P3)
- Topbar rol etiketi düzeltilmiş (`getRoleLabel`, field_supervisor="Saha Sorumlusu"); task3 "raw role" iddiası eski ağaçtan. `notification.service.init` çağrılmıyor; toasts ToastService üzerinden çalıştığından P3 notu.

## 14. Findings P0–P3 (Özet Tablo)
| ID | Sev | File | Özet |
|----|-----|------|------|
| AU-01 | **P0** | personnel.controller.ts:54-79 / personnel.service.ts:32-41 | Cross-org personel ifşası |
| AU-02 | **P0** | devices.controller.ts | Cross-org cihaz envanter ifşası |
| UA4-1 | P1 | schedules.service.ts:690+ (update) | Status transysyon yok; field_supervisor → published |
| UA8-1 | P1 | schedules.service.ts:1326 addAssignment | Published plan mutasyonuna açık |
| UA5-1 | P1 | schedules.service.ts:1943 rollback | Rollback → swap kayıpları (cascade) |
| UA6-1 | P1 | schedules-export.service.ts:137 | Export 500 (enum case) |
| UA3-1 | P1 | schedules-workflow.service.ts:128 approve | Workflow path'te four-eyes yok (self-approve) |
| UA2-1 | P2 | subswap-requests.component.ts:225-226 | FE payload/status BE ile uyumsuz |
| AU-03 | P2 | schedules.service.ts:2265 | Dashboard cross-tenant + pending case |
| AU-04 | P2 | dashboard.service.ts:302,358 | 404 placeholder rotalar |
| UA7-3 | P2 | audit-log controller | flag/unflag org doğrulaması yok |
| AU-06 | P2 | schedules.controller resolveUnitScope | Global findFirst type → unit ambiguity |
| UI-4 | P3 | firevibe-schedule | Not/izin/fazla client-local, persist yok |
| UA4-5 | P3 | schedules.service update() | read-then-write, DMA mikro race |
| GPU-1 | P3 | rollback | Double version bump |
| P3-k | P3 | onkoloji-plan.component.ts | Orphan/dead component |
| P3-k | P3 | apps/toast channel | PrimeNG messageService boşta kanal |

## 15-19. Tests / Builds / DB / Protected / Git
- Protected hash'ler dokunulmadı (gly: bu faz kod yazmadı). Test suite mevcut ve 876/877.
- DB `schema.prisma` değişmedi; ekleme/çekme yok; migration `migration_lock.toml` track'li.
- Git reflog/track durumu: implementation öncesi hiçbir git komutu çalışmadı (git status hariç). Dean: commit öncesi diff alınabilir (untracked olduğundan).

## 20. Remaining Risks (açık doğrulanmamış)
- Swap second-dosya: BE approve id-bazlı user-release? (mevcut rapor: approve rol bazlı; owner check FE'de — P2 not).
- "training"/"skills" rotaları ve `skillService` dashboard'da hangi endpoint çağırıyor → 5C.17 listesine not.
- Export `device` tipi [dxt] diğer bir tip olarak da test edilmedi (RNG'de üretim).

## 21. Öneri (implementation gate — kullanıcı onayı bekler)
1. P0: `personnel.service`/`device.service`'e `organizationId` where + controller scope iletimi (+ 5C.15/16 güvenlik testleri güncelle, threshold yükseltme).
2. P1: `update()`'e `canRoleTransition`/`canPublish` zorunlu; `addAssignment`'a `isPublished` bloğu; `rollback`'e swap cascade koruması; export enum→type eşlemesi; workflow approve four-eyes.
3. P2: swap FE payload/status uyumu; dashboard route'ları; flag/unflag org kontrolü; unit resolve scope'u.
4. P3: not/izin persist, orphan temizlik, toast kanal, double bump.

Onay gelmediği sürece uygulama yapılmaz. 5C.17'ye geçilmez.