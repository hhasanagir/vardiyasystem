import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { PushSubscriptionsService } from '../push-subscriptions.service';
import { PrismaService } from '../../../prisma.service';

describe('PushSubscriptionsService', () => {
  let service: PushSubscriptionsService;

  const mockConfig = {
    get: vi.fn((key: string, fallback?: string) => {
      const config: Record<string, string> = {};
      return config[key] ?? fallback;
    }),
  };

  const mockPrisma = {
    webPushSubscription: {
      findUnique: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      count: vi.fn().mockResolvedValue(0),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PushSubscriptionsService,
        { provide: ConfigService, useValue: mockConfig },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PushSubscriptionsService>(PushSubscriptionsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return 0 endpoints initially', async () => {
    expect(await service.getEndpointCount()).toBe(0);
  });
});
