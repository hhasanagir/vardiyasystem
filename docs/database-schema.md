# Vardiya Sistemi Veritabanı Şeması

## 1. ORGANİZASYON & KULLANICI

### organizations

| Kolon     | Tip                                       | Açıklama            |
| --------- | ----------------------------------------- | ------------------- |
| id        | UUID                                      | PK                  |
| name      | VARCHAR(255)                              | Hastane / kurum adı |
| plan      | ENUM('basic','professional','enterprise') | Abonelik planı      |
| createdAt | TIMESTAMP                                 |                     |
| updatedAt | TIMESTAMP                                 |                     |

### organization_units

| Kolon          | Tip          | Açıklama                   |
| -------------- | ------------ | -------------------------- |
| id             | UUID         | PK                         |
| organizationId | UUID         | FK → organizations         |
| code           | VARCHAR(50)  | MR, BT, US, NUK, RAD, ACIL |
| name           | VARCHAR(255) | Manyetik Rezonans, vb.     |
| description    | TEXT         |                            |
| isActive       | BOOLEAN      |                            |
| createdAt      | TIMESTAMP    |                            |
| updatedAt      | TIMESTAMP    |                            |

### users

| Kolon          | Tip                                                      | Açıklama                |
| -------------- | -------------------------------------------------------- | ----------------------- |
| id             | UUID                                                     | PK                      |
| organizationId | UUID                                                     | FK → organizations      |
| unitId         | UUID                                                     | FK → organization_units |
| email          | VARCHAR(255)                                             | UNIQUE                  |
| passwordHash   | VARCHAR(255)                                             |                         |
| name           | VARCHAR(255)                                             |                         |
| role           | ENUM('admin','manager','supervisor','operator','viewer') |                         |
| isActive       | BOOLEAN                                                  |                         |
| lastLoginAt    | TIMESTAMP                                                |                         |
| refreshToken   | TEXT                                                     |                         |
| createdAt      | TIMESTAMP                                                |                         |
| updatedAt      | TIMESTAMP                                                |                         |

---

## 2. PERSONEL YÖNETİMİ

### personnel

| Kolon              | Tip                                           | Açıklama                            |
| ------------------ | --------------------------------------------- | ----------------------------------- |
| id                 | UUID                                          | PK                                  |
| organizationId     | UUID                                          | FK → organizations                  |
| unitId             | UUID                                          | FK → organization_units             |
| employeeNo         | VARCHAR(50)                                   | UNIQUE, personel sicil no           |
| name               | VARCHAR(255)                                  | Ad soyad                            |
| email              | VARCHAR(255)                                  |                                     |
| phone              | VARCHAR(20)                                   |                                     |
| identityNo         | VARCHAR(11)                                   | TC kimlik no (opsiyonel)            |
| role               | VARCHAR(100)                                  | Teknisyen, Radyolog, Hemşire, vb.   |
| title              | VARCHAR(100)                                  | Ünvan                               |
| specialization     | VARCHAR(255)                                  | Uzmanlık alanı                      |
| experienceYears    | INT                                           | Deneyim yılı                        |
| seniority          | INT                                           | Kıdem derecesi (1-5)                |
| employmentStatus   | ENUM('active','leave','retired','terminated') |                                     |
| isActive           | BOOLEAN                                       |                                     |
| nightShiftEligible | BOOLEAN                                       | Gece vardiyası uygun mu?            |
| maxWeeklyHours     | INT                                           | Haftalık max mesai (varsayılan: 45) |
| startDate          | DATE                                          | İşe başlama                         |
| notes              | TEXT                                          |                                     |
| avatarUrl          | VARCHAR(500)                                  |                                     |
| createdAt          | TIMESTAMP                                     |                                     |
| updatedAt          | TIMESTAMP                                     |                                     |

### personnel_certifications

| Kolon       | Tip          | Açıklama                                     |
| ----------- | ------------ | -------------------------------------------- |
| id          | UUID         | PK                                           |
| personnelId | UUID         | FK → personnel                               |
| name        | VARCHAR(255) | Sertifika adı (MR Güvenlik, Radyasyon, vb.)  |
| issuedBy    | VARCHAR(255) | Veren kurum                                  |
| issuedAt    | DATE         | Veriliş tarihi                               |
| expiresAt   | DATE         | Bitiş tarihi                                 |
| level       | VARCHAR(50)  | Seviye (trainee, certified, expert, trainer) |
| isActive    | BOOLEAN      |                                              |
| createdAt   | TIMESTAMP    |                                              |

