import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-auth-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterOutlet],
  template: `
    <div class="auth-layout">
      <router-outlet />
    </div>
  `,
  styles: [
    `
      .auth-layout {
        min-height: 100vh;
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: var(--bg-primary);
      }
    `,
  ],
})
export class AuthLayoutComponent {}
