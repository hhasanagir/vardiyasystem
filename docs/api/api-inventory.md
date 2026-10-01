# API Inventory

> Generated: 2026-06-26 | Total: **27 Controllers, 146 Endpoints**

## Authentication (`/api/v1/auth`)

| Method | Endpoint            | Guards         | DTO               | Service                       |
| ------ | ------------------- | -------------- | ----------------- | ----------------------------- |
| GET    | `auth/csrf-token`   | —              | —                 | `csrfService.generateToken()` |
| POST   | `auth/register`     | —              | `CreateUserDto`   | `authService.register()`      |
| POST   | `auth/login`        | —              | `LoginDto`        | `authService.login()`         |
| POST   | `auth/refresh`      | —              | `RefreshTokenDto` | `authService.refreshToken()`  |
| POST   | `auth/invite-codes` | JwtAuth, Roles | `CreateInviteDto` | `inviteCodeService.create()`  |
| POST   | `auth/logout`       | JwtAuth        | —                 | `authService.logout()`        |
| POST   | `auth/logout-all`   | JwtAuth        | —                 | `authService.logoutAll()`     |
| GET    | `auth/me`           | JwtAuth        | —                 | Returns `req.user`            |
| GET    | `auth/sessions`     | JwtAuth        | —                 | `authService.getSessions()`   |
| DELETE | `auth/sessions/:id` | JwtAuth        | `ParseUUIDPipe`   | `authService.revokeSession()` |

## Schedules (`/api/v1/schedules`) — 33 endpoints

