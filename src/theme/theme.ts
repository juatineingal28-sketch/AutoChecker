/**
 * src/utils/theme.ts
 * Shared design tokens for AutoChecker.
 */

export const COLORS = {
  // Brand
  primary:        '#1D4ED8',   // blue-700 — header background
  primaryDark:    '#1E40AF',   // blue-800
  primaryLight:   '#3B82F6',   // blue-500

  // Semantic
  success:        '#22C55E',   // green-500
  successDark:    '#16A34A',   // green-600
  warning:        '#EAB308',   // yellow-500
  danger:         '#DC2626',   // red-600

  // Neutrals
  background:     '#F8FAFC',   // slate-50
  surface:        '#FFFFFF',
  border:         '#E2E8F0',   // slate-200
  borderDark:     '#CBD5E1',   // slate-300

  // Text
  text:           '#0F172A',   // slate-900
  textSecondary:  '#475569',   // slate-600
  textMuted:      '#94A3B8',   // slate-400
  textOnPrimary:  '#FFFFFF',

  // Camera / dark UI
  dark:           '#0D0D0D',
  dark2:          '#161616',
  dark3:          '#1E1E1E',
};

export const FONT_SIZES = {
  xs:   11,
  sm:   13,
  md:   14,
  base: 15,
  lg:   18,
  xl:   22,
  xxl:  28,
};

export const RADIUS = {
  sm:  6,
  md:  10,
  lg:  16,
  xl:  24,
  full: 9999,
};

export const SPACING = {
  xs:  4,
  sm:  8,
  md:  12,
  lg:  16,
  xl:  24,
  xxl: 32,
};