import { Injectable, inject } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private messageService: MessageService | null = null;
  private toast = inject(ToastService);

  init(messageService: MessageService): void {
    this.messageService = messageService;
  }

  show(title: string, message: string, severity: 'success' | 'info' | 'warning' | 'error'): void {
    this.toast[severity](title, message);
    if (this.messageService) {
      this.messageService.add({ severity, summary: title, detail: message, life: 3000 });
    }
  }

  success(title: string, message: string): void {
    this.show(title, message, 'success');
  }
  error(title: string, message: string): void {
    this.show(title, message, 'error');
  }
  warning(title: string, message: string): void {
    this.show(title, message, 'warning');
  }
  info(title: string, message: string): void {
    this.show(title, message, 'info');
  }
}
