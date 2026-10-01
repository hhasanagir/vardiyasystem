# VardiyaOS — Enterprise Sprint Plan

## Overview

| Sprint | Focus                      | Süre    | Tarih Aralığı   |
| ------ | -------------------------- | ------- | --------------- |
| S1     | Frontend Excellence        | 2 hafta | 30 Haz — 11 Tem |
| S2     | Capacitor Mobile           | 3 hafta | 14 Tem — 1 Ağu  |
| S3     | Production Infrastructure  | 2 hafta | 4 Ağu — 15 Ağu  |
| S4     | Load Testing & Performance | 1 hafta | 18 Ağu — 22 Ağu |
| S5     | Healthcare Compliance      | 1 hafta | 25 Ağu — 29 Ağu |
| S6     | Pilot Deployment           | 2 hafta | 1 Eyl — 12 Eyl  |
| S7     | Hospital Go-Live           | 2 hafta | 15 Eyl — 26 Eyl |

**Toplam süre: 13 hafta** — Her sprint sonunda çalışan, dağıtılabilir bir ürün çıkar.

---

## S1 — Frontend Excellence Sprint

> **Hedef:** Web uygulamasını mobil çağda rekabet edebilir seviyeye taşımak, boş ekran/loading/hata durumlarını standartlaştırmak, responsive layout'u tamamlamak.

| #    | Task                                                                                                                                                        | Output                         | Tahmin |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------ |
| 1.1  | **Design System Revamp** — Tüm component'leri Angular Material + Tailwind ile tutarlı hale getir, renk paletini kurumsal kimliğe uydur                      | `_variables.scss`, tema config | 3g     |
| 1.2  | **Empty State Component** — `app-empty-state` component'i: icon, title, description, action button, illustration slot. Tüm listelerde kullan.               | `shared/empty-state/`          | 1g     |
| 1.3  | **Loading Skeleton Component** — `app-skeleton-loader` ile her liste/kart için iskelet ekranı (isim, avatar, satır varyantları)                             | `shared/skeleton-loader/`      | 1g     |
| 1.4  | **Error Boundary Component** — `app-error-state` ile hata durumları: retry button, hata detayı, fallback UI                                                 | `shared/error-state/`          | 1g     |
| 1.5  | **Responsive Layout Engine** — Mobile (<768px) / Tablet (768-1024) / Desktop (>1024) için 3 kademeli layout sistemi. Sidebar→BottomNav geçişi.              | `core/layout/` rewrite         | 2g     |
| 1.6  | **Dynamic Dashboard** — Role-based widget sistemi (teknisyen, şef, yönetici, admin için farklı kartlar). Sürükle-bırak düzenleme, localStorage persistence. | `features/dashboard/` rewrite  | 3g     |
| 1.7  | **Data Table Standardization** — Tüm tabloları `app-data-table` component'ine taşı: sort, filter, search, pagination, row actions, responsive column hide   | `shared/data-table/`           | 2g     |
| 1.8  | **Form Validation UX** — Tüm formlarda inline validation, debounced async validation, submit loading state, success/error toast                             | Global form directive          | 1g     |
| 1.9  | **Offline-aware UI** — `ConnectionStatusBanner`, online/offline badge, kuyruktaki işlem sayısı göstergesi                                                   | `core/connection-status/`      | 1g     |
| 1.10 | **Page Transition Animations** — Router outlet transitions, list insert/remove animasyonları, skeleton→content smooth geçiş                                 | `core/animations.ts`           | 1g     |

**Sonuç:** Mobile UX score 50 → **80/100**, tüm boş ekranlar/hatalar/yüklemeler standartlaştı, dashboard role-adaptive çalışıyor.

---

## S2 — Capacitor Mobile Sprint

> **Hedef:** Web uygulamasını native Android/iOS paketine dönüştürmek, offline çalışma, biyometrik giriş, push bildirimleri.

