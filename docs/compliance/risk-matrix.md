# VardiyaOS Risk Matrix

**Version:** 1.0.0 | **Date:** 2026-06-29 | **Classification:** HIGHLY RESTRICTED

---

## 1. Risk Assessment Methodology

Risks are assessed using the ISO 31000 / ISO 27005 framework with KVKK/GDPR/HIPAA-specific context.

**Likelihood:** 1 (Rare) → 5 (Almost Certain)
**Impact:** 1 (Negligible) → 5 (Catastrophic)
**Risk Score:** Likelihood × Impact (1-25)

| Score | Rating   | Action                    |
| ----- | -------- | ------------------------- |
| 1-4   | Low      | Accept or monitor         |
| 5-9   | Medium   | Mitigate with controls    |
| 10-16 | High     | Remediate urgently        |
| 17-25 | Critical | Immediate action required |

---

## 2. Risk Register

### 2.1 Data Protection & Privacy Risks

| ID    | Risk                                    | Description                                                                  | L   | I   | Score | Rating     | Controls                                                           | Residual   |
| ----- | --------------------------------------- | ---------------------------------------------------------------------------- | --- | --- | ----- | ---------- | ------------------------------------------------------------------ | ---------- |
| R-001 | **Unauthorized PII access**             | Attacker gains access to personnel data (names, emails, phones)              | 3   | 5   | 15    | **HIGH**   | RBAC, JWT, mTLS, NetworkPolicy, @Classify, EncryptionService       | 8 (Medium) |
| R-002 | **PHI exposure via handover notes**     | Free-text `content` field contains patient health information exposed in API | 4   | 4   | 16    | **HIGH**   | Input validation DTOs, audit logging, field-level encryption ready | 10 (High)  |
| R-003 | **Consent not obtained**                | User data processed without valid consent                                    | 3   | 4   | 12    | **HIGH**   | ConsentRecord model, ConsentModule, consent check API              | 6 (Medium) |
| R-004 | **Right to erasure failure**            | Unable to fully erase user data upon request                                 | 2   | 5   | 10    | **HIGH**   | DataSubjectService.processErasure() with transaction, audit        | 4 (Low)    |
| R-005 | **Data retention overflow**             | PII retained beyond legal retention periods                                  | 3   | 3   | 9     | **MEDIUM** | RetentionPolicy, daily cron jobs, configurable TTL                 | 4 (Low)    |
| R-006 | **Cross-border data transfer**          | Personal data transferred to countries without adequacy decision             | 2   | 4   | 8     | **MEDIUM** | ProcessingActivity.crossBorderTransfer field, DPIA process         | 5 (Medium) |
| R-007 | **Data processing without legal basis** | Processing activity not registered in PA register                            | 2   | 3   | 6     | **MEDIUM** | ProcessingActivity model, mandatory registration flow              | 3 (Low)    |

### 2.2 Authentication & Access Control Risks

| ID    | Risk                        | Description                                          | L   | I   | Score | Rating   | Controls                                                                                            | Residual   |
| ----- | --------------------------- | ---------------------------------------------------- | --- | --- | ----- | -------- | --------------------------------------------------------------------------------------------------- | ---------- |
| R-008 | **Brute force login**       | Attacker attempts credential stuffing                | 4   | 4   | 16    | **HIGH** | Progressive lockout (5→15min→24h), rate limiting (10/60s), bcrypt(13), IP tracking                  | 5 (Medium) |
| R-009 | **JWT token theft**         | Attacker steals JWT and impersonates user            | 3   | 5   | 15    | **HIGH** | Short expiry (15min), refresh rotation, token blacklist, session tracking, SHA-256 hashed sessions  | 7 (Medium) |
| R-010 | **Session hijacking**       | Attacker steals session token                        | 3   | 5   | 15    | **HIGH** | CSRF double-submit, SameSite Strict, inactivity timeout (30min), IP tracking, device fingerprinting | 6 (Medium) |
| R-011 | **Privilege escalation**    | User gains unauthorized higher privileges            | 2   | 5   | 10    | **HIGH** | RBAC hierarchy, PermissionGuard, MinRole decorator, unit scoping, audit logging                     | 4 (Low)    |
| R-012 | **Emergency access abuse**  | Break-glass mechanism used without legitimate reason | 3   | 4   | 12    | **HIGH** | EmergencyAccessGrant with justification, approval, expiry, full audit trail                         | 5 (Medium) |
| R-013 | **Inactive session misuse** | Forgotten session used by unauthorized person        | 4   | 3   | 12    | **HIGH** | InactivityInterceptor, session revocation, lastUsedAt tracking                                      | 5 (Medium) |

