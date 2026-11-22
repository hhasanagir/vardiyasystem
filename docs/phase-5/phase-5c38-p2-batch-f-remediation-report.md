# Phase 5C.38 — P2 Batch F (Kanonik DDD Geçişi) Kapanış Raporu

**Tarih:** 2026-11-22  
**Durum:** Batch F tamamlandı. P3 kapsam dışıdır, ayrı onay bekler.  
**Yetki:** Kullanıcı `onaylıyorum` ile Batch E/F ve DB-backed doğrulamayı onayladı. DB/worker erişimi olmadığı için doğrulama yalnızca kod/unit seviyesinde yapıldı.  
**Öncesi yedek:** `C:\Users\Hasan\AppData\Local\Temp\opencode\vardiyasystem-batchE-backup-20261122\MANIFEST.txt` (1762 dosya, Batch E öncesi referans).

---

## 1. Kapsam

`docs/phase-5/phase-5c34-p2-decision-record.md` kararları uyarınca bu partide P2-01 / P2-02 / P2-03 (DDD kanonik yön, kademeli geçiş) tamamlandı. Kural semantiği (P2-04/11/14/18) Batch C/D'de, altyapı (P2-09/15) Batch E'de zaten uygulanmıştı. Bu parti **kanonik motoru legacy ile aynı kural yüzeyine getirip geçişi read-only bir flag altına aldı**.

| Madde | Karar | Uygulama |
| --- | --- | --- |
| P2-01 | DDD kanonik, kademeli geçiş | 6 legacy-only kural kodu 4 constraint sınıfıyla kanonik `ALL_HARD_CONSTRAINTS` kaydına alındı; `ENABLE_DDD_CANONICAL_SCHEDULING` varsayılan `false` |
| P2-02 | DDD kanonik, kademeli geçiş | Soft-fairness gerçek roster ve artık-yıla güvenli `daysInMonth` kullanıyor; skor metadata'sı `personnelCount/realPersonnelData/monthDays` pinlendi |
| P2-03 | DDD kanonik, kademeli geçiş | Flag yalnızca read-only dry-run çıktısına `metadata.rolloutMode` yazıyor; legacy write yolları migration modunda açık kalıyor |

---

## 2. Değişiklikler

### 2.1 Kanonik kural kaydı (P2-01)

`backend/src/modules/schedules/domain/constraints/hard-constraints.ts` içine 4 constraint sınıfı eklendi ve `ALL_HARD_CONSTRAINTS` dizisine kaydedildi:

| Sınıf | Kodlar | Davranış |
| --- | --- | --- |
| `DeviceBookedConstraint` | `DEVICE_BOOKED` | Aynı cihaz, tarih, vardiya ve personel tipinde mevcut atama varsa BLOCKING |
| `GroupReferenceConstraint` | `GROUP_NOT_FOUND`, `GROUP_NOT_IN_UNIT` | Grup yoksa veya atama birimine ait değilse BLOCKING |
| `TemplateScopeConstraint` | `TEMPLATE_NOT_IN_GROUP`, `TEMPLATE_NOT_IN_UNIT` | Şablon atanan gruba/birime ait değilse BLOCKING |
| `SameSlotConstraint` | `SAME_SLOT` | Aynı slot doluysa BLOCKING |

- Bu 6 kodun tamamı `VIOLATION_POLICY` içinde zaten `BLOCKING / isOverrideAllowed=false`; strictest-wins korundu.
- `constraint.interface.ts` içindeki `GroupLookup/ShiftTemplateLookup` ve ilgili info tipleri yeni kuralların ihtiyaç duyduğu context yüzeyini sağlıyor.
- Legacy validator (`schedules.service.ts`) aynı 6 kodu emit etmeye devam ediyor; iki yüzey artık aynı kural dilini konuşuyor. Kanonik yön **legacy → DDD**, tersi değil.

### 2.2 Soft-fairness gerçek veri (P2-02)

`backend/src/modules/schedules/domain/constraints/soft-fairness.ts`:

- Atama id'lerinden isim/yetkinlik/limit türetmek yerine `personnelLookup.all()` gerçek roster'ı kullanılıyor; sıfır atamalı personel de paydaya dahil.
- `monthDays`, `daysInMonth(year, month)` ile artık yıla göre hesaplanıyor (ör. Şubat 2024 = 29); sabit 30 varsayımı kaldırıldı.
- Skor metadata'sına `personnelCount`, `realPersonnelData: true` ve `monthDays` yazılıyor; regresyon testi bunları pinliyor.

### 2.3 Feature-flagged read-only geçiş (P2-03)

- `backend/src/config/feature-flags.ts`: `ENABLE_DDD_CANONICAL_SCHEDULING` flag listesine eklendi; `process.env === 'true'` olmadığı sürece **varsayılan `false`**.
- `backend/src/modules/schedules/schedule-dry-run.service.ts`:
  - `DDD_CANONICAL_SCHEDULING_FLAG` sabiti dışa aktarıldı.
  - Flag kapalıyken (varsayılan) dry-run sonucuna `metadata.rolloutMode = 'legacy-migration'`, açıkken `'canonical'` yazılıyor.
  - **Flag yalnızca read-only dry-run'ı işaretliyor.** Üretim write yolları (apply/publish/generate) migration modunda açık kalıyor; flag açık olsa bile write davranışı değişmiyor. DB/worker parity'si kanıtlanmadan otomatik cutover yok.
  - `ENABLE_SCHEDULE_GENERATION_ASYNC` flag'inden bağımsız; o flag hâlâ varsayılan `false` ve tüketilmiyor.