| #    | Task                                                                                                                                          | Output                               | Tahmin |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ------ |
| 2.1  | **Capacitor Projesi Kurulumu** — `npx cap init`, Angular entegrasyonu, platform ekleme (android/ios), build pipeline                          | `capacitor.config.ts`, mobil wrapper | 1g     |
| 2.2  | **Splash Screen & Icon** — Adaptive icon (Android), app icon (iOS), splash screen animasyonu, dark mode splash                                | Mobile assets                        | 1g     |
| 2.3  | **Biometric Auth** — `@capacitor/biometric` ile parmak izi/yüz tanıma girişi. PIN fallback. Web'de devre dışı.                                | `auth/biometric-auth.service.ts`     | 2g     |
| 2.4  | **Offline Storage** — `@capacitor-community/sqlite` ile local veritabanı. Personnel, Schedule, Device cache stratejisi.                       | `offline/` servis katmanı            | 3g     |
| 2.5  | **Offline Sync Engine** — Conflict resolution (version vector), queue-based sync, background sync (WorkManager), sync status UI               | `offline/sync-engine.ts`             | 3g     |
| 2.6  | **Push Notifications (FCM)** — `@capacitor/push-notifications` + FCM integration. Token kaydı, bildirim alındı/tıklandı yönlendirme.          | `notifications/push.service.ts`      | 2g     |
| 2.7  | **Native File System** — `@capacitor/filesystem` ile cihaz galerisine görsel kaydetme, PDF rapor dışa aktarma, CSV import                     | `shared/file.service.ts`             | 1g     |
| 2.8  | **App State Management** — `@capacitor/app` ile foreground/background olayları, uygulama kapatma öncesi veri senkronizasyonu, haptik feedback | `core/app-state.service.ts`          | 1g     |
| 2.9  | **Deep Linking** — `@capacitor/app` URL scheme, schedule/personnel derin bağlantıları, push notification'dan doğrudan yönlendirme             | `routing/deeplinks.ts`               | 1g     |
| 2.10 | **Mobile-specific UI** — Bottom sheet (Modal → Sheet geçişi), swipe-to-delete, pull-to-refresh, FAB menu (role-based)                         | `shared/mobile-ui/`                  | 2g     |

**Sonuç:** APK/AAB çıktısı alınabilir, offline çalışır, biyometrik giriş yapılır, push bildirimi gelir.

---

## S3 — Production Infrastructure Sprint

> **Hedef:** Sistemin 5000 kullanıcıya kesintisiz hizmet verebilmesi için altyapıyı tamamlamak. Mevcut Docker Compose yapısının üzerine K8s ve monitoring katmanını eklemek.

> **Not:** Altyapı dosyalarının büyük kısmı (`k8s/`, `prometheus/`, `loki/`, `tempo/`, `alertmanager/`) önceden hazırlandı. Bu sprint'te bunlar test edilecek, düzeltilecek ve canlıya alınacak.

| #   | Task                                                                                                                                                  | Output                  | Tahmin |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------ |
| 3.1 | **K8s Cluster Setup** — Staging cluster'a manifest'leri deploy et, rollout test et, rolling update doğrula                                            | `kubectl apply -k k8s/` | 1g     |
| 3.2 | **Monitoring Stack Validation** — Prometheus backend'i scrape ediyor mu, Grafana'da dashboard görünüyor mu, Loki log alıyor mu, Tempo trace alıyor mu | Test raporu             | 1g     |
| 3.3 | **AlertManager Tuning** — Slack kanallarını bağla, alert routing'i test et, inhibit rules doğrula, escalation timer'ları ayarla                       | Çalışan alert pipeline  | 1g     |
| 3.4 | **PgBouncer Load Test** — Connection pool davranışını test et, backend pool tükenmesi durumunda davranışı doğrula                                     | PgBouncer benchmark     | 1g     |
| 3.5 | **Disaster Recovery Validation** — Backup→restore testi yap, PITR WAL arşivleme çalışıyor mu kontrol et, offsite backup S3'e gidiyor mu               | DR test raporu          | 1g     |
| 3.6 | **SSL Certificate Setup** — Let's Encrypt + cert-manager, auto-renewal testi, HSTS header doğrulama                                                   | TLS sertifikası         | 1g     |
| 3.7 | **Production Drills** — Container kill testi (pod otomatik restart), node drain testi, CPU spike testi (HPA tetikleme), network partition testi       | Kaos test raporu        | 2g     |
| 3.8 | **Documentation Sync** — Tüm altyapı dokümanlarını güncelle, runbook'ları canlı konfigürasyona göre doğrula, mimari diyagramı güncelle                | Güncel dokümantasyon    | 1g     |

