import { Component, ChangeDetectionStrategy } from '@angular/core';

/**
 * P2-13 — Bu görünüm artık kurgusal "Kademe / coverage%" sunmaz.
 *
 * Persist edilmiş asgari kadro gereksinimi modeli yoktur; doluluk oranı
 * hesaplanamaz. Backend coverage doğrulama gate'i korunur, ancak kullanıcıya
 * otoriter bir oran gösterilmez.
 */
@Component({
  selector: 'app-coverage-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="coverage-notice">
      Bu program için kayıtlı asgari kadro gereksinimi bulunmuyor. Doluluk oranı
      hesaplanamaz; doğrulama yalnızca tanımlı kurallar ve ihlaller üzerinden yapılır.
    </div>
  `,
  styles: [`
    .coverage-notice {
      padding: 24px 16px;
      color: var(--color-text-muted, #94a3b8);
      font-size: 13px;
      line-height: 1.5;
      text-align: center;
    }
  `],
})
export class CoverageViewComponent {}
