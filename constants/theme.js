/**
 * src/utils/theme.js
 *
 * Centralized design tokens.
 * Import this everywhere — never hardcode colors or font sizes.
 */

export const COLORS = {
  // Primary brand
  primary:       '#2563EB',  // Blue
  primaryLight:  '#DBEAFE',
  primaryDark:   '#1D4ED8',

  // Accent
  accent:        '#10B981',  // Green
  accentLight:   '#D1FAE5',

  // Semantic
  error:         '#EF4444',
  warning:       '#F59E0B',
  success:       '#10B981',

  // Neutrals
  white:         '#FFFFFF',
  background:    '#F8FAFC',
  surface:       '#FFFFFF',
  border:        '#E2E8F0',
  inputBg:       '#F1F5F9',

  // Text
  textPrimary:   '#0F172A',
  textSecondary: '#64748B',
  textMuted:     '#94A3B8',
  textOnPrimary: '#FFFFFF',
};

export const FONTS = {
  xs:    11,
  sm:    13,
  base:  15,
  md:    17,
  lg:    20,
  xl:    24,
  xxl:   30,
  xxxl:  36,
};

export const RADIUS = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  full: 999,
};

export const SHADOW = {
  soft: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius:  8,
    elevation:     3,
  },
  medium: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius:  12,
    elevation:     5,
  },
};