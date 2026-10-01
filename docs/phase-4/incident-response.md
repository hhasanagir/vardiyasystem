# VardiyaOS — Incident Response Runbook

**Phase:** 4 — Production Readiness
**Applies to:** Production deployments of VardiyaOS (radiology shift management)
**Companion docs:** `production-configuration.md`, `production-deployment-checklist.md`, `backup-recovery-runbook.md`

---

## General Principles

- Every incident follows the same five stages: **Detect → Contain → Investigate → Recover → Review**
- Containment takes priority over root-cause analysis. Restore safety first, understand later.
- For security incidents involving PHI-adjacent data (staff schedules, assignments), assume regulatory notification obligations (KVKK/GDPR) and involve compliance early.
- Record timestamps and actions in the incident ticket as you go — memory degrades, logs rotate in 14 days.
- Severity ladder: **SEV1** (data breach / total outage / corruption) → page everyone; **SEV2** (partial outage, single-tenant compromise) → page on-call; **SEV3** (degradation) → ticket + business hours.

Quick command reference used throughout:

```bash
# Scale API to zero (kill switch)
kubectl scale deployment/vardiya-api --replicas=0

# Rotate JWT secrets (invalidates ALL sessions & tokens on restart)
# Update secret store, then:
kubectl rollout restart deployment/vardiya-api

# Revoke all sessions for a user
curl -X POST https://vardiya.example.com/api/v1/auth/logout-all -H "Authorization: Bearer $ADMIN_TOKEN"

# Admin-unlock a locked account
curl -X POST https://api/v1/auth/unlock -d '{"email":"user@example.com"}' ...
```

---

## 1. Account Compromise

A user's credentials are controlled by an attacker (phishing, credential stuffing, malware).

### Detect

- Alerts: lockout spikes for one account from varied IPs; successful login followed by unusual IP/UA; audit log shows `LOGIN` then role-inconsistent actions.
- User report ("I got a password-reset email I didn't request").
- Grafana auth dashboard: login failure rate anomaly per account.

### Contain

1. Force `logout-all` for the affected user (revokes every session).
2. Reset the user's password via admin flow; require change at next login.
3. If admin account compromised: rotate `JWT_ACCESS_TOKEN_SECRET` and `JWT_REFRESH_TOKEN_SECRET` and restart the fleet — this invalidates every token in circulation.
4. Temporarily disable the account if the user is unreachable.
5. Block attacker IP ranges at nginx (`deny` list) as a stopgap.

### Investigate

- Pull audit logs for the account window: what was viewed/exported/modified?
- Check `/api/v1/auth/sessions` history, IPs, user agents in structured logs (correlate via `trace_id`).
- Determine entry vector: reused password? phishing invite code? leaked DB elsewhere (check breach feeds)?
- Verify whether invite codes or subordinate accounts were created by the attacker.

### Recover

- User sets a fresh password out-of-band (verified channel); re-enable account.
- Revoke any attacker-created invite codes, delete attacker-created records.
- Return JWT secrets to normal rotation schedule after the emergency rotation window.

### Review

- Was MFA/passkey an option that wasn't enabled? File hardening ticket.
- Tune `AUTH_LOCKOUT_*` thresholds if stuffing went undetected too long.
- Add detection rule if the pattern was novel; document timeline in postmortem.

---

## 2. Refresh Token Theft

An attacker obtained a refresh token (XSS, log leakage, stolen device). Refresh tokens are long-lived (7 d default).

### Detect

- Same refresh token family used from two distinct IPs/user agents within a short window.
- Reuse of an already-rotated refresh token — the rotation/reuse-detection guard fires and invalidates the family; alert on these events.
- Abnormal `/api/v1/auth/refresh` rate from one identity.

### Contain

1. The reuse detector should have auto-revoked the token family — verify it did (`sessions` list is empty for the victim).
2. Manually revoke all sessions for the affected user (`logout-all`).
3. If theft source was XSS in frontend: ship a hotfix, purge CDN cache.
4. If many users affected (log leak): rotate both JWT secrets fleet-wide and restart — global session invalidation.

### Investigate

- Trace how the token left the system: browser storage? proxy logs with Authorization headers? support screenshots?
- Enumerate what the stolen access-token windows (15 min each) touched: audit log query by user + time range.
- Confirm no privilege escalation occurred during the window.

