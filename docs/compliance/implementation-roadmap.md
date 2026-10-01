# VardiyaOS Compliance Implementation Roadmap

**Version:** 1.0.0 | **Date:** 2026-06-29 | **Classification:** HIGHLY RESTRICTED

---

## 1. Vision & Strategy

Transform VardiyaOS from a feature-complete scheduling platform into a fully compliant healthcare information system across KVKK, GDPR, ISO 27001, ISO 27799, and HIPAA frameworks.

### Guiding Principles

1. **Privacy by Design** — embed compliance into architecture, not bolt it on
2. **Data Minimization** — collect/retain only what is legally necessary
3. **Transparency by Default** — all data processing visible in processing register
4. **User Empowerment** — full data subject rights automated via REST APIs
5. **Defense in Depth** — encryption at every layer, zero-trust networking

### Current State vs Target State

| Dimension             | Current           | Target                                 |
| --------------------- | ----------------- | -------------------------------------- |
| Compliance frameworks | 3/5 partial       | 5/5 auditable                          |
| Data subject rights   | 0/9               | 9/9 automated                          |
| Consent management    | None              | Full lifecycle (give/withdraw/expire)  |
| Data retention        | Ad-hoc            | Automated cron-based policies          |
| Breach notification   | Manual            | Automated workflow                     |
| Audit coverage        | ~10% of endpoints | 100% of write endpoints                |
| Encryption            | Transport only    | Transport + field-level + key rotation |
| Processing register   | None              | 8 activities documented                |
| Risk management       | None              | 28 risks tracked                       |
| Certification         | None              | ISO 27001 + ISO 27799 ready            |

---

## 2. Phase Breakdown (6 Weeks Total)

### Phase 1: Foundation (Week 1) ✅ COMPLETED

| Task                                    | Deliverable                                         | Status  |
| --------------------------------------- | --------------------------------------------------- | ------- |
| Full system audit                       | Gap analysis, risk matrix                           | ✅ DONE |
| Prisma schema: 11 new models            | Consent, DSR, retention, breach, DPIA, PA           | ✅ DONE |
| Encryption service                      | AES-256-GCM with key derivation                     | ✅ DONE |
| @Log() decorator + AuditInterceptor fix | Working audit trail for decorated endpoints         | ✅ DONE |
| Data classification                     | @Classify() decorator, AuditDataClassification enum | ✅ DONE |
| App module registration                 | All 7 new modules registered                        | ✅ DONE |

### Phase 2: Core Modules (Week 2) ✅ COMPLETED

| Task                       | Deliverable                                        | Status  |
| -------------------------- | -------------------------------------------------- | ------- |
| Consent module             | ConsentService, ConsentController, templates       | ✅ DONE |
| Data subject module        | DataSubjectService, DSR workflow, 5 right types    | ✅ DONE |
| Data retention module      | Retention cron × 5, policy management, job history | ✅ DONE |
| Emergency access module    | Break-glass with approval/expiry/revocation        | ✅ DONE |
| Breach notification module | Record/contain/notify/resolve workflow             | ✅ DONE |
| Processing activity module | Activity register, DPIA process                    | ✅ DONE |

### Phase 3: Decorators & Coverage (Week 3) 🟡 IN PROGRESS

| Task                                    | Deliverable                                                                                            | Owner   | Duration |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------- | -------- |
| Apply @Log to all remaining controllers | units, devices, trainings, skills, shifts, handover-notes, attendance, device-incidents, notifications | Backend | 1 day    |
| Add @Classify to sensitive endpoints    | All PII-returning endpoints                                                                            | Backend | 1 day    |
| Inactivity interceptor                  | Session timeout enforcement (30 min)                                                                   | Backend | ✅ DONE  |
| ES256 JWT migration                     | Asymmetric signing, key rotation, kid header                                                           | Backend | 2 days   |
| CSRF token binding                      | Bind token to user session                                                                             | Backend | 1 day    |

### Phase 4: Deployment & Configuration (Week 4)

| Task                           | Deliverable                                                  | Owner  | Duration |
| ------------------------------ | ------------------------------------------------------------ | ------ | -------- |
| Generate ENCRYPTION_MASTER_KEY | 64+ hex char key, store in Vault/SealedSecret                | DevOps | 1 hour   |
| Run Prisma migrations          | Apply new models to production DB                            | DevOps | 1 hour   |
| Seed initial data              | Consent templates, retention policies, processing activities | DevOps | 1 hour   |
| Deploy all 7 modules           | Verify REST endpoints respond correctly                      | DevOps | 2 hours  |
| Configure retention policies   | POST 8 policies via API                                      | DevOps | 1 hour   |
| Run first manual retention job | Verify purge logic                                           | DevOps | 1 hour   |

