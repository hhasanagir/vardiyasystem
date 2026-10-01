# Enterprise Notification Architecture

## Overview

The VardiyaOS Notification System is a centralized, event-driven, multi-channel notification platform designed for healthcare workforce management at enterprise scale (5000+ employees across multiple hospitals). It delivers notifications through in-app, web push, mobile push (FCM), email, and SMS channels with configurable user preferences, priority-based delivery, and full delivery tracking.

## Architecture Principles

1. **Event-Driven**: All notifications originate from domain events — no service directly calls the notification system
2. **Multi-Channel**: Each notification is delivered through all enabled channels based on user preferences and notification priority
3. **Extensible**: New notification types and delivery channels can be added without modifying core logic
4. **Resilient**: Failed deliveries are retried with exponential backoff; dead-letter queue for unrecoverable failures
5. **Observable**: Full delivery tracking, analytics, and audit logging for every notification
6. **Secure**: RBAC-controlled access, tenant isolation, notification spoofing prevention

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Domain Services                          │
│  (Schedule, Shift, Swap, Training, Device, Auth, etc.)      │
└─────────────────────┬───────────────────────────────────────┘
                      │ emits domain events
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                   Event Bus (BullMQ + Redis)                │
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐   │
│  │ Event Queue  │  │ Schedule Q  │  │ Dead Letter Q    │   │
│  └──────┬──────┘  └──────┬──────┘  └──────────────────┘   │
└─────────┼─────────────────┼────────────────────────────────┘
          │                 │
          ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│               Notification Orchestrator                     │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Type Router   │  │ Pref Checker │  │ Priority Mgr     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────────┘  │
│         │                 │                  │              │
│         ▼                 ▼                  ▼              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Channel Dispatcher                       │  │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌──────┐ ┌──────┐ │  │
│  │  │In-App  │ │Web Push│ │FCM Push│ │Email │ │ SMS  │ │  │
│  │  └────────┘ └────────┘ └────────┘ └──────┘ └──────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              Delivery Tracker + Analytics                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Delivery Log  │  │ Read Track   │  │ Metrics/Prom     │  │
│  └──────────────┘  └──────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Data Flow

```
1. Domain Service emits event → EventBusService.publish()
2. EventsConsumer receives event → NotificationOrchestrator.handle()
3. Orchestrator resolves notification type, creates Notification record
4. Channel Dispatcher fans out to all enabled channels:
   a. In-App: Save to DB → WebSocket broadcast to user room
   b. Web Push: Send via VAPID endpoint (persisted subscriptions)
   c. FCM: Send via Firebase Admin SDK
   d. Email: Send via SMTP/Nodemailer (queued)
   e. SMS: Send via SMS provider (future)
5. Each channel creates a NotificationDelivery record
6. Delivery Tracker records sent/delivered/read/failed status
7. Analytics Service records Prometheus metrics
8. Audit Log records the notification event
```

## Notification Model

### Core Entity

```
Notification {
  id             UUID          (PK)
  organizationId UUID          (FK → Organization)
  type           NotificationType
  priority       NotificationPriority
  title          String        (localized)
  message        String        (localized, supports templates)
  data           JSON          (arbitrary payload for action routing)
  senderId       UUID?         (FK → User, null for system)
  status         NotificationStatus
  createdAt      DateTime
  updatedAt      DateTime
}
```

### Delivery Tracking

```
NotificationDelivery {
  id               UUID        (PK)
  notificationId   UUID        (FK → Notification)
  recipientId      UUID        (FK → User)
  channel          ChannelType (IN_APP, WEB_PUSH, FCM, EMAIL, SMS)
  status           DeliveryStatus (PENDING, SENT, DELIVERED, READ, CLICKED, FAILED)
  deliveredAt      DateTime?
  readAt           DateTime?
  clickedAt        DateTime?
  failedAt         DateTime?
  errorMessage     String?
  attemptCount     Int         (default 0)
  metadata         JSON?
  createdAt        DateTime
}
```

### User Preferences

```
NotificationPreference {
  id                    UUID    (PK)
  userId                UUID    (FK → User, unique)
  pushEnabled           Boolean (default true)
  emailEnabled          Boolean (default true)
  smsEnabled            Boolean (default false)
  announcementEnabled   Boolean (default true)
  trainingReminders     Boolean (default true)
  scheduleReminders     Boolean (default true)
  emergencyAlerts       Boolean (default true, always forced on)
  quietHoursStart       String? (HH:mm format)
  quietHoursEnd         String? (HH:mm format)
  createdAt             DateTime
  updatedAt             DateTime
}
```

## Notification Types & Priorities

### Types

