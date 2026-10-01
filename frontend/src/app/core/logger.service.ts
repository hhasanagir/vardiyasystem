import { Injectable, inject } from '@angular/core';
import { environment } from '../environments';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: string;
  data?: unknown;
  timestamp: string;
}

@Injectable({ providedIn: 'root' })
export class LoggerService {
  private isProduction = environment.production;

  debug(message: string, context?: string, data?: unknown): void {
    this.log('debug', message, context, data);
  }

  info(message: string, context?: string, data?: unknown): void {
    this.log('info', message, context, data);
  }

  warn(message: string, context?: string, data?: unknown): void {
    this.log('warn', message, context, data);
  }

  error(message: string, context?: string, data?: unknown): void {
    this.log('error', message, context, data);
  }

  private log(level: LogLevel, message: string, context?: string, data?: unknown): void {
    const entry: LogEntry = {
      level,
      message,
      context,
      data: data ?? undefined,
      timestamp: new Date().toISOString(),
    };

    if (this.isProduction && level === 'debug') return;

    switch (level) {
      case 'error':
        console.error(`[${entry.context || 'App'}] ${message}`, data ?? '');
        break;
      case 'warn':
        console.warn(`[${entry.context || 'App'}] ${message}`, data ?? '');
        break;
      default:
        if (!this.isProduction) {
          console.log(`[${entry.context || 'App'}] ${message}`, data ?? '');
        }
    }
  }
}
