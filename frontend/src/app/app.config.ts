import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  ErrorHandler,
  isDevMode,
} from '@angular/core';
import {
  provideRouter,
  withPreloading,
  PreloadAllModules,
  withInMemoryScrolling,
} from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { providePrimeNG } from 'primeng/config';
import { provideServiceWorker } from '@angular/service-worker';
import Aura from '@primeng/themes/aura';
import { authInterceptor, errorInterceptor } from './interceptors/auth.interceptor';
import { csrfInterceptor } from './interceptors/csrf.interceptor';
import { offlineInterceptor } from './interceptors/offline.interceptor';
import { GlobalErrorHandler } from './core/error-handler.service';

import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    provideRouter(
      routes,
      withPreloading(PreloadAllModules),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
    ),
    provideHttpClient(
      withInterceptors([csrfInterceptor, authInterceptor, offlineInterceptor, errorInterceptor]),
    ),
    provideAnimations(),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:5000',
    }),
    providePrimeNG({
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.dark',
          ripple: true,
        },
      },
    }),
  ],
};
