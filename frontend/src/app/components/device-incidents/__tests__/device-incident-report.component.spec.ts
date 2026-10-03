// @vitest-environment jsdom
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { DeviceIncidentReportComponent } from '../device-incident-report.component';
import { DeviceIncidentsService } from '../../../services/device-incidents.service';
import { AuthService } from '../../../services/auth.service';
import { WebSocketService } from '../../../services/websocket.service';
import { DeviceApiService } from '../../../core/api/device-api.service';

describe('DeviceIncidentReportComponent', () => {
  let component: DeviceIncidentReportComponent;
  let fixture: ComponentFixture<DeviceIncidentReportComponent>;

  const mockAuthService = {
    user: () => ({ id: 'user-1', name: 'Tekniker', unitId: 'unit-1', role: 'technician' }),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeviceIncidentReportComponent],
      providers: [
        {
          provide: DeviceIncidentsService,
          useValue: {
            getIncidents: vi.fn(() => of({ data: [], total: 0 })),
            getIncident: vi.fn(),
            createIncident: vi.fn(() => of({})),
            updateIncident: vi.fn(() => of({})),
            updateStatus: vi.fn(() => of({})),
          },
        },
        { provide: AuthService, useValue: mockAuthService },
        { provide: WebSocketService, useValue: { on: vi.fn(() => of(null)) } },
        { provide: DeviceApiService, useValue: { loadDevices: vi.fn(() => of({ devices: [], total: 0 })) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DeviceIncidentReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should expose the six configured issue types', () => {
    const issueTypes = component['issueTypes'];
    expect(issueTypes.length).toBe(6);
    expect(issueTypes).toContain('arıza');
    expect(issueTypes).toContain('bakım ihtiyacı');
    expect(issueTypes).toContain('cihaz offline');
  });

  it('should start with empty filters', () => {
    expect(component['filterStatus']()).toBe('');
    expect(component['filterSeverity']()).toBe('');
  });

  it('should toggle the create form', () => {
    expect(component['showForm']()).toBe(false);
    component['openCreate']();
    expect(component['showForm']()).toBe(true);
    component['closeForm']();
    expect(component['showForm']()).toBe(false);
  });

  it('should reset form state when opening create', () => {
    component['openCreate']();
    expect(component['formIssueType']).toBe('');
    expect(component['formSeverity']).toBe('medium');
    expect(component['formDescription']).toBe('');
    expect(component['formDeviceId']).toBe('');
    expect(component['formImageUrl']).toBe('');
    expect(component['formError']()).toBeNull();
  });

  it('should toggle incident detail', () => {
    const id = 'incident-1';
    expect(component['expandedId']()).toBeNull();
    component['toggleExpand'](id);
    expect(component['expandedId']()).toBe(id);
    component['toggleExpand'](id);
    expect(component['expandedId']()).toBeNull();
  });

  it('should expose the current user signal', () => {
    expect(component['currentUser']).toBeDefined();
    expect(component['currentUser']()?.name).toBe('Tekniker');
  });
});