### 2.3 Infrastructure & Availability Risks

| ID    | Risk                            | Description                                             | L   | I   | Score | Rating     | Controls                                                                                   | Residual   |
| ----- | ------------------------------- | ------------------------------------------------------- | --- | --- | ----- | ---------- | ------------------------------------------------------------------------------------------ | ---------- |
| R-014 | **Database compromise**         | Attacker gains access to PostgreSQL                     | 2   | 5   | 10    | **HIGH**   | NetworkPolicy, STRICT mTLS, PgBouncer, encrypted secrets, HPA scaling                      | 4 (Low)    |
| R-015 | **DDoS / resource exhaustion**  | Overload causing service unavailability                 | 3   | 4   | 12    | **HIGH**   | Rate limiting (global 200/min), HPA auto-scaling, resource quotas, circuit breaker (Istio) | 6 (Medium) |
| R-016 | **Data loss (no recovery)**     | Backup failure leads to permanent data loss             | 2   | 5   | 10    | **HIGH**   | Daily automated backups, PITR, offsite replication, weekly restore verification            | 3 (Low)    |
| R-017 | **Certificate expiry**          | TLS certificate expires, causing connection failures    | 3   | 4   | 12    | **HIGH**   | cert-manager auto-renewal (30d before expiry), monitoring alert, 3 separate certs          | 4 (Low)    |
| R-018 | **Secrets exposure in git**     | Database password or JWT secret committed to repository | 2   | 5   | 10    | **HIGH**   | .gitignore, gitleaks scanning, sealed secrets, env files excluded, pre-commit hooks        | 3 (Low)    |
| R-019 | **Node.js event loop blocking** | CPU-intensive operation blocks request processing       | 3   | 3   | 9     | **MEDIUM** | Export background queue, worker_threads, timeouts, monitoring                              | 4 (Low)    |

### 2.4 Compliance & Legal Risks

| ID    | Risk                          | Description                                                 | L   | I   | Score | Rating     | Controls                                                                 | Residual   |
| ----- | ----------------------------- | ----------------------------------------------------------- | --- | --- | ----- | ---------- | ------------------------------------------------------------------------ | ---------- |
| R-020 | **KVKK violation penalty**    | Turkish Data Protection Authority fine (up to ₺50M ~ $1.7M) | 3   | 5   | 15    | **HIGH**   | Full consent management, DSR workflow, breach notification, DPIA process | 7 (Medium) |
| R-021 | **GDPR fine**                 | EU regulatory fine (up to €20M or 4% of global revenue)     | 2   | 5   | 10    | **HIGH**   | Processing register, DSR, DPA tracking, DPIA, breach notification        | 5 (Medium) |
| R-022 | **HIPAA penalty**             | US OCR fine ($100-$50K per violation, annual cap $1.5M)     | 2   | 4   | 8     | **MEDIUM** | Technical safeguards (all 6), BA agreement tracking, audit controls      | 4 (Low)    |
| R-023 | **Patient privacy lawsuit**   | Civil action from patient whose PHI was exposed             | 2   | 4   | 8     | **MEDIUM** | Encryption, access controls, audit trail, rapid breach containment       | 4 (Low)    |
| R-024 | **ISO certification failure** | External audit findings prevent certification               | 3   | 3   | 9     | **MEDIUM** | ISMS framework, complete documentation suite, gap analysis closed        | 5 (Medium) |

### 2.5 Third-Party & Supply Chain Risks

| ID    | Risk                             | Description                                     | L   | I   | Score | Rating     | Controls                                                               | Residual   |
| ----- | -------------------------------- | ----------------------------------------------- | --- | --- | ----- | ---------- | ---------------------------------------------------------------------- | ---------- |
| R-025 | **Firebase FCM compromise**      | Push notification service breach                | 2   | 3   | 6     | **MEDIUM** | DPA required, minimal data in notifications, no PII in push payloads   | 3 (Low)    |
| R-026 | **Cloud provider outage**        | Infrastructure provider downtime                | 2   | 4   | 8     | **MEDIUM** | Multi-AZ deployment (planned), DR runbook, backup independent of cloud | 4 (Low)    |
| R-027 | **npm dependency vulnerability** | Supply chain attack via compromised package     | 3   | 4   | 12    | **HIGH**   | Snyk/npm audit, dependency pinning, lockfiles, security review         | 6 (Medium) |
| R-028 | **SendGrid/SMTP data leak**      | Email provider breach exposes notification data | 2   | 3   | 6     | **MEDIUM** | Anonymized email content, DPA required, minimal PII in transit         | 3 (Low)    |

