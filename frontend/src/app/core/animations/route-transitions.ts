import { trigger, transition, style, query, group, animate, animateChild } from '@angular/animations';

export const routeAnimations = trigger('routeAnimations', [
  transition('* <=> *', [
    style({ position: 'relative' }),
    query(':enter, :leave', [
      style({ position: 'absolute', top: 0, left: 0, width: '100%' }),
    ], { optional: true }),
    group([
      query(':leave', [
        animate('200ms ease-out', style({ opacity: 0, transform: 'translateY(-8px)' })),
      ], { optional: true }),
      query(':enter', [
        style({ opacity: 0, transform: 'translateY(8px)' }),
        animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
      ], { optional: true }),
    ]),
  ]),
]);

export const listAnimation = trigger('listAnimation', [
  transition(':enter', [
    style({ opacity: 0, transform: 'translateY(12px)' }),
    animate('300ms ease-out', style({ opacity: 1, transform: 'translateY(0)' })),
  ]),
]);

export const fadeAnimation = trigger('fadeAnimation', [
  transition(':enter', [
    style({ opacity: 0 }),
    animate('200ms ease-out', style({ opacity: 1 })),
  ]),
  transition(':leave', [
    animate('150ms ease-in', style({ opacity: 0 })),
  ]),
]);

export const expandAnimation = trigger('expandAnimation', [
  transition(':enter', [
    style({ height: 0, opacity: 0, overflow: 'hidden' }),
    animate('250ms ease-out', style({ height: '*', opacity: 1 })),
  ]),
  transition(':leave', [
    style({ overflow: 'hidden' }),
    animate('200ms ease-in', style({ height: 0, opacity: 0 })),
  ]),
]);

export const scaleInAnimation = trigger('scaleInAnimation', [
  transition(':enter', [
    style({ opacity: 0, transform: 'scale(0.95)' }),
    animate('200ms ease-out', style({ opacity: 1, transform: 'scale(1)' })),
  ]),
]);
