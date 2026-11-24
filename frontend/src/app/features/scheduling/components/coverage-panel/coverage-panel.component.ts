import { Component, ChangeDetectionStrategy } from '@angular/core';

/**
 * P2-13 — Bu panel artık kurgusal "Kademe Analizi / coverage%" sunmaz.
 *
 * Persist edilmiş asgari kadro gereksinimi modeli yoktur; cihaz bazlı doluluk
 * ve "eksik tarih" listeleri gerçek bir gereksinime dayanmadığı için kaldırıldı.
 * Backend coverage doğrulama gate'i korunur.
 */
@Component({
  selector: 'app-coverage-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="panel">
      <div class="panel-header"><h4>Kadro</h4></div>
      <div class="panel-empty">
        Kayıtlı asgari kadro gereksinimi bulunmuyor. Doluluk yüzdesi veya eksik
        gün listesi gösterilmiyor; doğrulama tanımlı kurallar üzerinden yapılır.
      </div>
    </div>
  `,
  styles: [`
    .panel { height: 100%; display: flex; flex-direction: column; }
    .panel-header { padding: 12px 16px; border-bottom: 1px solid var(--surface-border, #e2e8f0); }
    .panel-header h4 { margin: 0; font-size: 13px; font-weight: 600; }
    .panel-empty {
      padding: 40px 16px; text-align: center;
      color: var(--text-color-secondary, #94a3b8); font-size: 13px; line-height: 1.5;
    }
  `],
})
export class CoveragePanelComponent {}
