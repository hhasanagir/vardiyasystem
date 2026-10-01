import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { MessageService, ConfirmationService } from 'primeng/api';
import { EmployeeService } from '../../services/employee.service';
import { ShiftService } from '../../services/shift.service';
import { Employee, PersonnelStats } from '../../domain/models';
import { AuthService } from '../../services/auth.service';
import { Subject } from 'rxjs';
import { takeUntil, finalize } from 'rxjs/operators';

interface PersonnelCard extends Employee {
  initials: string;
  stats: PersonnelStats;
  fatigueLevel: 'low' | 'moderate' | 'high' | 'critical';
  availability: 'available' | 'busy' | 'on-leave' | 'overloaded';
  department: string;
  deviceSkills: string[];
}
interface WizardData {
  name: string;
  employeeNo: string;
  email: string;
  phone: string;
  role: string;
  department: string;
  specialization: string;
  experienceYears: number;
  offDays: number[];
  maxWeeklyHours: number;
  deviceSkills: string[];
  nightShiftEligible: boolean;
  isActive: boolean;
  employmentStatus: string;
  startDate: string;
  notes: string;
}

@Component({
  selector: 'app-employees',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ToastModule, ConfirmDialogModule],
  providers: [MessageService, ConfirmationService],
  templateUrl: './employees.component.html',
  styleUrls: ['./employees.component.scss'],
})
export class EmployeesComponent implements OnInit, OnDestroy {
  private employeeService = inject(EmployeeService);
  private shiftService = inject(ShiftService);
  private authService = inject(AuthService);
  private messageService = inject(MessageService);
  private confirmationService = inject(ConfirmationService);
  private destroy$ = new Subject<void>();

  personnel = signal<PersonnelCard[]>([]);
  filteredPersonnel = signal<PersonnelCard[]>([]);
  departmentFilter = signal<string>('all');
  statusFilter = signal<'all' | 'available' | 'busy' | 'on-leave' | 'overloaded'>('all');
  searchTerm = '';

