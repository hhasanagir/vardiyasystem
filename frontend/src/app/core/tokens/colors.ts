export const colors = {
  primary: {
    50: '#eff6ff',
    100: '#dbeafe',
    200: '#bfdbfe',
    300: '#93c5fd',
    400: '#60a5fa',
    500: '#3b82f6',
    600: '#2563eb',
    700: '#1d4ed8',
    800: '#1e40af',
    900: '#1e3a8a',
    950: '#172554',
  },
  surface: {
    0: '#ffffff',
    50: '#f8fafc',
    100: '#f1f5f9',
    200: '#e2e8f0',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    800: '#1e293b',
    900: '#0f172a',
    950: '#020617',
  },
  accent: {
    mr: '#3b82f6',
    bt: '#14b8a6',
    rontgen: '#f97316',
    nukleer: '#22c55e',
    onkoloji: '#ec4899',
  },
  status: {
    success: '#22c55e',
    warning: '#f59e0b',
    danger: '#ef4444',
    info: '#3b82f6',
  },
  shift: {
    day: '#3b82f6',
    evening: '#8b5cf6',
    night: '#1e293b',
    mixed: '#06b6d4',
  },
} as const;

export type ColorKey = keyof typeof colors.primary;
export type UnitAccent = keyof typeof colors.accent;
export type StatusColor = keyof typeof colors.status;
export type ShiftColor = keyof typeof colors.shift;
