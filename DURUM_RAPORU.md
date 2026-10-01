# VardiyaOS - Proje Durum Raporu

**Tarih:** 30 Mayıs 2026
**Hedef:** Radyoloji birimleri için PWA tabanlı vardiya yönetim sistemi (teknisyen odaklı mobil dönüşüm)

---

## 1. Genel Durum

| Alan                      | Durum                                               |
| ------------------------- | --------------------------------------------------- |
| Backend TypeScript        | ✅ Derleniyor (`tsc --noEmit` temiz)                |
| Frontend TypeScript       | ✅ Derleniyor (`tsc --noEmit` temiz)                |
| Frontend Production Build | ✅ Başarılı (`ng build --configuration=production`) |
| Backend Testler           | ✅ **160 test, 18 dosya, tamamı geçiyor**           |
| Frontend Testler          | ✅ 27 test geçiyor                                  |

---

## 2. Yapılan Değişiklikler (Oturum Özeti)

Bu oturumda yapılan tüm değişiklikler, tek bir commit (`eb7a6db`) üzerine eklenmiştir (henüz commit'lenmemiş).

### 2.1. PWA Dönüşümü

| Özellik                       | Detay                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Service Worker**            | `@angular/service-worker` v21.2.9, `ngsw-config.json` ile app-shell + 5 API grubu için caching (my-shifts → cache-first 30dk, schedules → network-first 5dk) |
| **Manifest**                  | `public/manifest.webmanifest`, `display: standalone`, SVG ikonlar (72/192/512)                                                                               |
| **App İkonları**              | `public/icons/icon-{72,192,512}.svg` (maskable)                                                                                                              |
| **index.html**                | `theme-color`, `apple-mobile-web-app-capable`, `viewport-fit=cover`                                                                                          |
| **PwaService**                | `services/pwa.service.ts` — install prompt, push notification aboneliği, online/offline durumu                                                               |
| **PwaInstallPromptComponent** | Kurulum banner'ı + offline banner, slide-up animasyonu                                                                                                       |
| **Mobile Layout**             | Bottom nav (5 item), sidebar overlay <769px, iOS safe-area                                                                                                   |

### 2.2. Push Notification Altyapısı

| Özellik                  | Detay                                                            |
| ------------------------ | ---------------------------------------------------------------- |
| **VAPID Keys**           | Gerçek key pair oluşturuldu (`web-push` ile)                     |
| **Backend API**          | `POST/DELETE /api/v1/push-subscriptions` (JWT korumalı)          |
| **Backend Service**      | In-memory `Map<string, PushSubscriptionData>` (MVP için yeterli) |
| **Frontend Entegrasyon** | `PwaService` → backend'e subscribe/unsubscribe                   |
| **Test**                 | 9 unit test (push-subscriptions.service.spec.ts)                 |

### 2.3. Vardiya Başlat/Bitir (Clock In/Out)

| Özellik                | Detay                                                                                                                             |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Prisma Schema**      | `AttendanceRecord` modeli (`userId` + `date` unique)                                                                              |
| **Backend Service**    | `AttendanceService` — `getTodayStatus()`, `clockIn()`, `clockOut()`, `getMonthlyStats()`, `getHistory()`                          |
| **Backend Controller** | `GET attendance/today`, `GET attendance/history`, `GET attendance/stats`, `POST attendance/clock-in`, `POST attendance/clock-out` |
| **WebSocket**          | `attendance:status` event → `user:<userId>` room                                                                                  |
| **Frontend Service**   | `services/attendance.service.ts`                                                                                                  |
| **MyDay Component**    | "Vardiya Başlat" / "Vardiyayı Bitir" butonları, canlı süre sayacı                                                                 |
| **Test**               | 8 unit test                                                                                                                       |

### 2.4. Hızlı Aksiyon Widget'ı

| Özellik                      | Detay                                                                      |
| ---------------------------- | -------------------------------------------------------------------------- |
| **FloatingActionsComponent** | Sağ alt köşede FAB butonu, açılır menü                                     |
| **Aksiyonlar**               | Vardiya başlat/bitir, arıza bildir, devir notu, vardiya değiş, izin talebi |
| **Canlı Zamanlayıcı**        | Aktif vardiya varsa `setInterval` ile 1 saniyede bir güncellenen süre      |
| **Konum**                    | `z-index: 9999`, `position: fixed`, bottom-right                           |

### 2.5. Profil Sayfası

| Özellik              | Detay                                                                |
| -------------------- | -------------------------------------------------------------------- |
| **ProfileComponent** | `/app/profile` route                                                 |
| **Avatar**           | İsim baş harflerinden oluşan avatar, sidebar footer'dan tıklanabilir |
| **KPI Kartları**     | Toplam mesai günü/saati, günlük ortalama, zamanında başlama oranı    |
| **Hesap Detayları**  | İsim, rol, e-posta                                                   |

### 2.6. Vardiya Hatırlatıcı

| Özellik                | Detay                                                         |
| ---------------------- | ------------------------------------------------------------- |
| **MyDay Component**    | Bugünkü veya sonraki vardiya 2 saat içindeyse banner gösterir |
| **Otomatik Hesaplama** | Vardiya başlangıcından `Date.now()` farkını hesaplar          |

### 2.7. Pull-to-Refresh (Mobil)

| Özellik                | Detay                                                          |
| ---------------------- | -------------------------------------------------------------- |
| **MyShifts Component** | `touchstart`/`touchmove`/`touchend` ile native pull-to-refresh |
| **Eşik**               | 60px aşağı çekme → refresh tetiklenir                          |
| **Gösterge**           | Dönen ok ikonu + "Yenileniyor..." metni                        |

### 2.8. Dashboard - Aktif Arıza Widget'ı

| Özellik                    | Detay                                                                           |
| -------------------------- | ------------------------------------------------------------------------------- |
| **5. KPI Kartı**           | "Aktif Arıza" — açık arızaların sayısı (kırmızı)                                |
| **Aktif Arızalar Listesi** | Alt grid'de son 5 açık arıza, severity badge'leriyle (critical/high/medium/low) |
| **API**                    | `GET /device-incidents?status=open`                                             |

### 2.9. Test İyileştirmeleri

| Özellik                | Detay                                                                                              |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| **Backend Test Fix**   | `'PrismaService'` string token → `PrismaService` class reference                                   |
| **Mock Düzeltmeleri**  | Eksik `_count`, `schedules`, `workDays`, `mode` alanları eklendi                                   |
| **Mock Ekleme**        | `NotificationsService`, `ScheduleGateway` mock'ları eklendi                                        |
| **resetAllMocks**      | `clearAllMocks` → `resetAllMocks` (test izolasyonu)                                                |
| **Yeni Backend Test**  | analytics (8), device-incidents (7), push-subscriptions (9), attendance (8)                        |
| **Yeni Frontend Test** | pwa.service (6), device-incidents.service (10), device-incident-report (8), pwa-install-prompt (3) |

### 2.10. Bugfix'ler

| Hata                                           | Çözüm                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------ |
| `handover-notes.component.ts` duplicate method | İkinci `loadDevices()` ve `ngOnDestroy()` silindi, `wsSub` alanı eklendi |
| MainLayout template hataları                   | Kapanmayan `div`, hatalı `</a>`/`</div>` iç içelik düzeltildi            |
| `ng build --configuration=production` hataları | Template nesting fix, `activeIncidents` tipi eklendi                     |

---

## 3. Proje Mimarisi

### 3.1. Backend (NestJS)

```
backend/src/
├── app.module.ts          → Ana modül (tüm modülleri import eder)
├── main.ts                → Giriş noktası (CORS, Swagger, port 3000)
├── prisma.service.ts      → Prisma ORM servisi (PostgreSQL)
├── modules/
│   ├── analytics/         → Dashboard metrikleri, mesai analizi
│   ├── attendance/        → Clock in/out (YENİ)
│   ├── auth/              → JWT auth, rate-limit, CSRF, session, invite
│   ├── device-incidents/  → Arıza bildirim yönetimi
│   ├── handover-notes/    → Devir teslim notları (WebSocket)
│   ├── insights/          → Akıllı analiz servisi
│   ├── me/                → Kullanıcı kişisel verileri
│   ├── notifications/     → Bildirim servisi
│   ├── personnel/         → Personel yönetimi
│   ├── push-subscriptions/→ Push notification aboneliği (YENİ)
│   ├── schedules/         → Vardiya planlama, workflow, export
│   ├── shifts/            → Vardiya tanımları
│   ├── swap-requests/     → Vardiya değişim talepleri
│   ├── units/             → Birim yönetimi (MR, BT, Röntgen...)
│   └── websocket/         → ScheduleGateway, presence, concurrency, edit-lock
├── guards/                → min-role, role-guards
├── filters/               → Exception filter
└── interceptors/          → Logging interceptor
```

### 3.2. Frontend (Angular 19)

```
frontend/src/app/
├── app.ts / app.config.ts / app.routes.ts
├── components/
│   ├── device-incidents/   → Arıza bildirim formu + testler
│   ├── floating-actions/   → Hızlı aksiyon FAB widget'ı (YENİ)
│   ├── handover-notes/     → Devir teslim notları (fixed)
│   ├── pwa-install-prompt/ → PWA kurulum banner'ı + testler
│   └── ... (management-dashboard, reports, shifts, etc.)
├── features/
│   ├── dashboard/          → Radyoloji Komuta Merkezi (+ arıza widget)
│   ├── my-day/             → Bugünkü vardiyam (+ clock in/out, reminder)
│   ├── my-shifts/          → Vardiyalarım (+ pull-to-refresh)
│   └── profile/            → Profil sayfası (YENİ)
├── layouts/
│   ├── main-layout/        → Sidebar + bottom nav (mobile) + topbar
│   └── auth-layout/        → Giriş/kayıt layout'u
├── services/
│   ├── pwa.service.ts      → PWA kurulum, push notif, online durumu (YENİ)
│   ├── attendance.service.ts → Clock in/out API (YENİ)
│   └── ...
├── core/                   → API, scheduling engine, state management
├── domain/                 → Enum'lar, modeller, kurallar
└── guards/                 → auth.guard, guest.guard
```

---

## 4. Test Coverage

### Backend (160 test, 18 dosya)

| Test Dosyası                                  | Test Sayısı |
| --------------------------------------------- | ----------- |
| auth/session.service                          | 21          |
| auth/rate-limit.service                       | 15          |
| schedules/schedules.service                   | 12          |
| shifts/shifts.service                         | 11          |
| swap-requests/swap-requests.service           | 11          |
| auth/invite-code.service                      | 9           |
| push-subscriptions/push-subscriptions.service | 9           |
| auth/csrf.service                             | 8           |
| attendance/attendance.service                 | 8           |
| analytics/analytics.service                   | 8           |
| personnel/dto/create-personnel.dto            | 8           |
| auth/auth.service                             | 7           |
| auth/csrf.guard                               | 7           |
| device-incidents/device-incidents.service     | 7           |
| auth/token-blacklist.service                  | 5           |
| personnel/dto/personnel-query.dto             | 5           |
| units/dto/create-unit.dto                     | 5           |
| holidays/dto/create-holiday.dto               | 4           |

### Frontend (27 test)

| Test Dosyası                          | Test Sayısı |
| ------------------------------------- | ----------- |
| device-incidents.service.spec         | 10          |
| device-incident-report.component.spec | 8           |
| pwa.service.spec                      | 6           |
| pwa-install-prompt.component.spec     | 3           |

---

## 5. Rotalar

| Route                       | Sayfa                    | Erişim            |
| --------------------------- | ------------------------ | ----------------- |
| `/app/dashboard`            | Radyoloji Komuta Merkezi | Tüm roller        |
| `/app/my-day`               | Bugünkü Vardiyam         | Tüm roller        |
| `/app/my-shifts`            | Vardiyalarım             | Tüm roller        |
| `/app/profile`              | Profil                   | Tüm roller (YENİ) |
| `/app/handover-notes`       | Devir Teslim             | technician+       |
| `/app/device-incidents`     | Arıza Bildirim           | technician+       |
| `/app/swap-requests`        | Vardiya Değişim          | technician+       |
| `/app/operations`           | Operasyon Merkezi        | head_technician+  |
| `/app/management-dashboard` | Yönetim Paneli           | head_technician+  |
| `/app/approval-center`      | Onay Merkezi             | head_technician+  |
| `/app/employees`            | Personel                 | head_technician+  |
| `/app/settings`             | Sistem Ayarları          | admin+            |

---

## 6. Teknik Detaylar

| Özellik                | Değer                                                        |
| ---------------------- | ------------------------------------------------------------ |
| **Backend Framework**  | NestJS v10                                                   |
| **Frontend Framework** | Angular 19.2 (standalone, OnPush, signals)                   |
| **ORM**                | Prisma (PostgreSQL)                                          |
| **PWA**                | `@angular/service-worker` v21.2.9                            |
| **WebSocket**          | Socket.IO (ScheduleGateway)                                  |
| **Auth**               | JWT + refresh token + CSRF                                   |
| **Test (Backend)**     | Vitest v4.1.5                                                |
| **Test (Frontend)**    | Vitest + Angular Testing Library                             |
| **Build**              | Angular CLI production build (initial: 577kB/141kB transfer) |
| **Mobile Breakpoint**  | 769px (sidebar → overlay drawer + bottom nav)                |

---

## 7. Sıradaki Adımlar

1. **Push Notification Gönderme Endpoint'i** — `POST /push-subscriptions/send` ile web-push entegrasyonu
2. **E2E Testler** — Test veritabanına karşı full e2e senaryoları
3. **Device Incident Dashboard Widget** — Ana dashboard'da aktif/kritik arıza badge'i (TAMAMLANDI)
4. **Seed Güncelleme** — `npm run seed` ile attendance + push subscription verileri
5. **chart.js** — Yönetim dashboard'u için interaktif grafikler
6. **Production Build** — SW kaydı ve PWA kurulum akışı doğrulama (TAMAMLANDI)
7. **Offline Sync** — MyShifts için offline veri senkronizasyonu

---

## 8. Önemli Notlar

- Backend testleri `npm run test` (vitest) ile çalışır, **jest ile değil**
- PWA sadece production build'de aktiftir (`isDevMode()` kontrolü)
- Push subscription'lar MVP için in-memory saklanır (Prisma modeli upgrade edilebilir)
- VAPID public key frontend'de `pwa.service.ts`'de gömülüdür
- Demo kullanıcı: `tekniker@test.local` / `123456`
- Admin: `admin@hospital.com` / `admin123`
- Mobil breakpoint: 769px
- WebSocket event'leri: `handover-note:new`, `incident:new`, `attendance:status`
