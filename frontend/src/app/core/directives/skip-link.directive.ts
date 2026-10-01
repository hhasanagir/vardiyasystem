import { Directive, HostBinding, HostListener } from '@angular/core';

@Directive({
  selector: '[appSkipLink]',
  standalone: true,
})
export class SkipLinkDirective {
  @HostBinding('attr.role') role = 'navigation';
  @HostBinding('attr.aria-label') ariaLabel = 'Hızlı erişim bağlantıları';
  @HostBinding('class.skip-link') class = true;

  @HostListener('click', ['$event'])
  onClick(event: Event): void {
    event.preventDefault();
    const main = document.querySelector<HTMLElement>('main, [role="main"], .page-content');
    main?.focus();
  }
}
