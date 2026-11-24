import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { ServiceUnavailableException } from '@nestjs/common';
import { ScheduleJobProcessor } from '../job-queue/schedule-job.processor';
import { ScheduleJobType } from '../job-queue/schedule-job.types';
import { SchedulesDDDController } from '../schedules-ddd.controller';

function readSource(relativePath: string): string {
  return readFileSync(resolve(__dirname, relativePath), 'utf-8');
}

const statusStub = () => ({
  start: vi.fn(),
  progress: vi.fn(),
  fail: vi.fn(),
  complete: vi.fn(),
});

describe('P1-A3 — async schedule jobs fail closed', () => {
  it('never reports fake success for any job type', async () => {
    const processor = new ScheduleJobProcessor(statusStub() as never);

    for (const type of Object.values(ScheduleJobType)) {
      const status = statusStub();
      const worker = new ScheduleJobProcessor(status as never);
      const job = {
        id: 'j-1',
        data: { jobId: 'j-1', scheduleId: 's-1', type },
        updateProgress: vi.fn(),
      } as never;

      await expect(worker.process(job)).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(status.start).toHaveBeenCalledWith('j-1');
      expect(status.fail).toHaveBeenCalledWith('j-1', expect.stringContaining('not connected'));
      expect(status.complete).not.toHaveBeenCalled();
    }
    expect(processor).toBeTruthy();
  });

  it('rejects an unknown job type without marking it complete', async () => {
    const status = statusStub();
    const worker = new ScheduleJobProcessor(status as never);
    const job = {
      id: 'j-2',
      data: { jobId: 'j-2', scheduleId: 's-1', type: 'UNKNOWN' },
      updateProgress: vi.fn(),
    } as never;

    await expect(worker.process(job)).rejects.toThrow('Unknown job type');
    expect(status.fail).toHaveBeenCalled();
    expect(status.complete).not.toHaveBeenCalled();
  });

  it('processor source contains no canned success flags or simulated work', () => {
    const source = readSource('../job-queue/schedule-job.processor.ts');
    for (const flag of ['generated: true', 'validated: true', 'exported: true', 'reportGenerated: true']) {
      expect(source).not.toContain(flag);
    }
    expect(source).not.toContain('simulateWork');
    expect(source).toContain('ServiceUnavailableException');
  });

  it('controller refuses to enqueue generate/export jobs', async () => {
    const controller = Object.create(SchedulesDDDController.prototype) as SchedulesDDDController;

    await expect(
      controller.enqueueGenerate('s-1', { unitId: 'mr', month: 11, year: 2026 }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      controller.enqueueExport('s-1', { format: 'pdf' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('queue service keeps organization/user provenance in job data', () => {
    const source = readSource('../job-queue/schedule-job-queue.service.ts');
    expect(source).toContain('organizationId');
    expect(source).toContain('userId');
  });
});
