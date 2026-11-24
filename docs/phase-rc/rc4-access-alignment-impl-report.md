# RC-4 — FIELD_SUPERVISOR Erişim Hizalaması (IMPLEMENTATION) + Demo Verisi Temizliği

- **CDNS:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem` (AUTHORITATIVE)
- **Non-canonical (hiç kullanılmadı):** `C:\Users\Hasan\OneDrive\Belgeler\GitHub\vardiyasystem`
- **Mod:** IMPLEMENTATION — kod değişikliği yapıldı (yalnızca FE; BE dokunulmadı)
- **Tarih:** 2026-09-21

---

## 1. Executive Summary

RC-4 baseline **GREEN** (yeniden koşuldu: FE build/typecheck PASS, BE 97/1066 test PASS, BE tsc PASS). P1 erişim hizalaması **TAMAMLANDI**, demo/misleading veri temizliği (P2-02) **TAMAMLANDI**, FireVibe yayın kilidi + yaşam döngüsü sözlüğü (P2-01) **TAMAMLANDI**, P2-07 (legacy/DDD onay ayrışması) **BLOCKED-SUBITEM** olarak raporlandı (kanonik sözleşme/yetki belirlenemedi; sonraki faz kararı).

- **P1 konfigüre edildi:** `app.routes.ts` içinde 12 yüzey `minRole:'supervisor'` → `'field_supervisor'` (backend `MinRole.FIELD_SUPERVISOR=400` ile birebir eşik eşleşmesi, FE `field_supervisor`=450). Açılış kuralı: yalnızca backend karşılığı FIELD_SUPERVISOR(400)/VIEWER düzeyinde doğrulanan yüzeyler değiştirildi; 15 yönetici yüzeyi `'supervisor'` korundu.
- **P1 nav hizalandı:** `main-layout.component.ts` `isSupervisor`/`isManager` kaldırıldı → `hasSupervisorSurfaces` (`hasMinRole(...,'field_supervisor')`), tüm nav görünürlükleri route guard eşiğiyle aynı mantıktan türetildi.
- **P2-02:** approval-center compliance şeridi sahte `{passed:…}` sabitinden gerçek `GET /schedule/:id/alerts` türetimine geçti; performance sabit May-2026 metrikleri + sahte trend kaldırılıp gerçek `/analytics/overview` ile değiştirildi; smart-recommendations 6 statik "Engine" önerisi kaldırılıp gerçek `/recommendations` GET + `apply`/`dismiss` POST bağlandı, "Yapay zeka destekli" başlığı dürüst metinle değiştirildi.
- **P2-01:** FireVibe statü sözlüğü düzeltildi (`submitted` → `under_review`), `publishedLocked` + `guardLocked()` tüm mutasyon işleyicilerine eklendi; drawer "Personel Ata" bölümü + context menü ve sağc/stil eklendi.

**Sayılar:** P0=0 · P1=1 (12 yüzey + nav) · P2 işlenen=4 · P2-07 (BLOCKED) · P3 değişiklik yok.

**Durum:** IMPLEMENTATION = **COMPLETED** (istisna: P2-07 kayıtlı BLOCKED-SUBITEM, yeni fazda karar). IMPLEMENTATION STOP koşulu sağlandı; rapor sonundaki `RC-4 COMPLETE` blokuna bakın.

---

## 2. Repository Identity

`git rev-parse --show-toplevel` → `C:/Users/Hasan/OneDrive/Desktop/vardiyasystem` ✅

Dirty ağaç korundu — hiçbir `reset`/`clean`/`checkout`/`force-push` yapılmadı. İzlenen ağaç minimal (bootstrap dosyaları); `frontend/src/`, `backend/src/` zaten untracked durumda, değişiklikler kategori içinde kaldı.

---

## 3. RC-4 Baseline (yeniden koşuldu — 2026-09-21)

| Gate | Sonuç |
|---|---|
| FE BUILD `npm run build` | **PASS** (exit 0; yalnızca halihazır budget WARNING'leri) |
| FE TYPECHECK `npm run typecheck` | **PASS** (exit 0) |
| BE TEST `npm test` | **PASS** — 97 files / 1066 tests, exit 0 |
| BE TSC `npx tsc --noEmit` | **PASS** (exit 0) |

**RC-4 BLOCKED DEĞİL** (BASELINE REGRESSION yok).

---

## 4. P1 — Route Guard Hizalaması (impl)

Kural (Section 4/5): yalnızca backend karşılığı `MinRole.FIELD_SUPERVISOR`(400) veya daha geniş olan yüzeyler açıldı; backend'de SUPERVISOR+ olanlar korundu.

Değiştirilen 12 yüzey (`app.routes.ts`, `minRole:'field_supervisor'`):

| Yüzey | Route bloğu | BE karşılığı doğrulama |
|---|---|---|
| supervisor-center | `supervisor-center` | saha sorumlusu çalışma alanı (RBAC) |
| enterprise/assets | `enterprise/assets` | asset read V / write SV+ (asset mgmt) |
| assets | `assets` | yukarıdaki ile aynı alan |
| assets/:id | `assets/:id` | yukarıdaki ile aynı alan |
| enterprise/biomedical | `enterprise/biomedical` | biomedikal izleme (field-supervisor seviyesi) |
| enterprise/consumables | `enterprise/consumables` | sarf yönetimi (field-supervisor seviyesi) |
| enterprise/procurement | `enterprise/procurement` | satın alma taslakları (field-supervisor seviyesi) |
| enterprise/contracts | `enterprise/contracts` | sözleşme görüntüleme (field-supervisor seviyesi) |
| enterprise/suppliers | `enterprise/suppliers` | tedarikçi listesi (field-supervisor seviyesi) |
| enterprise/quality | `enterprise/quality` | kalite kayıtları (field-supervisor seviyesi) |
| enterprise/radiation-safety | `enterprise/radiation-safety` | radyasyon güvenliği (field-supervisor seviyesi) |
| enterprise/inventory | `enterprise/inventory` | envanter sayımı (field-supervisor seviyesi) |

Korunan 15 yönetici yüzeyi (backend SV+ karşılığı, `'supervisor'` kaldı): schedules/workspace, duty-roster, employees(+`personnel.read`), reports, performance, fairness, audit, trainings, skills, approval-center, management-dashboard, shifts, command-center, kpi-overview, smart-recommendations.

> Genel prensip anımsatıcı (rapor): FE threshold `'field_supervisor'`=450 ≥ BE `MinRole.FIELD_SUPERVISOR`=400. Açılan yüzeyler backend tarafında FIELD_SUPERVISOR düzeyinde halkalı olduğu için `>=` semantiği altında FE eşiği **backend'den sıkı değil** ve **backend'den gevşek değil** — otorite backend'dedir (P1 amaca uygun: saha sorumlusu üretken yüzeylere ulaşır, veri erişimi unit-gated).

---

## 5. P1 — Ana Menü Hizalaması (impl)

`main-layout.component.ts`:
- `injectRole()`/bağımlı `isSupervisor`, `isManager` computeds kaldırıldı.
- `hasSupervisorSurfaces = computed(() => hasMinRole(this.user()?.role ?? '', 'field_supervisor'))` eklendi (route guard ile aynı eşik).
- Nav `visible: this.isSupervisor()` (7x) ve `visible: this.isManager()` (4x) → `visible: this.hasSupervisorSurfaces()`.

Sonuç: menü görünürlüğü route erişimiyle ayrışmıyor (nav'da görünen → route'a girilebilir; FS seviyesi FSE eşiği ile senkron).

---

## 6. P2-01 — FireVibe Yayın Kilidi + Yaşam Döngüsü Sözlüğü (impl)

- **Statü sözlüğü:** `submitted` etiketi kaldırıldı, `under_review: 'İncelemede'` eklendi; draft/approved/published/rejected/archived korundu (backend `ScheduleStatus` v1 ile eşleşir).
- **`publishedLocked()`** = status `published` | `archived` (backend `isPublished` semantiği 1:1).
- **`guardLocked()`** → `notification.warning('Plan Kilitli', 'Yayınlanmış/arşivlenmiş plan değiştirilemez.')`.
- **Guard eklenen mutasyon işleyicileri:** `toggleOverride`, `assignTo`, `applyInverse`, `removeFromDrawerCell`, `onToggleDeviceOff`, `toggleLeaveSelected`, `toggleOvertimeSelected`, `deleteSelected`; `canRemove` compose'u `!publishedLocked()`; `publish()` eski `=== 'published'` kontrolü `publishedLocked()` merkezileştirildi.
- **UI:** drawer "Personel Ata" bölümü `@if (!publishedLocked())` ile gizlenir; drawer üstüne kilit notu; context menüde kilitli iken devre dışı satır; `fv-locked-note` / `fv-context-disabled` stilleri.

Backend zaten yetkili (5c17 gate 409): buradaki iş UI kilidi — uçtan uca kanıt `schedules.controller` yayın (PLANNER) / mutasyon (FS±) ile sınırlı.

---

## 7. P2-02 — Demo Verisi Temizliği (impl)

### 7.1 approval-center — gerçek compliance
- `complianceChecks[]` sabit 4 kalem silindi; `signal<ComplianceCheck[]>` (label/passed/detail) tanımlandı.
- `loadCompliance(schedule.id)` → `scheduleApi.getScheduleAlerts(id)`; uyarılar `type` bazında gruplanır, `severity ∈ {warning, critical}` varlığına göre `passed` hesaplanır, label eşleme TR (`missing_staff`→"Personel Eksikliği", …), boşsa "İhlal kaydı bulunmuyor.".
- Template'e ihlal/eylem detay satırı (`compliance-detail`) eklendi.

### 7.2 performance — gerçek overview
- Sabit 5 birim metrik + 7 günlük 2026-05 trend dizisi silindi, kullanılmayan `ApiService` import kaldırıldı.
- `getAnalyticsOverview({month,year})` (mevcut `schedule.service` helper'ı) bağlandı; `unitOccupancy` → birim bazlı kapsama kartları (rate %, assigned/total), `nightDistribution` → "Gece Vardiyası Dağılımı" çizelgesi (3 renk: gece/gündüz/akşam), özet satırı `nightShiftRatio`/`monthlyOvertime`/`busiestUnit`/`missingShifts`/`totalPersonnel`/`totalShifts`.
- Backend'de kaynağı olmayan metrikler (verimlilik, yorgunluk, adalet, uyum skoru, günlük trend) **üretilmedi** — UI gerçek veriyle sınırlı; period select aylık dönem etiketiyle değiştirildi.

### 7.3 smart-recommendations — gerçek API + dürüst metin
- 6 statik "Fatigue/Coverage/Fairness/Training/Compliance Engine" önerisi silindi.
- `GET /recommendations` bağlandı; DTO → FE model eşleme: priority lowercase, `impact*` numerikler işaretli string'e, `suggestedActionData` varlığı `actionable`, `createdAt` 'tr-TR' tarih, `source` = "Sistem · <tür>" (motor iddiası yok).
- `Uygula`/`X` ölü butonları `POST /recommendations/:id/apply` / `/dismiss`'a bağlandı; yüklenirken disable + geri bildirim (success/error notification), 403 rol eksikliği durumunda hata mesajı.
- Başlık: "Yapay zeka destekli vardiya optimizasyon önerileri" → "Kural ve analiz motoru tarafından üretilen vardiya optimizasyon önerileri".

**Sınıflandırma (Section 14 etiketleri):** approval-center compliance = **REAL API DATA** (kimlik: `/schedules/:id/alerts`); performance = **REAL API DATA** (`/analytics/overview`, çift len: occupancy+nightDistribution); smart-recommendations = **REAL API DATA** + **CONFIGURATION seed** (öneri kaynağı; eylemler backend denetimli). Kaldırılan her şey **DEAD CODE / MISLEADING DATA** idi.

---

## 8. P2-07 — Legacy/DDD Onay/Yayın Ayrışması (BLOCKED-SUBITEM)

**Kanıtlar:**
- legacy `approve`/`reject`: `@Roles(MinRole.HEAD_TECHNICIAN)` (schedules.controller ~516-529) + runtime `canApprove` (models/schedule-status.ts:171-174 → `[IMAGING_DIRECTOR, SUPERVISOR, system_admin, hospital_admin]`).
- YENİ bulgu: runtime `canApprove` başteknisyen(300) ve proje yöneticisini **fiilen engelliyor** (decorator 300 ile giriş verir, runtime reddeder) — iki kontrolde eşitsizlik.
- DDD `approve/reject/publish/archive`: `@Roles(IMAGING_DIRECTOR)` (schedules-ddd controller).
- İki yüzey de aktif; hangisi kanonik olduğu tanımlı değil; hiçbir `.spec.ts` bu MinRole değerlerini sabitlemiyor.

**Karar:** Güvenlik-koruyucu kanonik seçilemiyor (daraltma canlı davranışı değiştirir; genişletme tahmin). RC-3/Section 10 kuralı gereği kod değişikliği YAPILMADI, **BLOCKED-SUBITEM** olarak sonraki faz kararına devredildi. Önerilen inceleme: hangi plan akışının (legacy workspace vs DDD) üretimde kullanıldığı netleştirildikten sonra tek kanonik eşik + runtime/decorator eşitsizliğinin kapatılması.

---

## 9. Güvenlik/Beklenti Regresyon Matrisi (Section 9 senaryoları)

| Senaryo | Beklenen | Durum |
|---|---|---|
| SUPERVISOR yönetici yüzeyleri | `'supervisor'` routed yüzeylere erişir | ✔ korundu (fe eşiği backend SV ile uyumlu) |
| FIELD_SUPERVISOR kendi birimine | 12 açık yüzey erişir; unit data gated | ✔ route + unitAccessGuard + backend scoping |
| FS başka birime veri/mutasyon | Veri deny / mutasyon deny | ✔ backend `UnitScopeGuard` + read-scope deny (değişmedi) |
| FS başka org | deny (fail-closed NULL-org) | ✔ backend tenant middleware (değişmedi) |
| Yetkisiz rol (analiz personeli vs.) | açık yüzeylere FE `roleGuard` reddi | ✔ FE eşik hiyerarşisi ≥450 |
| Kimliği doğrulanmamış | yönlendirme | ✔ FE authGuard (değişmedi) |
| FireVibe published plan mutasyonu | BE 409 (5c17) + FE kilit+uyarı | ✔ yeni `guardLocked` tüm mutatörler |
| Öneri/yayın POST yetkisi | HEAD_TECH/ID yetkisiz kullanıcı 403 | ✔ FE hata bildirimi; BE denetim değişmedi |

---

## 10. Regresyon Sonuçları (RC-4)

| Gate | Komut | Sonuç |
|---|---|---|
| FE TYPECHECK | `npm run typecheck` | **PASS** (exit 0) |
| FE BUILD | `npm run build` | **PASS** (exit 0, iki kez doğrulandı) |
| BE TEST | `npm test` | **PASS** — 97 files / 1066 tests (334.12s) |
| BE VITEST | `npx vitest run --pool=forks` | **PASS** — 97 files / 1066 tests (251.03s) |
| BE TSC | `npx tsc --noEmit` | **PASS** (exit 0) |

hiçbir ignore/skip/threshold değişikliği yapılmadı; BE hiçbir dosyada değiştirilmedi.

---

## 11. Nihai Durum

- IMPLEMENTATION = **COMPLETED** (yalnızca P2-07 BLOCKED-SUBITEM kaydedildi).
- FireVibe published servis düzeyinde zaten kilitliydi (5c17): FE kilit arayüz katmanıydı — tamamlandı.
- Git: korundu; commit/push yapılmadı (talep yok).

---

## 12. RC-4 COMPLETE

`RC-4 COMPLETE`

`REASON = BASELINE GREEN + P1 FE-NV ALIGNED + P2-01 PUBLISHED LOCK + P2-02 DEMO CLEANED (3 surfaces)`

- `IMPLEMENTATION = COMPLETED` — P1: 12 route guard `field_supervisor` + nav senkron; P2-01: FireVibe under_review sözlüğü + published/archived kilit; P2-02: approval-compliance /analytics-overview /recommendations üzerinden gerçek veri.
- `BLOCKED SUBITEMS` = `P2-07 legacy/DDD onay eşiği ayrışması (kanonik belirsiz, kodda değişiklik yok)`.
- `VERIFICATION = FE typecheck 0, FE build 0, BE 1066/1066 (npm test + vitest forks), BE tsc 0 — ignore/skip/threshold dokunulmadı`.
- `NEXT PHASE = P2-07 kanonik onay/yayın eşiği kararı (legacy vs DDD üretim kullanımı netleşince); P3 backlog (duty-roster senior_technician, discoverability, a11y, mobil) + PWA prefix eşleşmesi`.

`STOP`