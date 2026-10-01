export interface Breadcrumb {
  label: string;
  path?: string;
}

export interface ContextAction {
  id: string;
  label: string;
  icon: string;
  severity?: 'primary' | 'success' | 'danger' | 'ghost';
  visible?: boolean;
}

export interface PageStatus {
  label: string;
  color: 'success' | 'warning' | 'error' | 'info';
  pulse?: boolean;
}

export interface PageContext {
  title: string;
  subtitle?: string;
  breadcrumbs: Breadcrumb[];
  actions?: ContextAction[];
  status?: PageStatus;
  lastUpdated?: Date;
}