### personnel_skills

| Kolon       | Tip                                            | Açıklama                    |
| ----------- | ---------------------------------------------- | --------------------------- |
| id          | UUID                                           | PK                          |
| personnelId | UUID                                           | FK → personnel              |
| skillId     | UUID                                           | FK → skills                 |
| level       | ENUM('trainee','certified','expert','trainer') |                             |
| isActive    | BOOLEAN                                        |                             |
| expiresAt   | DATE                                           | Yetkinlik bitiş (opsiyonel) |
| certifiedAt | DATE                                           | Sertifikalandırma tarihi    |
| createdAt   | TIMESTAMP                                      |                             |

### skills

| Kolon          | Tip          | Açıklama                            |
| -------------- | ------------ | ----------------------------------- |
| id             | UUID         | PK                                  |
| organizationId | UUID         | FK → organizations                  |
| name           | VARCHAR(255) | MR Kullanımı, Kontrastlı Çekim, vb. |
| category       | VARCHAR(100) | Radyoloji, Güvenlik, Acil, vb.      |
| description    | TEXT         |                                     |
| isActive       | BOOLEAN      |                                     |
| createdAt      | TIMESTAMP    |                                     |

### personnel_preferences

| Kolon                  | Tip          | Açıklama                       |
| ---------------------- | ------------ | ------------------------------ |
| id                     | UUID         | PK                             |
| personnelId            | UUID         | FK → personnel (UNIQUE)        |
| preferredShiftTypes    | JSON         | ['day','night','evening']      |
| preferredDeviceIds     | JSON         | ['device-uuid-1', ...]         |
| unavailableDates       | JSON         | ['2024-12-25', ...]            |
| isPregnant             | BOOLEAN      |                                |
| monthlyDose            | DECIMAL(5,2) | Radyasyon dozu takibi (mSv)    |
| maxNightShiftsPerMonth | INT          | Maksimum gece vardiyası sayısı |
| notes                  | TEXT         |                                |
| updatedAt              | TIMESTAMP    |                                |

### personnel_documents

| Kolon       | Tip          | Açıklama                             |
| ----------- | ------------ | ------------------------------------ |
| id          | UUID         | PK                                   |
| personnelId | UUID         | FK → personnel                       |
| type        | VARCHAR(50)  | diploma, sertifika, kimlik, sözleşme |
| name        | VARCHAR(255) |                                      |
| fileUrl     | VARCHAR(500) |                                      |
| uploadedAt  | TIMESTAMP    |                                      |

---

## 3. CİHAZ & ENVANTER

### devices

| Kolon               | Tip                                                      | Açıklama                             |
| ------------------- | -------------------------------------------------------- | ------------------------------------ |
| id                  | UUID                                                     | PK                                   |
| organizationId      | UUID                                                     | FK → organizations                   |
| unitId              | UUID                                                     | FK → organization_units              |
| code                | VARCHAR(50)                                              | MR-01, BT-02, US-03                  |
| name                | VARCHAR(255)                                             | Siemens Magnetom Vida 3T             |
| brand               | VARCHAR(100)                                             | Siemens, GE, Philips, Canon          |
| model               | VARCHAR(100)                                             |                                      |
| serialNo            | VARCHAR(100)                                             |                                      |
| mode                | ENUM('active','idle','maintenance','offline','critical') |                                      |
| isActive            | BOOLEAN                                                  |                                      |
| requiredSkills      | JSON                                                     | ['mr-kullanimi', 'kontrastli-cekim'] |
| workDays            | JSON                                                     | [1,2,3,4,5,6,7] (Pzt=1)              |
| startHour           | INT                                                      | 08 (çalışma başlangıç saati)         |
| endHour             | INT                                                      | 17 (çalışma bitiş saati)             |
| tripleShift         | BOOLEAN                                                  | 3 vardiya mı?                        |
| supportedShiftTypes | JSON                                                     | ['day','evening','night']            |
| location            | VARCHAR(255)                                             | Fiziksel konum                       |
| installationDate    | DATE                                                     |                                      |
| lastMaintenanceAt   | TIMESTAMP                                                |                                      |
| createdAt           | TIMESTAMP                                                |                                      |
| updatedAt           | TIMESTAMP                                                |                                      |

