import { Pipe, PipeTransform } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

const logger = { warn: (...args: unknown[]) => console.warn('[SafeHtmlPipe]', ...args) };

@Pipe({ name: 'safeHtml', standalone: true })
export class SafeHtmlPipe implements PipeTransform {
  constructor(private sanitizer: DomSanitizer) {}
  transform(value: string): SafeHtml {
    if (typeof value !== 'string') return value as unknown as SafeHtml;
    if (
      value.includes('<script') ||
      value.includes('javascript:') ||
      value.includes('onerror=') ||
      value.includes('onload=')
    ) {
      logger.warn('Blocked potentially malicious HTML content', { preview: value.slice(0, 100) });
      return this.sanitizer.bypassSecurityTrustHtml('');
    }
    return this.sanitizer.bypassSecurityTrustHtml(value);
  }
}
