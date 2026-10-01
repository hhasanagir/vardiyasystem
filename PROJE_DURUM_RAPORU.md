# VardiyaOS — Proje Durum Raporu

**Tarih:** Mayıs 2026
**Proje:** Enterprise Radyoloji Vardiya Planlama Sistemi (SaaS)
**Hedef:** Türk hastaneleri için MR, BT, Röntgen, Nükleer Tıp ve Radyasyon Onkolojisi birimlerinde personel vardiya çizelgeleme, onay iş akışı, denetim günlüğü ve gerçek zamanlı senkronizasyon.

---

## 1. Mimari Genel Bakış

### Frontend (Angular 19+)

- **Mimari:** Standalone bileşenler, Signals state yönetimi, functional HTTP interceptors
- **Tema:** Koyu tema, özel CSS (PrimeNG yalnızca tema için yapılandırılmış, UI bileşenleri kullanılmıyor)
- **State:** `signal()` / `computed()` tabanlı, servis katmanında reactive state
- **Router:** Lazy-loading ile feature bazında yükleme

### Backend (NestJS)

- **ORM:** Prisma (PostgreSQL)
- **Auth:** JWT tabanlı, refresh token mekanizması
- **WebSocket:** Socket.io (`/realtime` namespace) — presence, edit lock, concurrency
- **Denetim:** Append-only audit log, şüpheli aktivite tespiti

---

## 2. Tamamlanan İş Akışları

### Vardiya Tipleri

| Birim                | Vardiya Yapısı                                 |
| -------------------- | ---------------------------------------------- |
| MR                   | 2 vardiya (Gündüz 08-20, Gece 20-08)           |
| BT                   | 2 vardiya (Gündüz 08-20, Gece 20-08)           |
| Röntgen              | 2 vardiya (Gündüz 08-20, Gece 20-08)           |
| Nükleer Tıp          | 1 vardiya poliklinik (hafta sonu/tatil kapalı) |
| Radyasyon Onkolojisi | 3 seans (Sabah + İkindi + Gece)                |

### Schedule Durum Makinesi

```
DRAFT → UNDER_REVIEW → APPROVED → PUBLISHED → ARCHIVED
                  ↓            ↻ (reject)
              REJECTED
                  ↓ (resubmit)
                DRAFT
```

**Rol Bazlı Yetkilendirme:**

- `PROJECT_MANAGER`: Yayınlama, arşivleme, tüm onaylar
- `HEAD_TECHNICIAN`: Onaylama, reddetme
- `SUPERVISOR` / `FIELD_SUPERVISOR`: İncelemeye sunma
- `TECHNICIAN` / `STAFF`: Okuma, atama

---

## 3. Gerçekleştirilen Tüm Çalışmalar

### 3.1 Derleme Hatalarının Giderilmesi (Önceki Oturumlar)

**Frontend (20+ TS hatası düzeltildi):**

- `schedule-api.service.ts`: Eksik rxjs importları eklendi (`map`, `catchError`, `tap`, `finalize`, `throwError`); 14 metodun tamamında sessiz `of(null)` / `of([])` dönüşleri kaldırıldı, yerine `throwError` + `console.error` + notification eklendi
- `schedule.service.ts`: 6 sessiz `of([]/null)` dönüşü `throwError` ile değiştirildi
- `dashboard.service.ts`: 5 sessiz `of(null)` dönüşü `throwError` ile değiştirildi
- `core.module.ts`: HttpClient registration `importProvidersFrom(HttpClientModule)` ile düzeltildi

**Backend (20+ TS hatası düzeltildi):**

- `actions.service.ts`: PrismaService injection düzeltildi, tablo adları düzeltildi
- `conflicts.service.ts`: Raw SQL kaldırıldı, Prisma sorguları ile yeniden yazıldı
- `rebalance-engine.service.ts`: PrismaService injection düzeltildi
- `recommendations.service.ts`: Tüm analyzer'lar (fatigue/fairness/coverage) yeniden yazıldı
- `audit-log.service.ts`: `TimelineSummary` export edildi
- `schedule.gateway.ts`: Strict TS hataları giderildi (non-null assertions, optional property guard)

### 3.2 WebSocket Altyapısı

- `websocket.module.ts` oluşturuldu: PresenceService, EditLockService, ConcurrencyService
- `app.module.ts`'e register edildi
- Frontend `websocket.service.ts` yeniden yazıldı: JWT auth, exponential-backoff reconnect (30s), heartbeat, lock management, presence/typing metodları
- `PresenceService`: `isTyping` ve `cursorPosition` property'leri eklendi

