import { Schedule } from '../aggregates/schedule.aggregate';

export interface ScheduleFilter {
  unitId?: string;
  month?: number;
  year?: number;
  status?: string;
  organizationId?: string;
  take?: number;
  skip?: number;
}

export interface ScheduleRepositoryPort {
  findById(id: string): Promise<Schedule | null>;
  findByUnitMonthYear(
    unitId: string,
    month: number,
    year: number,
  ): Promise<Schedule | null>;
  findAll(filter: ScheduleFilter): Promise<Schedule[]>;
  save(schedule: Schedule): Promise<void>;
  delete(id: string): Promise<void>;
  count(filter?: ScheduleFilter): Promise<number>;
  findPendingApprovals(): Promise<Schedule[]>;
}
