// screens/AddAnswerKeyScreen.tsx
//
// CHANGES FROM PREVIOUS VERSION:
//  ✅ Legacy exam types removed (truefalse, traceError, shortAnswer)
//  ✅ Uses ExamType from exam.ts — NOT the old QuestionType from api.ts
//  ✅ Template-driven: ANSWER_KEY_TEMPLATES determines form UI per type
//  ✅ Dynamic form: Bubble OMR shows chip selector, others show typed input
//  ✅ Per-type validation enforced before save
//  ✅ Enumeration input properly builds string[] answers
//  ✅ MCQ/Bubble answers force uppercase A-D only
//  ✅ Two-step UX: (1) pick exam type, (2) enter answers for that template

import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { uploadAnswerKeyJson, type AnswerKeyItem } from '../services/api';
import { Colors, Radius, Spacing } from '../theme';
import {
  ANSWER_KEY_TEMPLATES,
  EXAM_TYPE_OPTIONS,
  type ExamType,
} from '../types/exam';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RouteParams {
  sectionId:   string;
  sectionName: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BUBBLE_OPTIONS = ['A', 'B', 'C', 'D'] as const;
type BubbleOption = typeof BUBBLE_OPTIONS[number];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parses the raw comma-separated text input into an array of answer strings.
 * Each element represents one question's answer.
 *
 * Accepts two input formats:
 *   1. Comma-separated:   A,B,C,D
 *   2. Numbered list:     1. Charles Babbage\n2. Mercury\n...
 */
function parseRawAnswers(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const isNumberedList = /^\d+[\.\)]\s+/.test(trimmed);

  if (isNumberedList) {
    return trimmed
      .split('\n')
      .map(line => line.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(Boolean);
  }

  return trimmed.split(',').map(a => a.trim()).filter(Boolean);
}

/**
 * Validates all parsed answers against the template for the selected exam type.
 * Returns the first error found, or null if all answers are valid.
 */
function validateAnswers(answers: string[], examType: ExamType): string | null {
  const template = ANSWER_KEY_TEMPLATES[examType];
  for (let i = 0; i < answers.length; i++) {
    const err = template.validateAnswer(answers[i], i + 1);
    if (err) return err;
  }
  return null;
}

/**
 * Builds AnswerKeyItem[] from a list of raw answer strings and the exam type.
 * Enumeration answers are split on semicolons into string[].
 */
function buildAnswerKeyItems(answers: string[], examType: ExamType): AnswerKeyItem[] {
  return answers.map((ans, i) => {
    const answer: string | string[] =
      examType === 'enumeration'
        ? ans.split(';').map(a => a.trim()).filter(Boolean)
        : examType === 'bubble_omr' || examType === 'multiple_choice'
        ? ans.toUpperCase()
        : ans;

    return { question: i + 1, type: examType, answer };
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Renders a row of A/B/C/D chip buttons for bubble_omr type, per question. */
function BubbleRow({
  questionNumber,
  selected,
  onSelect,
}: {
  questionNumber: number;
  selected:       BubbleOption | '';
  onSelect:       (q: number, val: BubbleOption) => void;
}) {
  return (
    <View style={bubbleStyles.row}>
      <Text style={bubbleStyles.qNum}>{questionNumber}.</Text>
      <View style={bubbleStyles.chips}>
        {BUBBLE_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt}
            style={[bubbleStyles.chip, selected === opt && bubbleStyles.chipActive]}
            onPress={() => onSelect(questionNumber, opt)}
            activeOpacity={0.75}
          >
            <Text style={[bubbleStyles.chipText, selected === opt && bubbleStyles.chipTextActive]}>
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const bubbleStyles = StyleSheet.create({
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 5,
    gap:             10,
  },
  qNum: {
    width:      24,
    fontSize:   13,
    fontWeight: '600',
    color:      Colors.textSecondary,
    textAlign:  'right',
  },
  chips: {
    flexDirection: 'row',
    gap:           8,
  },
  chip: {
    width:           36,
    height:          36,
    borderRadius:    18,
    borderWidth:     1.5,
    borderColor:     Colors.border,
    backgroundColor: Colors.white,
    alignItems:      'center',
    justifyContent:  'center',
  },
  chipActive: {
    backgroundColor: Colors.primary,
    borderColor:     Colors.primary,
  },
  chipText: {
    fontSize:   13,
    fontWeight: '700',
    color:      Colors.textSecondary,
  },
  chipTextActive: {
    color: Colors.white,
  },
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddAnswerKeyScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute();
  const { sectionId, sectionName } = route.params as RouteParams;

  // ── Step state ──────────────────────────────────────────────────────────────
  // step 1: choose exam type   step 2: enter answers
  const [step, setStep] = useState<1 | 2>(1);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [examType, setExamType] = useState<ExamType>('bubble_omr');
  const [rawText,  setRawText]  = useState('');

  // Bubble OMR uses a per-question chip map instead of a text input
  const [bubbleCount,   setBubbleCount]   = useState('10');
  const [bubbleAnswers, setBubbleAnswers] = useState<Record<number, BubbleOption | ''>>({});

  const [saving, setSaving] = useState(false);

  const template      = ANSWER_KEY_TEMPLATES[examType];
  const isBubble      = examType === 'bubble_omr';
  const parsedAnswers = isBubble ? [] : parseRawAnswers(rawText);
  const detectedCount = isBubble
    ? Object.values(bubbleAnswers).filter(v => v !== '').length
    : parsedAnswers.length;

  // ── Bubble helpers ──────────────────────────────────────────────────────────

  const bubbleCountNum = Math.max(1, Math.min(100, parseInt(bubbleCount) || 10));

  function handleBubbleSelect(q: number, val: BubbleOption) {
    setBubbleAnswers(prev => ({ ...prev, [q]: val }));
  }

  function buildBubbleItems(): AnswerKeyItem[] {
    return Array.from({ length: bubbleCountNum }, (_, i) => ({
      question: i + 1,
      type:     'bubble_omr' as ExamType,
      answer:   bubbleAnswers[i + 1] ?? '',
    })).filter(item => item.answer !== '');
  }

  // ── Save handler ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    let items: AnswerKeyItem[];

    if (isBubble) {
      const filled = buildBubbleItems();
      if (filled.length === 0) {
        Alert.alert('No answers selected', 'Please select at least one bubble answer.');
        return;
      }
      const unanswered = Array.from({ length: bubbleCountNum }, (_, i) => i + 1)
        .filter(q => !bubbleAnswers[q]);
      if (unanswered.length > 0) {
        Alert.alert(
          'Incomplete answer key',
          `Questions ${unanswered.join(', ')} have no bubble selected. Continue anyway?`,
          [
            { text: 'Cancel',   style: 'cancel' },
            { text: 'Continue', onPress: () => doSave(buildBubbleItems()) },
          ]
        );
        return;
      }
      items = buildBubbleItems();
    } else {
      if (!rawText.trim()) {
        Alert.alert('Missing answers', 'Please enter at least one answer.');
        return;
      }
      if (parsedAnswers.length === 0) {
        Alert.alert('Invalid input', template.placeholder);
        return;
      }
      const validationError = validateAnswers(parsedAnswers, examType);
      if (validationError) {
        Alert.alert('Invalid answer', validationError);
        return;
      }
      items = buildAnswerKeyItems(parsedAnswers, examType);
    }

    doSave(items);
  };

  const doSave = async (items: AnswerKeyItem[]) => {
    setSaving(true);
    try {
      await uploadAnswerKeyJson(sectionId, items);
      Alert.alert(
        'Saved',
        `Answer key for "${sectionName}" has been uploaded (${items.length} items).`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (err: any) {
      console.error('[AddAnswerKey] Save failed:', err);
      Alert.alert('Save failed', err?.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Step 1: Exam Type Picker ─────────────────────────────────────────────────

  const renderStep1 = () => (
    <>
      <Text style={styles.sectionTitle}>Select Exam Type</Text>
      <Text style={styles.hint}>
        Choose the exam type before entering answers. This determines how answers
        are formatted, scanned, and graded.
      </Text>

      <View style={styles.typeGrid}>
        {EXAM_TYPE_OPTIONS.map(t => {
          const isActive = examType === t.value;
          return (
            <TouchableOpacity
              key={t.value}
              style={[styles.typeCard, isActive && styles.typeCardActive]}
              onPress={() => setExamType(t.value)}
              activeOpacity={0.75}
            >
              <Ionicons
                name={t.icon as any}
                size={22}
                color={isActive ? Colors.primary : Colors.textSecondary}
              />
              <Text style={[styles.typeCardLabel, isActive && styles.typeCardLabelActive]}>
                {t.label}
              </Text>
              <Text style={styles.typeCardDesc}>{t.description}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Template preview */}
      <View style={styles.templateBox}>
        <Text style={styles.templateBoxTitle}>Template Rules</Text>
        <Text style={styles.templateBoxRow}>
          <Text style={styles.templateBoxKey}>Format: </Text>
          {template.answerFormat}
        </Text>
        <Text style={styles.templateBoxRow}>
          <Text style={styles.templateBoxKey}>Multiple accepted answers: </Text>
          {template.allowMultiple ? 'Yes (use semicolons)' : 'No'}
        </Text>
        {template.validAnswers && (
          <Text style={styles.templateBoxRow}>
            <Text style={styles.templateBoxKey}>Valid values: </Text>
            {template.validAnswers.join(', ')}
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={styles.nextBtn}
        onPress={() => setStep(2)}
        activeOpacity={0.85}
      >
        <Text style={styles.nextBtnText}>Continue →</Text>
      </TouchableOpacity>
    </>
  );

  // ── Step 2: Answer Entry Form (template-driven) ──────────────────────────────

  const renderStep2 = () => (
    <>
      {/* Selected type badge */}
      <TouchableOpacity
        style={styles.typeBadge}
        onPress={() => setStep(1)}
        activeOpacity={0.75}
      >
        <Ionicons name={EXAM_TYPE_OPTIONS.find(t => t.value === examType)?.icon as any} size={14} color={Colors.primary} />
        <Text style={styles.typeBadgeText}>
          {EXAM_TYPE_OPTIONS.find(t => t.value === examType)?.label}
        </Text>
        <Text style={styles.typeBadgeChange}>(change)</Text>
      </TouchableOpacity>

      {/* Bubble OMR — chip per question */}
      {isBubble ? (
        <>
          <Text style={styles.label}>Number of Questions</Text>
          <TextInput
            style={styles.input}
            value={bubbleCount}
            onChangeText={v => {
              setBubbleCount(v.replace(/[^0-9]/g, ''));
              setBubbleAnswers({});
            }}
            placeholder="e.g. 10"
            placeholderTextColor="#94A3B8"
            keyboardType="number-pad"
            maxLength={3}
          />

          <Text style={[styles.label, { marginTop: 14 }]}>Select Bubble Answers</Text>
          <Text style={styles.hint}>Tap A, B, C, or D for each question.</Text>

          <View style={styles.bubbleList}>
            {Array.from({ length: bubbleCountNum }, (_, i) => i + 1).map(q => (
              <BubbleRow
                key={q}
                questionNumber={q}
                selected={bubbleAnswers[q] ?? ''}
                onSelect={handleBubbleSelect}
              />
            ))}
          </View>
        </>
      ) : (
        /* All other types — text input */
        <>
          <Text style={styles.label}>Answers</Text>
          <Text style={styles.hint}>{template.inputHint}</Text>
          <TextInput
            style={[styles.input, styles.inputTall]}
            value={rawText}
            onChangeText={setRawText}
            placeholder={template.placeholder}
            placeholderTextColor="#94A3B8"
            autoCapitalize={
              examType === 'multiple_choice' ? 'characters' : 'sentences'
            }
            multiline
            returnKeyType="done"
          />
          {rawText.trim().length > 0 && (
            <Text style={styles.count}>
              {detectedCount} {detectedCount === 1 ? 'item' : 'items'} detected
            </Text>
          )}
        </>
      )}

      {/* Format reminder */}
      <View style={styles.formatBox}>
        <Ionicons name="information-circle-outline" size={14} color={Colors.textSecondary} />
        <Text style={styles.formatBoxText}>
          <Text style={{ fontWeight: '700' }}>Format: </Text>
          {template.answerFormat}
        </Text>
      </View>

      <View style={{ height: 60 }} />
    </>
  );

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={styles.topbar}>
        <TouchableOpacity
          onPress={() => (step === 2 ? setStep(1) : navigation.goBack())}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.topbarCenter}>
          <Text style={styles.topbarTitle}>New Answer Key</Text>
          <Text style={styles.topbarSub}>{sectionName}</Text>
        </View>

        {step === 2 ? (
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.5 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.85}
          >
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
          </TouchableOpacity>
        ) : (
          /* Spacer to keep title centred */
          <View style={{ width: 52 }} />
        )}
      </View>

      {/* Step indicator */}
      <View style={styles.stepRow}>
        <View style={[styles.stepDot, step >= 1 && styles.stepDotActive]} />
        <View style={[styles.stepLine, step >= 2 && styles.stepLineActive]} />
        <View style={[styles.stepDot, step >= 2 && styles.stepDotActive]} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {step === 1 ? renderStep1() : renderStep2()}
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // Top bar
  topbar: {
    height:            54,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor:   Colors.white,
  },
  topbarCenter: { alignItems: 'center' },
  topbarTitle: {
    fontSize:      15,
    fontWeight:    '700',
    color:         Colors.textPrimary,
    letterSpacing: -0.3,
  },
  topbarSub: { fontSize: 10, color: Colors.textSecondary, marginTop: 1 },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical:   6,
    backgroundColor:   Colors.primary,
    borderRadius:      Radius.sm,
  },
  saveBtnText: { fontSize: 12, fontWeight: '700', color: Colors.white },

  // Step indicator
  stepRow: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 24,
    paddingVertical:   10,
    backgroundColor:   Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  stepDot: {
    width:           8,
    height:          8,
    borderRadius:    4,
    backgroundColor: Colors.border,
  },
  stepDotActive: { backgroundColor: Colors.primary },
  stepLine: {
    flex:            1,
    height:          2,
    backgroundColor: Colors.border,
    marginHorizontal: 6,
  },
  stepLineActive: { backgroundColor: Colors.primary },

  // Scroll
  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, gap: 6 },

  // Typography
  sectionTitle: {
    fontSize:      16,
    fontWeight:    '700',
    color:         Colors.textPrimary,
    marginBottom:  4,
    letterSpacing: -0.3,
  },
  label: {
    fontSize:        11,
    fontWeight:      '700',
    color:           Colors.textMuted,
    textTransform:   'uppercase',
    letterSpacing:   0.5,
    marginBottom:    4,
    marginTop:       4,
  },
  hint: {
    fontSize:     11,
    color:        Colors.textSecondary,
    marginBottom: 6,
    lineHeight:   16,
  },

  // Type cards (step 1)
  typeGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           10,
    marginTop:     10,
    marginBottom:  14,
  },
  typeCard: {
    width:            '47%',
    padding:          12,
    borderRadius:     Radius.md,
    borderWidth:      1.5,
    borderColor:      Colors.border,
    backgroundColor:  Colors.white,
    gap:              6,
  },
  typeCardActive: {
    borderColor:     Colors.primary,
    backgroundColor: Colors.primary + '0D', // 5% tint
  },
  typeCardLabel: {
    fontSize:   13,
    fontWeight: '700',
    color:      Colors.textPrimary,
  },
  typeCardLabelActive: { color: Colors.primary },
  typeCardDesc: {
    fontSize:   10,
    color:      Colors.textSecondary,
    lineHeight: 14,
  },

  // Template preview box (step 1)
  templateBox: {
    backgroundColor:  Colors.white,
    borderRadius:     Radius.md,
    borderWidth:      1,
    borderColor:      Colors.border,
    padding:          14,
    gap:              6,
    marginBottom:     14,
  },
  templateBoxTitle: {
    fontSize:     11,
    fontWeight:   '700',
    color:        Colors.textMuted,
    textTransform:'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  templateBoxRow: {
    fontSize:   12,
    color:      Colors.textSecondary,
    lineHeight: 18,
  },
  templateBoxKey: {
    fontWeight: '600',
    color:      Colors.textPrimary,
  },

  // Continue button (step 1)
  nextBtn: {
    backgroundColor: Colors.primary,
    borderRadius:    Radius.md,
    paddingVertical: 13,
    alignItems:      'center',
  },
  nextBtnText: {
    fontSize:   14,
    fontWeight: '700',
    color:      Colors.white,
  },

  // Type badge (step 2)
  typeBadge: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             6,
    alignSelf:       'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius:    Radius.sm,
    borderWidth:     1,
    borderColor:     Colors.primary + '40',
    backgroundColor: Colors.primary + '0D',
    marginBottom:    14,
  },
  typeBadgeText: {
    fontSize:   12,
    fontWeight: '700',
    color:      Colors.primary,
  },
  typeBadgeChange: {
    fontSize: 11,
    color:    Colors.textSecondary,
  },

  // Text input
  input: {
    backgroundColor:  Colors.white,
    borderRadius:     Radius.md,
    borderWidth:      1,
    borderColor:      Colors.border,
    paddingHorizontal: 14,
    paddingVertical:  11,
    fontSize:         13,
    fontWeight:       '500',
    color:            Colors.textPrimary,
  },
  inputTall: {
    minHeight:       100,
    textAlignVertical: 'top',
  },

  count: {
    fontSize:   11,
    color:      Colors.primary,
    fontWeight: '600',
    marginTop:  4,
  },

  // Bubble list
  bubbleList: {
    backgroundColor: Colors.white,
    borderRadius:    Radius.md,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         12,
    gap:             2,
    marginTop:       6,
  },

  // Format reminder box (step 2)
  formatBox: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    gap:             6,
    backgroundColor: Colors.white,
    borderRadius:    Radius.sm,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         10,
    marginTop:       10,
  },
  formatBoxText: {
    flex:       1,
    fontSize:   11,
    color:      Colors.textSecondary,
    lineHeight: 16,
  },
});