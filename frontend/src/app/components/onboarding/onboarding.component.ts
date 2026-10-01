import { Component, inject, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { OnboardingService, OnboardingStep } from '../../services/onboarding.service';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ButtonModule, CardModule, TooltipModule],
  template: `
    <div class="onboarding-overlay">
      <!-- Tooltip Guide -->
      @if (tooltipVisible()) {
        <div class="tooltip-guide" [style.top.px]="tooltipY()" [style.left.px]="tooltipX()">
          <div class="tooltip-content">
            <i class="pi pi-info-circle"></i>
            <span>{{ tooltipText() }}</span>
          </div>
          <div class="tooltip-arrow"></div>
        </div>
      }

      <!-- Welcome Screen -->
      @if (currentStep() === 'welcome') {
        <div class="welcome-screen">
          <div class="welcome-content">
            <div class="logo">
              <i class="pi pi-calendar-plus"></i>
            </div>
            <h1>Vardiya Planlama</h1>
            <p class="tagline">Vardiya planlamayı saatlerden saniyelere indirin</p>

            <div class="features">
              <div class="feature">
                <i class="pi pi-bolt"></i>
                <span>Otomatik Planlama</span>
              </div>
              <div class="feature">
                <i class="pi pi-chart-bar"></i>
                <span>Adalet Skoru</span>
              </div>
              <div class="feature">
                <i class="pi pi-sync"></i>
                <span>Değişim Talepleri</span>
              </div>
            </div>

            <div class="actions">
              <p-button
                label="Demo Modunu Gör"
                icon="pi pi-play"
                styleClass="demo-btn"
                (onClick)="startDemo()"
              >
              </p-button>
              <p-button
                label="Kendi Verilerimle Başla"
                icon="pi pi-arrow-right"
                styleClass="start-btn"
                [outlined]="true"
                (onClick)="skipToApp()"
              >
              </p-button>
            </div>
          </div>

          <div class="visual">
            <div class="floating-cards">
              <div class="card card-1">
                <i class="pi pi-calendar"></i>
                <span>7 gün</span>
              </div>
              <div class="card card-2">
                <i class="pi pi-users"></i>
                <span>10 personel</span>
              </div>
              <div class="card card-3">
                <i class="pi pi-chart-line"></i>
                <span>85% adil</span>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- Generate Animation -->
      @if (currentStep() === 'generate') {
        <div class="generate-screen">
          <div class="generate-content">
            <div class="spinner">
              <i class="pi pi-spin pi-spinner"></i>
            </div>
            <h2>Plan Oluşturuluyor</h2>
            <p>Adaletli vardiya dağılımı hesaplanıyor...</p>
          </div>
        </div>
      }

      <!-- Results Preview -->
      @if (['interact', 'scenario', 'insights', 'cta'].includes(currentStep())) {
        <div class="results-screen" [class.fullscreen]="currentStep() === 'cta'">
          <div class="results-header">
            <button
              pButton
              class="p-button-text skip-btn"
              label="Atla"
              (click)="skipToApp()"
            ></button>
          </div>

          <div class="results-content">
            @if (currentStep() !== 'cta') {
              <div class="success-banner">
                <i class="pi pi-check-circle"></i>
                <span>Plan oluşturuldu - Adalet Skoru: {{ fairnessScore() }}</span>
              </div>
            }

            <!-- Interactive Grid Preview -->
            <div class="grid-preview">
              <h3>Vardiya Plan Önizlemesi</h3>
              <div class="mini-grid">
                @for (day of [1, 2, 3, 4, 5, 6, 7]; track day) {
                  <div class="mini-cell" [class.filled]="day <= 5">
                    <span class="day">{{ day }}. Gün</span>
                    @if (day <= 5) {
                      <span class="person">Personel {{ day }}</span>
                    } @else {
                      <span class="empty">Boş</span>
                    }
                  </div>
                }
              </div>
              <p class="hint">Hücrelere tıklayarak değişiklik yapabilirsiniz</p>
            </div>

            <!-- Scenario Buttons -->
            <div class="scenario-buttons">
              <p-button
                label="İzin Talebi Simüle Et"
                icon="pi pi-calendar-minus"
                (onClick)="simulateLeave()"
              ></p-button>
              <p-button
                label="Değişim Talebi"
                icon="pi pi-sync"
                (onClick)="simulateSwap()"
              ></p-button>
            </div>

            <!-- Insights Panel -->
            <div class="insights-panel">
              <h3>İçgörüler</h3>
              <div class="insight-item">
                <span class="label">Adalet Skoru</span>
                <span class="value good">85/100</span>
              </div>
              <div class="insight-item">
                <span class="label">Eşit Dağılım</span>
                <span class="value good">Mükemmel</span>
              </div>
              <div class="insight-item">
                <span class="label">Uyarılar</span>
                <span class="value warning">2 kısaca</span>
              </div>
            </div>

            @if (currentStep() === 'cta') {
              <div class="cta-section">
                <h2>Kendi verilerinizle başlayın</h2>
                <p>10 dakika içinde ilk vardiya planınızı oluşturun</p>
                <p-button
                  label="Uygulamaya Git"
                  icon="pi pi-arrow-right"
                  styleClass="cta-main-btn"
                  size="large"
                  (onClick)="finishOnboarding()"
                >
                </p-button>
                <button
                  pButton
                  class="p-button-text"
                  label="Demo verilerini temizle"
                  (click)="clearDemo()"
                ></button>
              </div>
            } @else {
              <div class="navigation">
                <p-button
                  label="İleri"
                  icon="pi pi-arrow-right"
                  iconPos="right"
                  (onClick)="nextStep()"
                ></p-button>
              </div>
            }
          </div>
        </div>
      }

      <!-- Progress Indicator -->
      <div class="progress-dots">
        @for (step of steps; track step; let i = $index) {
          <div
            class="dot"
            [class.active]="currentStep() === step"
            [class.completed]="stepIndex(step) < stepIndex(currentStep())"
          ></div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .onboarding-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, #1e3a5f 0%, #0f172a 100%);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }

      .welcome-screen {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 4rem;
        max-width: 900px;
        padding: 2rem;
      }

      .welcome-content {
        color: white;
      }

      .logo {
        width: 80px;
        height: 80px;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        border-radius: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 1.5rem;
        box-shadow: 0 20px 40px rgba(99, 102, 241, 0.4);

        i {
          font-size: 2.5rem;
          color: white;
        }
      }

      h1 {
        font-size: 3rem;
        font-weight: 700;
        margin: 0 0 0.5rem;
        background: linear-gradient(90deg, #fff, #a5b4fc);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
      }

      .tagline {
        font-size: 1.25rem;
        color: #94a3b8;
        margin-bottom: 2rem;
      }

      .features {
        display: flex;
        gap: 1.5rem;
        margin-bottom: 2rem;
      }

      .feature {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem 1rem;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: #cbd5e1;

        i {
          color: #8b5cf6;
        }
      }

      .actions {
        display: flex;
        gap: 1rem;
      }

      :host ::ng-deep .demo-btn {
        background: linear-gradient(135deg, #6366f1, #8b5cf6) !important;
        border: none !important;
        padding: 1rem 2rem !important;
        font-size: 1rem !important;
      }

      :host ::ng-deep .start-btn {
        border-color: rgba(255, 255, 255, 0.3) !important;
        color: white !important;
      }

      .visual {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .floating-cards {
        position: relative;
        width: 300px;
        height: 300px;
      }

      .card {
        position: absolute;
        background: rgba(255, 255, 255, 0.95);
        padding: 1rem 1.5rem;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
        animation: float 3s ease-in-out infinite;

        i {
          font-size: 1.5rem;
          color: #6366f1;
        }
        span {
          font-weight: 600;
          color: #1e293b;
        }
      }

      .card-1 {
        top: 20px;
        left: 20px;
        animation-delay: 0s;
      }
      .card-2 {
        top: 100px;
        right: 20px;
        animation-delay: 0.5s;
      }
      .card-3 {
        bottom: 40px;
        left: 60px;
        animation-delay: 1s;
      }

      @keyframes float {
        0%,
        100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-15px);
        }
      }

      .loading-screen,
      .generate-screen,
      .results-screen {
        text-align: center;
        color: white;
        max-width: 500px;
      }

      .loading-content,
      .generate-content h2 {
        font-size: 1.5rem;
      }

      .spinner {
        font-size: 4rem;
        color: #6366f1;
        margin-bottom: 1rem;
      }

      .results-screen {
        background: rgba(255, 255, 255, 0.05);
        border-radius: 20px;
        padding: 2rem;
        backdrop-filter: blur(10px);
        max-width: 600px;
      }

      .results-screen.fullscreen {
        background: transparent;
        max-width: 800px;
      }

      .success-banner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.75rem;
        background: linear-gradient(135deg, #10b981, #059669);
        padding: 1rem;
        border-radius: 12px;
        margin-bottom: 1.5rem;
        font-weight: 600;
      }

      .grid-preview {
        background: rgba(0, 0, 0, 0.3);
        padding: 1rem;
        border-radius: 12px;
        margin-bottom: 1rem;

        h3 {
          margin: 0 0 1rem;
          color: white;
          font-size: 1rem;
        }
      }

      .mini-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 0.5rem;
      }

      .mini-cell {
        background: rgba(255, 255, 255, 0.1);
        padding: 0.5rem;
        border-radius: 6px;
        text-align: center;

        &.filled {
          background: rgba(99, 102, 241, 0.3);
        }

        .day {
          display: block;
          font-size: 0.7rem;
          color: #94a3b8;
        }
        .person {
          display: block;
          font-size: 0.7rem;
          color: white;
        }
        .empty {
          display: block;
          font-size: 0.7rem;
          color: #64748b;
        }
      }

      .hint {
        font-size: 0.8rem;
        color: #64748b;
        margin-top: 0.5rem;
      }

      .scenario-buttons {
        display: flex;
        gap: 1rem;
        margin-bottom: 1.5rem;
      }

      .insights-panel {
        background: rgba(0, 0, 0, 0.3);
        padding: 1rem;
        border-radius: 12px;
        margin-bottom: 1.5rem;

        h3 {
          margin: 0 0 1rem;
          color: white;
          font-size: 1rem;
        }
      }

      .insight-item {
        display: flex;
        justify-content: space-between;
        padding: 0.5rem 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);

        .label {
          color: #94a3b8;
        }
        .value.good {
          color: #10b981;
          font-weight: 600;
        }
        .value.warning {
          color: #f59e0b;
          font-weight: 600;
        }
      }

      .cta-section {
        text-align: center;

        h2 {
          color: white;
          font-size: 2rem;
          margin-bottom: 0.5rem;
        }
        p {
          color: #94a3b8;
          margin-bottom: 1.5rem;
        }
      }

      :host ::ng-deep .cta-main-btn {
        background: linear-gradient(135deg, #6366f1, #8b5cf6) !important;
        border: none !important;
        padding: 1rem 3rem !important;
        font-size: 1.1rem !important;
      }

      .navigation {
        display: flex;
        justify-content: flex-end;
      }

      .progress-dots {
        position: absolute;
        bottom: 2rem;
        display: flex;
        gap: 0.5rem;
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.2);

        &.active {
          background: #6366f1;
          transform: scale(1.3);
        }
        &.completed {
          background: #10b981;
        }
      }

      .tooltip-guide {
        position: fixed;
        z-index: 10000;

        .tooltip-content {
          background: white;
          padding: 0.75rem 1rem;
          border-radius: 8px;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);

          i {
            color: #6366f1;
          }
          span {
            color: #1e293b;
            font-weight: 500;
          }
        }
      }

      .skip-btn {
        color: rgba(255, 255, 255, 0.6) !important;
      }

      .results-header {
        display: flex;
        justify-content: flex-end;
        margin-bottom: 1rem;
      }
    `,
  ],
})
export class OnboardingComponent implements OnInit {
  private onboarding = inject(OnboardingService);
  private router = inject(Router);

