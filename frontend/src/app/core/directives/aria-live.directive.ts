import { Directive, effect, input, ElementRef } from '@angular/core';

@Directive({
  selector: '[appAriaLive]',
  standalone: true,
})
export class AriaLiveDirective {
  readonly message = input<string>('', { alias: 'appAriaLive' });
  readonly politeness = input<'off' | 'polite' | 'assertive'>('polite');

  constructor(private host: ElementRef<HTMLElement>) {
    this.host.nativeElement.setAttribute('aria-live', 'polite');
    this.host.nativeElement.setAttribute('aria-atomic', 'true');

    effect(() => {
      const msg = this.message();
      if (msg) {
        this.host.nativeElement.textContent = msg;
      }
    });
  }
}
