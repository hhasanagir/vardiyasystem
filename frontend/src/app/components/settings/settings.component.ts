import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-settings',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="settings-page">
      <div class="page-header">
        <h1>Ayarlar</h1>
        <p class="subtitle">Sistem konfigürasyonu</p>
      </div>
      <div class="settings-grid">
        <div class="settings-card">
          <div class="settings-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </div>
          <h3>Genel Ayarlar</h3>
          <p>Sistem genel ayarları ve tercihleri yönetin</p>
        </div>
        <div class="settings-card">
          <div class="settings-icon shift">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
              <line x1="9" y1="4" x2="9" y2="20"/>
            </svg>
          </div>
          <h3>Vardiya Konfigürasyonu</h3>
          <p>Vardiya türleri, süreleri ve kuralları</p>
        </div>
        <div class="settings-card">
          <div class="settings-icon notify">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </div>
          <h3>Bildirimler</h3>
          <p>E-posta ve push bildirim ayarları</p>
        </div>
        <div class="settings-card">
          <div class="settings-icon leave">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
          </div>
          <h3>İzin Yönetimi</h3>
          <p>İzin kuralları ve kısıtlamalar</p>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .settings-page { max-width: 1400px; margin: 0 auto; }
    .page-header { margin-bottom: 32px; }
    .page-header h1 { font-size: 28px; font-weight: 700; color: #f8fafc; margin: 0 0 8px 0; }
    .subtitle { font-size: 14px; color: #64748b; margin: 0; }
    .settings-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
    .settings-card { background: rgba(30, 41, 59, 0.6); border: 1px solid rgba(71, 85, 105, 0.3); border-radius: 16px; padding: 24px; transition: all 0.2s; cursor: pointer; }
    .settings-card:hover { transform: translateY(-4px); border-color: rgba(99, 102, 241, 0.4); }
    .settings-icon { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: rgba(99, 102, 241, 0.1); border-radius: 12px; color: #6366f1; margin-bottom: 16px; }
    .settings-icon.shift { background: rgba(59, 130, 246, 0.1); color: #3b82f6; }
    .settings-icon.notify { background: rgba(245, 158, 11, 0.1); color: #f59e0b; }
    .settings-icon.leave { background: rgba(20, 184, 166, 0.1); color: #14b8a6; }
    .settings-card h3 { font-size: 16px; font-weight: 600; color: #f8fafc; margin: 0 0 8px 0; }
    .settings-card p { font-size: 14px; color: #64748b; margin: 0; }
    @media (max-width: 768px) { .settings-grid { grid-template-columns: 1fr; } }
  `]
})
export class SettingsComponent {}
