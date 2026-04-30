/**
 * src/components/StatusBadge.js
 *
 * Color-coded badge for score remarks / difficulty levels.
 *
 * Usage:
 *   <StatusBadge label="Outstanding" />
 *   <StatusBadge label="Hard" />
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, FONTS, RADIUS } from '../utils/theme';

const BADGE_COLORS = {
  'Outstanding':         { bg: '#D1FAE5', text: '#065F46' },
  'Very Satisfactory':  { bg: '#DBEAFE', text: '#1E40AF' },
  'Satisfactory':       { bg: '#EDE9FE', text: '#5B21B6' },
  'Developing':         { bg: '#FEF3C7', text: '#92400E' },
  'Needs Improvement':  { bg: '#FEE2E2', text: '#991B1B' },
  'Failed':             { bg: '#FCA5A5', text: '#7F1D1D' },
  'Hard':               { bg: '#FEE2E2', text: '#991B1B' },
  'Medium':             { bg: '#FEF3C7', text: '#92400E' },
  'Easy':               { bg: '#D1FAE5', text: '#065F46' },
  'Correct':            { bg: '#D1FAE5', text: '#065F46' },
  'Wrong':              { bg: '#FEE2E2', text: '#991B1B' },
};

export default function StatusBadge({ label }) {
  const colors = BADGE_COLORS[label] || { bg: COLORS.inputBg, text: COLORS.textSecondary };

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }]}>
      <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical:    4,
    borderRadius:       RADIUS.full,
    alignSelf:          'flex-start',
  },
  text: {
    fontSize:   FONTS.xs,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});