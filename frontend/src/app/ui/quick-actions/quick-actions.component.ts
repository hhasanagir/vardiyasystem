import { Component, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

interface QuickAction {
  id: string;
  label: string;
  icon: string;
  route: string;
  roles: string[];
}

@Component({
  selector: 'app-quick-actions',
  standalone: true,
  template: `
    <div class="quick-actions">
      <button
        class="qa-fab"
        (click)="open.set(!open())"
        [class.qa-fab-open]="open()"
        aria-label="Hızlı işlemler"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          width="24"
          height="24"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      @if (open()) {
        <div class="qa-menu" role="menu" aria-label="Hızlı işlemler">
          @for (action of filteredActions(); track action.id) {
            <button class="qa-item" (click)="execute(action)" role="menuitem">
              <span class="qa-icon" [innerHTML]="action.icon"></span>
              <span class="qa-label">{{ action.label }}</span>
            </button>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .quick-actions {
        position: fixed;
        bottom: 2rem;
        right: 2rem;
        z-index: 800;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.75rem;
      }
      .qa-fab {
        width: 3.5rem;
        height: 3.5rem;
        border-radius: 9999px;
        border: none;
        background: var(--primary, #3b82f6);
        color: white;
        cursor: pointer;
        box-shadow: var(--shadow-lg);
        display: flex;
        align-items: center;
        justify-content: center;
        transition:
          transform 0.2s,
          background 0.2s;
      }
      .qa-fab:hover {
        transform: scale(1.05);
      }
      .qa-fab-open {
        transform: rotate(45deg);
        background: var(--status-danger) !important;
      }
      .qa-menu {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        align-items: flex-end;
      }
      .qa-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1rem;
        border: none;
        border-radius: var(--radius-lg);
        background: var(--bg-primary);
        box-shadow: var(--shadow-md);
        cursor: pointer;
        color: var(--text-primary);
        font-size: 0.875rem;
        white-space: nowrap;
        transition:
          background 0.15s,
          transform 0.15s;
        min-width: 12rem;
      }
      .qa-item:hover {
        background: var(--bg-hover);
        transform: translateX(-4px);
      }
      .qa-icon {
        width: 1.5rem;
        height: 1.5rem;
        color: var(--primary);
        flex-shrink: 0;
      }
      .qa-icon svg {
        width: 1.25rem;
        height: 1.25rem;
      }
      .qa-label {
        font-weight: 500;
      }
      @media (max-width: 768px) {
        .quick-actions {
          bottom: 5rem;
          right: 1rem;
        }
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickActionsComponent {
  private router = inject(Router);
  private auth = inject(AuthService);

  readonly open = signal(false);

  private actions: QuickAction[] = [
    {
      id: 'new-incident',
      label: 'Arıza Bildir',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      route: '/app/device-incidents',
      roles: [
        'technician',
        'assistant_technician',
        'senior_technician',
        'supervisor',
        'medical_engineer',
        'hospital_admin',
      ],
    },
    {
      id: 'swap-request',
      label: 'Vardiya Takas Talebi',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>',
      route: '/app/swap-requests',
      roles: [
        'technician',
        'assistant_technician',
        'senior_technician',
        'supervisor',
        'medical_engineer',
      ],
    },
    {
      id: 'leave-request',
      label: 'İzin Talebi',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
      route: '/app/leave-management',
      roles: [
        'technician',
        'assistant_technician',
        'senior_technician',
        'supervisor',
        'hospital_admin',
      ],
    },
    {
      id: 'new-employee',
      label: 'Personel Ekle',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>',
      route: '/app/employees',
      roles: ['supervisor', 'hospital_admin'],
    },
    {
      id: 'handover',
      label: 'Devir Teslim Notu',
      icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
      route: '/app/handover-notes',
      roles: [
        'technician',
        'assistant_technician',
        'senior_technician',
        'supervisor',
        'medical_engineer',
      ],
    },
  ];

  readonly filteredActions = () => {
    const user = this.auth.user();
    const role = user?.role || 'staff';
    return this.actions.filter((a) => a.roles.includes(role));
  };

  execute(action: QuickAction): void {
    this.open.set(false);
    this.router.navigateByUrl(action.route);
  }
}
