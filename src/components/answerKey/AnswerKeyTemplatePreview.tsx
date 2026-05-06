// src/components/answerKey/AnswerKeyTemplatePreview.tsx
// ─── Template Preview ─────────────────────────────────────────────────────────
// Shows the format rules, input hint, and a live example for the selected
// exam type. Fully driven by the AnswerKeyTemplate from exam.ts — no
// hardcoded descriptions.

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  ANSWER_KEY_TEMPLATES,
  AnswerInputMode,
  AnswerKeyTemplate,
  EXAM_TYPE_OPTIONS,
  ExamType,
} from '../../types/exam';

// ─── Theme ────────────────────────────────────────────────────────────────────

const T = {
  primary:      '#2563EB',
  primaryLight: '#EFF6FF',
  surface:      '#FFFFFF',
  border:       '#E2E8F0',
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
  teal:         '#0D9488',
  tealLight:    '#F0FDFA',
  code:         '#F8FAFC',
  codeBorder:   '#E2E8F0',
};

const TYPE_ACCENT: Record<ExamType, { tint: string; bg: string }> = {
  bubble_omr:      { tint: T.primary,  bg: T.primaryLight },
  multiple_choice: { tint: T.violet,   bg: T.violetLight  },
  identification:  { tint: T.success,  bg: T.successLight },
  enumeration:     { tint: T.amber,    bg: T.amberLight   },
  true_or_false:   { tint: T.teal,     bg: T.tealLight    },
};

/** Human-readable input mode label */
const INPUT_MODE_LABEL: Record<AnswerInputMode, string> = {
  bubble:     'Bubble chip selector (A/B/C/D)',
  letter:     'Single letter text field',
  short_text: 'Short text field',
  multi_text: 'Semicolon-separated list per item',
};

/** Icon name per input mode */
const INPUT_MODE_ICON: Record<AnswerInputMode, keyof typeof Ionicons.glyphMap> = {
  bubble:     'radio-button-on-outline',
  letter:     'text-outline',
  short_text: 'create-outline',
  multi_text: 'list-outline',
};

