// src/components/answerKey/DynamicAnswerInput.tsx
// ─── Dynamic Answer Input Renderer ───────────────────────────────────────────
// Reads inputMode from the AnswerKeyTemplate and renders the appropriate UI.
//
//   bubble     → A/B/C/D chip tap grid (bubble_omr)
//   letter     → Single-letter or T/F chip tap grid (multiple_choice / true_or_false)
//   short_text → Comma-separated text input (identification)
//   multi_text → Per-question semicolon-aware text input (enumeration)
//
// All validation is delegated to template.validateAnswer — no inline logic.

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

import {
    ANSWER_KEY_TEMPLATES,
    AnswerKey,
    ExamType
} from '../types/exam';
// ─── Theme ────────────────────────────────────────────────────────────────────

const T = {
  primary:      '#2563EB',
  primaryLight: '#EFF6FF',
  surface:      '#FFFFFF',
  border:       '#E2E8F0',
  borderFocus:  '#2563EB',
  textPrimary:  '#0F172A',
  textSecondary:'#475569',
  textMuted:    '#94A3B8',
  danger:       '#E11D48',
  dangerLight:  '#FFF1F2',
  success:      '#10B981',
  successLight: '#ECFDF5',
  amber:        '#F59E0B',
  amberLight:   '#FFFBEB',
  violet:       '#7C3AED',
  violetLight:  '#F5F3FF',
  teal:         '#0D9488',
  tealLight:    '#F0FDFA',
  code:         '#F8FAFC',
};

const TYPE_ACCENT: Record<ExamType, string> = {
  bubble_omr:      T.primary,
  multiple_choice: T.violet,
  identification:  T.success,
  enumeration:     T.amber,
  true_or_false:   T.teal,
};

// ─── Validation helpers ───────────────────────────────────────────────────────

interface ValidationResult {
  errors: string[];
  valid:  boolean;
}

function validateAnswers(
  rawInput: string,
  examType: ExamType,
): ValidationResult {
  const template = ANSWER_KEY_TEMPLATES[examType];
  // Split on commas, preserve semicolons within each item
  const parts    = rawInput.split(',').map(s => s.trim()).filter(Boolean);
  const errors: string[] = [];

  parts.forEach((part, idx) => {
    const err = template.validateAnswer(part, idx + 1);
    if (err) errors.push(err);
  });

  return { errors, valid: errors.length === 0 && parts.length > 0 };
}

// ─── Bubble / Letter Chip Grid ────────────────────────────────────────────────
// Used by bubble_omr, multiple_choice, true_or_false.
// The user taps chips per-question; the raw string is built programmatically.

const CHOICE_OPTIONS: Record<ExamType, string[]> = {
  bubble_omr:      ['A', 'B', 'C', 'D'],
  multiple_choice: ['A', 'B', 'C', 'D'],
  identification:  [],
  enumeration:     [],
  true_or_false:   ['T', 'F'],
};

interface ChipGridProps {
  examType:       ExamType;
  questionCount:  number;
  answers:        string[];   // answers[i] = answer for question i+1
  onChangeAnswer: (questionIndex: number, value: string) => void;
  accent:         string;
}

