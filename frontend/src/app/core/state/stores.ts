/**
 * Unified barrel for all signal stores.
 * Import stores from './stores' rather than individual files.
 *
 * @example
 * import { ScheduleStore, UnitStore, MetricsStore, PersistenceStore } from '../state/stores';
 */

export { ScheduleStore, type PublishedSchedule } from './schedule.store';
export { MetricsStore, UnitStore } from './index';
export { PersistenceStore } from './persistence.store';