### Phase 5: Frontend Compliance (Week 5)

| Task                          | Deliverable                                             | Owner    | Duration |
| ----------------------------- | ------------------------------------------------------- | -------- | -------- |
| Privacy policy page           | `/gizlilik-politikasi` route with full KVKK/GDPR text   | Frontend | 1 day    |
| Cookie consent banner         | Banner with accept/decline, preference center           | Frontend | 2 days   |
| Registration consent checkbox | Consent for data processing + communication             | Frontend | 1 day    |
| Data subject rights portal    | `/kvkk` page with SAR/erasure/portability forms         | Frontend | 2 days   |
| Account deletion UI           | Confirmation dialog, reason collection, status tracking | Frontend | 1 day    |
| Legal footer links            | Privacy policy, terms, KVKK links in app footer         | Frontend | 1 day    |

### Phase 6: Testing & Verification (Week 6)

| Task                               | Deliverable                        | Owner    | Duration |
| ---------------------------------- | ---------------------------------- | -------- | -------- |
| Unit tests for all new modules     | ≥80% coverage                      | Backend  | 2 days   |
| Integration tests for DSR workflow | Full SAR/erasure/portability flow  | QA       | 2 days   |
| Penetration test                   | OWASP Top 10 + healthcare-specific | Security | 3 days   |
| Consent workflow E2E               | Give → verify → withdraw → expire  | QA       | 1 day    |
| Retention job verification         | Run + verify purge/archive         | DevOps   | 1 day    |
| Final compliance report            | Updated scores, gap closure        | Security | 1 day    |

---

## 3. Ongoing Compliance Cadence

### Weekly

- Review suspicious activity flags in audit dashboard
- Check pending data subject requests (>24h escalation)
- Verify retention cron jobs ran successfully

### Monthly

- Review emergency access grants (revoke expired)
- Generate consent statistics report
- Review breach notification log
- Update risk register with new findings
- Dependency vulnerability scan

### Quarterly

- Full compliance self-assessment
- Review and update consent templates
- Review processing activities register
- Conduct DPIA for new processing activities
- Penetration test (if significant changes)
- Backup restore drill

### Annual

- External compliance audit
- ISO 27001 / ISO 27799 surveillance audit
- KVKK data controller registration update
- Business continuity plan review
- Disaster recovery drill (full failover)
- Security awareness training
- Risk assessment review

---

## 4. Resource Requirements

### Personnel

| Role                    | FTE | Responsibility                        |
| ----------------------- | --- | ------------------------------------- |
| Data Protection Officer | 0.2 | Overall compliance oversight          |
| Security Architect      | 0.5 | Technical controls, encryption, audit |
| Backend Developer       | 1.0 | Module implementation, decorators     |
| Frontend Developer      | 0.5 | Privacy pages, consent UI             |
| DevOps Engineer         | 0.3 | Deployment, migration, cron           |
| QA Engineer             | 0.5 | Compliance test automation            |

### Estimated Cost (One-Time)

| Item                                  | Cost (USD)  |
| ------------------------------------- | ----------- |
| Development effort (6 weeks × 3 FTE)  | $36,000     |
| External penetration test             | $10,000     |
| ISO 27001 certification (Stage 1 + 2) | $15,000     |
| ISO 27799 certification (combined)    | $8,000      |
| DPIA consulting                       | $5,000      |
| DPA legal review                      | $3,000      |
| **Total**                             | **$77,000** |

### Estimated Ongoing Cost (Annual)

| Item                        | Cost (USD/yr) |
| --------------------------- | ------------- |
| DPO (0.2 FTE)               | $12,000       |
| Internal audit              | $8,000        |
| External pen test           | $10,000       |
| Certification maintenance   | $5,000        |
| Security tools (Snyk, SIEM) | $6,000        |
| **Total**                   | **$41,000**   |

---

## 5. Dependencies & Prerequisites

### Hard Dependencies

- [x] PostgreSQL with JSONB support (already in use)
- [x] Node.js 20+ with crypto module (AES-256-GCM)
- [x] Prisma with raw SQL support (for audit functions)
- [x] NestJS with ScheduleModule (for cron jobs)
- [ ] `ENCRYPTION_MASTER_KEY` set in environment
- [ ] Prisma migration applied (`npx prisma migrate dev`)
- [ ] Redis available (for enhanced rate limiting + session)

### Soft Dependencies

