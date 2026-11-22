import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ScrollPanelModule } from 'primeng/scrollpanel';

export interface ConflictViolation {
  rule?: string;
  code?: string;
  severity?: string;
  message?: string;
  isOverrideAllowed?: boolean;
}

export interface ConflictDetails {
  message: string;
  violations?: ConflictViolation[];
  hasBlocking?: boolean;
  canOverride?: boolean;
  serverVersion?: number;
  localVersion?: number;
  scheduleId?: string;
}

@Component({
  selector: 'app-conflict-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule,
    DialogModule, ButtonModule, TagModule, ScrollPanelModule,
  ],
  template: `
    <p-dialog
      [header]="'Çakışma (409)'"
      [(visible)]="visible"
      [modal]="true"
      [closable]="true"
      [style]="{ width: '540px', maxWidth: '92vw' }"
      (onHide)="onHide()"
    >
      <div class="conflict-body">
        <div class="conflict-summary" [class.has-blocking]="details?.hasBlocking">
          <p>{{ details?.message || 'Kayıt güncel durumla çakışıyor.' }}</p>
        </div>

        <div class="version-row" *ngIf="details?.serverVersion !== undefined || details?.localVersion !== undefined">
          <span *ngIf="details?.localVersion !== undefined">
            <b>Sizin sürümünüz:</b> {{ details?.localVersion }}
          </span>
          <span *ngIf="details?.serverVersion !== undefined">
            <b>Sunucudaki güncel sürüm:</b> {{ details?.serverVersion }}
          </span>
        </div>

        <div class="flag-row" *ngIf="details?.hasBlocking !== undefined">
          <p-tag
            [value]="details?.hasBlocking ? 'Engelleyen İhlaller Var' : 'İhlal Yok'"
            [severity]="details?.hasBlocking ? 'danger' : 'success'"
          />
          <p-tag
            *ngIf="details?.canOverride !== undefined"
            [value]="details?.canOverride ? 'Override Yapılabilir' : 'Override Yapılamaz'"
            [severity]="details?.canOverride ? 'warn' : 'secondary'"
            styleClass="ml-2"
          />
        </div>

        <p-scrollPanel styleClass="w-full" [style]="{ height: '180px' }" *ngIf="details?.violations?.length">
          <div class="violation" *ngFor="let v of details?.violations || []">
            <p-tag
              [value]="(v.severity || 'INFO')"
              [severity]="severityOf(v.severity)"
              styleClass="mr-2"
            />
            <span class="vrule" *ngIf="v.rule || v.code">{{ v.rule || v.code }}</span>
            <span class="vmsg">{{ v.message }}</span>
          </div>
        </p-scrollPanel>
      </div>

      <ng-template pTemplate="footer">
        <p-button label="Kapat" severity="secondary" [text]="true" (onClick)="close()" />
        <p-button label="Güncel Veriyi Yükle / Karşılaştır" icon="pi pi-refresh" (onClick)="reload.emit()" />
      </ng-template>
    </p-dialog>
  `,
  styles: [`
    :host { display: block; }
    .conflict-body { display: flex; flex-direction: column; gap: 12px; }
    .conflict-summary { padding: 10px 12px; border-radius: 8px; background: #fff7ed; border: 1px solid #fdba74; color: #7c2d12; }
    .conflict-summary.has-blocking { background: #fef2f2; border-color: #fca5a5; color: #991b1b; }
    .version-row { display: flex; gap: 16px; font-size: 13px; color: #374151; }
    .flag-row { display: flex; gap: 8px; align-items: center; }
    .violation { display: flex; align-items: flex-start; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
    .vrule { font-weight: 600; color: #1f2937; white-space: nowrap; }
    .vmsg { color: #4b5563; }
  `],
})
export class ConflictDialogComponent {
  @Input() visible = false;
  @Input() details: ConflictDetails | null = null;
  @Output() visibleChange = new EventEmitter<boolean>();
  @Output() reload = new EventEmitter<void>();

  severityOf(severity?: string): 'success' | 'warn' | 'danger' | 'info' | 'secondary' {
    switch ((severity || '').toUpperCase()) {
      case 'BLOCKING': return 'danger';
      case 'WARNING': return 'warn';
      case 'WARN': return 'warn';
      case 'INFO': return 'info';
      default: return 'info';
    }
  }

  close(): void {
    this.visibleChange.emit(false);
  }

  onHide(): void {
    this.visibleChange.emit(false);
  }
}