### Recover

- Victim re-authenticates cleanly; new token family issued.
- Shorten `JWT_REFRESH_TOKEN_EXPIRES_IN` temporarily (e.g. 24 h) until leak vector is closed.
- Fix the leak: remove tokens from any logging/storage surface; enforce HttpOnly cookie transport if body-based transport keeps leaking.

### Review

- Postmortem: was rotation+reuse-detection effective? Time-to-detect vs time-to-abuse.
- Add alert threshold on refresh-from-new-IP events.
- Consider binding refresh tokens to device fingerprints.

---

## 3. Cross-Tenant Access

A user reads/writes another organization's data (multi-tenant isolation failure — highest severity for a SaaS hospital product).

### Detect

- Audit log anomaly: `organizationId` in accessed records ≠ actor's `organizationId`.
- Customer report of foreign data appearing in their UI.
- Automated tenant-isolation tests failing in staging/prod probes.
- IDOR smoke test (deployment checklist §3.3) catching it pre-wider-impact.

### Contain

1. **Stop exposure:** scale API to zero or enable maintenance mode at nginx (`return 503`) — data integrity questions come second to active leakage.
2. Identify the vulnerable endpoint(s)/code path (missing `organizationId` filter in Prisma `where` clauses is the classic cause).
3. If a specific feature flag gates the path (e.g. `ENABLE_REALTIME_COLLABORATION`), flip the flag off and restart instead of full outage.

### Investigate

- Quantify scope: which tenants, which tables, which timeframe? Query audit logs + row-level review of cross-org access patterns.
- Root cause: missing tenant predicate, broken Prisma middleware, WS room join without org check, or export/report path bypassing scoping.
- Preserve evidence: snapshot DB + logs before remediation writes over them.

### Recover

- Patch code path; deploy fix behind the same endpoint.
- Delete/anonymize improperly exposed data per legal guidance; notify affected tenants per contract and regulation (KVKK/GDPR 72 h clock may apply).
- Run the full tenant-isolation test suite against prod API (read-only probes) before reopening traffic.

### Review

- Introduce a mandatory tenant-scoping test scaffold for every new module (lint rule / CI check on Prisma calls lacking `organizationId`).
- Consider PostgreSQL RLS (row-level security) as defense in depth.
- Postmortem shared with affected customers as appropriate.

---

## 4. Database Failure

Postgres unavailable, degraded, or corrupted (disk full, OOM, replication lag, hardware).

### Detect

- `GET /api/v1/health/ready` reports `database: error`; readiness flips `degraded`; Slack alert fires (5-min cooldown built in).
- Grafana: connection errors, p95 latency spike, PgBouncer `cl_waiting` queue growth.
- Pods start crash-looping if boot-time DB checks fail.

### Contain

1. Do not restart things blindly — capture state first: `SHOW POOLS;` on PgBouncer, `pg_stat_activity` on Postgres, disk usage.
2. If disk-full: free WAL/archive space cautiously (never delete unarchived WAL).
3. If a bad migration is mid-flight: pause deploy pipeline before it does more damage.
4. Enable nginx 503 maintenance mode so users see a clean message instead of 500s.

### Investigate

- Failure class: resource exhaustion (connections/disk/memory), query storm (runaway job?), true crash (hardware), or corruption.
- Check whether BullMQ workers piled on during degradation — generation jobs hammering a struggling DB worsen it.
- Review slow-query log for new regressions introduced by latest release.

### Recover

- Resource exhaustion → raise limits/restart cleanly: Postgres, then PgBouncer, then API pods (order matters).
- Crash/hardware loss → restore per `backup-recovery-runbook.md`: latest dump or PITR via WAL archiving.
- After restore: reconcile data written between last backup and failure using audit logs; communicate expected data-loss window to stakeholders.
- Remove maintenance mode only when readiness is green for 10 consecutive minutes.

### Review

- Add capacity alerts (disk > 80%, connections > 70%) if they were absent.
- Verify backup restore RTO/RPO matched expectations — rehearse again if not.
- Consider read replica + automated failover if this was a single-point failure.

---

## 5. Redis Failure

Redis down or flushed: rate limiting, throttler counters, presence/edit locks, and BullMQ queues all live here.

### Detect

