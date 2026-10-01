import { colors } from './colors';
import { spacing, radius, shadows } from './spacing';
import { typography } from './typography';

export const designTokens = {
  colors,
  spacing,
  radius,
  shadows,
  typography,
} as const;

export type DesignTokens = typeof designTokens;
