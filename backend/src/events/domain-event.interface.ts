import { randomUUID } from 'crypto';

export const EVENT_NAMES = {
  SCHEDULE_CREATED: 'schedule.created',
  SCHEDULE_UPDATED: 'schedule.updated',
  SCHEDULE_APPROVED: 'schedule.approved',
  SHIFT_SWAPPED: 'shift.swapped',
  DEVICE_INCIDENT_CREATED: 'device_incident.created',
  PERSONNEL_CREATED: 'personnel.created',
  NOTIFICATION_SENT: 'notification.sent',
  NOTIFICATION_DELIVERED: 'notification.delivered',
  NOTIFICATION_READ: 'notification.read',
  NOTIFICATION_FAILED: 'notification.failed',
  NOTIFICATION_DELETED: 'notification.deleted',
} as const;

export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];

export const AGGREGATE_TYPES = {
  SCHEDULE: 'Schedule',
  SWAP: 'SwapRequest',
  DEVICE_INCIDENT: 'DeviceIncident',
  PERSONNEL: 'Personnel',
  NOTIFICATION: 'Notification',
} as const;

export type AggregateType =
  (typeof AGGREGATE_TYPES)[keyof typeof AGGREGATE_TYPES];

export interface DomainEvent {
  eventId: string;
  eventName: EventName;
  aggregateId: string;
  aggregateType: AggregateType;
  correlationId: string;
  causationId?: string;
  timestamp: Date;
  payload: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export function createEvent(
  eventName: EventName,
  aggregateId: string,
  aggregateType: AggregateType,
  payload: Record<string, unknown>,
  correlationId?: string,
  causationId?: string,
): DomainEvent {
  return {
    eventId: randomUUID(),
    eventName,
    aggregateId,
    aggregateType,
    correlationId: correlationId || randomUUID(),
    causationId,
    timestamp: new Date(),
    payload,
  };
}
