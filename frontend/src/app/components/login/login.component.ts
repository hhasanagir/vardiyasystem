import { Component, OnDestroy, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CheckboxModule } from 'primeng/checkbox';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { AuthService } from '../../services/auth.service';
import { BiometricAuthService } from '../../services/biometric-auth.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    InputTextModule,
    CheckboxModule,
    ProgressSpinnerModule,
    ToastModule,
  ],
  providers: [MessageService],
  template: `
    <p-toast></p-toast>
    <div class="login-page">
      <div class="login-background">
        <div class="bg-gradient"></div>
        <div class="bg-pattern"></div>
      </div>

      <div class="login-card">
        <div class="brand">
          <div class="logo">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="10" fill="url(#logoGrad)" />
              <path
                d="M12 20H28M20 12V28"
                stroke="white"
                stroke-width="2.5"
                stroke-linecap="round"
              />
              <defs>
                <linearGradient id="logoGrad" x1="0" y1="0" x2="40" y2="40">
                  <stop stop-color="#6366f1" />
                  <stop offset="1" stop-color="#8b5cf6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <h1 class="brand-name">Vardiya</h1>
          <p class="brand-tagline">Hospital Shift Management</p>
        </div>

        <div class="card-content">
          <h2 class="card-title">Hoş geldiniz</h2>
          <p class="card-subtitle">Devam etmek için giriş yapın</p>

          @if (biometricState().enabled && biometricState().available) {
            <div class="biometric-section">
              <button
                class="biometric-btn"
                (click)="loginWithBiometric()"
                [disabled]="biometricLoading"
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.5"
                >
                  <path
                    d="M12 2C8.13 2 5 5.13 5 9v3c0 .55.45 1 1 1s1-.45 1-1V9c0-2.76 2.24-5 5-5s5 2.24 5 5v3c0 .55.45 1 1 1s1-.45 1-1V9c0-3.87-3.13-7-7-7z"
                  />
                  <path d="M12 12c-1.1 0-2 .9-2 2v3c0 1.1.9 2 2 2s2-.9 2-2v-3c0-1.1-.9-2-2-2z" />
                  <path
                    d="M17 13c.55 0 1 .45 1 1v.5c0 2.21-1.79 4-4 4s-4-1.79-4-4V14c0-.55.45-1 1-1s1 .45 1 1v.5c0 1.1.9 2 2 2s2-.9 2-2V14c0-.55.45-1 1-1z"
                  />
                </svg>
                <span>{{
                  biometricLoading ? 'Doğrulanıyor...' : 'Parmak İzi / Yüz Tanıma ile Giriş'
                }}</span>
              </button>
            </div>
            <div class="divider"><span>veya</span></div>
          }

          <form (ngSubmit)="login()" class="login-form">
            <div class="form-group">
              <label for="email">E-posta</label>
              <div class="input-wrapper">
                <span class="p-input-icon-left">
                  <i class="pi pi-envelope"></i>
                </span>
                <input
                  pInputText
                  id="email"
                  [(ngModel)]="email"
                  name="email"
                  placeholder="E-posta adresiniz"
                  class="form-input"
                  [disabled]="loading"
                  autocomplete="email"
                />
              </div>
            </div>

            <div class="form-group">
              <label for="password">Şifre</label>
              <div class="input-wrapper">
                <span class="p-input-icon-left">
                  <i class="pi pi-lock"></i>
                </span>
                <input
                  pInputText
                  id="password"
                  type="password"
                  [(ngModel)]="password"
                  name="password"
                  placeholder="Şifreniz"
                  class="form-input"
                  [disabled]="loading"
                  autocomplete="current-password"
                />
              </div>
            </div>

            <div class="form-options">
              <div class="remember-me">
                <p-checkbox
                  [(ngModel)]="rememberMe"
                  [ngModelOptions]="{ standalone: true }"
                  [binary]="true"
                  inputId="remember"
                >
                </p-checkbox>
                <label for="remember">Beni hatırla</label>
              </div>
              <a href="#" class="forgot-link">Şifremi unuttum?</a>
            </div>

            <button
              pButton
              type="submit"
              label="Giriş Yap"
              class="login-btn"
              [loading]="loading"
              [disabled]="loading || !isFormValid"
            ></button>
          </form>

          @if (biometricState().available && !biometricState().enabled) {
            <div class="enable-biometric-hint">
              <span>Biometrik giriş için önce e-posta ve şifrenizle giriş yapın.</span>
            </div>
          }

          <div class="divider">
            <span>veya</span>
          </div>

          <button
            pButton
            label="Hesap Oluştur"
            class="register-btn"
            [outlined]="true"
            (click)="register()"
            [disabled]="loading"
          ></button>
        </div>

        <div class="card-footer">
          <p>© 2026 Vardiya Sistemi</p>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        width: 100%;
      }

      .login-page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        overflow: hidden;
      }

      .login-background {
        position: absolute;
        inset: 0;
        z-index: 0;
      }

      .bg-gradient {
        position: absolute;
        inset: 0;
        background: linear-gradient(135deg, #0b0f1a 0%, #111827 50%, #0f172a 100%);
      }
      .bg-gradient::before {
        content: '';
        position: absolute;
        inset: 0;
        background:
          radial-gradient(ellipse 80% 60% at 20% 30%, rgba(99, 102, 241, 0.08) 0%, transparent 70%),
          radial-gradient(ellipse 60% 50% at 80% 70%, rgba(139, 92, 246, 0.06) 0%, transparent 70%);
        animation: ambientMove 20s ease-in-out infinite alternate;
      }
      @keyframes ambientMove {
        0% {
          transform: translate(0, 0) scale(1);
        }
        50% {
          transform: translate(-5%, 3%) scale(1.05);
        }
        100% {
          transform: translate(3%, -2%) scale(1.02);
        }
      }

      .bg-pattern {
        position: absolute;
        inset: 0;
        background-image: radial-gradient(
          circle at 1px 1px,
          rgba(148, 163, 184, 0.15) 1px,
          transparent 0
        );
        background-size: 24px 24px;
        opacity: 0.5;
      }

      .login-card {
        position: relative;
        z-index: 1;
        width: 100%;
        max-width: 420px;
        margin: 16px;
        background: var(--bg-secondary);
        border-radius: 20px;
        box-shadow:
          0 20px 60px -12px rgba(0, 0, 0, 0.5),
          0 0 0 1px rgba(255, 255, 255, 0.05);
        overflow: hidden;
        animation: cardEnter 0.5s ease-out;
      }

      @keyframes cardEnter {
        from {
          opacity: 0;
          transform: translateY(24px) scale(0.97);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }

      .brand {
        text-align: center;
        padding: 40px 40px 24px;
        background: linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-secondary) 100%);
      }

      .logo {
        display: inline-flex;
        margin-bottom: 12px;
      }

      .logo svg {
        width: 48px;
        height: 48px;
      }

      .brand-name {
        font-size: 28px;
        font-weight: 700;
        color: var(--text-primary);
        margin: 0 0 4px;
        letter-spacing: -0.5px;
      }

      .brand-tagline {
        font-size: 13px;
        color: var(--text-muted);
        margin: 0;
        text-transform: uppercase;
        letter-spacing: 1px;
      }

      .card-content {
        padding: 24px 40px 40px;
      }

      .card-title {
        font-size: 24px;
        font-weight: 600;
        color: var(--text-primary);
        margin: 0 0 8px;
        text-align: center;
      }

      .card-subtitle {
        font-size: 15px;
        color: var(--text-muted);
        margin: 0 0 32px;
        text-align: center;
      }

      .login-form {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .form-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .form-group label {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-secondary);
      }

      .input-wrapper {
        position: relative;
      }

      .input-wrapper .p-input-icon-left {
        position: absolute;
        left: 14px;
        top: 50%;
        transform: translateY(-50%);
        color: #94a3b8;
        z-index: 1;
      }

      .input-wrapper .p-input-icon-left i {
        font-size: 16px;
      }

      .form-input {
        width: 100%;
        height: 48px;
        padding: 0 14px 0 42px !important;
        border: 1.5px solid var(--border-default) !important;
        border-radius: 10px !important;
        font-size: 15px !important;
        background: var(--bg-hover) !important;
        transition: all 0.2s ease !important;
      }

      .form-input:hover {
        border-color: #cbd5e1 !important;
      }

      .form-input:focus {
        border-color: #6366f1 !important;
        box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1) !important;
        background: var(--bg-surface) !important;
        outline: none !important;
      }

      .form-input::placeholder {
        color: #94a3b8 !important;
      }

      .form-options {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .remember-me {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .remember-me label {
        font-size: 13px;
        color: #64748b;
        cursor: pointer;
      }

      .forgot-link {
        font-size: 13px;
        color: #6366f1;
        text-decoration: none;
        font-weight: 500;
      }

      .forgot-link:hover {
        text-decoration: underline;
      }

      .login-btn {
        width: 100%;
        height: 48px;
        border-radius: 10px !important;
        font-size: 15px !important;
        font-weight: 600 !important;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%) !important;
        border: none !important;
        transition: all 0.2s ease !important;
      }

      .login-btn:hover:not(:disabled) {
        transform: translateY(-1px);
        box-shadow: 0 8px 20px -6px rgba(99, 102, 241, 0.5) !important;
      }

      .login-btn:active:not(:disabled) {
        transform: translateY(0);
      }

      .divider {
        display: flex;
        align-items: center;
        gap: 16px;
        margin: 8px 0;
      }

      .divider::before,
      .divider::after {
        content: '';
        flex: 1;
        height: 1px;
        background: var(--border-subtle);
      }

      .divider span {
        font-size: 12px;
        color: var(--text-muted);
        text-transform: uppercase;
      }

      .register-btn {
        width: 100%;
        height: 48px;
        border-radius: 10px !important;
        font-size: 15px !important;
        font-weight: 600 !important;
        border: 1.5px solid var(--border-default) !important;
        color: var(--text-secondary) !important;
      }

      .register-btn:hover:not(:disabled) {
        border-color: #6366f1 !important;
        color: #6366f1 !important;
        background: var(--bg-hover) !important;
      }

      .card-footer {
        padding: 20px 40px;
        text-align: center;
        border-top: 1px solid var(--border-subtle);
        background: var(--bg-hover);
      }

      .card-footer p {
        font-size: 12px;
        color: var(--text-muted);
        margin: 0;
      }

      :host ::ng-deep .p-checkbox .p-checkbox-box {
        border-radius: 6px;
        border: 1.5px solid #e2e8f0;
      }

      :host ::ng-deep .p-checkbox.p-checkbox-checked .p-checkbox-box {
        background: #6366f1;
        border-color: #6366f1;
      }

      .biometric-section {
        margin-bottom: 20px;
      }

      .biometric-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 16px;
        border-radius: 12px;
        border: 1.5px dashed var(--border-default);
        background: var(--bg-glass);
        color: var(--text-primary);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--transition-fast);
        &:hover {
          border-color: var(--accent-mr);
          background: var(--bg-active);
          color: var(--accent-mr);
        }
        &:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        svg {
          color: var(--accent-mr);
        }
      }

      .enable-biometric-hint {
        text-align: center;
        margin-top: 16px;
        span {
          font-size: 12px;
          color: var(--text-muted);
        }
      }

      @media (max-width: 480px) {
        .brand,
        .card-content,
        .card-footer {
          padding-left: 24px;
          padding-right: 24px;
        }

        .brand {
          padding-top: 32px;
          padding-bottom: 20px;
        }

        .login-card {
          margin: 12px;
          border-radius: 16px;
        }
      }
    `,
  ],
})
export class LoginComponent implements OnDestroy {
  email = '';
  password = '';
  rememberMe = false;
  loading = false;
  biometricLoading = false;
  private biometricAuth = inject(BiometricAuthService);
  readonly biometricState = signal(this.biometricAuth.state());
  private destroy$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private router: Router,
    private messageService: MessageService,
  ) {}

  get isFormValid(): boolean {
    return this.email.length > 0 && this.password.length > 0;
  }

  login(): void {
    if (!this.isFormValid) return;

    this.loading = true;

    this.authService
      .login(this.email, this.password)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: async () => {
          this.loading = false;
          if (this.rememberMe && this.biometricAuth.state().available) {
            const saved = await this.biometricAuth.saveCredentials(this.email, this.password);
            if (saved) {
              this.biometricState.set(this.biometricAuth.state());
            }
          }
          this.router.navigate(['/app/dashboard']);
        },
        error: (err) => {
          this.loading = false;
          this.messageService.add({
            severity: 'error',
            summary: 'Giriş Başarısız',
            detail: err?.message || 'E-posta veya şifre hatalı',
            life: 4000,
          });
        },
      });
  }

  async loginWithBiometric(): Promise<void> {
    this.biometricLoading = true;
    const success = await this.biometricAuth.tryBiometricLogin();
    this.biometricLoading = false;
    if (!success) {
      this.messageService.add({
        severity: 'error',
        summary: 'Biometrik Giriş Başarısız',
        detail: 'Kimlik doğrulama yapılamadı. Lütfen e-posta ve şifrenizle giriş yapın.',
        life: 4000,
      });
    }
  }

  register(): void {
    this.router.navigate(['/register']);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
