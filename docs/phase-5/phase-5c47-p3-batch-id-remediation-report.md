# Phase 5c47 — P3 Batch I-D (Git / OneDrive) Kapanış Raporu

**Tarih:** 2026-11-22
**Onay:** Kullanıcı `I-D'yi uygula (Recommended)` seçeneğini açıkça onayladı.
**Kapsam:** P3-14 — kanonik Desktop ağacının git'e girişi ve OneDrive riskinin ele alınması. **Eski klon silinmedi/arşivlenmedi**; bu işlem karar dokümanı gereği ayrı açık onay bekliyor.
**Yedek:** `C:\Users\Hasan\AppData\Local\Temp\opencode\vardiyasystem-batchid-backup-20261122\MANIFEST.txt` (1767 dosya).
**Karar referansı:** `docs/phase-5/phase-5c43-p3-batch-i-decision-record.md` §P3-14.
**Commit / push:** **Yapılmadı.** Tüm değişiklikler uncommitted kalıyor.

## 1. Uygulanan değişiklikler

### 1.1 Kanonik ağaç git'e girdi (OneDrive güvenli düzen)

```
git init -b main --separate-git-dir="C:\Users\Hasan\AppData\Local\vardiya-system-git"
git remote add origin https://github.com/hhasanagir/vardiyasystem.git
git fetch origin main --no-tags
git reset --mixed origin/main
```

- OneDrive çalışıyor (`OneDrive.exe`, `OneDrive=C:\Users\Hasan\OneDrive`) ve Desktop yolu senkronize ediliyor. Bu nedenle `.git` **nesne veritabanı OneDrive dışına** (`%LOCALAPPDATA%\vardiya-system-git`) konuldu; senkronize ağaçta yalnızca **56 byte'lık gizli bir gitfile** var: `gitdir: C:/Users/Hasan/AppData/Local/vardiya-system-git`.
- HEAD, remote ucuna (`ef1277f6c61c765129ec1a35f09194d4d1b89613`) bağlandı; index remote ağacına resetlendi. **`git reset --mixed` çalışma ağacını değiştirmedi** — `.gitignore`, `package.json`, `backend/src/main.ts` hash'leri öncesi/sonrası birebir aynı.
- `git status`: **1116 kayıt** (779 `M`, 40 `D`, 297 `??`) — bunlar remote uca göre gerçek, henüz commit edilmemiş P0/P1/P2/P3 deltası. Hiçbir dosya stage edilmedi, commit/push yapılmadı.
- Global git kimliği zaten tanımlı (`hhasanagir`, `121825941+hhasanagir@users.noreply.github.com`): ek config değişikliği yapılmadı.

> Dikkat: gitfile **mutlak yol** içerir. Kanonik klasör taşınır/adı değiştirirse gitfile yeniden yazılmalı. `%LOCALAPPDATA%\vardiya-system-git` ağacın dışında olduğu için mevcut yedek/MANIFEST kapsamında değildir; ayrı yedeklenmelidir.

### 1.2 Remote geçmişi doğrulandı (salt okunur)

- Eski klon HEAD: `b672483306641122038063d4289ff17251856410` (branch `main`).
- Remote `main` ucu: `ef1277f6c61c765129ec1a35f09194d4d1b89613`.
- GitHub compare API (read-only): `base=b672483...`, `head=ef1277f...` → **status `ahead`, ahead_by 31, behind_by 0**. Yani remote, `b672483`'ü içeriyor; eski klonun commit geçmişi benzersiz değil.
- Bu, karar dokümanındaki "remote'un b672483'ü içerdiği doğrulanmalı" koşulunu karşılıyor. Ancak `M LICENSE` ve `bin/gh.exe` **commit edilmemiş** ve remote'da yok — silme/arşivleme öncesi ayrıca korunmalı.

### 1.3 Eski klon korundu

`C:\Users\Hasan\OneDrive\Belgeler\GitHub\vardiyasystem` üzerinde **hiçbir yazma işlemi yapılmadı**. Öncesi/sonrası normalleştirilmiş karşılaştırma birebir aynı:

