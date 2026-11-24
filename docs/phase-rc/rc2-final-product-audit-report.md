# RC-2 — Final Product & UX Audit Report (Canonical)

- **Repo:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem` (AUTHORITATIVE)
- **Non-canonical (excluded):** `C:\Users\Hasan\OneDrive\Belgeler\GitHub\vardiyasystem`
- **Mode:** READ-ONLY — implementation not started
- **Date:** 2026-09-21

---

## 1. Executive Summary

Canonical desktop repository doğrulandı; dört regression gate PASS (FE build, FE typecheck, BE 97 dosya/1066 test, BE tsc). F1 = VERIFIED CLOSED. RC-2 ürün/UX audit canonical kaynaklar üzerinde tamamlandı. Ana sıralama surface'i (FireVibe) ve DDD scheduling workspace güçlü ve demo-seviyesi; asıl bulgular rol-erişim tutarsızlığı (FIELD_SUPERVISOR), hardcoded demo-verisi analitik yüzeyler ve FireVibe'de yayın-kilidi UX eksikliğidir.

**Final sayılar:** P0=0 · P1=1 · P2=6 · P3=6

---

## 2. Repository Identity

| Check | Result |
|---|---|
| Desktop root exists | PASS |
| `frontend` exists | PASS |
| `backend` exists | PASS |
| `frontend/package.json` | PASS |
| `backend/package.json` | PASS |
| `backend/vitest.config.ts` | PASS |
| `frontend/src/app/app.routes.ts` | PASS |
| `features/firevibe-schedule/firevibe-schedule.component.ts` | PASS |
| `features/firevibe-schedule/firevibe-schedule.component.html` | PASS |
| `git rev-parse --show-toplevel` | `C:/Users/Hasan/OneDrive/Desktop/vardiyasystem` PASS |

All identity acceptance criteria PASS.

---

## 3. Git State

- **Repository root:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem`
- **Branch:** `main`
- **HEAD:** `eb7a6dbabfdd254810a7e5f6c9f263395446b61e`
- **Working tree:** DIRTY (değişiklik yapılmadı, yalnızca raporlanır). Değişen: `.gitignore`, `README.md`, `backend/package-lock.json`, migration dosyaları (AD durumunda eski migration'lar), `frontend/package-lock.json` + çok sayıda untracked (tagsız config, `backend/src`, `frontend/src`, `docs/`, `secrets/`, `server_log.txt`, `query` vb.). RC-2 gate'leri bu durumdan etkilenmeden PASS.

---

## 4. Regression Gate

| Gate | Result | Evidence |
|---|---|---|
| `npm run build` (frontend) | **PASS** (exit 0) | `ng build` tamamlandı; 9 budget WARNING (istikrar — hata değil): initial bundle 626.87 kB / 400 kB bütçe, `firevibe-schedule.component.scss` 23.04/12 kB, `plan-page.component.scss` 24.17/12 kB vb. |
| `npm run typecheck` (frontend) | **PASS** (exit 0) | `npx tsc --noEmit` temiz |
| `npm test` (backend) | **PASS** (exit 0) | `97 passed (97 files), 1066 passed (1066)` |
| `npx vitest run --pool=forks` (backend) | **PASS** | İlk iki koşuda `device-off.spec.ts` (10 test) `localhost:5432` erişemedi — çevresel (Postgres container `vardiya-postgres` `Exited (255) 33 saat önce`). DB container başlatılıp `npm test` yeniden koşulunca **97/1066 PASS**. Timing flake değildi; test değiştirilmedi, threshold düşürülmedi, hiçbiri atlanmadı. |
| `npx tsc --noEmit` (backend) | **PASS** (exit 0) | Temiz |

**BACKEND BASELINE:** EXPECTED = 97 files / 1066 tests → ACTUAL = **97 files / 1066 tests PASS** ✅

---

## 5. F1 Verification

**F1 = VERIFIED CLOSED**

| Point | Canonical evidence |
|---|---|
| `DeviceRow.slots: ShiftSlot[]` | `firevibe-schedule.component.ts:60-69` (`slots` :68) |
| `seedDeviceRows = signal<DeviceRow[]>([])` | :256 |
| Persisted mapper (deviceRows computed) | :358-396 — `slots` built from `cfg.shifts` (:367-384), unchanged |
| Empty-month seed mapper closure | :1798-1809 `const seedDevices: DeviceRow[] = (deviceStatuses || [])…` (:1799 filter, :1808 `slots: [] as ShiftSlot[]`, :1809 `}));` closure, :1810 `this.seedDeviceRows.set(seedDevices)`) |
| HTML empty-state CTA → `createEmptyMonthPlan()` | `firevibe-schedule.component.html:217-219`; handler `firevibe-schedule.component.ts:1827` |
| Route `firevibe-schedule` → `FirevibeScheduleComponent` | `app.routes.ts:131-136` (lazy import, :134) |
| Duplicate route/component | YOK — tek dosya dizini (`features/firevibe-schedule/`), tek component (:226 selector `app-firevibe-schedule`, :233 class), tek route |

---

## 6. Route/Surface Inventory

Canonical `app.routes.ts` (522 satır): login/register/onboarding (guestGuard) + `app` (authGuard) altında 50+ çocuk route.

- **Birim planları:** `mr-plan|bt-plan|rontgen-plan|nukleer-tip-plan|onkoloji-plan|supervizor-plan` → `PlanPageComponent`, `unitAccessGuard` (:64-128). `firevibe-schedule` (:130) guard'sız; nav'da LİNK YOK (sadece doğrudan URL).
- **Scheduling:** `schedules` → `SCHEDULING_ROUTES` (schedule-list, :unitId/:year/:month workspace), `roleGuard minRole:'supervisor'` (:139-147).
- **Yönetici yüzeyleri:** supervisors center, employees, reports, performance, fairness, audit, trainings, skills, approval-center, management-dashboard, command-center, kpi, smart-recommendations, enterprise/* — tamamı `roleGuard minRole:'supervisor'` veya `hospital_admin` (settings).
- **Guard'sız (alt roller)** : leave-management, swap-requests, handover-notes, device-incidents, my-shifts, profile, my-day, notifications.

**FE Rolleme** (`auth.guard.ts:6-21` / `shared/utils/role-hierarchy.ts:1-16`): field_supervisor=450, supervisor=500, medical_engineer=400. `roleGuard` = `FE_HIERARCHY[role] >= FE_HIERARCHY[minRole]`. `unitAccessGuard` yalnızca field_supervisor'ı birimine sabitler.

**Nav** (`layouts/main-layout/main-layout.component.ts`): `isSupervisor` listesi field_supervisor'ı İÇERMEZ (:283-286); `employees/reports/settings` every role için `visible:true` gösterilir (:332-337) ama guard'lar engeller → dead-end nav. `mainNav` RBAC permission kontrolü yapmaz.

---

## 7. Scheduling UX

**FireVibe (birim planlama, ana surface)** — `features/firevibe-schedule/`:
- Kapsam KPI şeridi (slot/atanan/boş/doluluk bar/çakışma/izin/tatil/gece/mesai/raporlu) + legend (html:138-192).
- Sabit başlık/sol panel + yatay kaydırılabilir grid; zoom (compact→large), ay/yıl/gün navigasyonu, "Bugün"/"Güne Git", Ctrl+F arama, cihaz/vardiya filtreleri (:54-119).
- Satır mimarisi: blok → cihaz → vardiya; sürükle-bırak tray + avatarlar; hücre tipleri: atama (badge'li), override (AÇIK/KAPALI), boş `+`, kapalı, cihaz-kapalı (:288-417).
- Hücre etkileşimi: tıkla→drawer (kişi kartı, künye, uyarı listesi, yük/geçmiş, atama formu, kaldır), sağ-tık menü (ata/kopyala/yapıştır/sil/not/izin/mesai/cihaz-kapalı), klavye kısayolları (Ctrl+C/V/Delete/Z/F).
- State machine: loading/empty/error/success + retry + CTA (html:199-440). `translateAssignmentErrorPayload` ile anlaşılır hata mesajları (ts:25).

**Scheduling workspace (DDD)** — `features/scheduling/pages/schedule-workspace/`:
- Toolbar lifecycle (generated→validated→under_review→approved→published→archived→rejected) — `schedule-toolbar.component.ts:40-87`.
- Skor üst şeridi (puan/kapsama/adalet/ihlal) — `schedule-workspace.component.ts:87-108`.
- Sürüm çakışması overlay (sunucuyu yükle/karşılaştır/korumaya devam) — :111-128.
- Sekmeler: grid, conflicts, validation, fairness, coverage, versions, approval, personnel, device, coverage/conflict görüntüleyiciler; mobile-day-view; connection indicator; offline warning.
- `ScheduleStore.isEditable` = draft|rejected|generated|validated (`store/schedule.store.ts:93-96`).

**PlanPage (legacy birim planı)** — empty/error/loading states, conflicts modal (:1231), status filter (:683), grid status bar.

---

## 8. Device Semantics

- **Cihaz durumu:** FireVibe cihaz satırında renkli durum rozeti (`active/maintenance/fault/out_of_service`) — html:309-315, `deviceStatusLabel()`.
- **Device Off vs Unit Closed vs Weekend vs Holiday — net ayrışık:**
  - Device-off: `CİHAZ KAPALI` + opsiyonel gerekçe rozeti, ayrı css class `device-off`, sağ-tık "Cihazı Aç" (html:372-378, :657-667). Backend `toggleDeviceOff` + FK/unique + cascade (migration `device_off_dates`).
  - Unit closed: `KAPALI` + "⚠ Mevcut atama" uyarısı (html:379-385), `unitClosedDays()` computed (ts:410), başlıkta `KAPALI` mark (html:279-281).
  - Weekend/holiday: sütun + hücre class'ları, tatil mark, tooltip, tatil uyarısı (html:275-282, :362-363, :535).
  - Her iki kapalı tipi de drop/atama için bloklanır (ts:1334-1343; html:366 `drag-over` guard'ı).
- **Cihaz analiz view** (workspace `device-view`): cihaz başına vardiya dağılımı bar + legend.

**Derecelendirme:** device-off / unit-closed / weekend / holiday distinction **CONFIRMED — iyi ayrışık.**

---

## 9. Coverage/Conflict

- **Conflict-view:** severity + rule code + `c.message` + personel + tarih (context) — `conflict-view.component.ts:17-30`.
- **Conflict-panel:** code + message + personel + tarih + saat + dinlenme saati (`conflict-panel.component.ts:32-45`).
- **Conflict card (workspace):** hard/soft ayrımı, `CONFLICT_CODE_LABELS`, `CONFLICT_SEVERITY_LABELS` (`models`).
- **Coverage:** `coverage-view` gün-bazlı bar (complete/partial/empty) + büyük yüzde; publish-dialog kapsama/uyarı/ihlal istatistikleri.
- **FireVibe:** satır `filled/total` rozeti (ok/warn/low) (html:353-357), hücre uyarı listesi seviyeli (error/warning/info) + tatil notu (drawer html:524-539).
- **Yalnızca "conflict" demek yerine neden/kural/personel/tarih/saat** veriliyor — açıklanabilirlik **CONFIRMED GOOD**.

---

## 10. Personnel Availability

- Hücre badge'leri İZ (izin) / RP (rapor) (html:395-396); `cell.leave`/`cell.report` kaynağı personel durumları.
- Drawer: employment status tag (Aktif/İzinli/Raporlu), gece-uygunluk, uzmanlık/sertifika (html:478-505).
- Backend: `personnel_date_availability` migration + `5c25-availability-enforcement` + `5c23-availability-api` testleri (97/1066 içinde PASS), `personnel-availability.controller` @Roles(VIEWER) GET, FIELD_SUPERVISOR yazma (:61-75).
- **Eksik affordance:** atanmış kişi o gün müsait değilse önleyici görsel ipucu yok — boyama atama sonrası desperate badge ile; atama denemesi arka planda backend tarafından reddedilir. **PARTIALLY CONFIRMED.** (İYİLEŞTİRME: kişi sürüklenirken müsaitlik engelli gün hücrelerini görsel işaretle.)

---

## 11. Lifecycle

- Canonical status kümeleri:
  - `domain/enums/index.ts:64` `ScheduleStatusEnum` (draft, under_review, approved, published, archived, rejected); `:82` valid statuses aynı 6'lı.
  - `features/scheduling/models/schedule.models.ts:1` — `draft | generated | validated | under_review | approved | published | archived | rejected` (8'li).
- **FireVibe label map (BUG):** `submitted` içerir (hiçbir enum'da yok), `under_review`/`generated`/`validated` **yok** — `firevibe-schedule.component.ts:904-916`. Bu map'ten geçen bir `under_review` schedule pill'de ham İngilizce `under_review` görünür. `submitted` anahtarı ölü. → **FINDING F-2.**
- Workspace toolbar tüm durumlar için eylemi/fonksiyonu doğru eşleştiriyor (`schedule-toolbar.component.ts:40-87`) — en uyumlu yüzey bu.

---

## 12. Role UX (SUPERVISOR vs FIELD_SUPERVISOR)

- **SUPERVISOR (500):** tüm `minRole:'supervisor'` route'larına erişir; unit-scoped değil (backend `UNIT_SCOPED_ROLES` görsel listesi SENIOR_TECHNICIAN/MEDICAL_ENGINEER/FIELD_SUPERVISOR — SUPERVISOR hariç, `min-role.ts:53-57`).
- **FIELD_SUPERVISOR (450):** `unitAccessGuard` ile yalnızca kendi birimine sabitlenir (auth.guard.ts:45-53) — plan route'larına erişir.
- **MISMATCH (P1):** Backend `FIELD_SUPERVISOR: MEDICAL_ENGINEER (400)` eşiğiyle supervisor-center/supervisor dashboard API'leri sahaya açıkken (`supervisor-center.controller @Roles(MinRole.FIELD_SUPERVISOR)`, `supervisor.controller @Roles(MinRole.FIELD_SUPERVISOR)`), FE'de bu route'ların tamamı `roleGuard minRole:'supervisor'` (500) ile korunur → field_supervisor (450) FE'de **kilitlenir**. Nav'da da `isSupervisor` listesi field_supervisor'ı içermez (main-layout:283-291). → **FINDING F-1.**

---

## 13. Dashboard

- Dashboard service `loadDashboard()` → `GET /analytics/dashboard` → `alerts: DashboardAlert[]` (backend kaynaklı, `dashboard.service.ts:200-221`, `DashboardAlert` :57-62).
- Dashboard component `alerts` computed: danger/warning/info/success + action button `navigate(action.route)` (dashboard.component.ts:128-149, :354-362).
- Ek risk kanalları: `GET /schedules/:id/alerts` → `ScheduleAlertService` (`missing_staff|understaffed|double_booking|overtime|consecutive_night|unassigned_critical|workload_imbalance|shift_threshold`) (`backend/src/modules/schedules/schedule-alert.service.ts:6-153`); websocket `alerts:updated`.
- **Kritik-risk görünürlüğü backend verili ve CANLI — CONFIRMED ako.**
- `loadDashboardMetrics` ek KPI'lar (`/schedules/dashboard/stats`, sunucu 404 fallback hâlinde sessiz) — P3 not.

---

## 14. Mobile/PWA

- SW: `app.config.ts:30-33`; `ngsw-config.json` asset/dataGroups (32-143). **MISMATCH:** dataGroups `/api/...` iken runtime interceptor'ları `/api/v1/...` kullanır → PWA offline cache eşleşmez (sessiz çalışmaz). → **FINDING F-9.**
- Manifest: start_url `/app/my-shifts`, standalone, tr-TR, SVG ikonlar; capacitor config + android/ios dir'leri mevcut; PWA install prompt bileşeni var.
- Mobile scheduling: `mobile-day-view` (gün kartları) workspace'te; FireVibe zoom + sticky satırlar; ancak kapalı/cihaz-kapalı günler mobile view'da jenerik "atama bulunmuyor" gibi görünür → **FINDING F-8.**

---

## 15. Accessibility

- Yardımcı direktifler mevcut: skip-link, aria-live, focus-trap (`core/directives/`).
- FireVibe: `scope="col"` th, input/button `aria-label`'ları, drawer `role="dialog" aria-label`, context menu `role="menu"` (alt butonlarda `role="menuitem"` yok — P3).
- Dashboard alerts `role="list"/"listitem"`, smart-recommendations `role="tablist"/"tab"` + aria-selected.
- Kontrast/odak davranışı canlı test edilemedi (read-only); statik işaretler olumlu. Light-audit, P0/P1 bulgu yok.

---

## 16. Visual/Design

- FireVibe: tutarlı tasarım sistemi — marka başlığı, KPI strip, legend, durum rozetleri, avatar/badge iskeleti, karanlık uyumlu SCSS değişkenleri, published pill. En yüksek ürün-polish yüzeyi.
- Workspace: skor şeridi, panel sekmeleri, sürüm farkı, publish diyaloğu (uyarı banner + istatistik grid) — profesyonel.
- Approval-center: workflow steps, compliance grid, onay/ret/yayın modal'ları — tutarlı.
- Legacy yüzeyler (performance, smart-recommendations, kpi-overview, enterprise/*) aynı tasarım dilini paylaşır ancak veri demo/hardcoded (aşağıdaki bulgular).
- Build budget ihlalleri (firevibe.scss 23 kB, initial bundle 626 kB) → **FINDING F-10.**

---

## 17. Differentiation

- **Güçlü:** aylık ızgara UX'i (drag-tray, çoklu vardiya slotları, override, cihaz-kapalı toggle, cross-day scroll, klavye), DDD workspace (canlı doğrulama paneli, sürüm çakışması yönetimi, adalet/performans panelleri), backend risk motoru (ScheduleAlertService) + websocket.
- **Zayıf:** üç analitik yüzey "canlı ürün" sunarken statik/hardcoded veri gösteriyor ("AI destekli", "Compliance Engine" etiketleri gerçek motor çağrısı değil); FireVibe nav'da yok ve statü etiket haritası enum'dan sapmış. Bunlar demo/üretim algısını zedeler → F-2/F-5/F-6/F-7.

---

## 18. Previous Findings — Revalidation

| # | Finding | Status (canonical) | Evidence |
|---|---|---|---|
| 1 | F1 empty-month dead-end | **RESOLVED / F1 CLOSED** | seed mapper closure :1798-1810, typed signal :256, CTA html:217-219 |
| 2 | Approval-center "Yayınla" ghost modal | **RESOLVED (canonical'da mevcut)** | modal markup :272-281, `showPublishModal` :397, `publish()` :503 |
| 3 | Hardcoded compliance/demo data | **CONFIRMED** | approval-center :403-408; performance :426-431; smart-recommendations :160-167 |
| 4 | Lifecycle label mismatch (`submitted` vs `under_review`) | **CONFIRMED** | firevibe ts:904-916 vs domain/enums:64/82; scheduling models:1 |
| 5 | Device-off vs unit-closed ayrımı | **CONFIRMED (iyi)** | distinct css/UI, drop blocked her iki tip |
| 6 | Coverage/conflict explainability | **CONFIRMED (iyi)** | conflict-view/panel context, coverage-view, FireVibe drawer warnings |
| 7 | Personnel availability affordance | **PARTIALLY CONFIRMED** | İZ/RP badge + drawer tags; önleyici görsel yok |
| 8 | Published lock UX | **PARTIALLY CONFIRMED** | workspace doğru (isEditable + publish-dialog gate); FireVibe yarım (F-3) |
| 9 | Mobile dense grid | **PARTIALLY CONFIRMED** | mobile-day-view, FireVibe zoom; kapalı gün açıklaması yok (F-8) |
| 10 | Dashboard critical-risk | **CONFIRMED (backend-driven)** | /analytics/dashboard + ScheduleAlertService |
| 11 | Visual/product differentiation | **CONFIRMED**; demo-data yüzeyleri canlı algısı kırıyor | F-5/F-6/F-7 |

---

## 19. Findings Summary (Canonical)

### P1

**F-1 — FIELD_SUPERVISOR, FE'de kendisine açık yüzeylerden kilitli (FE/BE rol eşik tutarsızlığı)**
- Area: Role UX / RBAC
- Status: CONFIRMED
- Canonical file(s): `app.routes.ts:139,149,160,189,200,211,222,233,244,255,284,333,344,364,375,388,399,421,432,443,454,465,476,487,498,508` (tümü `roleGuard minRole:'supervisor'`); `guards/auth.guard.ts:6-21` (field_supervisor=450); `layouts/main-layout/main-layout.component.ts:283-291`; BE `backend/src/guards/min-role.ts:36` (`FIELD_SUPERVISOR = MEDICAL_ENGINEER(400)`), `modules/supervisor-center/supervisor-center.controller.ts:29` (@Roles FIELD_SUPERVISOR), `modules/supervisor/supervisor.controller.ts:25`.
- Evidence: FE eşiği `supervisor=500`; FE `hasMinRole('field_supervisor','supervisor')` = 450≥500 → false. Backend aynı endpoint'leri FIELD_SUPERVISOR(400) seviyesinde açar. `auth.guard.ts` ROLE_HIERARCHY ile `min-role.ts` değerleri backend'le birebir aynıdır (450/500) — fark FE guard'larının `'supervisor'` eşiğini kullanmasından.
- User impact: Saha sorumlusu (first-class rol, v20/v21/v22 migration'ları) onay merkezi, süpervizör panosu, rapor, performans, denetim, şirket uygulamalarına FE'de giremez; yalnızca kendi birim planı + guard'sız sayfalar.
- Security/RBAC impact: Erişim hapları BE'de doğru, FE'de dar — yetki aşımı değil, **erişim engeli**; rol stratejisi yarım işlevli.
- Recommended next phase: FE guard + nav hiyerarşisinde `FIELD_SUPERVISOR` min seviyesi tanımla (backend MinRole ile hizalan), field_supervisor için süpervizör yüzeylerinin nav görünürlüğü + unit-scope filter ekle.

### P2

**F-2 — FireVibe status label haritası enum'dan sapmış: `submitted` (ölü anahtar) + eksik `under_review`/`generated`/`validated`**
- Canonical: `firevibe-schedule.component.ts:904-916` vs `domain/enums/index.ts:64,82`; `scheduling/models/schedule.models.ts:1`.
- User impact: status pill'de ham İngilizce gösterim; `submitted` asla eşleşmez. `approved`/`draft`/`published` doğru kaldığı için günlük akışta düşük görünürlük ama yanlış.
- Recommended: mapa `under_review: 'İncelemede'` ekle, `submitted`'ı kaldır (scheduling models'teki 8'li ile tek kaynağa bağla).

**F-3 — FireVibe'de published-lock yetersiz: yayın sonrası grid düzenlenebilir kalır**
- Canonical: html:130 (yalnızca "Yayınla" butonu gizlenir); ts:1289-1293 `canRemove` status check'siz; ts:1267-1287 `removeFromDrawerCell` status/role check'siz; hücre assign/drop/override/device-off/izin/mesai yayın durumunu denetlemez (yalnızca `isClosed||isDeviceOff`).
- User impact: published plan üzerinde UI izin verir → backend `5c17 published-mutation-gate` reddeder → kullanıcıya hata toast'ları; "yayınlandı/kilitli" hissi yok.
- Recommended: workspace store `isEditable` semantiğini FireVibe'a taşı (published/archived → read-only grid + banner).

**F-4 — FireVibe: nav'da link yok ve guard yok**
- Canonical: main-layout grep → 0 eşleşme; `app.routes.ts:131-136` guard'sız.
- Impact: keşfedilebilirlik yok (doğru URL gerekir); alt roller için tutarsız erişim sunumu (backend read = VIEWER/guest tabanlı, yani veri sızıntısı değil ama yüzey kılavuzuyla çelişir).
- Recommended: nav item ekle + roleGuard(minRole:'supervisor') veya BE ile uyumlu eşik; mutations FE'de tutarlı gate'le (öneri: F-1/F-3 ile birlikte).

**F-5 — "Akıllı Öneriler" tamamen hardcoded + ölü butonlar**
- Canonical: `smart-recommendations.component.ts:160-167` (6 statik öneri, sahte isimler, statik `createdAt`), subtitle "Yapay zeka destekli" (:28), `Uygula`/`X` butonları **hiçbir handler içermez** (template :91-94).
- Impact: ürün canlı motor varmış gibi davranır; "Uygula" tıklanınca hiçbir şey olmaz. İntegriti/algı kırıcı.
- Recommended: ya gerçek `recommendation-engine` çağrısı bağla ya da butonları kaldır/placeholder'et.

**F-6 — "Performans" sayfası hardcoded metrikleri canlı KPI gibi sunuyor**
- Canonical: `performance.component.ts:421` `api` inject (kullanılmıyor), `:426-431` 5 birim sabit metrik, `:434-442` May-2026 sabit trend serisi.
- Impact: süpervizörün karar verdiği performans verisi demo veridir.
- Recommended: backend `/analytics/dashboard` benzeri endpoint'ten besle veya "örnek veri" etiketi ekle.

**F-7 — Approval-center compliance checks hardcoded**
- Canonical: `approval-center.component.ts:403-408` — 4 statik kontrol, biri sabit `passed:false` ("Adalet Eşiği" → Başarısız).
- Impact: onay ekranında "Başarısız" görünen bir denetim satırı gerçek hesaplama değil; kullanıcı kararı etkilenebilir.
- Recommended: `validationResult`/`ScheduleAlertService` ile besle veya kaldır.

### P3

- **F-8** — `mobile-day-view.component.ts:31-33`: kapalı/cihaz-kapalı günler jenerik "atama bulunmuyor" gösterir.
- **F-9** — `ngsw-config.json:32-143` dataGroup URL'leri `/api/...` iken runtime `/api/v1/...` (`schedule.service` baseUrl / interceptor'lar) → PWA offline cache eşleşmez.
- **F-10** — Build budget ihlalleri: initial bundle 626.87kB/400kB; `firevibe-schedule.component.scss` 23.04kB/12kB; `plan-page.component.scss` 24.17kB/12kB; `employees.component.scss` 16.66kB/12kB.
- **F-11** — `main-layout/main-layout.component.ts:332-337`: `employees/reports/settings` her rol için `visible:true` ancak guard'lar engeller → dead-end nav (route redirect `/app/dashboard`).
- **F-12** — Status enum çoğaltması: `domain/enums` (6) / `scheduling/models` (8) / approval-center'da `review` eş anlamlı etiket (`approval-center.component.ts:524,540`) — etiket sapmaları F-2 ailesini besler.
- **F-13** — FireVibe context menu `role="menu"` alt elemanları `role="menuitem"` değil (html:627-668) — hafif a11y iyileştirme.

---

## 20. Recommended Next Phase

**NEXT PHASE = RC-3 (Saha Rolü / Erişim Hizalaması + Demo-Verisi Temizliği)**
- 1) **P1 F-1:** FE guard'larına backend `MinRole` semantiğiyle hizalı `FIELD_SUPERVISOR` seviyesi ekle; field_supervisor nav/görünürlük + unit-scope filtre. (Backend zaten hazır.)
- 2) **P2 F-3/F-4:** FireVibe'a published/archived read-only modu + nav/guard; F-2 statü etiket düzeltmesi (tek kaynak).
- 3) **P2 F-5/F-6/F-7:** hardcoded analitik yüzeyleri gerçek API/engine ile bağla ya da açıkça "örnek veri" etiketle + ölü butonları kaldır.
- 4) **P3** paketi: F-8 mobile kapalı-gün açıklaması, F-9 ngsw `/api/v1` hizası, F-10 CSS/JS budget, F-11 nav dead-end, F-13 menuitem roles.

NOT: Bu oturumda implementation yapılmadı (READ-ONLY). F1 regresyonu yok; canonical baseline 97/1066 PASS'tır.

---

**Final çıktı:**
```
RC-2 CANONICAL PRODUCT AUDIT COMPLETE
AUTHORITATIVE REPOSITORY VERIFIED
F1 VERIFIED CLOSED

P0 = 0
P1 = 1
P2 = 6
P3 = 6

NEXT PHASE = RC-3 (Saha Rolü / Erişim Hizalaması + Demo-Verisi Temizliği)
IMPLEMENTATION = NOT STARTED
STOP
```