### device_status_history

| Kolon     | Tip                                                      | Açıklama     |
| --------- | -------------------------------------------------------- | ------------ |
| id        | UUID                                                     | PK           |
| deviceId  | UUID                                                     | FK → devices |
| status    | ENUM('active','idle','maintenance','offline','critical') |              |
| reason    | TEXT                                                     |              |
| changedBy | UUID                                                     | FK → users   |
| createdAt | TIMESTAMP                                                |              |

### device_incidents

| Kolon       | Tip                                            | Açıklama       |
| ----------- | ---------------------------------------------- | -------------- |
| id          | UUID                                           | PK             |
| deviceId    | UUID                                           | FK → devices   |
| reportedBy  | UUID                                           | FK → personnel |
| title       | VARCHAR(255)                                   |                |
| description | TEXT                                           |                |
| severity    | ENUM('low','medium','high','critical')         |                |
| status      | ENUM('open','in_progress','resolved','closed') |                |
| resolvedAt  | TIMESTAMP                                      |                |
| resolution  | TEXT                                           |                |
| createdAt   | TIMESTAMP                                      |                |
| updatedAt   | TIMESTAMP                                      |                |

---

## 4. VARDİYA TANIMLARI

### shift_types

| Kolon          | Tip          | Açıklama            |
| -------------- | ------------ | ------------------- |
| id             | UUID         | PK                  |
| organizationId | UUID         | FK → organizations  |
| name           | VARCHAR(100) | Gündüz, Gece, Akşam |
| code           | VARCHAR(20)  | day, night, evening |
| startTime      | TIME         | 08:00               |
| endTime        | TIME         | 16:00               |
| durationHours  | DECIMAL(4,1) | 8.0                 |
| isActive       | BOOLEAN      |                     |

---

## 5. VARDİYA PLANLAMA

### schedules

| Kolon          | Tip                                                       | Açıklama                |
| -------------- | --------------------------------------------------------- | ----------------------- |
| id             | UUID                                                      | PK                      |
| organizationId | UUID                                                      | FK → organizations      |
| unitId         | UUID                                                      | FK → organization_units |
| month          | INT                                                       | 1-12                    |
| year           | INT                                                       |                         |
| version        | INT                                                       | Versiyon no             |
| status         | ENUM('draft','pending','approved','published','archived') |                         |
| createdById    | UUID                                                      | FK → users              |
| approvedById   | UUID                                                      | FK → users (nullable)   |
| approvedAt     | TIMESTAMP                                                 |                         |
| notes          | TEXT                                                      |                         |
| createdAt      | TIMESTAMP                                                 |                         |
| updatedAt      | TIMESTAMP                                                 |                         |

### shift_assignments

| Kolon       | Tip                                                 | Açıklama         |
| ----------- | --------------------------------------------------- | ---------------- |
| id          | UUID                                                | PK               |
| scheduleId  | UUID                                                | FK → schedules   |
| deviceId    | UUID                                                | FK → devices     |
| personnelId | UUID                                                | FK → personnel   |
| date        | DATE                                                |                  |
| shiftTypeId | UUID                                                | FK → shift_types |
| startTime   | TIME                                                |                  |
| endTime     | TIME                                                |                  |
| status      | ENUM('planned','confirmed','completed','cancelled') |                  |
| isOvertime  | BOOLEAN                                             | Fazla mesai mi?  |
| notes       | TEXT                                                |                  |
| createdAt   | TIMESTAMP                                           |                  |
| updatedAt   | TIMESTAMP                                           |                  |

### swap_requests

| Kolon                 | Tip                                               | Açıklama                          |
| --------------------- | ------------------------------------------------- | --------------------------------- |
| id                    | UUID                                              | PK                                |
| organizationId        | UUID                                              | FK → organizations                |
| unitId                | UUID                                              | FK → organization_units           |
| requesterId           | UUID                                              | FK → personnel                    |
| targetPersonnelId     | UUID                                              | FK → personnel (nullable)         |
| requesterAssignmentId | UUID                                              | FK → shift_assignments            |
| targetAssignmentId    | UUID                                              | FK → shift_assignments (nullable) |
| reason                | TEXT                                              |                                   |
| status                | ENUM('pending','approved','rejected','cancelled') |                                   |
| processedById         | UUID                                              | FK → users (nullable)             |
| processedAt           | TIMESTAMP                                         |                                   |
| createdAt             | TIMESTAMP                                         |                                   |

