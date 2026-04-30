// theme/index.ts — FIXED (NO CIRCULAR DEPENDENCY)

export const Colors = {
  primary:      '#2563EB',
  primaryMid:   '#3B82F6',
  primaryLight: '#EFF6FF',
  primaryDark:  '#1D4ED8',

  success:      '#059669',
  successLight: '#ECFDF5',
  amber:        '#D97706',
  amberLight:   '#FFFBEB',
  danger:       '#DC2626',
  dangerLight:  '#FEF2F2',
  purple:       '#4F46E5',
  purpleLight:  '#EEF2FF',

  n50:  '#F8FAFC',
  n100: '#F1F5F9',
  n200: '#E2E8F0',
  n300: '#CBD5E1',
  n400: '#94A3B8',
  n500: '#64748B',
  n600: '#475569',
  n700: '#334155',
  n800: '#1E293B',
  n900: '#0F172A',

  white: '#FFFFFF',

  background:   '#F8FAFC',
  card:         '#FFFFFF',
  border:       '#E2E8F0',
  divider:      '#F1F5F9',
  textPrimary:  '#0F172A',
  textSecondary:'#475569',
  textMuted:    '#94A3B8',
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 999,
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const Shadow = {
  card: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  fab: {
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  modal: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 16,
  },
};