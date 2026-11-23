import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationEventService } from '../notification-event.service';

/**
 * Phase 5c49 — coverage wave 1. These are mapping/alias tests only: the
 * personnel→user resolution and addRecipients rules stay in the existing
 * notification-event.service.spec.ts and are not repeated here.
 */
describe('NotificationEventService — event mapping and aliases', () => {
  const orchestrator = {
    send: vi.fn(),
    sendToAllUsers: vi.fn(),
    sendEmergency: vi.fn(),
  };
  const template = { render: vi.fn() };
  const eventBus = { publish: vi.fn() };
  const prisma = { user: {}, personnel: {} };
  let service: NotificationEventService;

  const rendered = { title: 'Rendered title', message: 'Rendered message' };

  beforeEach(() => {
    vi.clearAllMocks();
    template.render.mockResolvedValue(rendered);
    orchestrator.send.mockResolvedValue({ id: 'notif-1' });
    orchestrator.sendToAllUsers.mockResolvedValue(undefined);
    orchestrator.sendEmergency.mockResolvedValue(undefined);
    service = new NotificationEventService(
      orchestrator as any,
      template as any,
      eventBus as any,
      prisma as any,
    );
  });

  it('renders once and broadcasts schedulePublished to every recipient', async () => {
    await service.schedulePublished(['u-1', 'u-2'], 'org-1', { month: 11 });

    expect(template.render).toHaveBeenCalledTimes(1);
    expect(orchestrator.send).toHaveBeenCalledWith({
      organizationId: 'org-1',
      type: 'SCHEDULE_CHANGED',
      title: rendered.title,
      message: rendered.message,
      data: { month: 11 },
      recipientIds: ['u-1', 'u-2'],
    });
  });

  it.each([
    ['scheduleSubmitted', ['u-1', 'org-1', {}], 'SCHEDULE_CHANGED', 'NORMAL'],
    ['scheduleApproved', ['u-1', 'org-1', {}], 'SCHEDULE_APPROVED', 'HIGH'],
    ['scheduleRejected', ['u-1', 'org-1', {}], 'SCHEDULE_REJECTED', 'HIGH'],
    ['shiftSwapRequested', ['u-1', 'u-2', 'org-1', {}], 'SHIFT_SWAP_REQUESTED', 'NORMAL'],
    ['swapAccepted', ['u-1', 'org-1', {}], 'SHIFT_SWAP_APPROVED', 'HIGH'],
    ['swapRejected', ['u-1', 'org-1', {}], 'SHIFT_SWAP_REJECTED', 'NORMAL'],
    ['trainingAssigned', ['u-1', 'org-1', {}], 'TRAINING_ASSIGNED', 'NORMAL'],
    ['trainingExpiring', ['u-1', 'org-1', {}], 'TRAINING_EXPIRING', 'HIGH'],
    ['certificationExpiring', ['u-1', 'org-1', {}], 'CERTIFICATION_EXPIRING', 'HIGH'],
    ['roleAssigned', ['u-1', 'org-1', {}], 'ROLE_ASSIGNED', 'HIGH'],
    ['clockedIn', ['u-1', 'org-1', {}], 'ATTENDANCE_ALERT', 'NORMAL'],
    ['clockedOut', ['u-1', 'org-1', {}], 'ATTENDANCE_ALERT', 'NORMAL'],
  ])('maps %s to %s/%s', async (method, args, type, priority) => {
    const receiver = service as unknown as Record<string, (...values: unknown[]) => Promise<void>>;
    await receiver[method](...(args as unknown[]));

    const [sent] = orchestrator.send.mock.calls[0] as unknown as Array<{
      type: string;
      priority: string;
      recipientIds: string[];
    }>;
    expect(sent).toMatchObject({ type, priority });
    expect(sent.recipientIds).toContain('u-1');
  });

  it('uses the incident channel sets for normal and critical device incidents', async () => {
    await service.deviceIncident(['m-1'], 'org-1', { deviceId: 'dev-1' });
    await service.incidentCritical(['m-1'], 'org-1', { deviceId: 'dev-1' });
    await service.deviceIncidentCritical(['m-1'], 'org-1', { deviceId: 'dev-1' });

    expect(orchestrator.send.mock.calls[0][0]).toMatchObject({
      type: 'DEVICE_INCIDENT',
      priority: 'HIGH',
      channels: ['IN_APP', 'FCM'],
    });
    expect(orchestrator.send.mock.calls[1][0]).toMatchObject({
      type: 'DEVICE_INCIDENT_CRITICAL',
      channels: ['IN_APP', 'FCM', 'EMAIL', 'WEB_PUSH'],
    });
    expect(orchestrator.send.mock.calls[2][0]).toMatchObject({
      type: 'DEVICE_INCIDENT_CRITICAL',
      priority: 'CRITICAL',
    });
  });

  it('routes system announcements to recipients or all active users', async () => {
    await service.systemAnnouncement('org-1', {}, ['u-1']);
    await service.systemAnnouncement('org-1', {});

    expect(orchestrator.send).toHaveBeenCalledWith(expect.objectContaining({ recipientIds: ['u-1'] }));
    expect(orchestrator.sendToAllUsers).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      type: 'SYSTEM_ANNOUNCEMENT',
    }));
  });

  it('delegates emergency alerts to sendEmergency', async () => {
    await service.emergencyAlert('org-1', { area: 'A Blok' }, ['u-1', 'u-2']);

    expect(orchestrator.sendEmergency).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      recipientIds: ['u-1', 'u-2'],
    }));
  });

  it('swallows template and orchestrator failures instead of breaking the caller', async () => {
    template.render.mockRejectedValueOnce(new Error('template missing'));
    await expect(service.scheduleChanged('u-1', 'org-1', {})).resolves.toBeUndefined();

    template.render.mockResolvedValueOnce(rendered);
    orchestrator.send.mockRejectedValueOnce(new Error('orchestrator down'));
    await expect(service.scheduleChanged('u-1', 'org-1', {})).resolves.toBeUndefined();
  });
});