| Method | Endpoint                                  | Guards                            | DTO                         | Service                                  |
| ------ | ----------------------------------------- | --------------------------------- | --------------------------- | ---------------------------------------- |
| POST   | `schedules`                               | JwtAuth, Roles (FIELD_SUPERVISOR) | `CreateScheduleDto`         | `schedulesService.create()`              |
| GET    | `schedules`                               | JwtAuth, Roles (VIEWER)           | —                           | `schedulesService.findAll()`             |
| GET    | `schedules/pending-approvals`             | JwtAuth, Roles (SUPERVISOR)       | —                           | `workflowService.getPendingApprovals()`  |
| GET    | `schedules/by-unit/:unitId`               | JwtAuth, Roles (VIEWER)           | —                           | `schedulesService.findByUnitMonthYear()` |
| GET    | `schedules/my-shifts`                     | JwtAuth, Roles (VIEWER)           | —                           | `schedulesService.findMyShifts()`        |
| GET    | `schedules/unit/:unit`                    | JwtAuth, Roles (VIEWER)           | —                           | `schedulesService.findByUnitType()`      |
| POST   | `schedules/unit/:unit/publish`            | JwtAuth, Roles (HEAD_TECHNICIAN)  | `PublishUnitScheduleDto`    | `schedulesService.publishByUnit()`       |
| GET    | `schedules/:id`                           | JwtAuth, Roles (VIEWER)           | —                           | `schedulesService.findOne()`             |
| GET    | `schedules/:id/versions`                  | JwtAuth, Roles (VIEWER)           | —                           | `workflowService.getVersionHistory()`    |
| GET    | `schedules/:id/versions/:version`         | JwtAuth, Roles (VIEWER)           | —                           | `workflowService.getVersionSnapshot()`   |
| GET    | `schedules/:id/compare`                   | JwtAuth, Roles (VIEWER)           | —                           | `workflowService.compareVersions()`      |
| GET    | `schedules/:id/audit`                     | JwtAuth, Roles (SUPERVISOR)       | —                           | `workflowService.getAuditLog()`          |
| GET    | `schedules/:id/snapshots`                 | JwtAuth, Roles (SUPERVISOR)       | —                           | `schedulesService.getSnapshots()`        |
| GET    | `schedules/:id/alerts`                    | JwtAuth, Roles (VIEWER)           | —                           | `alertService.getAlerts()`               |
| GET    | `schedules/export/excel`                  | JwtAuth, Roles (VIEWER)           | —                           | `exportService.exportExcel()`            |
| GET    | `schedules/export/pdf`                    | JwtAuth, Roles (VIEWER)           | —                           | `exportService.exportPdf()`              |
| GET    | `schedules/analytics`                     | JwtAuth, Roles (HEAD_TECHNICIAN)  | —                           | `schedulesService.getAnalytics()`        |
| GET    | `schedules/dashboard/stats`               | JwtAuth, Roles (VIEWER)           | —                           | `schedulesService.getDashboardStats()`   |
| PUT    | `schedules/:id`                           | JwtAuth, Roles (FIELD_SUPERVISOR) | `UpdateScheduleDto`         | `schedulesService.update()`              |
| POST   | `schedules/:id/assignments`               | JwtAuth, Roles (FIELD_SUPERVISOR) | `CreateAssignmentDto`       | `schedulesService.addAssignment()`       |
| DELETE | `schedules/:id/assignments/:assignmentId` | JwtAuth, Roles (FIELD_SUPERVISOR) | —                           | `schedulesService.removeAssignment()`    |
| POST   | `schedules/:id/submit`                    | JwtAuth, Roles (FIELD_SUPERVISOR) | `WorkflowTransitionDto`     | `workflowService.submitForReview()`      |
| POST   | `schedules/:id/approve`                   | JwtAuth, Roles (HEAD_TECHNICIAN)  | `WorkflowTransitionDto`     | `workflowService.approve()`              |
| POST   | `schedules/:id/reject`                    | JwtAuth, Roles (HEAD_TECHNICIAN)  | `RejectScheduleDto`         | `workflowService.reject()`               |
| POST   | `schedules/:id/publish`                   | JwtAuth, Roles (PLANNER)          | —                           | `workflowService.publish()`              |
| POST   | `schedules/:id/archive`                   | JwtAuth, Roles (PLANNER)          | —                           | `workflowService.archive()`              |
| POST   | `schedules/:id/rollback/:version`         | JwtAuth, Roles (HEAD_TECHNICIAN)  | `RollbackDto`               | `workflowService.rollback()`             |
| POST   | `schedules/:id/revision`                  | JwtAuth, Roles (HEAD_TECHNICIAN)  | —                           | `workflowService.createRevision()`       |
| POST   | `schedules/:id/duplicate`                 | JwtAuth, Roles (SUPERVISOR)       | —                           | `schedulesService.duplicate()`           |
| DELETE | `schedules/:id`                           | JwtAuth, Roles (HEAD_TECHNICIAN)  | —                           | `schedulesService.delete()`              |
| POST   | `schedules/generate`                      | JwtAuth, Roles (HEAD_TECHNICIAN)  | `GenerateScheduleDto`       | `autoGeneratorService.preview()`         |
| POST   | `schedules/generate/preview`              | JwtAuth, Roles (HEAD_TECHNICIAN)  | `PreviewScheduleDto`        | `autoGeneratorService.preview()`         |
| POST   | `schedules/generate/apply`                | JwtAuth, Roles (HEAD_TECHNICIAN)  | `ApplyGeneratedScheduleDto` | `autoGeneratorService.apply()`           |

## Other Modules

Full listing for all 27 controllers: audit, analytics, attendance, command-center, device-incidents, device-status, devices, handover-notes, health, holidays, insights, me, metrics, notifications (24 endpoints), personnel, push-subscriptions, push-tokens, rbac, recommendations, shifts, shift-tasks, skills, swap-requests, trainings, units.

## Metrics

| Metric              | Count                                                                                               |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| Controllers         | 27                                                                                                  |
| GET                 | 82                                                                                                  |
| POST                | 37                                                                                                  |
| PATCH               | 13                                                                                                  |
| PUT                 | 7                                                                                                   |
| DELETE              | 7                                                                                                   |
| DTO types           | 43                                                                                                  |
| Guards              | 6 (CsrfGuard, JwtAuthGuard, RolesGuard, PermissionGuard, AuditAccessGuard, NotificationAccessGuard) |
| Global Interceptors | 2 (Logging, Metrics)                                                                                |
| Global Filters      | 1 (AllExceptionsFilter)                                                                             |
| Global Pipes        | 1 (ValidationPipe)                                                                                  |
