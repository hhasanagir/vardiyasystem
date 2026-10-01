import { ErrorHandler, Injectable } from '@angular/core';
import { LoggerService } from './logger.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  constructor(private readonly logger: LoggerService) {}

  handleError(error: unknown): void {
    const errorId = crypto.randomUUID().slice(0, 8);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const stack = error instanceof Error ? error.stack : undefined;

    console.error(`[GlobalErrorHandler]`, error);
    this.logger.error(`[${errorId}] Uncaught error: ${message}`, 'GlobalErrorHandler', {
      errorId,
      message,
      stack,
      error: String(error),
      type: typeof error,
      timestamp: new Date().toISOString(),
    });

    const container = document.getElementById('error-fallback');
    if (container) {
      container.style.display = 'flex';
      container.innerHTML = `
        <div style="max-width:500px;text-align:center;padding:2rem">
          <div style="font-size:3rem;margin-bottom:1rem">!</div>
          <h2 style="margin:0 0 0.5rem;color:#ef4444">Bir hata oluştu</h2>
          <p style="margin:0 0 1.5rem;color:#94a3b8;font-size:0.875rem">
            Beklenmeyen bir sorun oluştu. Lütfen sayfayı yenileyin.
          </p>
          <p style="margin:0 0 1.5rem;color:#64748b;font-size:0.75rem">
            Hata Kodu: ${errorId}
          </p>
          <button onclick="location.reload()" style="
            padding:0.75rem 1.5rem;background:#3b82f6;color:white;
            border:none;border-radius:0.5rem;cursor:pointer;font-size:0.875rem
          ">Sayfayı Yenile</button>
        </div>
      `;
    }
  }
}