| Type | Code | Default Priority | Channels |
|---|---|---|---|
| Schedule Changed | SCHEDULE_CHANGED | NORMAL | In-App, Push, Email |
| Schedule Approved | SCHEDULE_APPROVED | HIGH | In-App, Push |
| Shift Swap Request | SHIFT_SWAP_REQUESTED | NORMAL | In-App, Push, Email |
| Shift Swap Approved | SHIFT_SWAP_APPROVED | HIGH | In-App, Push |
| Shift Swap Rejected | SHIFT_SWAP_REJECTED | NORMAL | In-App, Push |
| Training Assigned | TRAINING_ASSIGNED | NORMAL | In-App, Push, Email |
| Training Expiring | TRAINING_EXPIRING | HIGH | In-App, Push, Email |
| Certification Expiring | CERTIFICATION_EXPIRING | HIGH | In-App, Push, Email |
| Device Incident | DEVICE_INCIDENT | HIGH | In-App, Push |
| Device Incident Critical | DEVICE_INCIDENT_CRITICAL | CRITICAL | All (incl. SMS) |
| System Announcement | SYSTEM_ANNOUNCEMENT | NORMAL | In-App, Push, Email |
| Role Assigned | ROLE_ASSIGNED | HIGH | In-App, Push, Email |
| Permission Changed | PERMISSION_CHANGED | HIGH | In-App, Push |
| Attendance Alert | ATTENDANCE_ALERT | NORMAL | In-App, Push |
| Emergency Alert | EMERGENCY_ALERT | CRITICAL | All (bypasses prefs) |
| Clock In Reminder | CLOCK_IN_REMINDER | LOW | In-App, Push |
| Schedule Reminder | SCHEDULE_REMINDER | LOW | In-App, Push, Email |
| Certification Expired | CERTIFICATION_EXPIRED | HIGH | In-App, Push, Email |

### Priority Levels

| Priority | Level | Bypass Prefs | Retry | Delivery Window |
|---|---|---|---|---|
| LOW | 10 | No | 1 attempt | Next sync |
| NORMAL | 20 | No | 2 attempts | 5 minutes |
| HIGH | 30 | No | 3 attempts | 1 minute |
| CRITICAL | 40 | Yes | 5 attempts | Immediate |

## Channel Architecture

### In-App (WebSocket)
- Notification saved to DB immediately
- Real-time delivery via Socket.IO to user-specific rooms
- Badge counter via `unread-count` event
- Supports read/unread, delete, mark-all-read
- No delivery failure possible (DB write = delivery)

### Web Push (VAPID)
- Browser push via Service Worker
- Subscriptions stored in `WebPushSubscription` table (persisted)
- Payload: title, body, icon, badge, data (routing), actions
- VAPID keys configured via environment

### Firebase Cloud Messaging
- Android + iOS + Web via FCM
- Device tokens stored in `PushToken` table
- Token refresh handled automatically
- Invalid tokens cleaned up on send failure
- Uses Firebase Admin SDK

### Email (SMTP)
- Queued via BullMQ for async processing
- HTML templates with inline styles
- Supports attachments (PDF reports, etc.)
- Configurable SMTP via environment

### SMS (Future)
- Placeholder implementation
- Provider-agnostic interface
- Queued via BullMQ

## Scheduling & Reminders

The Notification Scheduler (BullMQ repeatable jobs) handles:

| Job | Schedule | Description |
|---|---|---|
| Shift Reminder | Daily at 18:00 | Remind users of next day's shifts |
| Training Expiration Check | Daily at 06:00 | Warn about training expiring within 7 days |
| Certification Expiration Check | Daily at 06:00 | Warn about certs expiring within 30 days |
| Weekly Announcements | Every Monday 09:00 | Send scheduled announcements |
| Cleanup Stale Deliveries | Hourly | Archive old delivery records |

## Analytics & Metrics

### Prometheus Metrics
- `notifications_sent_total{type, channel, priority}`
- `notifications_delivered_total{channel}`
- `notifications_read_total{type}`
- `notifications_failed_total{channel, reason}`
- `notifications_delivery_duration_seconds{channel}`
- `notifications_queue_depth`
- `notifications_scheduler_jobs_total`

### Dashboard Statistics
- Sent/Delivered/Read/Failed counts (daily, weekly, monthly)
- Delivery rate by channel
- Channel breakdown pie
- Failed delivery details
- User engagement metrics (read rate, click rate)

## Security