  currentStep = signal<OnboardingStep>('welcome');
  tooltipVisible = signal(false);
  tooltipText = signal('');
  tooltipX = signal(0);
  tooltipY = signal(0);
  fairnessScore = signal(0);

  steps: OnboardingStep[] = ['welcome', 'generate', 'interact', 'scenario', 'insights', 'cta'];

  ngOnInit() {
    if (this.onboarding.isCompleted()) {
      this.skipToApp();
    }
  }

  startDemo() {
    this.currentStep.set('generate');
    this.onboarding.getFairnessScore().subscribe({
      next: (analytics) => {
        this.fairnessScore.set(analytics.fairnessScore);
        this.currentStep.set('interact');
      },
      error: () => {
        this.currentStep.set('interact');
      },
    });
  }

  nextStep() {
    const idx = this.steps.indexOf(this.currentStep());
    if (idx < this.steps.length - 1) {
      this.currentStep.set(this.steps[idx + 1]);
    }
  }

  skipToApp() {
    this.onboarding.completeAndStart();
    this.router.navigate(['/dashboard']);
  }

  finishOnboarding() {
    this.onboarding.completeAndStart();
    this.router.navigate(['/dashboard']);
  }

  clearDemo() {
    this.onboarding.reset();
    this.currentStep.set('welcome');
  }

  simulateLeave() {
    alert('İzin talebi simüle edildi: Personel A - 3 gün');
  }

  simulateSwap() {
    alert('Değişim talebi simüle edildi: Personel A ↔ Personel B');
  }

  stepIndex(step: OnboardingStep): number {
    return this.steps.indexOf(step);
  }
}
