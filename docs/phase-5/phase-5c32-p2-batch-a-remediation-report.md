# PHASE 5C.32 — P2 Batch A Remediation Kapanış Raporu

**Repo:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem` (authoritative)
**Önceki faz:** 5C.24 read-only denetim → P0 tamamlandı → P1 tamamlandı (5C.31) → P2 onayı alındı.
**Kapsam:** yalnızca `phase-5c24-readonly-audit-report.md` P2 satırlarından güvenli, code-onlyBatch A maddeleri: **P2-16, P2-17, P2-10, P2-11, P2-12 ve P2-02’nin trivial parçaları**. Diğer P2 maddeleri ve P3’e geçilmedi.
**Yedek:** `C:\Users\Hasan\AppData\Local\Temp\opencode\vardiyasystem-p2-backup-20261120-225904` (SHA256 `MANIFEST.txt`).
**Kısıtlar:** migration/DB/secret/git değişikliği yok; test skip’i, sayı eşiği değişikliği, lint re-baseline yok. Repo git değil; tüm değişiklikler uncommitted.

## Uygulanan değişiklikler

### P2-16 — Dashboard schedule route’ları (tenant-güvenli)
- `schedules.controller.ts`: `GET /schedules/activities` ve `GET /schedules/live-metrics`, dinamik `@Get(':id')` rotasından **önce** kaydedildi (aksi halde `:id` tarafından yakalanıyordu).
- Organizasyon **query parametresinden değil** `req.user.organizationId`’den alınıyor; org’suz caller için activities boş dönüyor (cross-tenant satır yok).
- `activities`: `auditLog.findMany` org + `status: 'SUCCESS'` filtresi, `createdAt desc`, `take: 50`; aksiyon tipleri istemci anlamlı tiplere map ediliyor.
- `live-metrics`: sahte değil, gerçek gateway socket sayısı (`gateway.server.sockets.sockets.size`).
- Controller 9. constructor argümanı olarak `ScheduleGateway` eklendi.

### P2-17 — ONK seed/master drift
- `prisma/seed.ts`: inline `onkolojiDevices` (Lineer Hızlandırıcı-* / Simülasyon CT, 7-gün `workDays`) ve inline `assistantTechShiftDefs` ONK blokları kaldırıldı.
- Yerine kanonik `applyOnkolojiMasterConfig(prisma, org.id, onkolojiUnit.id)` çağrısı bağlandı; artık ONK için tek kaynak `onkoloji-master-config.ts` (Linak-1/2, Tomoterapi, BT Simülatör; Mon–Fri; master vardiya şablonları).
- Kullanılmayan `ShiftType` import’u kaldırıldı.
- **Kanıt sınırı:** seed çalıştırılamadığı (PostgreSQL yok) için doğrulama kaynak/unit seviyesinde; DB’de fiili seed uygulaması yapılmadı.

### P2-10 — Determinizm
- Generator ve dry-run master-data `findMany` çağrılarına deterministik `orderBy` eklendi (personnel: `seniority desc, id asc`; device: `code asc, id asc`; holiday: `date asc, name asc`; shifts: `deviceId/type/startTime/id asc`; override/off-date/assignment: `date + id/shiftId/deviceId asc`).
- Inline generator ve greedy optimizer’da `seniority` artık pozisyondan (`indexOf(p) % 5`) değil gerçek `Personnel.seniority` alanından geliyor; eşit skorlarda `id.localeCompare` ile sabit tie-break.
- `PersonnelInfo` / `SchedulingProblemPersonnel` arayüzlerine `seniority` eklendi.

### P2-11 — İş yükü cap / `maxWeeklyHours`
- `dto.year` / `dto.month` generator options’a geçirildi; aylık cap artık doğru aya bağlı (önce her zaman Ocak 2026’ydı).
- Açık `maxOvertime: 0` falsy hatası `??` ile düzeltildi (`||` sessizce 20’ye döndürüyordu).
- Yerel (Pazartesi bazlı) haftalık saat ledger’ı eklendi; `maxWeeklyHours` tekniker/yardımcı/süpervizör için hard cap olarak uygulandı ve aşımda `MAX_WORK_EXCEEDED` uyarısı üretiliyor (sessiz aşırı-atama yok).
- **Kısmi kapsam:** greedy optimizer tarafında hard weekly cap uygulanmadı; bu eksik **P2-01 tek-motor kapsamına** bırakıldı ve “fixed” sayılmıyor.

### P2-12 — Yerel tarih aritmetiği
- Yeni ortak helper: `domain/value-objects/local-date.ts` (`parseDateParts`, `dateKey`, `toDateKey`, `dayOfWeek`, `addDays`, `startOfWeek`, `todayKey`) — takvim günü, UTC anı olarak parse edilmiyor.
- `schedule-auto-generator.service.ts`, `schedules.service.ts`, `fatigue-engine.ts` içindeki `toISOString().split('T')[0]` ve `new Date(dateStr).getDay()` kullanımları local helper’lara çevrildi.
- Negatif UTC ofsetinde (America/New_York) ±1 gün kayma test ile kanıtlandı ve önlendi.

### P2-02 (trivial parçalar)
- `ScoreAggregator`: kanonik 0.15 `COVERAGE` ağırlığı artık `breakdown` ve `total` içinde; `weightFor('COVERAGE')` destekleniyor.
- `SOFT_CONSTRAINT_WEIGHTS.COVERAGE` eklendi.
- `OptimizationStrategyId.LOCAL_SEARCH = 'local-search'` eklendi (optimizer zaten kayıtlıydı, DTO izin vermiyordu).
- **Kısmi kapsam:** P2-02’nin kalan maddeleri yapılmadı.

## Lint gate regresyonu (kapatıldı)
İlk Batch A taramasında **4152 error** (baseline 4075 → 77 yeni error) görüldü. Kaynak:
- Yeni P2 spec dosyalarındaki `any` / unsafe spread / unsafe member-access kullanımları,
- P2-16 rotasında Reflect metadata erişiminin `any` üzerinden yapılması,
- kullanılmayan import’lar.

Tümü **kaynağında** düzeltildi: p2-10 / p2-11 / p2-17 spec’leri typed interface’lerle yeniden yazıldı; p2-16 handler metadata’sı tip-güvenli okundu; unused import’lar temizlendi. Re-baseline **yapılmadı**; `eslint-baseline.json` değişmedi.

## Full-suite regresyonu (kapatıldı)
P2-16’nın yeni `ScheduleGateway` constructor argümanı, `5c9-export-scope.spec.ts` içindeki NestJS TestingModule’da provider eksikliğine yol açtı (6 hata). Test modülüne `ScheduleGateway` mock provider’ı eklenerek düzeltildi; test 6/6 PASS.

## Doğrulama kanıtı

| Katman | Komut | Sonuç |
|---|---|---|
| Backend typecheck | `npm run typecheck` | PASS |
| Backend lint gate | `npm run lint` | **PASS — 4068 error / 8600 warning** (baseline 4075’in 7 altında) |
| P2-16 | `vitest run p2-16-dashboard-routes.spec.ts` | 4/4 PASS |
| P2-17 | `vitest run p2-17-seed-master-config.spec.ts` | 3/3 PASS |
| P2-10 | `vitest run p2-10-determinism.spec.ts` | 4/4 PASS |
| P2-11 | `vitest run p2-11-workload-cap.spec.ts` | 4/4 PASS |
| P2-12 | `vitest run p2-12-local-date.spec.ts` | 3/3 PASS |
| P2-02 + optimizer | `vitest run p2-02 + 5b2 + 5b3 + 5b4` | 83/83 PASS |
| Eski regresyon | `vitest run 5c9-export-scope.spec.ts` | 6/6 PASS |
| Backend full suite | `npx vitest run` | **1212/1222 PASS** (113 dosyadan 112 geçti) |
| Frontend typecheck | `npm run typecheck` | PASS |
| Frontend full suite | `npm test` | **157/157 PASS** (19 dosya) |
| Frontend lint | `npm run lint` | **PASS — 0 error / 397 warning** |

Backend full suite’de kalan **10 hata** yalnızca `src/modules/schedules/__tests__/device-off.spec.ts` içindeki
`PrismaClientInitializationError: Can't reach database server at localhost:5432` kaynaklıdır; ortamda
PostgreSQL bulunmadığından veritabanı-backed testler çalıştırılamadı. P2-16 kaynaklı 6 hata yukarıdaki
gateway provider düzeltmesiyle kapatıldı; son koşuda tekrar görünmedi.

## Kapsam dışı / doğrulanamayan
- **P2-01, P2-03:** PHASE 3 tek-motor/mimari sequencing (P2-11 greedy hard-cap eksikliği de burada).
- **P2-13:** ürün kararı + additive migration (destructive migration önerilmiyor).
- **P2-14, P2-18:** hangi semantiğin canonical olduğuna dair politika kararı.
- **P2-09:** Redis/BullMQ tabanlı state + ürün kararı (A3 fail-closed 503 korunuyor).
- **P2-15:** büyük performans mimarisi (batch validation + in-memory index).
- **P2-02 (kalan), P2-04…P2-08:** Batch A kapsamı dışı.
- Build, e2e/Playwright, migration, seed, Docker/K8s ve DB-backed integration çalıştırılmadı.
- Repo git olmadığından commit/push/history/gitleaks doğrulaması yapılamadı.
- Emek hukuku / NDK yorumları doğrulanmış mevzuat olarak sunulmadı.
- **P3 başlatılmadı** — ayrı kullanıcı onayı bekleniyor.