  selectedMonth = signal<number>(new Date().getMonth() + 1);
  selectedYear = signal<number>(new Date().getFullYear());
  months = [
    { value: 1, label: 'Ocak' },
    { value: 2, label: 'Şubat' },
    { value: 3, label: 'Mart' },
    { value: 4, label: 'Nisan' },
    { value: 5, label: 'Mayıs' },
    { value: 6, label: 'Haziran' },
    { value: 7, label: 'Temmuz' },
    { value: 8, label: 'Ağustos' },
    { value: 9, label: 'Eylül' },
    { value: 10, label: 'Ekim' },
    { value: 11, label: 'Kasım' },
    { value: 12, label: 'Aralık' },
  ];
  years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);

  wizardVisible = signal(false);
  wizardEditId = signal<string>('');
  wizardStep = signal(1);
  saving = signal(false);
  stepValid = signal(false);

  wizardData: WizardData = this.emptyWizardData();

  wizardSteps = [
    { index: 1, label: 'Kimlik', desc: 'Kişisel bilgiler' },
    { index: 2, label: 'Mesleki', desc: 'Rol ve uzmanlık' },
    { index: 3, label: 'Operasyonel', desc: 'Vardiya ayarları' },
    { index: 4, label: 'Durum', desc: 'Onay ve özet' },
  ];

  roles = [
    { label: 'Tekniker', value: 'technician' },
    { label: 'Yardımcı Tekniker', value: 'assistant_technician' },
    { label: 'Sorumlu Tekniker', value: 'senior_technician' },
    { label: 'Süpervizör', value: 'supervisor' },
    { label: 'Medikal Mühendis', value: 'medical_engineer' },
    { label: 'Görüntüleme Hiz. Müdürü', value: 'imaging_director' },
    { label: 'Sekreter', value: 'secretary' },
  ];

  departmentFilters = [
    { label: 'MR', value: 'mr' },
    { label: 'BT', value: 'bt' },
    { label: 'Röntgen', value: 'rontgen' },
    { label: 'Nükleer Tıp', value: 'nukleer' },
    { label: 'RONK', value: 'onkoloji' },
  ];

  departments = this.departmentFilters;

  weekDays = [
    { name: 'Pazar', value: 0 },
    { name: 'Pazartesi', value: 1 },
    { name: 'Salı', value: 2 },
    { name: 'Çarşamba', value: 3 },
    { name: 'Perşembe', value: 4 },
    { name: 'Cuma', value: 5 },
    { name: 'Cumartesi', value: 6 },
  ];

  deviceSkillOptions = [
    'MR',
    'BT',
    'Röntgen',
    'Nükleer Tıp',
    'Anjiyo',
    'Ultrason',
    'Mamografi',
    'Kemik Dansitometri',
  ];

  ngOnInit(): void {
    this.loadPersonnel();
  }

  isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  loadPersonnel(): void {
    this.employeeService
      .getAll(this.selectedMonth(), this.selectedYear())
      .pipe(
        takeUntil(this.destroy$),
        finalize(() => {
          /* loading done handled by service */
        }),
      )
      .subscribe({
        next: (data) => {
          const cards: PersonnelCard[] = data.map((emp) => ({
            ...emp,
            initials: this.getInitials(emp.name),
            stats: this.toStats(emp.stats),
            fatigueLevel: this.toFatigue(emp.stats),
            availability: this.toAvailability(emp.stats, emp.isActive, emp.employmentStatus),
            department: this.getDepartment(emp),
            deviceSkills: emp.deviceSkills || [],
          }));
          this.personnel.set(cards);
          this.applyFilters();
        },
        error: () => {
          this.personnel.set([]);
        },
      });
  }

  changeMonth(month: number): void {
    this.selectedMonth.set(month);
    this.loadPersonnel();
  }

  changeYear(year: number): void {
    this.selectedYear.set(year);
    this.loadPersonnel();
  }

  toStats(stats?: PersonnelStats): PersonnelStats {
    return (
      stats ?? {
        personnelId: '',
        selectedMonth: this.selectedMonth(),
        totalShifts: 0,
        dayShifts: 0,
        nightShifts: 0,
        totalHours: 0,
        weeklyHours: 0,
        workloadPercentage: 0,
        riskLevel: 'low',
        critical: false,
        conflicts: 0,
      }
    );
  }

  toFatigue(stats?: PersonnelStats): 'low' | 'moderate' | 'high' | 'critical' {
    if (!stats) return 'low';
    return stats.riskLevel;
  }

  toAvailability(
    stats?: PersonnelStats,
    isActive?: boolean,
    employmentStatus?: string,
  ): 'available' | 'busy' | 'on-leave' | 'overloaded' {
    if (isActive === false || employmentStatus === 'inactive' || employmentStatus === 'leave')
      return 'on-leave';
    if (!stats) return 'available';
    if (stats.workloadPercentage > 90) return 'overloaded';
    if (stats.workloadPercentage > 70) return 'busy';
    return 'available';
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  }

  getDepartment(employee: Employee): string {
    if (
      employee.unit?.type &&
      ['mr', 'bt', 'rontgen', 'nukleer', 'onkoloji'].includes(employee.unit.type)
    ) {
      return employee.unit.type;
    }
    if (employee.unit?.code) {
      const code = employee.unit.code.toLowerCase();
      if (['mr', 'bt', 'rontgen', 'nukleer', 'onkoloji'].includes(code)) {
        return code;
      }
    }
    if (
      employee.unitId &&
      ['mr', 'bt', 'rontgen', 'nukleer', 'onkoloji'].includes(employee.unitId)
    ) {
      return employee.unitId;
    }
    return 'mr';
  }

  getDepartmentLabel(dept: string): string {
    const labels: Record<string, string> = {
      mr: 'MR',
      bt: 'BT',
      rontgen: 'Röntgen',
      nukleer: 'Nükleer Tıp',
      onkoloji: 'RONK',
    };
    return labels[dept] || dept.toUpperCase();
  }

  getAvatarGradient(dept: string): string {
    const gradients: Record<string, string> = {
      mr: 'linear-gradient(135deg, #3b82f6, #2563eb)',
      bt: 'linear-gradient(135deg, #14b8a6, #0d9488)',
      rontgen: 'linear-gradient(135deg, #f59e0b, #d97706)',
      nukleer: 'linear-gradient(135deg, #10b981, #059669)',
      onkoloji: 'linear-gradient(135deg, #ec4899, #db2777)',
    };
    return gradients[dept] || gradients['mr'];
  }

  getWorkloadClass(percent: number): string {
    if (percent > 75) return 'high';
    if (percent > 50) return 'moderate';
    return 'low';
  }

  getFatigueLabel(level: string): string {
    const labels: Record<string, string> = {
      low: 'Düşük',
      moderate: 'Orta',
      high: 'Yüksek',
      critical: 'Kritik',
    };
    return labels[level] || level;
  }

  getRoleLabel(role: string): string {
    const roles: Record<string, string> = {
      technician: 'Tekniker',
      assistant_technician: 'Yardımcı Tekniker',
      senior_technician: 'Sorumlu Tekniker',
      supervisor: 'Süpervizör',
      medical_engineer: 'Medikal Mühendis',
      imaging_director: 'Görüntüleme Hiz. Müdürü',
      secretary: 'Sekreter',
      system_admin: 'Sistem Yöneticisi',
      hospital_admin: 'Hastane Yöneticisi',
      guest: 'Misafir',
    };
    return roles[role] || role;
  }

  getDayName(value: number): string {
    const day = this.weekDays.find((d) => d.value === value);
    return day ? day.name : '';
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      active: 'Aktif',
      probation: 'Deneme Sürecinde',
      leave: 'İzinli',
      inactive: 'Pasif',
    };
    return labels[status] || status;
  }

  filterByDepartment(dept: string): void {
    this.departmentFilter.set(dept);
    this.applyFilters();
  }

  filterByStatus(status: 'all' | 'available' | 'busy' | 'on-leave' | 'overloaded'): void {
    this.statusFilter.set(status);
    this.applyFilters();
  }

  onSearch(term: string): void {
    this.searchTerm = term;
    this.applyFilters();
  }

  applyFilters(): void {
    let filtered = this.personnel();
    if (this.departmentFilter() !== 'all') {
      filtered = filtered.filter((p) => p.department === this.departmentFilter());
    }
    if (this.statusFilter() !== 'all') {
      filtered = filtered.filter((p) => p.availability === this.statusFilter());
    }
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          this.getRoleLabel(p.role).toLowerCase().includes(term),
      );
    }
    this.filteredPersonnel.set(filtered);
  }

  private scopedPersonnel(): PersonnelCard[] {
    let scoped = this.personnel();
    if (this.departmentFilter() !== 'all') {
      scoped = scoped.filter((p) => p.department === this.departmentFilter());
    }
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase();
      scoped = scoped.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          this.getRoleLabel(p.role).toLowerCase().includes(term),
      );
    }
    return scoped;
  }

  getAvailableCount(): number {
    return this.scopedPersonnel().filter((p) => p.availability === 'available').length;
  }
  getBusyCount(): number {
    return this.scopedPersonnel().filter((p) => p.availability === 'busy').length;
  }
  getLeaveCount(): number {
    return this.scopedPersonnel().filter((p) => p.availability === 'on-leave').length;
  }
  getOverloadedCount(): number {
    return this.scopedPersonnel().filter((p) => p.availability === 'overloaded').length;
  }

  private emptyWizardData(): WizardData {
    return {
      name: '',
      employeeNo: '',
      email: '',
      phone: '',
      role: 'technician',
      department: 'mr',
      specialization: '',
      experienceYears: 0,
      offDays: [],
      maxWeeklyHours: 40,
      deviceSkills: [],
      nightShiftEligible: true,
      isActive: true,
      employmentStatus: 'active',
      startDate: '',
      notes: '',
    };
  }

  openWizard(person?: PersonnelCard): void {
    this.wizardStep.set(1);
    this.stepValid.set(false);

    if (person) {
      this.wizardEditId.set(person.id);
      this.wizardData = {
        name: person.name || '',
        employeeNo: person.employeeNo || '',
        email: person.email || '',
        phone: person.phone || '',
        role: person.role || 'technician',
        department: person.department || 'mr',
        specialization: person.specialization || '',
        experienceYears: person.experienceYears ?? 0,
        offDays: person.offDays || [],
        maxWeeklyHours: person.maxWeeklyHours || 40,
        deviceSkills: person.deviceSkills || [],
        nightShiftEligible: person.nightShiftEligible ?? true,
        isActive: person.isActive ?? true,
        employmentStatus: person.employmentStatus || 'active',
        startDate: person.startDate ? person.startDate.split('T')[0] : '',
        notes: person.notes || '',
      };
      this.validateStep(1);
    } else {
      this.wizardEditId.set('');
      this.wizardData = this.emptyWizardData();
    }

    this.wizardVisible.set(true);
  }

  closeWizard(): void {
    this.wizardVisible.set(false);
    this.wizardStep.set(1);
  }

  validateStep(step: number): void {
    if (step === 1) {
      this.stepValid.set(this.wizardData.name.trim().length > 0);
    } else if (step === 2) {
      this.stepValid.set(this.wizardData.role.trim().length > 0);
    } else if (step === 3) {
      this.stepValid.set(true);
    } else {
      this.stepValid.set(
        this.wizardData.name.trim().length > 0 &&
          this.wizardData.role.trim().length > 0 &&
          this.wizardData.department.trim().length > 0 &&
          this.wizardData.experienceYears >= 0 &&
          this.wizardData.employmentStatus.trim().length > 0,
      );
    }
  }

  nextStep(): void {
    if (this.wizardStep() < 4) {
      this.wizardStep.update((s) => s + 1);
      this.validateStep(this.wizardStep());
    }
  }

  prevStep(): void {
    if (this.wizardStep() > 1) {
      this.wizardStep.update((s) => s - 1);
      this.validateStep(this.wizardStep());
    }
  }

  toggleOffDay(day: number): void {
    const current = [...this.wizardData.offDays];
    const idx = current.indexOf(day);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(day);
    }
    this.wizardData.offDays = current.sort();
  }

  toggleSkill(skill: string): void {
    const current = [...this.wizardData.deviceSkills];
    const idx = current.indexOf(skill);
    if (idx >= 0) {
      current.splice(idx, 1);
    } else {
      current.push(skill);
    }
    this.wizardData.deviceSkills = current.sort();
  }

  saveWizard(): void {
    if (!this.wizardData.name) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Uyarı',
        detail: 'Ad soyad zorunludur',
      });
      return;
    }
    this.saving.set(true);

    const editId = this.wizardEditId();

    const baseData = {
      name: this.wizardData.name,
      role: this.wizardData.role,
      employeeNo: this.wizardData.employeeNo || undefined,
      email: this.wizardData.email || undefined,
      phone: this.wizardData.phone || undefined,
      specialization: this.wizardData.specialization || undefined,
      experienceYears: this.wizardData.experienceYears || 0,
      deviceSkills: this.wizardData.deviceSkills || [],
      nightShiftEligible: this.wizardData.nightShiftEligible ?? true,
      employmentStatus: this.wizardData.employmentStatus || 'active',
      startDate: this.wizardData.startDate || undefined,
      notes: this.wizardData.notes || undefined,
      offDays: this.wizardData.offDays || [],
      maxWeeklyHours: this.wizardData.maxWeeklyHours || 40,
      isActive: this.wizardData.employmentStatus !== 'inactive',
      unitId: this.wizardData.department,
    };

    const existingPerson = this.personnel().find((p) => p.id === editId);

    if (editId) {
      const employeeData = this.sanitizeUpdatePayload(baseData);

      this.employeeService
        .update(editId, employeeData)
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => this.saving.set(false)),
        )
        .subscribe({
          next: (updated) => {
            this.messageService.add({
              severity: 'success',
              summary: 'Başarılı',
              detail: 'Personel güncellendi',
            });
            if (updated) {
              const cards = this.personnel().map((p) =>
                p.id === editId ? this.toPersonnelCard(updated) : p,
              );
              this.personnel.set(cards);
              this.applyFilters();
            }
            this.closeWizard();
          },
          error: (err) => {
            this.messageService.add({
              severity: 'error',
              summary: 'Güncelleme Hatası',
              detail: err?.message || 'Personel güncellenemedi',
            });
          },
        });
    } else {
      this.employeeService
        .create(baseData)
        .pipe(
          takeUntil(this.destroy$),
          finalize(() => this.saving.set(false)),
        )
        .subscribe({
          next: (created) => {
            this.messageService.add({
              severity: 'success',
              summary: 'Başarılı',
              detail: 'Personel eklendi',
            });
            if (created) {
              this.personnel.update((list) => [...list, this.toPersonnelCard(created)]);
              this.applyFilters();
            }
            this.closeWizard();
          },
          error: (err) => {
            this.messageService.add({
              severity: 'error',
              summary: 'Kayıt Hatası',
              detail: err?.message || 'Personel eklenemedi',
            });
          },
        });
    }
  }

  private sanitizeUpdatePayload(data: Record<string, any>): Record<string, any> {
    const cleaned: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value === '' || value === null || value === undefined) continue;
      if (Array.isArray(value) && value.length === 0) continue;
      cleaned[key] = value;
    }
    return cleaned;
  }

  private toPersonnelCard(emp: Employee): PersonnelCard {
    return {
      ...emp,
      initials: this.getInitials(emp.name),
      stats: this.toStats(emp.stats),
      fatigueLevel: this.toFatigue(emp.stats),
      availability: this.toAvailability(emp.stats, emp.isActive, emp.employmentStatus),
      department: this.getDepartment(emp),
      deviceSkills: emp.deviceSkills || [],
    };
  }

  deletePerson(person: PersonnelCard): void {
    this.confirmationService.confirm({
      message: `${person.name} silmek istediğinize emin misiniz?`,
      header: 'Silme Onayı',
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.employeeService
          .delete(person.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.messageService.add({
                severity: 'success',
                summary: 'Başarılı',
                detail: 'Personel silindi',
              });
              this.personnel.update((list) => list.filter((p) => p.id !== person.id));
              this.applyFilters();
            },
          });
      },
    });
  }

  assignShift(person: PersonnelCard): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Vardiya Atama',
      detail: `${person.name} için vardiya atama ekranı açılıyor...`,
    });
  }

  viewDetails(person: PersonnelCard): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Personel Detay',
      detail: `${person.name} detayları gösteriliyor...`,
    });
  }

  requestLeave(person: PersonnelCard): void {
    this.messageService.add({
      severity: 'info',
      summary: 'İzin Tanımla',
      detail: `${person.name} için izin tanımlama ekranı açılıyor...`,
    });
  }

  requestChange(person: PersonnelCard): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Değişiklik Talebi',
      detail: `${person.name} için değişiklik talebi oluşturuluyor...`,
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
