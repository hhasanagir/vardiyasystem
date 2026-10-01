import { Injectable, inject, signal, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

@Injectable({ providedIn: 'root' })
export class SessionTimeoutService {
  private router = inject(Router);
  private auth = inject(AuthService);
  private toast = inject(ToastService);
  private ngZone = inject(NgZone);

  private readonly WARNING_MS = 5 * 60 * 1000;
  private readonly CHECK_INTERVAL_MS = 30 * 1000;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastActivity = Date.now();

  showWarning = signal(false);
  remainingSeconds = signal(0);
  private warningTimer: ReturnType<typeof setInterval> | null = null;

  start(refreshExpiresInMs: number) {
    this.lastActivity = Date.now();
    this.setupActivityListeners();
    this.startTimer(refreshExpiresInMs);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    if (this.warningTimer) clearInterval(this.warningTimer);
    this.timer = null;
    this.warningTimer = null;
    this.showWarning.set(false);
    this.removeActivityListeners();
  }

  private setupActivityListeners() {
    document.addEventListener('click', this.onActivity);
    document.addEventListener('keydown', this.onActivity);
    document.addEventListener('mousemove', this.onActivity);
    document.addEventListener('scroll', this.onActivity);
  }

  private removeActivityListeners() {
    document.removeEventListener('click', this.onActivity);
    document.removeEventListener('keydown', this.onActivity);
    document.removeEventListener('mousemove', this.onActivity);
    document.removeEventListener('scroll', this.onActivity);
  }

  private onActivity = () => {
    this.lastActivity = Date.now();
    if (this.showWarning()) {
      this.dismissWarning();
    }
  };

  private startTimer(refreshExpiresInMs: number) {
    this.ngZone.runOutsideAngular(() => {
      this.timer = setInterval(() => {
        const elapsed = Date.now() - this.lastActivity;
        const remaining = refreshExpiresInMs - elapsed;

        if (remaining <= 0) {
          this.ngZone.run(() => this.handleExpired());
        } else if (remaining <= this.WARNING_MS && !this.showWarning()) {
          this.ngZone.run(() => this.showSessionWarning(remaining));
        }
      }, this.CHECK_INTERVAL_MS);
    });
  }

  private showSessionWarning(remainingMs: number) {
    this.showWarning.set(true);
    this.remainingSeconds.set(Math.ceil(remainingMs / 1000));
    this.ngZone.runOutsideAngular(() => {
      this.warningTimer = setInterval(() => {
        this.ngZone.run(() => {
          this.remainingSeconds.update((v) => Math.max(0, v - 1));
        });
      }, 1000);
    });
  }

  dismissWarning() {
    this.showWarning.set(false);
    if (this.warningTimer) clearInterval(this.warningTimer);
    this.warningTimer = null;
  }

  extendSession() {
    this.dismissWarning();
    this.lastActivity = Date.now();
    this.toast.info('Oturum Uzatıldı', 'Oturum süreniz uzatıldı');
  }

  private handleExpired() {
    this.stop();
    this.auth.logout();
    this.toast.warning('Oturum Süresi Doldu', 'Güvenliğiniz için oturumunuz sonlandırıldı');
    this.router.navigate(['/login']);
  }
}
