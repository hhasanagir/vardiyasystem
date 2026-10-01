import { Test, TestingModule } from '@nestjs/testing';
import { NotificationEventService } from '../notification-event.service';
import { NotificationOrchestratorService } from '../notification-orchestrator.service';
import { NotificationTemplateService } from '../notification-template.service';
import { EventBusService } from '../../../events/event-bus.service';
import { PrismaService } from '../../../prisma.service';
import { NotificationsService } from '../notifications.service';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('NotificationEventService (personnel->user resolution)', () => {
  let service: NotificationEventService;
  let orchestrator: NotificationOrchestratorService;
  let prisma: PrismaService;

  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    personnel: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    notification: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    notificationRecipient: {
      create: vi.fn(),
      createMany: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    notificationDelivery: { create: vi.fn(), updateMany: vi.fn() },
  };

  const mockOrchestrator = {
    send: vi.fn().mockResolvedValue({ id: 'notif-1' }),
    sendToAllUsers: vi.fn(),
    sendEmergency: vi.fn(),
  };

  const mockTemplate = {
    render: vi
      .fn()
      .mockResolvedValue({
        title: 'Vardiya Değişikliği',
        message: 'Yeni atama yapıldı',
      }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationEventService,
        {
          provide: NotificationOrchestratorService,
          useValue: mockOrchestrator,
        },
        { provide: NotificationTemplateService, useValue: mockTemplate },
        { provide: EventBusService, useValue: { publish: vi.fn() } },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NotificationEventService>(NotificationEventService);
    orchestrator = module.get<NotificationOrchestratorService>(
      NotificationOrchestratorService,
    );
    prisma = module.get<PrismaService>(PrismaService);

    vi.clearAllMocks();
  });

  it('should resolve personnelId to real userId via email and notify that user (rule I)', async () => {
    const personnelId = '62222a14-4231-4b89-aca8-04662b307a1f';
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.personnel.findUnique.mockResolvedValue({
      id: personnelId,
      email: 'yusuf.erdogan@hospital.com',
    });
    mockPrisma.user.findFirst.mockResolvedValue({ id: 'real-user-1' });

    await service.assignmentCreated(personnelId, 'org-1', {
      date: '2026-08-04',
    });

    expect(orchestrator.send).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: ['real-user-1'] }),
    );
  });

  it('should NOT create a notification when personnel has no user account (rule J, no FK error)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.personnel.findUnique.mockResolvedValue({
      id: 'personnel-no-account',
      email: 'ghost@hospital.com',
    });
    mockPrisma.user.findFirst.mockResolvedValue(null);

    await service.assignmentCreated('personnel-no-account', 'org-1', {
      date: '2026-08-04',
    });

    expect(orchestrator.send).not.toHaveBeenCalled();
  });

  it('should notify a direct real userId for legacy callers', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'legacy-user',
      isActive: true,
    });

    await service.assignmentCreated('legacy-user', 'org-1', {
      date: '2026-08-04',
    });

    expect(orchestrator.send).toHaveBeenCalledWith(
      expect.objectContaining({ recipientIds: ['legacy-user'] }),
    );
  });

  it('should skip notification when personnel record is missing entirely', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.personnel.findUnique.mockResolvedValue(null);

    await service.assignmentRemoved('missing-personnel', 'org-1', {
      date: '2026-08-04',
    });

    expect(orchestrator.send).not.toHaveBeenCalled();
  });
});

describe('NotificationsService.addRecipients (FK defense)', () => {
  let service: NotificationsService;
  let prisma: PrismaService;

  const mockPrisma = {
    user: { findMany: vi.fn() },
    notificationRecipient: {
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
    prisma = module.get<PrismaService>(PrismaService);
    vi.clearAllMocks();
  });

  it('should filter out non-existent userIds before createMany (rule I)', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'valid-1' }]);

    const valid = await service.addRecipients('notif-1', [
      'valid-1',
      'personnel-id-mistaken-as-user',
    ]);

    expect(valid).toEqual(['valid-1']);
    expect(mockPrisma.notificationRecipient.createMany).toHaveBeenCalledWith({
      data: [{ notificationId: 'notif-1', userId: 'valid-1' }],
      skipDuplicates: true,
    });
  });

  it('should not createAny recipients when none of the ids are real users (rule J)', async () => {
    mockPrisma.user.findMany.mockResolvedValue([]);

    const valid = await service.addRecipients('notif-1', [
      'ghost-1',
      'ghost-2',
    ]);

    expect(valid).toEqual([]);
    expect(mockPrisma.notificationRecipient.createMany).not.toHaveBeenCalled();
  });
});
