import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReportsComponent } from '../reports.component';
import { ScheduleStore, MetricsStore } from '../../../../core/state';

describe('ReportsComponent', () => {
  let component: ReportsComponent;
  let fixture: ComponentFixture<ReportsComponent>;
  let scheduleStore: ScheduleStore;

  beforeEach(async () => {
    scheduleStore = new ScheduleStore();

    await TestBed.configureTestingModule({
      imports: [ReportsComponent],
      providers: [
        { provide: ScheduleStore, useValue: scheduleStore },
        { provide: MetricsStore, useValue: new MetricsStore() },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ReportsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have summary tab active by default', () => {
    expect(component.activeTab()).toBe('summary');
  });

  it('should switch tabs correctly', () => {
    component.setActiveTab('daily');
    expect(component.activeTab()).toBe('daily');

    component.setActiveTab('personnel');
    expect(component.activeTab()).toBe('personnel');

    component.setActiveTab('departments');
    expect(component.activeTab()).toBe('departments');
  });

  it('should have all 4 tabs defined', () => {
    expect(component.tabs.length).toBe(4);
    expect(component.tabs).toContain('summary');
    expect(component.tabs).toContain('daily');
    expect(component.tabs).toContain('personnel');
    expect(component.tabs).toContain('departments');
  });

  describe('Summary Data', () => {
    it('should provide summary metrics', () => {
      const summary = component.getSummaryData();
      expect(summary).toBeDefined();
    });
  });

  describe('CSV Export', () => {
    it('should generate valid CSV format', () => {
      const testData = [
        { name: 'Test 1', value: 100 },
        { name: 'Test 2', value: 200 },
      ];
      const csv = component.exportToCSV(testData);

      expect(csv).toContain('name,value');
      expect(csv).toContain('Test 1,100');
      expect(csv).toContain('Test 2,200');
    });

    it('should handle empty data', () => {
      const csv = component.exportToCSV([]);
      expect(csv).toBe('name,value\n');
    });
  });

  describe('Date Range Selection', () => {
    it('should set start date', () => {
      const testDate = new Date('2026-05-01');
      component.setStartDate(testDate);
      expect(component.startDate()).toEqual(testDate);
    });

    it('should set end date', () => {
      const testDate = new Date('2026-05-31');
      component.setEndDate(testDate);
      expect(component.endDate()).toEqual(testDate);
    });
  });
});
