/**
 * src/components/InputField.js
 *
 * Reusable text input with label, error display, and password toggle.
 *
 * Usage:
 *   <InputField
 *     label="Email"
 *     value={email}
 *     onChangeText={setEmail}
 *     placeholder="you@school.edu"
 *     error={errors.email}
 *   />
 */

import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS, RADIUS } from '../utils/theme';

export default function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  secureTextEntry = false,
  keyboardType    = 'default',
  autoCapitalize  = 'none',
  style,
  ...rest
}) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = secureTextEntry;

  return (
    <View style={[styles.wrapper, style]}>
      {/* Label */}
      {label && <Text style={styles.label}>{label}</Text>}

      {/* Input row */}
      <View style={[styles.inputWrap, error && styles.inputError]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={COLORS.textMuted}
          secureTextEntry={isPassword && !showPassword}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          style={styles.input}
          {...rest}
        />
        {/* Password show/hide toggle */}
        {isPassword && (
          <TouchableOpacity
            onPress={() => setShowPassword(v => !v)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={showPassword ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={COLORS.textMuted}
            />
          </TouchableOpacity>
        )}
      </View>

      {/* Error message */}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  label: {
    fontSize:     FONTS.sm,
    fontWeight:   '600',
    color:        COLORS.textSecondary,
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  inputWrap: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: COLORS.inputBg,
    borderRadius:    RADIUS.md,
    borderWidth:     1.5,
    borderColor:     COLORS.border,
    paddingHorizontal: 14,
    paddingVertical:   2,
  },
  inputError: {
    borderColor: COLORS.error,
  },
  input: {
    flex:      1,
    fontSize:  FONTS.base,
    color:     COLORS.textPrimary,
    paddingVertical: 12,
  },
  error: {
    fontSize:  FONTS.xs,
    color:     COLORS.error,
    marginTop: 4,
  },
});