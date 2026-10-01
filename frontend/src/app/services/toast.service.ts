import { Injectable, inject, signal } from '@angular/core';

export interface Toast {
  id: string;
  severity: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration: number;
  createdAt: number;
  dismissing: boolean;
}

export type ToastAction = 'confirm' | 'undo';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private counter = 0;
  toasts = signal<Toast[]>([]);

  private add(severity: Toast['severity'], title: string, message: string, duration = 4000) {
    const id = `toast-${++this.counter}`;
    this.toasts.update((list) => [
      ...list,
      { id, severity, title, message, duration, createdAt: Date.now(), dismissing: false },
    ]);
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
  }

  success(title: string, message: string, duration?: number) {
    this.add('success', title, message, duration);
  }
  error(title: string, message: string, duration?: number) {
    this.add('error', title, message, duration);
  }
  warning(title: string, message: string, duration?: number) {
    this.add('warning', title, message, duration);
  }
  info(title: string, message: string, duration?: number) {
    this.add('info', title, message, duration);
  }

  dismiss(id: string) {
    this.toasts.update((list) => list.map((t) => (t.id === id ? { ...t, dismissing: true } : t)));
    setTimeout(() => {
      this.toasts.update((list) => list.filter((t) => t.id !== id));
    }, 300);
  }

  dismissAll() {
    this.toasts.update((list) => list.map((t) => ({ ...t, dismissing: true })));
    setTimeout(() => this.toasts.set([]), 300);
  }
}
