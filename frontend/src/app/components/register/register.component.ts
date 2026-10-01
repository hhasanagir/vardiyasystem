import { Component, OnDestroy, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { AuthService } from '../../services/auth.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-register',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ButtonModule, InputTextModule, CardModule, SelectModule],
  template: `
    <div class="register-container">
      <p-card header="Kayıt Ol" styleClass="w-full max-w-md">
        <div class="flex flex-column gap-3">
          <div class="flex flex-column gap-2">
            <label for="name">Ad Soyad</label>
            <input pInputText id="name" [(ngModel)]="name" placeholder="Adınız soyadınız" />
          </div>
          <div class="flex flex-column gap-2">
            <label for="email">E-posta</label>
            <input pInputText id="email" [(ngModel)]="email" placeholder="E-posta adresiniz" />
          </div>
          <div class="flex flex-column gap-2">
            <label for="password">Şifre</label>
            <input
              pInputText
              id="password"
              type="password"
              [(ngModel)]="password"
              placeholder="Şifreniz"
            />
          </div>
          <div class="flex flex-column gap-2">
            <label for="organization">Kurum Adı</label>
            <input
              pInputText
              id="organization"
              [(ngModel)]="organizationName"
              placeholder="Kurum adı"
            />
          </div>
          @if (error) {
            <div class="error-message">{{ error }}</div>
          }
          <p-button
            label="Kayıt Ol"
            (onClick)="register()"
            [loading]="loading"
            styleClass="w-full"
          ></p-button>
          <p-button
            label="Giriş Sayfasına Dön"
            (onClick)="goToLogin()"
            [outlined]="true"
            styleClass="w-full"
          ></p-button>
        </div>
      </p-card>
    </div>
  `,
  styles: [
    `
      .register-container {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100vh;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      }
      :host ::ng-deep .p-card {
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
      }
      .error-message {
        color: #dc2626;
        font-size: 0.875rem;
      }
    `,
  ],
})
export class RegisterComponent implements OnDestroy {
  name = '';
  email = '';
  password = '';
  organizationName = '';
  loading = false;
  error = '';
  private destroy$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private router: Router,
  ) {}

  register(): void {
    this.loading = true;
    this.error = '';

    this.authService
      .register({
        name: this.name,
        email: this.email,
        password: this.password,
        organizationName: this.organizationName,
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.router.navigate(['/app/dashboard']);
        },
        error: (err) => {
          this.error = 'Kayıt başarısız. Lütfen bilgilerinizi kontrol edin.';
          this.loading = false;
        },
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}