- Readiness check `redis: failing: redis unreachable`; queue check warns.
- Symptoms cascade: 429s vanish (throttler silently fails open), WebSocket presence breaks, async schedule jobs stall in `waiting`.

### Contain

1. Confirm scope: is it one Redis instance (cache) or the queue instance?
2. Snapshot current Redis state if possible (`BGSAVE`, copy dump) before restart attempts.
3. If the queue instance is lost and AOF is unusable, note which jobs are in flight — users will need to resubmit generations.

### Investigate

- Cause: OOM eviction (`noeviction` misconfig on queue instance = fatal), maxmemory reached, network partition, container OOM-killed.
- Check whether the cache instance evicted keys under LRU (acceptable) or the queue instance dropped jobs (unacceptable — persistence misconfigured).

### Recover

- Restart Redis with corrected config; BullMQ workers reconnect automatically (`maxRetriesPerRequest` handling).
- Stalled jobs resume; orphaned jobs stuck in `active` are recovered by BullMQ stalled-job checks.
- If queues are empty but users reported pending generations: ask affected users to resubmit; job status service marks stale entries failed.
- Throttler/lockout counters reset — expect a brute-force exposure window; compensate by tightening nginx rate limits temporarily.

### Review

- Enforce instance separation (cache vs queue) if violated — this incident is the argument.
- Alert on Redis memory > 80% and on `evicted_keys` deltas.
- Add AOF verification to the backup checklist.

---

## 6. Queue Failure

BullMQ processing stalls: jobs pile up, generations/exports never complete, DLQ grows.

### Detect

- Health endpoint: `queue: warning: N failed jobs` (>100 triggers warning).
- Grafana queue gauges: `waiting` climbing, `completed` flat.
- User reports: schedule generation spinner forever; export button no result.
- DLQ alert: dead-lettered events accumulating.

### Contain

1. Identify stall type: workers dead (pod crash), Redis connection broken (see §5), or poison job repeatedly crashing a worker.
2. Poison-job suspect: inspect the oldest `active` job; remove it to unstick the worker (`job.remove()`).
3. If async generation is blocked but users need schedules now: temporarily disable `ENABLE_SCHEDULE_GENERATION_ASYNC` and restart — sync path resumes (accept slower requests).

### Investigate

- Worker logs around first failure; exception stack traces land in structured logs (`exception` events).
- Check retry exhaustion: GENERATE gives 3 attempts w/ exponential backoff; EXPORT 2 — did failures burn through retries fast?
- Inspect DLQ payloads: `DeadLetterQueueService` stores event name, error, attempt count — classify failures (bug vs transient dependency).

### Recover

- Fix root cause (deploy patch or repair dependency).
- Replay DLQ entries via the event-replay path once fixed.
- Clear duplicate-generation locks so users can resubmit (`ScheduleJobStatusService` dedup entries expire; clear manually if needed).
- Backlog drain: monitor `waiting` count trending to zero; consider scaling worker replicas up temporarily.

### Review

- Add alerting on `waiting` age (oldest job > X minutes) rather than only counts.
- Verify DLQ review cadence (7-day target) is staffed.
- Load-test the sync fallback path if it became the safety net.

---

## 7. Schedule Corruption

Published schedule data becomes wrong: assignments lost, versions mismatch, partial writes visible to staff.

### Detect

- Discrepancy reports: staff see different shifts than the printed/exported version.
- Integrity signals: version chain gaps, rollback of a published version leaving dangling assignments, concurrent-edit conflicts merged badly.
- Four-eyes approval flag off + two editors racing = classic corruption window.

### Detect concretely

- Compare exported artifact hash against DB rows for the schedule.
- Query schedule versions table: latest version ≠ published pointer, or assignment rows referencing non-latest version.

### Contain

1. Freeze the affected schedule: block edits/publishes for that unit (edit locks + revoke publish permission at role level).
2. Notify unit staff not to trust the displayed schedule; provide the last known-good artifact (export/PDF from before corruption).
3. If corruption is spreading via a background job (bad generation writing rows): kill the queue processor (see §6 containment) before it writes further.

### Investigate

- Timeline reconstruction via audit logs: every mutation to the schedule has an audit trail — find the diverging write.
- Check concurrency layer: were edit locks honored? Did the WS collaboration path bypass validation (dedup TTL race)?
- Rule out malicious edit: cross-check actor identities and IPs on the suspicious writes.

