/**
 * src/components/Card.js
 *
 * Generic card container with optional title and subtitle.
 *
 * Usage:
 *   <Card title="Class Average" subtitle="April 2024">
 *     <Text>79%</Text>
 *   </Card>
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONTS, RADIUS, SHADOW } from '../utils/theme';

export default function Card({ title, subtitle, children, style, contentStyle }) {
  return (
    <View style={[styles.card, style]}>
      {(title || subtitle) && (
        <View style={styles.header}>
          {title    && <Text style={styles.title}>{title}</Text>}
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
      )}
      <View style={contentStyle}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius:    RADIUS.lg,
    padding:         16,
    marginBottom:    16,
    ...SHADOW.soft,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize:   FONTS.md,
    fontWeight: '700',
    color:      COLORS.textPrimary,
  },
  subtitle: {
    fontSize:   FONTS.sm,
    color:      COLORS.textMuted,
    marginTop:  2,
  },
});