### 3.3 Auth & Interceptor İyileştirmeleri

- Auth interceptor: `localhost:3000` gate kaldırıldı — token tüm isteklere ekleniyor
- Retry mekanizması: GET/5xx için 2 kez exponential delay ile yeniden dene
- Mutation'lar (POST/PUT/DELETE/PATCH) asla retry edilmez — fail fast + notification
- Tüm hatalar console'a URL, method, status ile loglanır
- `auth.interceptor.ts`: Class-based → functional `HttpInterceptorFn` dönüşümü
- `error.interceptor.ts`: ErrorInterceptor/RetryInterceptor → functional `errorInterceptor` dönüşümü

### 3.4 Prisma Şema Düzeltmeleri

- User → recommendations ve resolvedConflicts reverse relation'ları eklendi
- Prisma client yeniden oluşturuldu

### 3.5 Ortam Yapılandırması

- `src/environments/environment.ts` (yetim dosya) silindi
- Tüm importlar `src/app/environments.ts`'e yönlendirildi
- `wsUrl`: `http://` → `ws://`, port `3001` → `3000`
- `angular.json` fileReplacements: `src/app/environments.ts` ↔ `src/app/environments.prod.ts`

### 3.6 Denetim Zaman Çizelgesi (Phase 7)

- **Model:** `src/app/domain/models/audit-log.ts` — `AuditLogEntry`, `AuditChange`, `TimelineSummary`, `TimelineResponse`
- **Bileşen:** `audit-timeline.component.ts` — tarih/işlem tipi filtreleri, özet kartları (toplam, bayraklanan, kullanıcı, varlık), renk kodlu zaman çizelgesi, değişiklik detayları, flag/unflag
- **API:** `loadAuditTimeline()` metodu `GET /audit-logs/timeline`
- **Route:** `/app/audit`
- **Navigasyon:** SİSTEM → Denetim

### 3.7 Onay Merkezi (Phase 8)

- **Bileşen:** `approval-center.component.ts` — bekleyen onay listesi (sidebar), schedule detayı, versiyon zaman çizelgesi, diff görüntüleyici (eklenen/silinen/değişen atamalar), onayla/reddet diyalogları, yayınlama butonu
- **API:** `compareVersions()` metodu `GET /schedules/:id/compare?from=X&to=Y`
- **API Düzeltmesi:** `loadPendingApprovals()` endpoint'i `/approvals/pending` → `/schedules/pending-approvals`
- **Route:** `/app/approval-center`
- **Navigasyon:** OPERASYONLAR → Onay Merkezi

### 3.8 Yayınlama Onay Modalı

- `PublishConfirmModalComponent` — `ConfirmModalComponent`'i saran, yayınlamaya özel uyarı metni ve onay akışı

### 3.9 Stale State Algılama

- `StaleStateIndicatorComponent` — renk kodlu güncellik göstergesi (yeşil/sarı/kırmızı) + yenile butonu
- `StaleStateBannerComponent` — veri güncel değilse beliren uyarı banner'ı
- Ana layout'a entegre edildi (`lastSyncTime` signal + `refreshData()` metodu)

### 3.10 Import Yolu Düzeltmeleri

- `schedule-api.service.ts`: `../../core/api/api.service` → `../core/api/api.service`
- `schedule-api.service.ts`: `../../domain/enums` → `../domain/enums`
- `schedule-api.service.ts`: `../../domain/models` → `../domain/models`

---

## 4. API Endpoint Haritası

### Schedule İş Akışı

| Metot | Endpoint                           | Açıklama               |
| ----- | ---------------------------------- | ---------------------- |
| GET   | `/schedules`                       | Filtreli liste         |
| GET   | `/schedules/pending-approvals`     | Onay bekleyenler       |
| GET   | `/schedules/:id`                   | Detay                  |
| GET   | `/schedules/:id/versions`          | Versiyon geçmişi       |
| GET   | `/schedules/:id/versions/:version` | Belirli versiyon       |
| GET   | `/schedules/:id/compare?from=&to=` | Versiyon karşılaştırma |
| GET   | `/schedules/:id/audit`             | Denetim günlüğü        |
| POST  | `/schedules/:id/submit`            | İncelemeye sun         |
| POST  | `/schedules/:id/approve`           | Onayla                 |
| POST  | `/schedules/:id/reject`            | Reddet                 |
| POST  | `/schedules/:id/publish`           | Yayınla                |
| POST  | `/schedules/:id/archive`           | Arşivle                |
| POST  | `/schedules/:id/rollback/:version` | Geri al                |
| POST  | `/schedules/:id/revision`          | Revizyon oluştur       |

