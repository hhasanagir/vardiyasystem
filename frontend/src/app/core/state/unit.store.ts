import { Injectable, signal, computed } from '@angular/core';
import { UnitType, UNIT_CONFIG } from './state.models';

export interface NavItem {
  path: string;
  label: string;
  unit: UnitType;
  icon: string;
  color: string;
}

@Injectable({
  providedIn: 'root',
})
export class UnitStore {
  private readonly _activeUnit = signal<UnitType>('mr');
  private readonly _sidebarExpanded = signal<boolean>(true);
  private readonly _heatmapView = signal<UnitType>('mr');

  readonly activeUnit = computed(() => this._activeUnit());
  readonly sidebarExpanded = computed(() => this._sidebarExpanded());
  readonly heatmapView = computed(() => this._heatmapView());

  readonly activeUnitConfig = computed(() => UNIT_CONFIG[this._activeUnit()]);
  readonly heatmapUnitConfig = computed(() => UNIT_CONFIG[this._heatmapView()]);

  readonly navItems: NavItem[] = [
    {
      path: '/app/mr-plan',
      label: 'MR Plan',
      unit: 'mr',
      icon: UNIT_CONFIG.mr.icon,
      color: UNIT_CONFIG.mr.color,
    },
    {
      path: '/app/bt-plan',
      label: 'BT Plan',
      unit: 'bt',
      icon: UNIT_CONFIG.bt.icon,
      color: UNIT_CONFIG.bt.color,
    },
    {
      path: '/app/rontgen-plan',
      label: 'Röntgen Plan',
      unit: 'rontgen',
      icon: UNIT_CONFIG.rontgen.icon,
      color: UNIT_CONFIG.rontgen.color,
    },
    {
      path: '/app/nukleer-tip-plan',
      label: 'Nükleer Tıp',
      unit: 'nukleer',
      icon: UNIT_CONFIG.nukleer.icon,
      color: UNIT_CONFIG.nukleer.color,
    },
    {
      path: '/app/onkoloji-plan',
      label: 'Radyasyon Onkolojisi',
      unit: 'onkoloji',
      icon: UNIT_CONFIG.onkoloji.icon,
      color: UNIT_CONFIG.onkoloji.color,
    },
    {
      path: '/app/supervizor-plan',
      label: 'Süpervizör',
      unit: 'supervizor',
      icon: UNIT_CONFIG.supervizor.icon,
      color: UNIT_CONFIG.supervizor.color,
    },
  ];

  readonly unitColors: Record<UnitType, string> = {
    mr: UNIT_CONFIG.mr.color,
    bt: UNIT_CONFIG.bt.color,
    rontgen: UNIT_CONFIG.rontgen.color,
    nukleer: UNIT_CONFIG.nukleer.color,
    onkoloji: UNIT_CONFIG.onkoloji.color,
    supervizor: UNIT_CONFIG.supervizor.color,
  };

  readonly unitLabels: Record<UnitType, string> = {
    mr: 'MR',
    bt: 'BT',
    rontgen: 'RÖ',
    nukleer: 'NT',
    onkoloji: 'RONK',
    supervizor: 'SV',
  };

  setActiveUnit(unit: UnitType): void {
    this._activeUnit.set(unit);
  }

  toggleSidebar(): void {
    this._sidebarExpanded.update((v) => !v);
  }

  setSidebarExpanded(expanded: boolean): void {
    this._sidebarExpanded.set(expanded);
  }

  setHeatmapView(unit: UnitType): void {
    this._heatmapView.set(unit);
  }

  getUnitRoute(unit: UnitType): string {
    const routes: Record<UnitType, string> = {
      mr: '/app/mr-plan',
      bt: '/app/bt-plan',
      rontgen: '/app/rontgen-plan',
      nukleer: '/app/nukleer-tip-plan',
      onkoloji: '/app/onkoloji-plan',
      supervizor: '/app/supervizor-plan',
    };
    return routes[unit];
  }

  getUnitFromRoute(path: string): UnitType {
    if (path.includes('mr-plan')) return 'mr';
    if (path.includes('bt-plan')) return 'bt';
    if (path.includes('rontgen')) return 'rontgen';
    if (path.includes('nukleer')) return 'nukleer';
    if (path.includes('supervizor-plan')) return 'supervizor';
    if (path.includes('onkoloji-plan')) return 'onkoloji';
    return 'mr';
  }

  isActiveRoute(path: string): boolean {
    return path === this.getUnitRoute(this._activeUnit());
  }
}
