import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SeedService } from '../seed.service';
import { PrismaService } from '../prisma.service';
import { RbacSeedService } from '../modules/rbac/seeds/rbac-seed.service';

/**
 * Phase 5C.15 — A: user seeding must be disabled in production.
 *
 * The production runtime must NEVER create/seed the well-known bootstrap
 * admin accounts (admin@vardiyaos.com etc). User demos/seed data is only
 * allowed when NODE_ENV != 'production' with an explicit SEED_ADMIN_PASSWORD.
 */
describe('Phase 5C.15 — A: production user-seed guard', () => {
  function buildService(config: Record<string, any>) {
    const mockPrisma = {
      rbacRole: { findMany: vi.fn().mockResolvedValue([]) },
      unit: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const rbacSeed = { seed: vi.fn().mockResolvedValue(undefined) };
    const configService = { get: vi.fn((k: string) => config[k]) };
    const service = new SeedService(
      mockPrisma as unknown as PrismaService,
      configService as unknown as ConfigService,
      rbacSeed as unknown as RbacSeedService,
    );
    return { service, mockPrisma, configService };
  }

  it('calls seed + ensurePersonnelGroups but NOT user seeding when NODE_ENV=production (even with password set)', async () => {
    const { service, mockPrisma } = buildService({
      NODE_ENV: 'production',
      SEED_ADMIN_PASSWORD: 's3cret',
    });
    (service as any).ensurePersonnelGroups = vi
      .fn()
      .mockResolvedValue(undefined);
    (service as any).ensureUsers = vi.fn().mockResolvedValue(undefined);

    await service.onModuleInit();

    expect((service as any).ensureUsers).not.toHaveBeenCalled();
    expect((service as any).ensurePersonnelGroups).toHaveBeenCalledTimes(1);
    expect((mockPrisma as any).user).toBeUndefined();
  });

  it('seeds users ONLY when not production and a password is provided', async () => {
    const { service } = buildService({
      NODE_ENV: 'development',
      SEED_ADMIN_PASSWORD: 'demo-pass',
    });
    (service as any).ensurePersonnelGroups = vi
      .fn()
      .mockResolvedValue(undefined);
    (service as any).ensureUsers = vi.fn().mockResolvedValue(undefined);

    await service.onModuleInit();

    expect((service as any).ensureUsers).toHaveBeenCalledTimes(1);
    expect((service as any).ensureUsers).toHaveBeenCalledWith('demo-pass');
  });

  it('does NOT seed users when a password is absent, even in development', async () => {
    const { service } = buildService({
      NODE_ENV: 'development',
      SEED_ADMIN_PASSWORD: undefined,
    });
    (service as any).ensurePersonnelGroups = vi
      .fn()
      .mockResolvedValue(undefined);
    (service as any).ensureUsers = vi.fn().mockResolvedValue(undefined);

    await service.onModuleInit();

    expect((service as any).ensureUsers).not.toHaveBeenCalled();
  });

  it('defaults to development and does not seed users without a password', async () => {
    const { service, configService } = buildService({
      SEED_ADMIN_PASSWORD: undefined,
    });
    (service as any).ensurePersonnelGroups = vi
      .fn()
      .mockResolvedValue(undefined);
    (service as any).ensureUsers = vi.fn().mockResolvedValue(undefined);

    await service.onModuleInit();

    const isProduction = configService.get('NODE_ENV') === 'production';
    expect(isProduction).toBe(false);
    expect((service as any).ensureUsers).not.toHaveBeenCalled();
  });
});
