import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceIncidentReportComponent } from '../device-incident-report.component';
import { DeviceIncidentsService } from '../../../services/device-incidents.service';
import { AuthService } from '../../../services/auth.service';

describe('DeviceIncidentReportComponent', () => {
  let component: DeviceIncidentReportComponent;
  let fixture: ComponentFixture<DeviceIncidentReportComponent>;

  const mockAuthService = {
    user: () => ({ id: 'user-1', name: 'Tekniker', unitId: 'unit-1', role: 'technician' }),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeviceIncidentReportComponent, HttpClientTestingModule],
      providers: [DeviceIncidentsService, { provide: AuthService, useValue: mockAuthService }],
    }).compileComponents();

    fixture = TestBed.createComponent(DeviceIncidentReportComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have all filter types defined', () => {
    expect(component.issueTypes().length).toBe(6);
    expect(component.severityLevels().length).toBe(4);
    expect(component.statusLevels().length).toBe(4);
  });

  it('should have empty filters by default', () => {
    expect(component.selectedStatus()).toBe('');
    expect(component.selectedSeverity()).toBe('');
  });

  it('should toggle create form', () => {
    expect(component.showForm()).toBe(false);
    component.openCreate();
    expect(component.showForm()).toBe(true);
    component.closeForm();
    expect(component.showForm()).toBe(false);
  });

  it('should reset form state when opening create', () => {
    component.openCreate();
    expect(component.formIssueType()).toBe('arıza');
    expect(component.formSeverity()).toBe('low');
    expect(component.formDescription()).toBe('');
  });

  it('should filter incidents by status', () => {
    component.setFilter('status', 'open');
    expect(component.selectedStatus()).toBe('open');
  });

  it('should filter incidents by severity', () => {
    component.setFilter('severity', 'critical');
    expect(component.selectedSeverity()).toBe('critical');
  });

  it('should clear all filters', () => {
    component.setFilter('status', 'open');
    component.setFilter('severity', 'critical');
    component.clearFilters();
    expect(component.selectedStatus()).toBe('');
    expect(component.selectedSeverity()).toBe('');
  });

  it('should toggle incident detail', () => {
    const id = 'incident-1';
    expect(component.expandedId()).toBeNull();
    component.toggleExpand(id);
    expect(component.expandedId()).toBe(id);
    component.toggleExpand(id);
    expect(component.expandedId()).toBeNull();
  });

  it('should have template current user', () => {
    expect(component.currentUser).toBeDefined();
  });
});