### Denetim Günlüğü

| Metot | Endpoint                 | Açıklama               |
| ----- | ------------------------ | ---------------------- |
| GET   | `/audit-logs`            | Filtreli sorgu         |
| GET   | `/audit-logs/timeline`   | Zaman çizelgesi + özet |
| GET   | `/audit-logs/statistics` | İstatistikler          |
| GET   | `/audit-logs/suspicious` | Şüpheli aktivite       |
| GET   | `/audit-logs/flagged`    | Bayraklananlar         |
| POST  | `/audit-logs/:id/flag`   | Bayrakla               |
| POST  | `/audit-logs/:id/unflag` | Bayrağı kaldır         |
| GET   | `/audit-logs/export/pdf` | PDF dışa aktar         |
| GET   | `/audit-logs/export/csv` | CSV dışa aktar         |

### Gerçek Zamanlı (WebSocket)

| Olay                   | Yön | Açıklama               |
| ---------------------- | --- | ---------------------- |
| `schedule:heartbeat`   | →   | Canlılık sinyali (30s) |
| `schedule:lock`        | ↔   | Düzenleme kilidi       |
| `schedule:unlock`      | ↔   | Kilit bırakma          |
| `schedule:extend-lock` | →   | Kilit uzatma (2dk)     |
| `presence:online`      | ←   | Kullanıcı çevrimiçi    |
| `presence:offline`     | ←   | Kullanıcı çevrimdışı   |
| `presence:typing`      | ↔   | Yazma durumu           |
| `schedule:updated`     | ←   | Program güncellendi    |
| `schedule:published`   | ←   | Program yayınlandı     |
| `schedule:conflict`    | ←   | Çakışma uyarısı        |
| `error`                | ←   | Hata bildirimi         |

---

## 5. Route Haritası

| Path                    | Bileşen                   | Açıklama             |
| ----------------------- | ------------------------- | -------------------- |
| `/login`                | LoginComponent            | Giriş                |
| `/register`             | RegisterComponent         | Kayıt                |
| `/onboarding`           | OnboardingComponent       | Kurulum              |
| `/app/dashboard`        | DashboardComponent        | Kontrol Paneli       |
| `/app/operations`       | OperationsCenterComponent | Operasyon Merkezi    |
| `/app/live-tracking`    | LiveTrackingComponent     | Canlı Vardiya Takibi |
| `/app/mr-plan`          | PlanPageComponent         | MR Planı             |
| `/app/bt-plan`          | PlanPageComponent         | BT Planı             |
| `/app/rontgen-plan`     | PlanPageComponent         | Röntgen Planı        |
| `/app/nukleer-tip-plan` | PlanPageComponent         | Nükleer Tıp Planı    |
| `/app/onkoloji-plan`    | OnkolojiPlanComponent     | Radyasyon Onkolojisi |

| `/app/employees` | EmployeesComponent | Personel |
| `/app/leave-management` | LeaveManagementComponent | İzin Yönetimi |
| `/app/swap-requests` | SwapRequestsComponent | Vardiya Talepleri |
| `/app/reports` | ReportsComponent | Raporlar |
| `/app/performance` | PerformanceComponent | Performans |
| `/app/fairness-analysis` | FairnessAnalysisComponent | Adalet Analizi |
| `/app/approval-center` | ApprovalCenterComponent | **Onay Merkezi (yeni)** |
| `/app/audit` | AuditTimelineComponent | **Denetim (yeni)** |
| `/app/notifications` | NotificationsComponent | Bildirimler |
| `/app/settings` | SettingsComponent | Ayarlar |
| `/app/shifts` | ShiftsComponent | Vardiyalar |

---

## 6. Derleme Durumu

### Frontend

- **Module resolution:** ✅ Tüm import yolları düzeltildi
- **Functional interceptors:** ✅ `auth.interceptor.ts` ve `error.interceptor.ts` dönüşümü tamam
- **Sessiz hata yutma:** ✅ Tüm servislerde kaldırıldı (25+ metot)
- **Kalan hatalar:** `NotificationService` tip uyuşmazlığı — iki farklı servis var (`services/notification.service.ts` thin, `core/services/notification.service.ts` rich). İkincisi `error()`, `warning()`, `success()` metodlarına sahip, birincisi yok. Servislerin çoğu thin versiyonu import ediyor ama rich versiyonun metodlarını çağırıyor. **Çözüm:** Tek bir NotificationService'e birleştirme gerekiyor.