**Sonuç:** K8s üzerinde çalışan, otomatik ölçeklenen, tam izlenen, alert veren, felaket kurtarma prosedürleri test edilmiş bir sistem.

---

## S4 — Load Testing & Performance Sprint

> **Hedef:** Gerçekçi yük senaryolarıyla sistemin 5000 kullanıcı altında davranışını doğrulamak, darboğazları bulup düzeltmek.

| #   | Task                                                                                                                                                                                                                                                                                                   | Output               | Tahmin |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------- | ------ |
| 4.1 | **K6 Test Scenarios** — Mevcut `k6/load-test.js`'i 5 senaryoya genişlet: (1) Normal iş günü sabahı (clock in + schedule view + cihaz kontrol), (2) Vardiya değişim saati (yoğun okuma), (3) Rapor dönemi (ağır sorgular), (4) Bildirim fırtınası (push + in-app), (5) Gece bakım penceresi (düşük yük) | `k6/scenarios/`      | 1g     |
| 4.2 | **Baseline Run (100 users)** — Mevcut metrikleri kaydet, latency/error rate/througput baseline'ı çıkar                                                                                                                                                                                                 | Baseline raporu      | 0.5g   |
| 4.3 | **Load Run (500 users)** — 2x baseline, darboğazları tespit et (CPU, memory, DB connections, Redis)                                                                                                                                                                                                    | 500-user raporu      | 0.5g   |
| 4.4 | **Stress Run (1000 users)** — Sistem limitlerini bul, hangi bileşenin ilk doyduğunu belirle                                                                                                                                                                                                            | 1000-user raporu     | 0.5g   |
| 4.5 | **Breakpoint Run (2500 users)** — Sistemin kırılma noktasını bul, hangi hata tiplerinin görüldüğünü kaydet                                                                                                                                                                                             | 2500-user raporu     | 0.5g   |
| 4.6 | **Soak Test (500 users, 4h)** — Uzun süreli yük altında memory leak, connection leak, temp table bloat kontrolü                                                                                                                                                                                        | 4h soak raporu       | 4h     |
| 4.7 | **Performance Tuning** — Bulunan darboğazları düzelt: missing index ekle, N+1 sorguları düzelt, Redis cache warming ekle, lazy loading optimize et                                                                                                                                                     | Performance fix'leri | 2g     |
| 4.8 | **Final Validation Run (500 users)** — Tuning sonrası metriklerin iyileştiğini doğrula, improvement yüzdesini hesapla                                                                                                                                                                                  | Final rapor          | 0.5g   |

**Sonuç:** 5000 kullanıcı için validated capacity planı, p99 latency <1s garantisi, error rate <%0.1, tüm darboğazlar belgelenmiş ve düzeltilmiş.

---

## S5 — Healthcare Compliance Sprint

> **Hedef:** Sistemin hastane ortamında yasal olarak çalışabilmesi için KVKK/GDPR/ISO 27001 uyumluluğunu tamamlamak, tüm operasyon dokümanlarını hastane BT standartlarına uygun hale getirmek.

