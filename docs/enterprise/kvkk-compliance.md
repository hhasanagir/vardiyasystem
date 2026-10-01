# VardiyaOS — KVKK Compliance Documentation

## 1. Data Inventory

### Personal Data Collected

| Data Category  | Field                                     | Purpose                               | Legal Basis         | Retention             |
| -------------- | ----------------------------------------- | ------------------------------------- | ------------------- | --------------------- |
| Identity       | Name, Employee No                         | Shift assignment, authentication      | Contract execution  | Employment + 10 years |
| Contact        | Email, Phone                              | Notification delivery, password reset | Contract execution  | Employment + 2 years  |
| Employment     | Role, Unit, Skills, Certifications        | Shift assignment, competency tracking | Contract execution  | Employment + 10 years |
| Biometric      | None collected                            | —                                     | —                   | —                     |
| Health         | None collected                            | —                                     | —                   | —                     |
| Authentication | Password (hashed), JWT tokens, IP address | System access, security               | Legitimate interest | Session + 90 days     |
| Audit Logs     | User ID, action, timestamp, IP            | Security monitoring, compliance       | Legal obligation    | 10 years              |
| Attendance     | Clock in/out times, date                  | Payroll, labor law compliance         | Legal obligation    | 10 years              |

### Special Categories of Data

No special category data (health data, biometric data, etc.) is collected.

## 2. Data Processing Activities

| Process          | Data Used                  | Purpose              | Third Party Sharing           |
| ---------------- | -------------------------- | -------------------- | ----------------------------- |
| Authentication   | Email, password, IP        | System access        | No                            |
| Shift Scheduling | Name, role, skills, unit   | Schedule creation    | No                            |
| Notification     | Email, push token          | Shift change alerts  | FCM (Google)                  |
| Attendance       | User ID, date, time        | Work hour tracking   | No                            |
| Audit Logging    | User ID, action, timestamp | Compliance, security | No                            |
| Backup           | All data                   | Disaster recovery    | Cloud storage (if configured) |

## 3. Data Subject Rights

| Right                 | Implementation                                         | Response Time |
| --------------------- | ------------------------------------------------------ | ------------- |
| Access (MD 11)        | Export API: `GET /api/v1/audit/export/user/:id`        | 30 days       |
| Rectification (MD 12) | Profile update in application                          | Immediate     |
| Erasure (MD 13)       | Admin user deletion + `DELETE /api/v1/admin/users/:id` | 30 days       |
| Restriction (MD 14)   | Account deactivation toggle                            | Immediate     |
| Portability (MD 15)   | JSON export of user data                               | 30 days       |
| Objection (MD 16)     | Notification preference settings                       | Immediate     |

## 4. Technical and Organizational Measures

### Organizational

- Data processing inventory maintained
- Access control policy with RBAC
- Regular security awareness training
- Incident response plan (see docs/enterprise/incident-response.md)
- Data Protection Impact Assessment (DPIA) completed

### Technical

- **Encryption at rest**: PostgreSQL data files (LUKS/TDE — pending implementation)
- **Encryption in transit**: TLS 1.2/1.3 for all external connections
- **Access control**: RBAC with 40+ granular permissions, dual-level authorization
- **Audit logging**: All data access logged with user ID, timestamp, action type
- **Pseudonymization**: User IDs used in logs instead of names
- **Backup**: Daily encrypted backups, 30-day retention
- **Access revocation**: Immediate via account deactivation
- **Breach detection**: AlertManager + logging system with anomaly detection

## 5. Data Breach Procedure

1. **Detection**: AlertManager notification or manual report
2. **Assessment**: Determine scope, data affected, severity within 24 hours
3. **Containment**: Revoke access, rotate secrets, block IPs
4. **Notification**: KVKK authority within 72 hours (if personal data breached)
5. **Documentation**: Incident report with timeline, root cause, remediation
6. **Remediation**: Fix vulnerability, update procedures

Contact: privacy@vardiyaos.com (Data Protection Officer)

## 6. Vendor Assessments

| Vendor            | Data Shared         | Purpose            | Agreement    |
| ----------------- | ------------------- | ------------------ | ------------ |
| Google (FCM)      | Push token          | Push notifications | Standard DPA |
| AWS S3 (optional) | Backup data         | Offsite storage    | Standard DPA |
| Slack             | Alert notifications | Incident response  | Standard DPA |

## 7. Compliance Checklist

- [x] Data inventory completed
- [x] Data processing register maintained
- [x] Consent mechanisms in place
- [x] Data subject rights implementable
- [x] Technical security measures documented
- [x] Breach notification procedure documented
- [ ] Data Protection Impact Assessment (DPIA) reviewed annually
- [ ] Vendor Data Processing Agreements signed
- [ ] Annual compliance audit scheduled
