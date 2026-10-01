# VardiyaOS — Incident Response Plan

## Severity Levels

| Level    | Definition                                        | Response Time     | Examples                                            |
| -------- | ------------------------------------------------- | ----------------- | --------------------------------------------------- |
| **SEV1** | Complete service outage or data loss              | 15 min            | Database down, backend crash-loop, data corruption  |
| **SEV2** | Major feature degradation affecting >20% of users | 30 min            | API latency >5s, notification failure, login issues |
| **SEV3** | Minor degradation affecting <20% of users         | 2 hours           | Slow queries, non-critical feature bug              |
| **SEV4** | Cosmetic or non-urgent                            | Next business day | UI typo, minor styling issue                        |

## Incident Response Flow

### 1. Detection

- **Automatic**: AlertManager → Slack #alerts-critical
- **Manual**: Support team → #alerts Slack channel
- **Monitoring**: Grafana dashboard, uptime monitor

### 2. Triage

1. Confirm incident severity level
2. Assign incident commander (first responder)
3. Create incident channel (#incident-YYYYMMDD-NN)
4. Record start time in incident log
5. Notify stakeholders based on severity:
   - SEV1: On-call engineer + Engineering Lead + CTO
   - SEV2: On-call engineer + Engineering Lead
   - SEV3: On-call engineer
   - SEV4: Engineering team (next standup)

### 3. Mitigation

1. **Stop the bleeding**: Rollback, feature flag disable, scale up, restart
2. **Restore service**: Prioritize availability over root cause analysis
3. **Apply hotfix**: If root cause known and fix is low-risk
4. **Verify**: Confirm service health via monitoring + manual test

### 4. Resolution

1. Verify all metrics returned to baseline
2. Confirm with stakeholders
3. Remove incident channel (archive after 30 days)

### 5. Postmortem (within 48h for SEV1/SEV2)

- Timeline of events
- Root cause analysis (5 Whys)
- Detection → response → resolution times
- Action items with owners and due dates
- Follow-up in next sprint planning

## On-Call Responsibilities

Primary on-call:

- Respond within 15 min (SEV1) or 30 min (SEV2)
- Triage, mitigate, escalate as needed
- Update incident log every 30 min during active incident

Secondary on-call:

- Backup for primary
- Handles lower-severity alerts during active SEV1

## Escalation Matrix

| Role             | Name       | Contact        |
| ---------------- | ---------- | -------------- |
| Primary On-Call  | (rotating) | #on-call Slack |
| Engineering Lead | (named)    | Phone + Slack  |
| CTO              | (named)    | Phone + Slack  |
| CEO              | SEV1 only  | Phone          |

## Communication Templates

### Status Update (every 30 min during incident)

```
Status: [INVESTIGATING / MITIGATING / RESOLVED]
Impact: [X users affected, Y features degraded]
Action: [What we're doing]
ETA: [Estimated resolution time]
```

### Postmortem Template

```
# Postmortem: [Title]
Date: YYYY-MM-DD
Severity: SEV1/SEV2
Duration: X hours Y minutes

## Summary
[1-2 paragraph summary]

## Timeline
- HH:MM - Detection
- HH:MM - Triage
- HH:MM - Mitigation started
- HH:MM - Service restored
- HH:MM - Incident closed

## Root Cause
[5 Whys analysis]

## Action Items
- [ ] Action 1 (Owner, Due date)
- [ ] Action 2 (Owner, Due date)

## Lessons Learned
[What went well, what could be improved]
```