### Backend

- ✅ Tüm servisler PrismaService ile düzgün çalışıyor
- ✅ Audit log append-only
- ✅ WebSocket gateway stabil
- ✅ Şüpheli aktivite tespiti hazır

---

## 7. Eksikler & Yapılacaklar

### Yüksek Öncelik

1. **NotificationService birleştirme:** İki ayrı servis tek bir servise indirgenecek, tüm importlar güncellenecek
2. **`api.service.ts` rxjs retry fix'i:** `retry` operator'ının empty array fallback'i düzeltilecek (`[]` → `pipe()`)
3. **`ApiResponse` inconsistency:** Backend direkt veri döndürüyor, frontend `ApiResponse<T>` wrapping bekliyor. Ya backend'e global response wrapper eklenecek ya da frontend'den `ApiResponse` kaldırılacak

### Orta Öncelik

4. **ScheduleStatus enum uyumu:** Frontend `'review'` kullanıyor, backend `'under_review'` kullanıyor. Backend'de `REJECTED` var, frontend enum'ında yok
5. **`loadDashboardData` metodu:** `main-layout.component.ts`'de `getDashboardMetrics()` → `loadDashboardMetrics()` çağrısı düzeltildi ancak `departmentStatus` signal'i reactive olduğu için subscribe edilemiyor
6. **`src/app/envrionments.prod.ts` (dead file):** Silinmesi gerekiyor

### Düşük Öncelik

7. **Audit component'inde backend entegrasyonu:** Flag/unflag şu an lokal (backend çağrısı yok)
8. **Master veri:** Cihaz listeleri (`mrDevices`, `btDevices`, vs.) hala `main-layout.component.ts`'de statik array'ler
9. **Test Coverage:** E2E ve unit testleri henüz yazılmadı

---

## 8. Önemli Teknik Notlar

- **WebSocket edit lock TTL:** 5 dakika, heartbeat ile refresh, 2 dakika uzatma
- **Concurrency:** Version-based optimistic locking, otomatik snapshot oluşturma
- **AuditLog:** Append-only, metadata ile flagged/işaretlenebilir
- **Rollback:** Asla overwrite etmez, her rollback yeni bir versiyon oluşturur

- **Etiket:** Sistem genelinde `RONK` (Radyasyon Onkolojisi) kullanılır, `RÖNK` kullanılmaz

---

## 9. Klasör Yapısı (Frontend)

```
src/app/
├── core/                    # Shared core services
│   ├── api/                 # ApiService (HTTP wrapper)
│   ├── interceptors/        # auth.interceptor, error.interceptor
│   ├── services/            # Rich NotificationService
│   ├── state/               # ScheduleStore, MetricsStore, etc.
│   └── scheduling/          # Schedule engine
├── services/                # Feature services
│   ├── schedule-api.service # Tüm API çağrıları
│   ├── schedule.service     # Business logic
│   ├── dashboard.service    # Dashboard API + state
│   ├── websocket.service    # WS client
│   └── notification.service # Thin notification (import hatası var)
├── features/
│   ├── audit/               # AuditTimelineComponent (yeni)
│   ├── approval-center/     # ApprovalCenterComponent (yeni)
│   ├── dashboard/           # DashboardComponent
│   ├── operations/          # OperationsCenterComponent
│   ├── plans/               # PlanPageComponent
│   └── onkoloji/            # OnkolojiPlanComponent
├── domain/
│   ├── models/              # Schedule, ShiftAssignment, etc.
│   │   └── audit-log.ts     # Audit modelleri (yeni)
│   └── enums/               # ScheduleStatus, UnitType, etc.
├── shared/
│   ├── stale-state-indicator.component (yeni)
│   ├── stale-state-banner.component (yeni)
│   ├── publish-confirm-modal.component (yeni)
│   └── components/          # MetricCard, CalendarGrid
├── layouts/
│   └── main-layout/         # Ana layout + sidebar navigation
├── components/              # Login, register, employees, reports, etc.
└── guards/                  # auth.guard, guest.guard
```

---

## 10. Bağımlılıklar

### Frontend

- Angular 19+
- PrimeNG (tema motoru, UI değil)
- Socket.io Client
- rxjs

### Backend

- NestJS
- Prisma (PostgreSQL)
- Socket.io
- JWT (passport)
- class-validator / class-transformer

**Not:** Bu rapor, projenin Mayıs 2026 itibarıyla geldiği noktayı özetlemektedir. Kalan hatalar ve yapılacaklar 7. bölümde listelenmiştir.
