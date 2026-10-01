export interface KpiCardData {
  id: string;
  icon: string;
  label: string;
  value: number | string;
  unit?: string;
  color: string;
  trend?: number;
  trendLabel?: string;
  comparison?: string;
  status?: 'healthy' | 'warning' | 'critical';
}

export interface KpiGridConfig {
  kpis: KpiCardData[];
  loading: boolean;
  error?: string | null;
  emptyMessage?: string;
}

export type KpiSize = 'sm' | 'md' | 'lg';
