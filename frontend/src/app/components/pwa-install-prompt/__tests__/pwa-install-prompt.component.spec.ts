import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { PwaInstallPromptComponent } from '../pwa-install-prompt.component';

describe('PwaInstallPromptComponent', () => {
  let component: PwaInstallPromptComponent;
  let fixture: ComponentFixture<PwaInstallPromptComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PwaInstallPromptComponent, HttpClientTestingModule],
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
