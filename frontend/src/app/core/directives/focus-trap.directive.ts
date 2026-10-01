import { Directive, ElementRef, HostListener, input } from '@angular/core';

@Directive({
  selector: '[appFocusTrap]',
  standalone: true,
})
export class FocusTrapDirective {
  readonly active = input(true);

  private readonly focusableSelector =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

  constructor(private host: ElementRef<HTMLElement>) {}

  @HostListener('keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.active()) return;

    const elements = this.host.nativeElement.querySelectorAll<HTMLElement>(this.focusableSelector);
    if (elements.length === 0) return;

    const first = elements[0];
    const last = elements[elements.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