---

## 6. KURALLAR & KISITLAR

### rules

| Kolon            | Tip           | Açıklama                             |
| ---------------- | ------------- | ------------------------------------ |
| id               | UUID          | PK                                   |
| organizationId   | UUID          | FK → organizations                   |
| name             | VARCHAR(255)  | Maksimum gece vardiyası, vb.         |
| description      | TEXT          |                                      |
| type             | VARCHAR(50)   | night_shift_limit, weekly_hours, vb. |
| value            | DECIMAL(10,2) | Kural değeri                         |
| isHardConstraint | BOOLEAN       | Sert kısıt mı?                       |
| isActive         | BOOLEAN       |                                      |
| createdAt        | TIMESTAMP     |                                      |
| updatedAt        | TIMESTAMP     |                                      |

### holidays

| Kolon          | Tip                                           | Açıklama             |
| -------------- | --------------------------------------------- | -------------------- |
| id             | UUID                                          | PK                   |
| organizationId | UUID                                          | FK → organizations   |
| date           | DATE                                          |                      |
| name           | VARCHAR(255)                                  | Ramazan Bayramı, vb. |
| type           | ENUM('public','religious','national','other') |                      |
| year           | INT                                           |                      |
| createdAt      | TIMESTAMP                                     |                      |

---

## 7. İZİN & DEVAMSIZLIK

### leave_requests

| Kolon          | Tip                                                            | Açıklama              |
| -------------- | -------------------------------------------------------------- | --------------------- |
| id             | UUID                                                           | PK                    |
| organizationId | UUID                                                           | FK → organizations    |
| personnelId    | UUID                                                           | FK → personnel        |
| type           | ENUM('annual','sick','maternity','paternity','unpaid','other') |                       |
| startDate      | DATE                                                           |                       |
| endDate        | DATE                                                           |                       |
| reason         | TEXT                                                           |                       |
| status         | ENUM('pending','approved','rejected','cancelled')              |                       |
| approvedById   | UUID                                                           | FK → users (nullable) |
| approvedAt     | TIMESTAMP                                                      |                       |
| documentUrl    | VARCHAR(500)                                                   | Rapor/sağlık belgesi  |
| createdAt      | TIMESTAMP                                                      |                       |
| updatedAt      | TIMESTAMP                                                      |                       |

### attendance_logs

| Kolon             | Tip                                                     | Açıklama               |
| ----------------- | ------------------------------------------------------- | ---------------------- |
| id                | UUID                                                    | PK                     |
| personnelId       | UUID                                                    | FK → personnel         |
| date              | DATE                                                    |                        |
| shiftAssignmentId | UUID                                                    | FK → shift_assignments |
| checkIn           | TIMESTAMP                                               |                        |
| checkOut          | TIMESTAMP                                               |                        |
| status            | ENUM('on_time','late','absent','early_leave','excused') |                        |
| durationMinutes   | INT                                                     |                        |
| notes             | TEXT                                                    |                        |
| createdAt         | TIMESTAMP                                               |                        |

---

## 8. BİLDİRİM & DENETİM

### notifications

| Kolon          | Tip                                  | Açıklama                                                 |
| -------------- | ------------------------------------ | -------------------------------------------------------- |
| id             | UUID                                 | PK                                                       |
| organizationId | UUID                                 | FK → organizations                                       |
| type           | VARCHAR(50)                          | schedule_change, swap_request, approval, alert, training |
| title          | VARCHAR(255)                         |                                                          |
| message        | TEXT                                 |                                                          |
| data           | JSON                                 | Opsiyonel ek veri                                        |
| priority       | ENUM('low','medium','high','urgent') |                                                          |
| status         | ENUM('active','archived')            |                                                          |
| createdById    | UUID                                 | FK → users (nullable)                                    |
| createdAt      | TIMESTAMP                            |                                                          |

### notification_recipients