/** Example rendered answer strings per exam type */
const EXAMPLE_ANSWERS: Record<ExamType, string[]> = {
  bubble_omr:      ['A', 'B', 'C', 'D', 'A'],
  multiple_choice: ['A', 'C', 'B', 'D', 'B'],
  identification:  ['Charles Babbage', 'Mercury', 'Photosynthesis'],
  enumeration:     ['Red;Crimson', 'Blue;Indigo;Navy', 'Green'],
  true_or_false:   ['T', 'F', 'T', 'T', 'F'],
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function RuleRow({ icon, label, value, accent }: {
  icon:   keyof typeof Ionicons.glyphMap;
  label:  string;
  value:  string;
  accent: string;
}) {
  return (
    <View style={styles.ruleRow}>
      <View style={[styles.ruleIconWrap, { backgroundColor: accent + '20' }]}>
        <Ionicons name={icon} size={13} color={accent} />
      </View>
      <View style={styles.ruleTextGroup}>
        <Text style={styles.ruleLabel}>{label}</Text>
        <Text style={styles.ruleValue}>{value}</Text>
      </View>
    </View>
  );
}

function ExampleBubbles({ answers, accent }: { answers: string[]; accent: string }) {
  return (
    <View style={styles.exampleRow}>
      {answers.map((ans, i) => (
        <View key={i} style={styles.exampleItem}>
          <Text style={styles.exampleQNum}>{i + 1}</Text>
          <View style={[styles.exampleBubble, { borderColor: accent, backgroundColor: accent + '18' }]}>
            <Text style={[styles.exampleBubbleText, { color: accent }]}>{ans}</Text>
          </View>
        </View>
      ))}
      {answers.length > 0 && (
        <View style={styles.exampleItem}>
          <Text style={[styles.exampleEllipsis, { color: accent }]}>…</Text>
        </View>
      )}
    </View>
  );
}

function ExampleCode({ template, answers, accent }: {
  template: AnswerKeyTemplate;
  answers:  string[];
  accent:   string;
}) {
  const joined = answers.join(',') + ',…';
  return (
    <View style={[styles.codeBlock, { borderColor: accent + '40' }]}>
      <Text style={styles.codeLabel}>Example input:</Text>
      <Text style={[styles.codeText, { color: accent }]}>{joined}</Text>
      <Text style={styles.codeCaption}>{template.placeholder}</Text>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export interface AnswerKeyTemplatePreviewProps {
  examType: ExamType;
}

export default function AnswerKeyTemplatePreview({ examType }: AnswerKeyTemplatePreviewProps) {
  const template = ANSWER_KEY_TEMPLATES[examType];
  const meta     = EXAM_TYPE_OPTIONS.find(o => o.value === examType)!;
  const accent   = TYPE_ACCENT[examType];
  const examples = EXAMPLE_ANSWERS[examType];

  // Fade-in animation when exam type changes
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [examType]);

  return (
    <Animated.View style={[styles.root, { opacity: fade }]}>

      {/* Header */}
      <View style={[styles.header, { backgroundColor: accent.bg }]}>
        <View style={[styles.headerIcon, { backgroundColor: accent.tint }]}>
          <Ionicons
            name={meta.icon as keyof typeof Ionicons.glyphMap}
            size={18}
            color="#fff"
          />
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.headerTitle, { color: accent.tint }]}>{meta.label}</Text>
          <Text style={styles.headerSub}>{meta.description}</Text>
        </View>
      </View>

      {/* Rules */}
      <View style={styles.rules}>
        <RuleRow
          icon="pencil-outline"
          label="Answer format"
          value={template.answerFormat}
          accent={accent.tint}
        />
        <View style={styles.divider} />
        <RuleRow
          icon={INPUT_MODE_ICON[template.inputMode]}
          label="Input mode"
          value={INPUT_MODE_LABEL[template.inputMode]}
          accent={accent.tint}
        />
        {template.validAnswers && (
          <>
            <View style={styles.divider} />
            <RuleRow
              icon="shield-checkmark-outline"
              label="Valid answers"
              value={[...template.validAnswers].join('  ·  ')}
              accent={accent.tint}
            />
          </>
        )}
        <View style={styles.divider} />
        <RuleRow
          icon={template.allowMultiple ? 'copy-outline' : 'remove-circle-outline'}
          label="Multiple accepted answers"
          value={template.allowMultiple ? 'Yes — separate with semicolons ( ; )' : 'No — one answer per question'}
          accent={accent.tint}
        />
      </View>

      {/* Hint box */}
      <View style={[styles.hintBox, { borderLeftColor: accent.tint }]}>
        <Ionicons name="information-circle-outline" size={15} color={accent.tint} style={{ marginTop: 1 }} />
        <Text style={styles.hintText}>{template.inputHint}</Text>
      </View>

      {/* Example visualisation */}
      <View style={styles.exampleSection}>
        <Text style={styles.exampleTitle}>FORMAT PREVIEW</Text>
        <ExampleBubbles answers={examples} accent={accent.tint} />
        <ExampleCode template={template} answers={examples} accent={accent.tint} />
      </View>

    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    backgroundColor: T.surface,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: T.border,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1 },
  headerTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  headerSub: {
    fontSize: 11,
    color: T.textSecondary,
    lineHeight: 15,
  },

  // Rules
  rules: {
    padding: 14,
    paddingTop: 10,
    gap: 0,
  },
  ruleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
  },
  ruleIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  ruleTextGroup: { flex: 1 },
  ruleLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: T.textMuted,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 1,
  },
  ruleValue: {
    fontSize: 12,
    fontWeight: '600',
    color: T.textPrimary,
    lineHeight: 17,
  },
  divider: {
    height: 1,
    backgroundColor: T.border,
    marginLeft: 36,
  },

  // Hint
  hintBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 14,
    padding: 10,
    backgroundColor: T.code,
    borderRadius: 8,
    borderLeftWidth: 3,
  },
  hintText: {
    flex: 1,
    fontSize: 11.5,
    color: T.textSecondary,
    lineHeight: 17,
    fontWeight: '500',
  },

  // Example
  exampleSection: {
    borderTopWidth: 1,
    borderTopColor: T.border,
    padding: 14,
    gap: 10,
  },
  exampleTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: T.textMuted,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  exampleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'flex-end',
  },
  exampleItem: {
    alignItems: 'center',
    gap: 3,
  },
  exampleQNum: {
    fontSize: 9,
    fontWeight: '600',
    color: T.textMuted,
  },
  exampleBubble: {
    minWidth: 32,
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exampleBubbleText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  exampleEllipsis: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  codeBlock: {
    backgroundColor: T.code,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    gap: 2,
  },
  codeLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: T.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  codeText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'monospace' as any,
    letterSpacing: 0.3,
  },
  codeCaption: {
    fontSize: 10,
    color: T.textMuted,
    marginTop: 3,
    fontStyle: 'italic',
  },
});