/**
 * src/components/AppButton.js
 *
 * Reusable button with variants: primary, secondary, outline, danger.
 * Supports loading spinner and disabled state.
 *
 * Usage:
 *   <AppButton label="Login" onPress={handleLogin} loading={isLoading} />
 *   <AppButton label="Cancel" variant="outline" onPress={goBack} />
 */

import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
} from 'react-native';
import { COLORS, FONTS, RADIUS, SHADOW } from '../utils/theme';

export default function AppButton({
  label,
  onPress,
  variant  = 'primary',  // 'primary' | 'secondary' | 'outline' | 'danger'
  size     = 'md',        // 'sm' | 'md' | 'lg'
  loading  = false,
  disabled = false,
  fullWidth = true,
  icon,                   // Optional left icon element
  style,
}) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.8}
      style={[
        styles.base,
        styles[variant],
        styles[`size_${size}`],
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'outline' ? COLORS.primary : COLORS.textOnPrimary}
        />
      ) : (
        <View style={styles.content}>
          {icon && <View style={styles.iconWrap}>{icon}</View>}
          <Text style={[styles.label, styles[`label_${variant}`], styles[`labelSize_${size}`]]}>
            {label}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius:    RADIUS.md,
    alignItems:      'center',
    justifyContent:  'center',
    ...SHADOW.soft,
  },
  content: {
    flexDirection:  'row',
    alignItems:     'center',
  },
  iconWrap: {
    marginRight: 8,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },

  // ── Variants ────────────────────────────────
  primary: {
    backgroundColor: COLORS.primary,
  },
  secondary: {
    backgroundColor: COLORS.accent,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth:     1.5,
    borderColor:     COLORS.primary,
    shadowOpacity:   0,
    elevation:       0,
  },
  danger: {
    backgroundColor: COLORS.error,
  },

  // ── Sizes ───────────────────────────────────
  size_sm: { paddingVertical: 10, paddingHorizontal: 16 },
  size_md: { paddingVertical: 14, paddingHorizontal: 24 },
  size_lg: { paddingVertical: 18, paddingHorizontal: 32 },

  // ── Disabled ────────────────────────────────
  disabled: {
    opacity: 0.5,
  },

  // ── Label styles ────────────────────────────
  label: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  label_primary:   { color: COLORS.textOnPrimary },
  label_secondary: { color: COLORS.textOnPrimary },
  label_outline:   { color: COLORS.primary       },
  label_danger:    { color: COLORS.textOnPrimary },

  labelSize_sm: { fontSize: FONTS.sm   },
  labelSize_md: { fontSize: FONTS.base },
  labelSize_lg: { fontSize: FONTS.md   },
});