### Access Control
- **Send notifications**: `NOTIFICATION_SEND` permission (SYSTEM_ADMIN, ORGANIZATION_ADMIN)
- **View notifications**: `NOTIFICATION_VIEW` permission (authenticated users, own notifications only)
- **Manage preferences**: `NOTIFICATION_PREFERENCE_MANAGE` permission (authenticated users, own preferences only)
- **View admin panel**: `NOTIFICATION_ADMIN` permission (SYSTEM_ADMIN, ORGANIZATION_ADMIN)
- **Send system-wide announcement**: `NOTIFICATION_ANNOUNCE` permission (SYSTEM_ADMIN only)

### Anti-Abuse
- Rate limiting: max 10 push subscriptions per user
- Notification creation restricted to server-side only (no client-side creation)
- Recipient validation: users cannot send to users outside their org
- Template injection prevention via parameterized templates
- Notification spoofing prevention: `senderId` is always server-verified

### Data Isolation
- Multi-tenant: notifications scoped by `organizationId`
- Cross-tenant access impossible via RBAC scope enforcement
- User can only see own notifications (enforced at query level)

## Mobile Architecture

- Capacitor Push Notifications plugin handles native FCM registration
- Foreground notifications shown as in-app toasts
- Background notifications trigger OS notification tray
- Notification tap deep-links to relevant app screen (schedule, training, swap, etc.)
- Offline support: queued notifications retrieved on reconnect
- iOS/Android silent push for badge count sync

## Scalability

- **Horizontal scaling**: Stateless notification delivery workers (BullMQ consumers)
- **Channel parallelization**: Each channel dispatched independently
- **Database sharding**: Notifications partitioned by `organizationId`
- **Redis persistence**: BullMQ queues survive restarts
- **Rate limiting per channel**: Prevents provider API throttling
- **Batch sending**: Email/FCM channels support batch delivery

## Directory Structure

```
backend/src/modules/notifications/
  notifications.module.ts
  notifications.service.ts
  notifications.controller.ts
  notifications.gateway.ts              # WebSocket events for notifications
  notification-orchestrator.service.ts  # Central orchestration logic
  notification-template.service.ts      # Template rendering
  notification-event.service.ts         # Domain event → notification mapping
  notification-scheduler.service.ts     # BullMQ repeatable jobs
  email-sender.service.ts               # SMTP email delivery
  sms-sender.service.ts                 # SMS delivery (future)
  web-push-sender.service.ts            # VAPID web push delivery
  fcm-sender.service.ts                 # Firebase push delivery
  channel-dispatcher.service.ts         # Multi-channel fan-out
  delivery-tracker.service.ts           # Track delivery status
  notification-preference.service.ts    # User preferences CRUD
  notification-analytics.service.ts     # Metrics and statistics
  interfaces/
    notification-type.enum.ts
    notification-priority.enum.ts
    channel-type.enum.ts
    delivery-status.enum.ts
    notification.interface.ts
  dto/
    create-notification.dto.ts
    mark-read.dto.ts
    notification-filter.dto.ts
    notification-preference.dto.ts
    send-announcement.dto.ts
    notification-stats-query.dto.ts
  decorators/
    current-notification-user.decorator.ts
  guards/
    notification-access.guard.ts
  __tests__/
    notifications.service.spec.ts
    notification-orchestrator.spec.ts
    notification-event.service.spec.ts
    channel-dispatcher.spec.ts
    delivery-tracker.spec.ts
    web-push-sender.spec.ts
    notification-gateway.spec.ts
  templates/
    email/
      schedule-changed.hbs
      training-assigned.hbs
      emergency-alert.hbs
```

## Related Files

- `backend/prisma/schema.prisma` — Notification, NotificationDelivery, NotificationPreference, NotificationTemplate, WebPushSubscription models
- `backend/src/modules/notifications/*.ts` — Complete notification module
- `backend/src/modules/push-tokens/*.ts` — FCM token registration
- `backend/src/modules/websocket/schedule.gateway.ts` — WebSocket broadcasting
- `backend/src/events/handlers/events.consumer.ts` — Event queue consumer
- `frontend/src/app/services/notification.service.ts` — Frontend notification service
- `frontend/src/app/services/push-notification.service.ts` — Capacitor FCM
- `frontend/src/app/services/websocket.service.ts` — Socket.IO client
- `frontend/src/app/features/notification-center/` — Frontend notification UI

## Technology Stack

| Component | Technology |
|---|---|
| Queue | BullMQ 5.x + Redis 7.x |
| Real-time | Socket.IO 4.x |
| Web Push | web-push (VAPID) |
| Mobile Push | firebase-admin (FCM) |
| Email | nodemailer |
| Scheduled Jobs | BullMQ repeatable jobs |
| Metrics | prom-client |
| Audit | NestJS Audit Log Module |
| Templates | Handlebars |
| Frontend | Angular 21 + PrimeNG |
| Mobile | Capacitor 8 |