| #   | Task                                                                                                                                                                                    | Output                              | Tahmin |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------ |
| 5.1 | **KVKK Envanter Finalization** — Veri işleme envanterini hastane hukuk birimiyle doğrula, veri saklama politikalarını netleştir, imha prosedürlerini ekle                               | Onaylı KVKK dokümanı                | 1g     |
| 5.2 | **Data Retention Automation** — AuditLog (10 yıl), Attendance (10 yıl), Notification (90 gün), AuthAttempt (90 gün), AuthSession (oturum+30 gün) için otomatik cleanup cron job'ı       | `scripts/data-retention-cleanup.sh` | 1g     |
| 5.3 | **Consent Management UI** — Kullanıcıya veri işleme onay ekranı (ilk girişte), KVKK aydınlatma metni, onay geçmişi logs                                                                 | `auth/consent/`                     | 1g     |
| 5.4 | **Data Export Tool** — Kullanıcının tüm verilerini JSON olarak dışa aktarabileceği `GET /api/v1/audit/export/user/:id` endpoint'i + UI                                                  | Data export feature                 | 1g     |
| 5.5 | **Data Deletion Workflow** — Hesap silme talebi + bekleme süresi (30 gün) + otomatik anonimleştirme workflow'u                                                                          | Account deletion pipeline           | 2g     |
| 5.6 | **ISO 27001 Readiness** — Risk değerlendirme tablosu, varlık envanteri, erişim kontrol politikası, olay yönetimi prosedürü, iş sürekliliği planı                                        | `docs/enterprise/iso-27001/`        | 2g     |
| 5.7 | **Operasyon Doküman Seti** — Dağıtım kılavuzu (güncelleme), sistem yönetici kılavuzu, kullanıcı kılavuzu (teknisyen/yönetici), bakım penceresi prosedürü, değişiklik yönetimi prosedürü | Operasyon dokümanları               | 2g     |
| 5.8 | **Penetrasyon Testi** — Harici güvenlik firmasıyla sözleşme, test senaryoları, raporlama, bulguların düzeltilmesi                                                                       | Pentest raporu                      | 2g     |
| 5.9 | **Eğitim Materyalleri** — Son kullanıcı eğitim sunumu, sistem yönetici eğitim dokümanı, KVKK farkındalık eğitimi, acil durum prosedürleri eğitimi                                       | Eğitim seti                         | 1g     |

**Sonuç:** KVKK uyumlu, ISO 27001'e hazır, pentest'ten geçmiş, tüm operasyon dokümanları tamamlanmış sistem.

---

## S6 — Pilot Deployment Sprint

> **Hedef:** Tek bir görüntüleme biriminde (MR veya BT odası) gerçek kullanıcılarla 2 haftalık pilot çalışması, geri bildirim toplama, düzeltme.

| #   | Task                                                                                                                                                                            | Output                     | Tahmin |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ------ |
| 6.1 | **Pilot Birim Seçimi** — Hastane yönetimiyle pilot birim belirle (yüksek trafikli MR/BT ünitesi), kullanıcı listesi çıkar, rolleri ata, eğitim planı yap                        | Pilot planı                | 1g     |
| 6.2 | **Pilot Ortam Kurulumu** — Staging sunucuya son sürümü deploy et, test verilerini yükle, kullanıcı hesaplarını oluştur, cihaz/ekipman kayıtlarını gir                           | Pilot ortamı               | 1g     |
| 6.3 | **Kullanıcı Eğitimi** — Pilot kullanıcılara 2 saatlik yüz yüze eğitim: temel işlemler, mobil uygulama kurulumu, bildirim ayarları, destek kanalı                                | Eğitim oturumu             | 1g     |
| 6.4 | **Hafta 1 — Gözlem & Destek** — Günlük check-in, ilk hafta sorunlarını topla, acil düzeltmeleri yap, kullanıcı geri bildirimlerini kaydet (interview + anket)                   | Hafta 1 raporu             | 5g     |
| 6.5 | **Hafta 1 Düzeltmeleri** — Kritik bug'ları fix'le, UX iyileştirmelerini yap, performans tweak'lerini uygula, sık istenen feature'ları ekle                                      | Hotfix sürümü              | 2g     |
| 6.6 | **Hafta 2 — Derinlemesine Kullanım** — İkinci haftada daha az müdahale, sistemin kendi kendine çalıştığını doğrula, monitoring metriklerini topla                               | Hafta 2 raporu             | 5g     |
| 6.7 | **Pilot Değerlendirme** — Kullanıcı memnuniyet anketi (NPS), sistem metrikleri (uptime, latency, error rate), feature kullanım istatistikleri, karşılanmayan ihtiyaçlar listesi | Pilot değerlendirme raporu | 2g     |
| 6.8 | **Go/No-Go Kararı** — Pilot sonuçlarına göre kurum geneline yaygınlaştırma kararı. Minimum: NPS > 40, uptime > 99.9%, error rate < 0.5%                                         | Go/No-Go raporu            | 0.5g   |

**Sonuç:** Gerçek hastane ortamında 2 hafta çalışmış, kullanıcı onayı almış, metrikleri toplanmış, go/no-go kararı verilmiş sistem.

---

## S7 — Hospital Go-Live Sprint