### Recover

- Roll back to the previous published version using the version/rollback mechanism (versions retained 1 year per retention policy).
- Re-run generation if needed (after fixing root cause) and walk the approval flow again.
- Re-publish with four-eyes approval enforced (`ENABLE_FOUR_EYES_APPROVAL=true`) for this cycle.
- Verify end-to-end: export matches DB, staff UI matches published version.

### Review

- Root cause fix: tighten concurrency service, extend lock TTL, add transaction boundaries around multi-row schedule writes.
- Add invariant checks: post-write validation that assignment rows match version pointers.
- Enable dual-approval permanently for publish operations if it was off.

---

## 8. Unauthorized Publish

A schedule is published by someone without authority, or through a bypass (direct API call, stale role, WS path, race before role check).

### Detect

- Audit log: `PUBLISH` action by actor whose role < required minimum (technician publishing, foreign-org admin publishing).
- Staff receive notifications for a schedule that shouldn't be public yet.
- Alert rule on publish events where actor org ≠ schedule org.

### Contain

1. Immediately unpublish/rollback the schedule version (rollback mechanism retains prior version).
2. Revoke the actor's elevated capability: force password reset + `logout-all` (treat as potential compromise — link to §1).
3. If the bypass is a code-level hole (endpoint missing role guard), take that endpoint offline: hotfix deploy or route-block at nginx while patching.
4. Preserve evidence before unpublishing: snapshot audit log entries + affected rows.

### Investigate

- Determine bypass vector: missing `RolesGuard` on a controller, WS event handler performing publishes, expired-role token still valid within 15-min access-token window, or direct DB write.
- Scope: which other schedules did this actor touch? Any other actors exploiting the same hole? Sweep audit logs for the pattern.
- Check whether the four-eyes approval flag was disabled, removing a safeguard.

### Recover

- Republish correct schedule through the sanctioned flow with proper approvers.
- Close the hole: restore guard, shorten `JWT_ACCESS_TOKEN_EXPIRES_IN` temporarily if stale-role tokens were the vector, redeploy.
- Notify affected staff of corrected schedule; document the unauthorized publication window for compliance.

### Review

- CI enforcement: lint/test rule requiring `RolesGuard` (+ explicit `@Roles`) on every mutating controller — make the missing-guard case unbuildable.
- Add publish-event anomaly alerting (publish outside business hours, publish by low-privilege role, cross-org publish).
- Re-enable `ENABLE_FOUR_EYES_APPROVAL` if it had been turned off for convenience.

---

## Appendix A — Contact & Escalation Template

| Role                   | Name              | Channel           | When to engage                   |
| ---------------------- | ----------------- | ----------------- | -------------------------------- |
| Incident Commander     | `<name>`          | `<phone/@handle>` | All SEV1/SEV2                    |
| Backend on-call        | `<name>`          | pager             | Technical triage                 |
| DBA                    | `<name>`          | pager             | Database incidents, restores     |
| Security officer       | `<name>`          | phone             | Any §1–§3, §8                    |
| Compliance/DPO         | `<name>`          | email+phone       | Suspected personal-data exposure |
| Vendor/hosting support | `<ticket portal>` | portal            | Infra-layer failures             |

## Appendix B — Evidence Preservation

Before remediation touches anything, capture:

```bash
# Logs (14-day rotation — do this FIRST)
kubectl logs deployment/vardiya-api --since=48h > incident_api_logs.txt
cp -r $LOG_DIR /incident-evidence/logs_$(date +%Y%m%d_%H%M%S)

# Database snapshot
pg_dump -h $DB_HOST -U $DB_USER -d vardiyasystem -F c \
  -f incident_evidence_$(date +%Y%m%d_%H%M%S).dump

# Audit log export (structured)
psql -h $DB_HOST -U $DB_USER -d vardiyasystem \
  -c "\copy (SELECT * FROM audit_logs WHERE \"createdAt\" > NOW() - INTERVAL '72 hours') TO 'audit_72h.csv' CSV HEADER"
```

Store evidence encrypted, access-restricted, and reference it from the incident ticket. Retain per your legal-hold policy (minimum: close of the postmortem).
