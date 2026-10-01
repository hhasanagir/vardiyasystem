import { Routes } from '@angular/router';
import { authGuard, roleGuard, rbacGuard } from './guards/auth.guard';
import { guestGuard } from './guards/guest.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/login', pathMatch: 'full' },

  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./components/login/login.component').then((m) => m.LoginComponent),
    title: 'Giriş - VardiyaOS',
  },

  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./components/register/register.component').then((m) => m.RegisterComponent),
    title: 'Kayıt - VardiyaOS',
  },

  {
    path: 'onboarding',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./components/onboarding/onboarding.component').then((m) => m.OnboardingComponent),
    title: 'Kurulum - VardiyaOS',
  },

  {
    path: 'app',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./layouts/main-layout/main-layout.component').then((m) => m.MainLayoutComponent),
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },

      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
        title: 'Kontrol Paneli - VardiyaOS',
      },

      {
        path: 'live-tracking',
        canActivate: [roleGuard],
        data: { minRole: 'medical_engineer' },
        loadComponent: () =>
          import('./components/live-tracking/live-tracking.component').then(
            (m) => m.LiveTrackingComponent,
          ),
        title: 'Canlı Vardiya Takibi - VardiyaOS',
      },

      {
        path: 'mr-plan',
        loadComponent: () =>
          import('./features/plans/plan-page.component').then((m) => m.PlanPageComponent),
        title: 'MR Planı - VardiyaOS',
        data: { unit: 'mr' },
      },

      {
        path: 'bt-plan',
        loadComponent: () =>
          import('./features/plans/plan-page.component').then((m) => m.PlanPageComponent),
        title: 'BT Planı - VardiyaOS',
        data: { unit: 'bt' },
      },

      {
        path: 'rontgen-plan',
        loadComponent: () =>
          import('./features/plans/plan-page.component').then((m) => m.PlanPageComponent),
        title: 'Röntgen Planı - VardiyaOS',
        data: { unit: 'rontgen' },
      },

      {
        path: 'nukleer-tip-plan',
        loadComponent: () =>
          import('./features/plans/plan-page.component').then((m) => m.PlanPageComponent),
        title: 'Nükleer Tıp Planı - VardiyaOS',
        data: { unit: 'nukleer' },
      },

      {
        path: 'onkoloji-plan',
        loadComponent: () =>
          import('./features/plans/plan-page.component').then((m) => m.PlanPageComponent),
        title: 'Radyasyon Onkolojisi Planı - VardiyaOS',
        data: { unit: 'onkoloji' },
      },

      {
        path: 'supervizor-plan',
        loadComponent: () =>
          import('./features/plans/plan-page.component').then((m) => m.PlanPageComponent),
        title: 'Süpervizör Planı - VardiyaOS',
        data: { unit: 'supervizor' },
      },

      {
        path: 'firevibe-schedule',
        loadComponent: () =>
          import('./features/firevibe-schedule/firevibe-schedule.component').then(
            (m) => m.FirevibeScheduleComponent,
          ),
        title: 'FireVibe Program - VardiyaOS',
      },

      {
        path: 'schedules',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadChildren: () =>
          import('./features/scheduling/scheduling.routes').then((m) => m.SCHEDULING_ROUTES),
      },

      {
        path: 'duty-roster',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./features/duty-roster/duty-roster.component').then((m) => m.DutyRosterComponent),
        title: 'Nöbetçi Listesi - VardiyaOS',
      },

      {
        path: 'employees',
        canActivate: [roleGuard, rbacGuard],
        data: { minRole: 'supervisor', permissions: ['personnel.read'] },
        loadComponent: () =>
          import('./components/employees/employees.component').then((m) => m.EmployeesComponent),
        title: 'Personel - VardiyaOS',
      },

      {
        path: 'leave-management',
        loadComponent: () =>
          import('./components/leave-management/leave-management.component').then(
            (m) => m.LeaveManagementComponent,
          ),
        title: 'İzin Yönetimi - VardiyaOS',
      },

      {
        path: 'swap-requests',
        loadComponent: () =>
          import('./components/subswap-requests/subswap-requests.component').then(
            (m) => m.SwapRequestsComponent,
          ),
        title: 'Vardiya Talepleri - VardiyaOS',
      },

      {
        path: 'reports',
        canActivate: [roleGuard, rbacGuard],
        data: { minRole: 'supervisor', permissions: ['analytics.read'] },
        loadComponent: () =>
          import('./components/reports/reports.component').then((m) => m.ReportsComponent),
        title: 'Raporlar - VardiyaOS',
      },

      {
        path: 'performance',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./components/performance/performance.component').then(
            (m) => m.PerformanceComponent,
          ),
        title: 'Performans - VardiyaOS',
      },

      {
        path: 'fairness-analysis',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./components/fairness-analysis/fairness-analysis.component').then(
            (m) => m.FairnessAnalysisComponent,
          ),
        title: 'Adalet Analizi - VardiyaOS',
      },

      {
        path: 'audit',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./features/audit/audit-center.component').then((m) => m.AuditCenterComponent),
        title: 'Denetim Merkezi - VardiyaOS',
      },

      {
        path: 'trainings',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./features/trainings/training-list.component').then(
            (m) => m.TrainingListComponent,
          ),
        title: 'Sertifika & Eğitim Yönetimi - VardiyaOS',
      },

      {
        path: 'skills',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./features/skills/skill-matrix.component').then((m) => m.SkillMatrixComponent),
        title: 'Yetkinlik Matrisi - VardiyaOS',
      },

      {
        path: 'approval-center',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./features/approval-center/approval-center.component').then(
            (m) => m.ApprovalCenterComponent,
          ),
        title: 'Onay Merkezi - VardiyaOS',
      },

      {
        path: 'handover-notes',
        loadComponent: () =>
          import('./components/handover-notes/handover-notes.component').then(
            (m) => m.HandoverNotesComponent,
          ),
        title: 'Devir Teslim Notları - VardiyaOS',
      },

      {
        path: 'device-incidents',
        loadComponent: () =>
          import('./components/device-incidents/device-incident-report.component').then(
            (m) => m.DeviceIncidentReportComponent,
          ),
        title: 'Arıza / Bakım Bildirimi - VardiyaOS',
      },

      {
        path: 'management-dashboard',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./components/management-dashboard/management-dashboard.component').then(
            (m) => m.ManagementDashboardComponent,
          ),
        title: 'Yönetim Paneli - VardiyaOS',
      },

      {
        path: 'settings',
        canActivate: [roleGuard, rbacGuard],
        data: { minRole: 'hospital_admin', permissions: ['organization.update'] },
        loadComponent: () =>
          import('./components/settings/settings.component').then((m) => m.SettingsComponent),
        title: 'Ayarlar - VardiyaOS',
      },

      {
        path: 'my-shifts',
        loadComponent: () =>
          import('./features/my-shifts/my-shifts.component').then((m) => m.MyShiftsComponent),
        title: 'Vardiyalarım - VardiyaOS',
      },

      {
        path: 'profile',
        loadComponent: () =>
          import('./features/profile/profile.component').then((m) => m.ProfileComponent),
        title: 'Profilim - VardiyaOS',
      },

      {
        path: 'my-day',
        loadComponent: () =>
          import('./features/my-day/my-day.component').then((m) => m.MyDayComponent),
        title: 'Bugünkü Vardiyam - VardiyaOS',
      },

      {
        path: 'shifts',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./components/shifts/shifts.component').then((m) => m.ShiftsComponent),
        title: 'Vardiyalar - VardiyaOS',
      },

      {
        path: 'command-center',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./features/command-center/command-center.component').then(
            (m) => m.CommandCenterComponent,
          ),
        title: 'Komuta Merkezi - VardiyaOS',
      },

      {
        path: 'notifications',
        loadComponent: () =>
          import('./components/notification-center/notification-center.component').then(
            (m) => m.NotificationCenterComponent,
          ),
        title: 'Bildirimler - VardiyaOS',
      },

      {
        path: 'kpi-overview',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./features/kpi-overview/kpi-overview.component').then(
            (m) => m.KpiOverviewComponent,
          ),
        title: 'KPI Göstergeleri - VardiyaOS',
      },

      {
        path: 'smart-recommendations',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./features/smart-recommendations/smart-recommendations.component').then(
            (m) => m.SmartRecommendationsComponent,
          ),
        title: 'Akıllı Öneriler - VardiyaOS',
      },

      // === ENTERPRISE MODULES ===

      {
        path: 'enterprise/assets',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./features/asset-management/asset-management.component').then(
            (m) => m.AssetManagementComponent,
          ),
        title: 'Cihaz Yönetimi - VardiyaOS',
      },

      {
        path: 'assets',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./features/asset-management/asset-management.component').then(
            (m) => m.AssetManagementComponent,
          ),
        title: 'Cihaz Yönetimi - VardiyaOS',
      },

      {
        path: 'assets/:id',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./features/asset-management/asset-detail.component').then(
            (m) => m.AssetDetailComponent,
          ),
        title: 'Cihaz Detayı - VardiyaOS',
      },

      {
        path: 'enterprise/biomedical',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./features/biomedical/biomedical.component').then((m) => m.BiomedicalComponent),
        title: 'Biyomedikal Mühendislik - VardiyaOS',
      },

      {
        path: 'enterprise/consumables',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./features/consumables/consumables.component').then(
            (m) => m.ConsumablesComponent,
          ),
        title: 'Sarf Malzeme Yönetimi - VardiyaOS',
      },

      {
        path: 'enterprise/procurement',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./features/procurement/procurement.component').then(
            (m) => m.ProcurementComponent,
          ),
        title: 'Satın Alma - VardiyaOS',
      },

      {
        path: 'enterprise/contracts',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./features/contracts/contracts.component').then((m) => m.ContractsComponent),
        title: 'Sözleşmeler - VardiyaOS',
      },

      {
        path: 'enterprise/suppliers',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./features/suppliers/suppliers.component').then((m) => m.SuppliersComponent),
        title: 'Tedarikçiler - VardiyaOS',
      },

      {
        path: 'enterprise/quality',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./features/quality/quality.component').then((m) => m.QualityComponent),
        title: 'Kalite Yönetimi - VardiyaOS',
      },

      {
        path: 'enterprise/radiation-safety',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./features/radiation-safety/radiation-safety.component').then(
            (m) => m.RadiationSafetyComponent,
          ),
        title: 'Radyasyon Güvenliği - VardiyaOS',
      },

      {
        path: 'enterprise/inventory',
        canActivate: [roleGuard],
        data: { minRole: 'supervisor' },
        loadComponent: () =>
          import('./features/inventory/inventory.component').then((m) => m.InventoryComponent),
        title: 'Akıllı Envanter - VardiyaOS',
      },
    ],
  },

  { path: '**', redirectTo: '/login' },
];