> **Hedef:** Tüm görüntüleme birimlerinde (MR, BT, Röntgen, Nükleer, Onkoloji) sistemi devreye almak, eski sistemden geçişi yönetmek, ilk ay boyunca destek sağlamak.

| #   | Task                                                                                                                                                                          | Output               | Tahmin |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------ |
| 7.1 | **Go-Live Planı** — Birim birim rollout takvimi, her birim için geçiş saatleri (haftasonu veya gece), geri dönüş planı, iletişim planı                                        | Go-Live planı        | 1g     |
| 7.2 | **Production Ortamı** — Canlı sunucuya deploy, SSL sertifikalarını kontrol et, monitoring alert'lerini aktifleştir, Slack kanallarını bağla, backup cron'larını doğrula       | Production ortam     | 1g     |
| 7.3 | **Veri Geçişi** — Eski sistemden (mevcut Excel/manual süreç) veri aktarımı: personnel, cihaz, vardiya geçmişi. Veri doğrulama.                                                | Data migration       | 2g     |
| 7.4 | **Birim Bazında Rollout** — Her birim için: (1) Kullanıcı hesaplarını oluştur, (2) 1 saat eğitim, (3) Sistemi aç, (4) İlk gün boyunca yanlarında ol, (5) Sorunları anında çöz | 6 birim × 0.5g       | 3g     |
| 7.5 | **İlk Hafta Hypercare** — Tüm ekip teyakkuzda: anlık bug fix, kullanıcı destek hattı, saat başı metrik kontrol, gün sonu durum raporu                                         | Hypercare dönemi     | 5g     |
| 7.6 | **Eski Sistemi Kapatma** — Pilot birimde eski sistemi kapat, veri tutarlılığını doğrula, arşiv amaçlı readonly erişim bırak                                                   | Legacy decommission  | 1g     |
| 7.7 | **İlk Ay Stabilizasyon** — Haftalık review, kalan bug'ları düzelt, performans iyileştirmeleri, kullanıcı geri bildirimlerini topla, roadmap v2 için önceliklendirme           | Stabilizasyon raporu | 10g    |

**Sonuç:** Tüm hastanede çalışan, eski sistemden geçilmiş, kullanıcıların eğitildiği, hypercare dönemi tamamlanmış, stabil çalışan sistem.

---

## Phasing Strategy

```
Hafta:  1  2  3  4  5  6  7  8  9  10 11 12 13
        │  │  │  │  │  │  │  │  │  │  │  │  │
S1      ██ ██
S2          ██ ██ ██
S3                 ██ ██
S4                      ██
S5                         ██
S6                            ██ ██
S7                                  ██ ██
        │  │  │  │  │  │  │  │  │  │  │  │  │
        Haziran          Temmuz          Ağustos
```

## Critical Path

```
S1 (Frontend) ──▶ S2 (Mobile) ──▶ S6 (Pilot) ──▶ S7 (Go-Live)
                                                   │
S3 (Infra) ──────▶ S4 (Load Test) ──▶ S5 (Compliance) ┘
```

- S1 → S2 → S6 → S7 ana kritik yol
- S3 → S4 → S5 paralel hazırlık
- S6 pilotu için S1 ve S2'nin bitmiş olması gerekir
- S7 go-live için tüm sprint'lerin tamamlanması gerekir

## Riskler ve Mitigasyon

| Risk                                     | Olasılık | Etki   | Mitigasyon                                      |
| ---------------------------------------- | -------- | ------ | ----------------------------------------------- |
| Mobil uygulama mağaza onayı gecikmesi    | Orta     | Yüksek | Pilot'u web üzerinden başlat, APK sideload      |
| Hastane IT güvenlik duvarı kısıtlamaları | Yüksek   | Orta   | Pilot öncesi IT ile network topology toplantısı |
| Kullanıcı direnci (değişime)             | Orta     | Yüksek | Erken ve sık eğitim, champion kullanıcılar seç  |
| Veri geçişi sırasında tutarsızlık        | Düşük    | Kritik | Pilot öncesi test migration, doğrulama script'i |
| Performans sorunları                     | Düşük    | Yüksek | S4'te kapsamlı load test, capacity planı        |
| Yasal/KVKK uyumsuzluğu                   | Düşük    | Kritik | S5'te hukuk birimi onayı, pentest               |