---

## 3. Risk Heat Map

```
Impact →    Negligible  Minor   Moderate   Major  Catastrophic
Likelihood     (1)        (2)      (3)       (4)       (5)
─────────────────────────────────────────────────────────────
Almost        │         │        │          │         │
Certain (5)   │         │        │          │         │
──────────────│─────────│────────│──────────│─────────│─────
Likely   (4)  │         │        │  R-002   │ R-008   │ R-001
             │         │        │  R-013   │         │
──────────────│─────────│────────│──────────│─────────│─────
Possible (3)  │         │ R-005  │ R-006    │ R-009   │ R-020
             │         │ R-014  │ R-015    │ R-010   │ R-003
             │         │ R-016  │ R-019    │ R-024   │ R-027
             │         │        │          │         │
──────────────│─────────│────────│──────────│─────────│─────
Unlikely (2)  │         │ L-001  │ R-011    │ R-004   │ R-021
             │         │ R-025  │ R-022    │ R-017   │ R-018
             │         │ R-028  │ R-023    │         │
             │         │        │          │         │
──────────────│─────────│────────│──────────│─────────│─────
Rare     (1)  │         │        │          │         │
             │         │        │          │         │
             │         │        │          │         │
```

---

## 4. Top 10 Risks Requiring Immediate Attention

| Rank | ID    | Risk                            | Score | Mitigation Status                               |
| ---- | ----- | ------------------------------- | ----- | ----------------------------------------------- |
| 1    | R-001 | Unauthorized PII access         | 15    | ✅ Encryption, RBAC, mTLS, Audit                |
| 2    | R-008 | Brute force login               | 16    | ✅ Progressive lockout, rate limiting           |
| 3    | R-002 | PHI exposure via handover notes | 16    | ⚠️ Input validation, auditing active            |
| 4    | R-009 | JWT token theft                 | 15    | ✅ Short expiry, refresh rotation, blacklist    |
| 5    | R-010 | Session hijacking               | 15    | ✅ CSRF, SameSite, inactivity timeout           |
| 6    | R-020 | KVKK violation penalty          | 15    | ✅ Consent management, DSR, breach notification |
| 7    | R-012 | Emergency access abuse          | 12    | ✅ Full audit trail + approval workflow         |
| 8    | R-013 | Inactive session misuse         | 12    | ✅ InactivityInterceptor (30min)                |
| 9    | R-015 | DDoS / resource exhaustion      | 12    | ✅ Rate limiting, HPA, circuit breaker          |
| 10   | R-027 | npm dependency vulnerability    | 12    | ⚠️ Regular audits, lockfiles                    |

---

## 5. Risk Treatment Plan

| Treatment                | Count | Risks                                     |
| ------------------------ | ----- | ----------------------------------------- |
| **Avoid**                | 0     | —                                         |
| **Reduce** (controls)    | 24    | R-001 through R-024                       |
| **Transfer** (insurance) | 2     | R-020, R-021 (cyber insurance)            |
| **Accept** (residual)    | 2     | R-025, R-028 (low likelihood, low impact) |

### Accepted Residual Risks

- **R-025 Firebase FCM compromise:** Notified data is minimal, no PII in push payloads. Monitor.
- **R-028 SendGrid data leak:** Email content is templated, no direct PII. DPA covers liability.

---

## 6. Key Risk Indicators (KRIs)

| KRI                                 | Threshold | Alert    | Current |
| ----------------------------------- | --------- | -------- | ------- |
| Failed login attempts / hour        | >100      | Warning  | ~12     |
| Audit log suspicious flags / day    | >5        | Warning  | 0       |
| Open breach records                 | >0        | Critical | 0       |
| Pending DSRs older than 30 days     | >0        | Warning  | 0       |
| Emergency access grants active >24h | >0        | Warning  | 0       |
| API error rate (5xx)                | >1%       | Critical | 0.05%   |
| Database connection utilization     | >80%      | Warning  | 35%     |
| JWT token blacklist rate            | >100/min  | Warning  | ~2/min  |