function ChipGrid({ examType, questionCount, answers, onChangeAnswer, accent }: ChipGridProps) {
  const choices = CHOICE_OPTIONS[examType];

  return (
    <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
      {Array.from({ length: questionCount }, (_, qi) => (
        <View key={qi} style={styles.chipRow}>
          <View style={styles.qNumWrap}>
            <Text style={styles.qNum}>{qi + 1}</Text>
          </View>
          <View style={styles.chipGroup}>
            {choices.map(ch => {
              const active = answers[qi] === ch;
              return (
                <TouchableOpacity
                  key={ch}
                  activeOpacity={0.75}
                  onPress={() => onChangeAnswer(qi, active ? '' : ch)}
                  style={[
                    styles.chip,
                    active && { backgroundColor: accent, borderColor: accent },
                  ]}
                >
                  <Text style={[styles.chipText, active && { color: '#fff' }]}>{ch}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {answers[qi] ? (
            <Ionicons name="checkmark-circle" size={16} color={accent} />
          ) : (
            <Ionicons name="ellipse-outline" size={16} color={T.textMuted} />
          )}
        </View>
      ))}
    </ScrollView>
  );
}

// ─── Question Counter ─────────────────────────────────────────────────────────

interface CounterProps {
  value:    number;
  onChange: (v: number) => void;
  accent:   string;
  min?:     number;
  max?:     number;
}

function QuestionCounter({ value, onChange, accent, min = 1, max = 100 }: CounterProps) {
  return (
    <View style={styles.counterWrap}>
      <Text style={styles.counterLabel}>Number of questions</Text>
      <View style={styles.counterRow}>
        <TouchableOpacity
          style={[styles.counterBtn, { borderColor: accent }]}
          onPress={() => onChange(Math.max(min, value - 1))}
          activeOpacity={0.75}
        >
          <Ionicons name="remove" size={16} color={accent} />
        </TouchableOpacity>
        <Text style={[styles.counterValue, { color: accent }]}>{value}</Text>
        <TouchableOpacity
          style={[styles.counterBtn, { borderColor: accent }]}
          onPress={() => onChange(Math.min(max, value + 1))}
          activeOpacity={0.75}
        >
          <Ionicons name="add" size={16} color={accent} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Text-based input (identification / enumeration) ─────────────────────────

interface FreeTextInputProps {
  examType:     ExamType;
  value:        string;
  onChangeText: (v: string) => void;
  errors:       string[];
  accent:       string;
  isFocused:    boolean;
  onFocus:      () => void;
  onBlur:       () => void;
}

function FreeTextInput({
  examType, value, onChangeText, errors, accent, isFocused, onFocus, onBlur,
}: FreeTextInputProps) {
  const template = ANSWER_KEY_TEMPLATES[examType];
  const hasError = errors.length > 0 && value.trim().length > 0;

  return (
    <View>
      <View
        style={[
          styles.textInputWrap,
          isFocused && { borderColor: accent },
          hasError  && { borderColor: T.danger },
        ]}
      >
        <TextInput
          style={styles.textInput}
          value={value}
          onChangeText={onChangeText}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder={template.placeholder}
          placeholderTextColor={T.textMuted}
          multiline
          autoCorrect={false}
          autoCapitalize={examType === 'identification' || examType === 'enumeration' ? 'words' : 'characters'}
        />
      </View>

      {/* Live character count */}
      <View style={styles.inputMeta}>
        <Text style={styles.inputMetaText}>
          {value.split(',').filter(s => s.trim().length > 0).length} item(s) entered
        </Text>
        {hasError ? (
          <Ionicons name="alert-circle-outline" size={14} color={T.danger} />
        ) : value.trim().length > 0 ? (
          <Ionicons name="checkmark-circle-outline" size={14} color={T.success} />
        ) : null}
      </View>
    </View>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export interface DynamicAnswerInputProps {
  examType:          ExamType;
  /** Controlled raw string value (comma-separated) */
  value:             string;
  onChangeText:      (raw: string) => void;
  /** Called with structured AnswerKey whenever valid */
  onValidChange?:    (key: AnswerKey, isValid: boolean) => void;
  disabled?:         boolean;
}

export default function DynamicAnswerInput({
  examType,
  value,
  onChangeText,
  onValidChange,
  disabled = false,
}: DynamicAnswerInputProps) {
  const template = ANSWER_KEY_TEMPLATES[examType];
  const accent   = TYPE_ACCENT[examType];

  // For chip modes — track question count separately
  const [questionCount, setQuestionCount] = useState(5);
  const [isFocused,     setIsFocused]     = useState(false);

  // Validation
  const validation = validateAnswers(value, examType);

  // Notify parent of valid structured key
  React.useEffect(() => {
    if (!onValidChange) return;
    const parts = value.split(',').map(s => s.trim()).filter(Boolean);
    const key: AnswerKey = {};
    parts.forEach((p, i) => {
      key[String(i + 1)] = template.allowMultiple
        ? p.split(';').map(s => s.trim()).filter(Boolean)
        : p;
    });
    onValidChange(key, validation.valid);
  }, [value, examType]);

  // For chip-mode: rebuild the comma string when a chip is toggled
  const handleChipChange = useCallback((qi: number, val: string) => {
    const parts = Array.from({ length: questionCount }, (_, i) => {
      const existing = value.split(',').map(s => s.trim());
      return i === qi ? val : (existing[i] ?? '');
    });
    onChangeText(parts.join(','));
  }, [value, questionCount, onChangeText]);

  const chipAnswers = React.useMemo(() => {
    const parts = value.split(',').map(s => s.trim());
    return Array.from({ length: questionCount }, (_, i) => parts[i] ?? '');
  }, [value, questionCount]);

  const usesChips = template.inputMode === 'bubble' || (
    template.inputMode === 'letter' && CHOICE_OPTIONS[examType].length > 0
  );

  const answeredCount = usesChips
    ? chipAnswers.filter(a => a.length > 0).length
    : value.split(',').filter(s => s.trim().length > 0).length;

  const totalExpected = usesChips ? questionCount : answeredCount;

  return (
    <View style={[styles.root, disabled && { opacity: 0.5 }]} pointerEvents={disabled ? 'none' : 'auto'}>

      {/* ── Progress bar ──────────────────────────────────────────────── */}
      <View style={styles.progressRow}>
        <Text style={styles.progressLabel}>
          {answeredCount} / {totalExpected} answered
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width: totalExpected > 0
                  ? `${Math.min(100, (answeredCount / totalExpected) * 100)}%` as any
                  : '0%',
                backgroundColor: answeredCount === totalExpected && totalExpected > 0
                  ? T.success
                  : accent,
              },
            ]}
          />
        </View>
      </View>

      {/* ── Chip-mode inputs ──────────────────────────────────────────── */}
      {usesChips && (
        <>
          <QuestionCounter
            value={questionCount}
            onChange={count => {
              setQuestionCount(count);
              // Trim answers if count shrinks
              const parts = value.split(',').map(s => s.trim()).slice(0, count);
              onChangeText(parts.join(','));
            }}
            accent={accent}
          />
          <View style={styles.chipGridWrap}>
            <ChipGrid
              examType={examType}
              questionCount={questionCount}
              answers={chipAnswers}
              onChangeAnswer={handleChipChange}
              accent={accent}
            />
          </View>
        </>
      )}

      {/* ── Free-text inputs ──────────────────────────────────────────── */}
      {!usesChips && (
        <FreeTextInput
          examType={examType}
          value={value}
          onChangeText={onChangeText}
          errors={validation.errors}
          accent={accent}
          isFocused={isFocused}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        />
      )}

      {/* ── Validation errors ─────────────────────────────────────────── */}
      {validation.errors.length > 0 && value.trim().length > 0 && (
        <View style={styles.errorList}>
          {validation.errors.slice(0, 3).map((err, i) => (
            <View key={i} style={styles.errorRow}>
              <Ionicons name="alert-circle-outline" size={13} color={T.danger} />
              <Text style={styles.errorText}>{err}</Text>
            </View>
          ))}
          {validation.errors.length > 3 && (
            <Text style={styles.errorMore}>+{validation.errors.length - 3} more issues</Text>
          )}
        </View>
      )}

      {/* ── Success state ─────────────────────────────────────────────── */}
      {validation.valid && (
        <View style={styles.successRow}>
          <Ionicons name="checkmark-circle" size={14} color={T.success} />
          <Text style={styles.successText}>All {answeredCount} answers are valid</Text>
        </View>
      )}

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    gap: 12,
  },

  // Progress
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  progressLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: T.textMuted,
    minWidth: 90,
  },
  progressTrack: {
    flex: 1,
    height: 5,
    backgroundColor: T.border,
    borderRadius: 99,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 99,
  },

  // Counter
  counterWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: T.code,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: T.border,
  },
  counterLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: T.textSecondary,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  counterBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.surface,
  },
  counterValue: {
    fontSize: 16,
    fontWeight: '800',
    minWidth: 24,
    textAlign: 'center',
  },

  // Chip grid
  chipGridWrap: {
    backgroundColor: T.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    padding: 4,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: T.border + '80',
  },
  qNumWrap: {
    width: 22,
    alignItems: 'flex-end',
  },
  qNum: {
    fontSize: 11,
    fontWeight: '700',
    color: T.textMuted,
  },
  chipGroup: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    width: 38,
    height: 34,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: T.border,
    backgroundColor: T.code,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '700',
    color: T.textSecondary,
  },

  // Free text
  textInputWrap: {
    borderWidth: 1.5,
    borderColor: T.border,
    borderRadius: 12,
    backgroundColor: T.surface,
    minHeight: 100,
    padding: 12,
  },
  textInput: {
    fontSize: 14,
    color: T.textPrimary,
    lineHeight: 22,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  inputMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  inputMetaText: {
    fontSize: 11,
    color: T.textMuted,
    fontWeight: '500',
  },

  // Errors
  errorList: {
    backgroundColor: T.dangerLight,
    borderRadius: 10,
    padding: 10,
    gap: 5,
  },
  errorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  errorText: {
    flex: 1,
    fontSize: 11.5,
    color: T.danger,
    fontWeight: '500',
    lineHeight: 16,
  },
  errorMore: {
    fontSize: 11,
    color: T.danger,
    fontWeight: '600',
    marginTop: 2,
    paddingLeft: 19,
  },

  // Success
  successRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: T.successLight,
    borderRadius: 8,
  },
  successText: {
    fontSize: 12,
    color: T.success,
    fontWeight: '600',
  },

  

});