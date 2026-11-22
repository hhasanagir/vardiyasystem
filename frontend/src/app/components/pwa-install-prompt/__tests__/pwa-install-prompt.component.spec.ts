import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { SwPush } from '@angular/service-worker';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PwaInstallPromptComponent } from '../pwa-install-prompt.component';

describe('PwaInstallPromptComponent', () => {
  let component: PwaInstallPromptComponent;
  let fixture: ComponentFixture<PwaInstallPromptComponent>;

  beforeEach(async () => {
    // jsdom in this harness does not implement matchMedia; PwaService calls it
    // in checkStandalone() during construction.
    Object.defineProperty(window, 'matchMedia', {
      value: (query: string): MediaQueryList => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
      writable: true,
      configurable: true,
    });
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [PwaInstallPromptComponent, HttpClientTestingModule],
      providers: [
        { provide: SwPush, useValue: { isEnabled: false } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PwaInstallPromptComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have pwa service injected', () => {
    expect(component['pwa']).toBeDefined();
  });

  it('should attempt install when install is called', () => {
    const promptSpy = vi.spyOn(component['pwa'], 'promptInstall');
    component.install();
    expect(promptSpy).toHaveBeenCalled();
  });
});