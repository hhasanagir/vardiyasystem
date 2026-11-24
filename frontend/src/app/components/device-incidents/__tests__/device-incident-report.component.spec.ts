import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { DeviceIncidentReportComponent } from '../device-incident-report.component';
import { DeviceIncidentsService } from '../../../services/device-incidents.service';
import { DeviceApiService } from '../../../core/api/device-api.service';
import { WebSocketService } from '../../../services/websocket.service';
import { AuthService } from '../../../services/auth.service';

describe('DeviceIncidentReportComponent', () => {
  let component: DeviceIncidentReportComponent;
  let fixture: ComponentFixture<DeviceIncidentReportComponent>;

  const mockAuthService = {
    user: () => ({ id: 'user-1', name: 'Tekniker', unitId: 'unit-1', role: 'technician' }),
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    TestBed.overrideComponent(DeviceIncidentReportComponent, {
      set: { template: '<div></div>', styleUrls: [], styles: [] },
    });
    await TestBed.configureTestingModule({
      imports: [DeviceIncidentReportComponent, HttpClientTestingModule],
      providers: [
        {
          provide: DeviceIncidentsService,
          useValue: { getIncidents: vi.fn(() => of({ data: [], total: 0 })) },
        },
        {
          provide: DeviceApiService,
          useValue: { loadDevices: vi.fn(() => of({ devices: [], total: 0 })) },
        },
        { provide: WebSocketService, useValue: { on: () => of({}) } },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DeviceIncidentReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have all issue type constants defined', () => {
    expect(component['issueTypes'].length).toBe(6);
    expect(component['issueTypes']).toContain('arıza');
  });

  it('should have empty filters by default', () => {
    expect(component['filterStatus']()).toBe('');
    expect(component['filterSeverity']()).toBe('');
  });

  it('should toggle create form', () => {
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
  });

  it('should filter incidents by status', () => {
    component['filterStatus'].set('open');
    expect(component['filterStatus']()).toBe('open');
  });

  it('should filter incidents by severity', () => {
    component['filterSeverity'].set('critical');
    expect(component['filterSeverity']()).toBe('critical');
  });

  it('should clear all filters', () => {
    component['filterStatus'].set('open');
    component['filterSeverity'].set('critical');
    component['filterStatus'].set('');
    component['filterSeverity'].set('');
    expect(component['filterStatus']()).toBe('');
    expect(component['filterSeverity']()).toBe('');
  });

  it('should toggle incident detail', () => {
    const id = 'incident-1';
    expect(component['expandedId']()).toBeNull();
    component['toggleExpand'](id);
    expect(component['expandedId']()).toBe(id);
    component['toggleExpand'](id);
    expect(component['expandedId']()).toBeNull();
  });

  it('should expose the current authenticated user', () => {
    const currentUser = component['currentUser']();
    expect(currentUser).toBeDefined();
    expect(currentUser?.name).toBe('Tekniker');
  });
});