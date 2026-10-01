import { Routes } from '@angular/router';

export const SCHEDULING_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/schedule-list/schedule-list.component').then(
        m => m.ScheduleListComponent,
      ),
    title: 'Vardiya Planları - VardiyaOS',
  },
  {
    path: ':unitId/:year/:month',
    loadComponent: () =>
      import('./pages/schedule-workspace/schedule-workspace.component').then(
        m => m.ScheduleWorkspaceComponent,
      ),
    title: 'Vardiya Planı - VardiyaOS',
  },
];