### 2.4 Yeni regresyon spec'i

`backend/src/modules/schedules/__tests__/p2-batch-f-canonical-rollout.spec.ts` eklendi (**11 test**):

- 6 kuralın kanonik kaydı ve strictest-wins politika pinleri,
- her kuralın shared engine'den BLOCKING / non-overridable üretmesi (parametrize 6 vaka),
- legacy validator'ın aynı 6 kodu emit ettiği pin'i,
- soft-fairness'in gerçek roster ve artık-yıla güvenli `monthDays` metadata pin'i,
- flag'in varsayılan `false` ve yalnızca dry-run `rolloutMode` etiketi olduğu pinleri.

Mevcut testler zayıflatılmadı; yalnızca Batch E'de eklenen `validateAssignmentsBatch` yüzeyini yansıtan 4 mock güncellendi (bkz. Batch E raporu).

---

## 3. Kapsam farkı (Batch E öncesi yedek ile karşılaştırma)

Batch E yedeğine (1762 dosya) göre son SHA-256 manifest farkı: **19 değiştirilmiş + 4 yeni dosya**, **0 silinen dosya**, güncel ağaç 1766 dosya.

Yeni dosyaların tamamı:
- `backend/src/modules/schedules/__tests__/p2-batch-e-infrastructure.spec.ts`
- `backend/src/modules/schedules/__tests__/p2-batch-f-canonical-rollout.spec.ts`
- `docs/phase-5/phase-5c37-p2-batch-e-remediation-report.md`
- `docs/phase-5/phase-5c38-p2-batch-f-remediation-report.md`

Değiştirilen 19 dosyanın tamamı `backend/src/config/*` ve `backend/src/modules/schedules/*` altındadır (kaynak + 4 mevcut spec mock'u). Değiştirilen/Yeni/Silinen yollar üzerinde yasaklı yol taraması (migration, `schema.prisma`, seed, `.env`, secret, `eslint-baseline.json`, git, Docker/K8s, package manifest'leri) **0 eşleşme** verdi.

Migration, Prisma schema, seed, `.env`, secret, git veya lint baseline değişikliği yapılmadı.

---

## 4. Doğrulama kapıları

| Kapı | Sonuç |
| --- | --- |
| Backend typecheck (`npm run typecheck`) | **PASS** |
| Backend lint (`npm run lint`) | **4072 error**, 8988 warning; baseline `maxErrors: 4075`; **PASS (3 error altında)**. Re-baseline yapılmadı. |
| Hedef testler (24 dosya, Batch E+F birleşik) | **288/288 PASS** |
| Yeni Batch F spec | **11/11 PASS** |
| Yeni Batch E spec | **6/6 PASS** |
| Backend tam `npx vitest run` | **1275 PASS / 10 FAIL / 1285** — 117 dosya geçti, 1 dosya (`device-off.spec.ts`) `localhost:5432` erişilemediği için DB'siz ortamdan kaynaklı; hatalar Batch D'den beri aynı |
| Frontend typecheck | **PASS** |
| Frontend test (`npx vitest run`) | **157/157 PASS** |
| Frontend lint | **0 error / 397 warning** |

E/F tarafından tanıtılan 74 yeni ESLint error'u tespit edilip düzeltildi; final sayı baseline'ın 3 altında. Düzeltmeler tip/mock yazımıyla sınırlı; test semantiği, severity veya eşik değişmedi.

Çalıştırılmadı: build, migration, seed, e2e/Playwright, Docker/K8s, DB-backed integration ve gerçek Redis doğrulaması — PostgreSQL (`localhost:5432`) ve Redis (`localhost:6379`) erişilebilir değil.

---

## 5. Kapanış değerlendirmesi

Batch F kapsamındaki P2-01/02/03 tamamlandı. Kanonik DDD motoru legacy validator ile aynı 6 kural koduna kavuştu; soft-fairness gerçek roster ve doğru takvim ayı kullanıyor; geçiş varsayılan kapalı, read-only bir flag altında ve write yolları migration modunda açık. Test skip, severity düşürme, eşik değişikliği, lint re-baseline veya DB/secret/git değişikliği yok.

**30 Kasım 2026 go-live değerlendirmesi hâlâ NOT READY:** PostgreSQL/Redis sağlanıp DB-backed migration/seed/integration/e2e/build ve worker doğrulaması tamamlanmadan, ayrıca tüm P0/P1/P2 değişiklikleri commit edilip history/gitleaks kontrolü yapılmadan üretim onayı verilmemelidir. P3 için ayrı açık kullanıcı onayı gereklidir; bu rapor o onayı içermez.