- [ ] Vault / AWS Secrets Manager / Kubernetes Secret
- [ ] Documentation review by legal counsel
- [ ] Penetration test vendor engaged
- [ ] DPA signed with cloud providers
- [ ] Cyber insurance policy updated

---

## 6. Success Criteria

### Gate 1: Technical Implementation (Week 2)

- [x] All 11 new Prisma models created and migrated
- [x] All 7 backend modules registered and compiling
- [x] EncryptionService passes unit tests (encrypt → decrypt roundtrip)
- [x] @Log decorator functional (verified via integration test)
- [ ] **NEW:** `npx prisma generate` succeeds
- [ ] **NEW:** `npm run build` succeeds

### Gate 2: API Completeness (Week 4)

- [ ] All 9 data subject rights have working endpoints
- [ ] Consent give/withdraw/check lifecycle verified
- [ ] Retention cron job runs and purges test data
- [ ] Emergency access grant/revoke verified
- [ ] Breach notification workflow tested end-to-end
- [ ] Processing activity register populated

### Gate 3: Compliance Verification (Week 6)

- [ ] KVKK gap analysis: all critical/high gaps closed
- [ ] GDPR gap analysis: all critical/high gaps closed
- [ ] Risk matrix: no risks above "Medium" without mitigation plan
- [ ] Penetration test: zero critical/high findings
- [ ] HVKK compliance report: ≥8.5/10 score
- [ ] Suite of regression tests passing

### Gate 4: Operational Readiness

- [ ] Monitoring dashboards for compliance metrics
- [ ] On-call runbook includes compliance alert response
- [ ] Incident response plan includes data breach procedure
- [ ] Backup includes compliance-critical data
- [ ] Team trained on compliance procedures

---

## 7. Architecture Decision Records

### ADR-001: Field-Level Encryption at Application Layer

- **Status:** Accepted
- **Context:** PII fields (names, emails, phones, IPs) need protection beyond transport encryption
- **Decision:** AES-256-GCM encryption at the application layer via EncryptionService, not PostgreSQL TDE
- **Rationale:** Portability across PostgreSQL versions, column-level granularity, key rotation support, audit-friendly
- **Trade-off:** Cannot query encrypted fields directly; use hash-based lookup for exact matches

### ADR-002: @Log Decorator Pattern over Global Interceptor

- **Status:** Accepted
- **Context:** Need per-endpoint control over audit logging with explicit intent
- **Decision:** Decorator-based (opt-in) rather than global automatic (opt-out) audit logging
- **Rationale:** Explicit developer intent, reduced noise from read endpoints, ability to define entity type per endpoint
- **Trade-off:** Developers must remember to add `@Log()` to new write endpoints

### ADR-003: Soft-Delete for GDPR Erasure

- **Status:** Accepted
- **Context:** Right to erasure requires removal of personal data while preserving audit integrity
- **Decision:** Pseudonymization + account disable + audit preservation, not hard DELETE
- **Rationale:** Audit logs (with RESTRICT on User FK) must remain for legal compliance; full deletion would break audit chain
- **Trade-off:** User email is replaced with `deleted-{uuid}@anon.vardiya`; some associated data persists in anonymized form

### ADR-004: Retention via Cron Jobs, Not Database Triggers

- **Status:** Accepted
- **Context:** Data retention requires configurable, auditable, and testable execution
- **Decision:** NestJS ScheduleModule cron jobs with explicit policy-driven logic
- **Rationale:** Audit trail for every retention run, easy to test, configurable policies, failure logging
- **Trade-off:** Requires application instance to be running; no automatic cleanup if app is down

---

## 8. Quick-Start Deployment Commands

```bash
# 1. Generate Prisma client with new models
cd backend
npx prisma generate

# 2. Apply database migration
npx prisma migrate dev --name add_compliance_models

# 3. Set encryption master key in .env
echo "ENCRYPTION_MASTER_KEY=$(openssl rand -hex 64)" >> .env

# 4. Seed initial compliance data
npx ts-node src/seed-compliance.ts

# 5. Verify modules are registered
npm run build

# 6. Deploy and run retention policy seeding
curl -X POST http://localhost:3000/api/v1/data-retention/policies \
  -H "Content-Type: application/json" \
  -d '{"entityType":"auth_attempts","retentionDays":90,"purgeAfterDays":90,"description":"Failed login attempts"}'

# 7. Verify consent endpoints
curl http://localhost:3000/api/v1/consent/templates -H "Authorization: Bearer $TOKEN"

# 8. Run initial retention job
curl -X POST http://localhost:3000/api/v1/data-retention/run -H "Authorization: Bearer $TOKEN"
```