| Alan | Değer |
|---|---|
| HEAD | `b672483306641122038063d4289ff17251856410` |
| Branch / remote | `main` / `https://github.com/hhasanagir/vardiyasystem.git` |
| Status | ` M LICENSE`, `?? bin/gh.exe` |
| LICENSE SHA-256 | `8999137010582DA29456C10E0A628BF3FA7EAD05AB3AE5F424AD25CD0DD94574` |
| `bin/gh.exe` | 42.875.192 byte |
| Reflog | 21 kayıt |

`.git` refs/reflog, commit edilmemiş `LICENSE` değişikliği ve untracked `bin/` tamamen yerinde. **Silme/arşivleme bu batch'in dışında** ve ayrı açık onay gerektiriyor.

## 2. Kapılar

| Kapı | Sonuç |
|---|---|
| Backend typecheck | PASS |
| Frontend typecheck | PASS |
| Backend tam suite | **1298/1298 PASS** (121 dosya) |
| Frontend birim testleri | **162/162 PASS** (21 dosya) |
| Backend lint | **4074 error / baseline 4075** → PASS (re-baseline yok) |
| Frontend lint | **0 error / 332 warning** |
| Backend build (`nest build`) | PASS |
| Frontend build (`ng build`) | PASS |
| Backend DB e2e (`npm run test:e2e`) | **10 dosya, 85/85 PASS** |
| Tarayıcı e2e (`npm run e2e`) | **44/44 PASS** (4.4 dk) |
| Git doğrulama | HEAD=remote tipi, çalışma ağacı hash'leri değişmedi, commit/push yok |
| Eski klon koruma | Normalize before/after eşit (`OLD_CLONE_NORMALIZED_UNCHANGED: True`) |

Notlar:

- I-D kaynak kodu değiştirmedi; kapılar I-C'den sonra **yeniden** çalıştırıldı ve aynı sonuçları verdi.
- Tarayıcı e2e'nin yeniden ürettiği `e2e/playwright-report/index.html`, I-D yedeğindeki hash ile birebir aynı olacak şekilde geri yüklendi (`BFBE31BC…120CACB4`).
- Test skip'i, eşik/severity zayıflatması veya `eslint-baseline.json` re-baseline'i yok.

## 3. Kapsam / manifest

I-D yedeğine göre (`batchid-manifest-diff.py`):

- **Değişen:** 0 dosya
- **Yeni:** 5 dosya — `.git` (56 byte gitfile), bu rapor (diff'den sonra yazıldı) ve 3 OneDrive `ReparsePoint` artefaktı (`coverage-engine.ts`, `coverage-input-mapper.ts`, `coverage-types.ts`; I-B dosyaları, yedekleme scripti dehydrated oldukları için kopyalayamamış)
- **Silinen:** 0 dosya
- **Yasaklı yol eşleşmesi:** 0

Migration, `schema.prisma`, seed, `.env`, secret, `eslint-baseline.json`, Docker, package dosyalarına ve eski klona dokunulmadı.

## 4. P3 durumu (I-D sonrası)

| Madde | Önce | Sonra |
|---|---|---|
| P3-14 | PARTIAL | **Git ön koşulu RESOLVED**; arşivleme/silme kararı **OPEN** (ayrı onay) |
| P3-01 | PARTIAL | PARTIAL (Batch G'den kalan `ScoringModel` GATE 5 pin'i) |

Diğer P3 maddeleri (P3-02, 06, 08, 09, 10, 11, 13) kapalı kaldı.

## 5. Go-live

Kanonik ağaç artık git'e sahip ve remote geçmişiyle ilişkilendirildi; ancak:

- **1116 dosya hâlâ uncommitted**; commit/push yapılmadı, PR/branch stratejisi karara bağlanmadı (remote, eski HEAD'in 31 commit önünde; kanonik çalışma ağacı otorite).
- Eski klondaki `M LICENSE` ve `bin/gh.exe` remote'da yok — arşivlemeden önce ayrıca ele alınmalı.
- OneDrive dışındaki git dir (`%LOCALAPPDATA%\vardiya-system-git`) yedekleme kapsamına alınmalı.
- Staging/production DB, Redis ve worker dağıtımı doğrulanmadı; P3-01 hâlâ PARTIAL.

Bu nedenlerle **30 Kasım 2026 go-live değerlendirmesi NOT READY** kalıyor.

> **STOP — Batch I-D tamamlandı. Eski klonun arşivlenmesi/silmesi ve commit/push + staging doğrulaması için ayrı açık onay gerekir.**