| Kolon          | Tip       | Açıklama           |
| -------------- | --------- | ------------------ |
| id             | UUID      | PK                 |
| notificationId | UUID      | FK → notifications |
| userId         | UUID      | FK → users         |
| isRead         | BOOLEAN   |                    |
| readAt         | TIMESTAMP |                    |
| isDeleted      | BOOLEAN   |                    |

### audit_logs

| Kolon          | Tip         | Açıklama                                |
| -------------- | ----------- | --------------------------------------- |
| id             | UUID        | PK                                      |
| organizationId | UUID        | FK → organizations                      |
| userId         | UUID        | FK → users                              |
| action         | VARCHAR(50) | CREATE, UPDATE, DELETE, APPROVE, REJECT |
| entityType     | VARCHAR(50) | schedule, assignment, personnel, device |
| entityId       | UUID        |                                         |
| changes        | JSON        | Değişiklik detayı                       |
| ipAddress      | VARCHAR(45) |                                         |
| userAgent      | TEXT        |                                         |
| isFlagged      | BOOLEAN     | Şüpheli aktivite işareti                |
| createdAt      | TIMESTAMP   |                                         |

---

## 9. EĞİTİM & GELİŞİM

### trainings

| Kolon          | Tip          | Açıklama                      |
| -------------- | ------------ | ----------------------------- |
| id             | UUID         | PK                            |
| organizationId | UUID         | FK → organizations            |
| name           | VARCHAR(255) | Radyasyon Güvenliği Eğitimi   |
| description    | TEXT         |                               |
| category       | VARCHAR(100) | safety, technical, soft_skill |
| durationHours  | INT          |                               |
| isMandatory    | BOOLEAN      |                               |
| validityDays   | INT          | Kaç gün geçerli (opsiyonel)   |
| createdAt      | TIMESTAMP    |                               |

### training_assignments

| Kolon       | Tip                                                  | Açıklama       |
| ----------- | ---------------------------------------------------- | -------------- |
| id          | UUID                                                 | PK             |
| trainingId  | UUID                                                 | FK → trainings |
| personnelId | UUID                                                 | FK → personnel |
| status      | ENUM('assigned','in_progress','completed','expired') |                |
| completedAt | TIMESTAMP                                            |                |
| score       | INT                                                  | 0-100          |
| expiresAt   | DATE                                                 |                |
| createdAt   | TIMESTAMP                                            |                |

---

## 10. ANALİTİK & RAPORLAMA

### dashboard_stats

| Kolon            | Tip          | Açıklama                           |
| ---------------- | ------------ | ---------------------------------- |
| id               | UUID         | PK                                 |
| organizationId   | UUID         | FK → organizations                 |
| unitId           | UUID         | FK → organization_units (nullable) |
| date             | DATE         |                                    |
| activeShifts     | INT          |                                    |
| occupancyRate    | DECIMAL(5,2) | Yüzde                              |
| pendingApprovals | INT          |                                    |
| activeIncidents  | INT          |                                    |
| criticalAlerts   | INT          |                                    |
| totalPersonnel   | INT          |                                    |
| onLeave          | INT          |                                    |
| createdAt        | TIMESTAMP    |                                    |

### employee_workloads

| Kolon           | Tip          | Açıklama       |
| --------------- | ------------ | -------------- |
| id              | UUID         | PK             |
| personnelId     | UUID         | FK → personnel |
| month           | INT          |                |
| year            | INT          |                |
| totalHours      | DECIMAL(6,2) |                |
| nightShiftHours | DECIMAL(6,2) |                |
| weekendHours    | DECIMAL(6,2) |                |
| overtimeHours   | DECIMAL(6,2) |                |
| fairnessScore   | DECIMAL(5,2) |                |
| createdAt       | TIMESTAMP    |                |

---

## İLİŞKİ DİYAGRAMI (ÖZET)

```
organizations ──┬── organization_units
                ├── users
                ├── personnel ──── personnel_certifications
                │                 ├── personnel_skills ──── skills
                │                 ├── personnel_preferences
                │                 ├── personnel_documents
                │                 └── training_assignments ──── trainings
                ├── devices ─────── device_status_history
                │                 └── device_incidents
                ├── schedules ───── shift_assignments ──── attendance_logs
                ├── shift_types
                ├── swap_requests
                ├── leave_requests
                ├── rules
                ├── holidays
                ├── notifications ─ notification_recipients
                ├── audit_logs
                └── dashboard_stats
                    └── employee_workloads
```
