// src/components/answerKey/AnswerKeyTemplateSelector.tsx
// ─── Template Selector ────────────────────────────────────────────────────────
// Renders a scrollable grid of exam type cards. Selecting one emits the
// corresponding ExamType via onSelect. The active card shows a filled style.
// Zero hardcoded exam logic — everything comes from EXAM_TYPE_OPTIONS.

import { Ionicons } from '@expo/vector-icons';
import React, { useRef } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  EXAM_TYPE_OPTIONS,
  ExamType,
  ExamTypeMeta,
} from '../../types/exam';

// ─── Theme tokens (mirrors app theme) ────────────────────────────────────────

const T = {
  primary:      '#2563EB',
  primaryLight: '#EFF6FF',
  surface:      '#FFFFFF',
  border:       '#E2E8F0',
  borderActive: '#2563EB',
  textPrimary:  '#0F172A',
  textSecondary:'#475569',
  textMuted:    '#94A3B8',
  success:      '#10B981',
  successLight: '#ECFDF5',
  amber:        '#F59E0B',
  amberLight:   '#FFFBEB',
  violet:       '#7C3AED',
  violetLight:  '#F5F3FF',
  rose:         '#E11D48',
  roseLight:    '#FFF1F2',
  teal:         '#0D9488',
  tealLight:    '#F0FDFA',
};

/** Per-exam-type accent colours so each card feels distinct */
const TYPE_ACCENT: Record<ExamType, { bg: string; tint: string; badge: string }> = {
  bubble_omr:      { bg: T.primaryLight, tint: T.primary,  badge: 'MC' },
  multiple_choice: { bg: T.violetLight,  tint: T.violet,   badge: 'MC' },
  identification:  { bg: T.successLight, tint: T.success,  badge: 'ID' },
  enumeration:     { bg: T.amberLight,   tint: T.amber,    badge: 'EN' },
  true_or_false:   { bg: T.tealLight,    tint: T.teal,     badge: 'TF' },
};

// ─── Single Card ──────────────────────────────────────────────────────────────

interface CardProps {
  meta:     ExamTypeMeta;
  selected: boolean;
  onPress:  () => void;
}

function ExamTypeCard({ meta, selected, onPress }: CardProps) {
  const scale = useRef(new Animated.Value(1)).current;
  const accent = TYPE_ACCENT[meta.value];

  const handleIn  = () => Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 30 }).start();
  const handleOut = () => Animated.spring(scale, { toValue: 1,    useNativeDriver: true, speed: 20 }).start();

  return (
    <Animated.View style={{ transform: [{ scale }], flex: 1 }}>
      <TouchableOpacity
        activeOpacity={1}
        onPressIn={handleIn}
        onPressOut={handleOut}
        onPress={onPress}
        style={[
          styles.card,
          selected && { borderColor: accent.tint, borderWidth: 2, backgroundColor: accent.bg },
        ]}
      >
        {/* Selection checkmark */}
        {selected && (
          <View style={[styles.checkBadge, { backgroundColor: accent.tint }]}>
            <Ionicons name="checkmark" size={10} color="#fff" />
          </View>
        )}

        {/* Icon */}
        <View style={[styles.iconWrap, { backgroundColor: selected ? accent.tint : accent.bg }]}>
          <Ionicons
            name={meta.icon as keyof typeof Ionicons.glyphMap}
            size={22}
            color={selected ? '#fff' : accent.tint}
          />
        </View>

        {/* Text */}
        <Text style={[styles.cardLabel, selected && { color: accent.tint }]} numberOfLines={2}>
          {meta.label}
        </Text>

        {/* Badge */}
        <View style={[styles.badge, { backgroundColor: selected ? accent.tint : accent.bg }]}>
          <Text style={[styles.badgeText, { color: selected ? '#fff' : accent.tint }]}>
            {accent.badge}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Selector ─────────────────────────────────────────────────────────────────

export interface AnswerKeyTemplateSelectorProps {
  selected:  ExamType | null;
  onSelect:  (type: ExamType) => void;
  disabled?: boolean;
}

export default function AnswerKeyTemplateSelector({
  selected,
  onSelect,
  disabled = false,
}: AnswerKeyTemplateSelectorProps) {
  return (
    <View style={styles.root}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionLabel}>EXAM TYPE</Text>
        {selected && (
          <View style={styles.selectedPill}>
            <Ionicons
              name={EXAM_TYPE_OPTIONS.find(o => o.value === selected)?.icon as keyof typeof Ionicons.glyphMap ?? 'help-outline'}
              size={11}
              color={TYPE_ACCENT[selected].tint}
            />
            <Text style={[styles.selectedPillText, { color: TYPE_ACCENT[selected].tint }]}>
              {EXAM_TYPE_OPTIONS.find(o => o.value === selected)?.label}
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        pointerEvents={disabled ? 'none' : 'auto'}
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        {EXAM_TYPE_OPTIONS.map((meta) => (
          <View key={meta.value} style={styles.cardWrapper}>
            <ExamTypeCard
              meta={meta}
              selected={selected === meta.value}
              onPress={() => !disabled && onSelect(meta.value)}
            />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CARD_W = 96;

const styles = StyleSheet.create({
  root: {
    marginBottom: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: T.textMuted,
    letterSpacing: 0.8,
  },
  selectedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    backgroundColor: T.primaryLight,
  },
  selectedPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  scroll: {
    paddingVertical: 2,
    gap: 8,
  },
  cardWrapper: {
    width: CARD_W,
  },
  card: {
    width: CARD_W,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 8,
    backgroundColor: T.surface,
    borderWidth: 1.5,
    borderColor: T.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: T.textPrimary,
    textAlign: 'center',
    lineHeight: 14,
  },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  checkBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});