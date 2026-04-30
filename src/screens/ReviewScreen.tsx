// screens/ReviewScreen.tsx
// Loads REAL scan result passed via navigation params.
// Falls back gracefully if no data is present.
// ✅ EDIT MODE: Tap any answer box to manually correct it. Score updates live.

import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { ScanResult } from '../storage/localStorage';
import { getScanResultById, updateScanResult } from '../storage/localStorage';
import { Colors, Radius, Spacing } from '../theme';
import { gradeAnswers } from '../utils/grading';

// ─── Local UI helpers ──────────────────────────────────────────────────────────

function IconButton({
  name,
  onPress,
  size = 16,
  color = '#000',
}: {
  name: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  size?: number;
  color?: string;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <Ionicons name={name} size={size} color={color} />
    </TouchableOpacity>
  );
}

function SectionHeading({ label }: { label: string }) {
  return <Text style={styles.sectionHeading}>{label}</Text>;
}

// ─── Route Params ──────────────────────────────────────────────────────────────

interface RouteParams {
  resultId?:     string;
  inlineResult?: ScanResult;
  result?:       ScanResult;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ReviewScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute();
  const params     = (route.params as RouteParams) ?? {};

  // Accept result from any param name
  const initialResult = params.inlineResult ?? params.result ?? null;

  const [result, setResult]   = useState<ScanResult | null>(initialResult);
  const [loading, setLoading] = useState(!initialResult);
  const [error, setError]     = useState<string | null>(null);

  // ── Edit mode state ────────────────────────────────────────
  // editedAnswers holds the current (possibly corrected) student answers
  const [editedAnswers, setEditedAnswers] = useState<Record<string, string>>(
    initialResult?.studentAnswers ?? {}
  );
  const [editingQuestion, setEditingQuestion] = useState<string | null>(null);
  const [editingValue, setEditingValue]       = useState('');
  const [editedName, setEditedName]           = useState(initialResult?.studentName ?? '');
  const [editingName, setEditingName]         = useState(false);
  const inputRef = useRef<TextInput>(null);

  // ── Load from storage if only resultId was passed ─────────

  useEffect(() => {
    if (initialResult || !params.resultId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await getScanResultById(params.resultId!);
        if (cancelled) return;
        if (!r) {
          setError('Scan result not found.');
        } else {
          setResult(r);
          setEditedAnswers(r.studentAnswers ?? {});
          setEditedName(r.studentName ?? '');
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Failed to load result.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [params.resultId]);

  // ── Recompute grade live from editedAnswers ────────────────

  const gradeData = result
    ? gradeAnswers(editedAnswers, result.answerKey, result.examType)
    : null;

  const answerEntries = gradeData?.breakdown ?? [];
  const correctCount  = gradeData?.score      ?? 0;
  const total         = gradeData?.total       ?? 0;
  const percent       = gradeData?.percentage  ?? 0;
  const passed        = gradeData?.passed      ?? (percent >= 50);
  const hasLowConf    = (result?.ocrConfidence ?? 1) < 0.8;
  const ambiguous     = result?.ocrNotes?.toLowerCase().includes('ambiguous') ||
                        result?.ocrNotes?.toLowerCase().includes('double') || false;

  // ── Edit answer handlers ───────────────────────────────────

  const openEdit = useCallback((questionNumber: string, currentAnswer: string) => {
    setEditingQuestion(questionNumber);
    setEditingValue(currentAnswer === '—' || currentAnswer === '?' ? '' : currentAnswer);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const confirmEdit = useCallback(() => {
    if (!editingQuestion) return;
    const val = editingValue.trim().toUpperCase();
    setEditedAnswers(prev => ({ ...prev, [editingQuestion]: val }));
    setEditingQuestion(null);
    setEditingValue('');
  }, [editingQuestion, editingValue]);

  const cancelEdit = useCallback(() => {
    setEditingQuestion(null);
    setEditingValue('');
  }, []);

  // ── Confirm & save ─────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    if (!result) return;

    // Recompute final grade with edited answers
    const finalGrade = gradeAnswers(editedAnswers, result.answerKey, result.examType);

    // Persist corrections to local storage
    await updateScanResult(result.id, {
      studentName:    editedName.trim() || result.studentName,
      studentAnswers: editedAnswers,
      score:          finalGrade.score,
      total:          finalGrade.total,
      percentage:     finalGrade.percentage,
      passed:         finalGrade.passed ?? (finalGrade.percentage >= 50),
    });

    navigation.navigate('Results', { resultId: result.id });
  }, [result, editedAnswers, editedName, navigation]);

  const handleRescan = useCallback(() => {
    Alert.alert(
      'Rescan',
      'Go back to scan a new sheet?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Rescan', onPress: () => navigation.goBack() },
      ]
    );
  }, [navigation]);

  // ── Render states ──────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={Colors.success} />
        <Text style={styles.loadingText}>Loading result…</Text>
      </View>
    );
  }

  if (error || !result) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.errorText}>{error ?? 'No result to display.'}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>← Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main UI ────────────────────────────────────────────────

  return (
    <View style={styles.root}>

      {/* ── Edit Answer Modal ── */}
      <Modal
        visible={editingQuestion !== null}
        transparent
        animationType="fade"
        onRequestClose={cancelEdit}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Answer — Q{editingQuestion}</Text>
            <Text style={styles.modalHint}>
              Type the correct answer (e.g. A, B, C, D or a word)
            </Text>
            <TextInput
              ref={inputRef}
              style={styles.modalInput}
              value={editingValue}
              onChangeText={setEditingValue}
              autoCapitalize="characters"
              placeholder="Enter answer…"
              placeholderTextColor="#94A3B8"
              returnKeyType="done"
              onSubmitEditing={confirmEdit}
            />
            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={cancelEdit}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={confirmEdit}>
                <Text style={styles.modalConfirmText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Top bar */}
      <View style={styles.topbar}>
        <View style={styles.topbarLeft}>
          <IconButton
            name="chevron-back"
            onPress={() => navigation.goBack()}
            size={16}
            color={Colors.textPrimary}
          />
          <Text style={styles.topbarTitle}>Review Scan</Text>
        </View>
        <IconButton
          name="refresh-outline"
          size={14}
          color={Colors.textSecondary}
          onPress={handleRescan}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Scan quality indicator */}
        <View style={styles.imgPreview}>
          <View style={styles.imgLines}>
            {[1, 0.78, 0.55, 1, 0.78, 0.55].map((w, i) => (
              <View key={i} style={[styles.imgLine, { width: `${w * 70}%` as any }]} />
            ))}
          </View>
          <View
            style={[
              styles.qualityBadge,
              { backgroundColor: hasLowConf ? Colors.amber : Colors.success },
            ]}
          >
            <Text style={styles.qualityText}>
              {hasLowConf
                ? `⚠ ${Math.round((result.ocrConfidence ?? 0) * 100)}% confidence`
                : '✓ Good quality'}
            </Text>
          </View>
        </View>

        {/* Student name — tappable to edit */}
        <TouchableOpacity
          style={[styles.ocrField, editingName && styles.ocrFieldActive]}
          onPress={() => setEditingName(true)}
          activeOpacity={0.75}
        >
          <View style={styles.ocrFieldRow}>
            <Text style={styles.ocrLabel}>Student name</Text>
            <Ionicons name="pencil-outline" size={10} color={Colors.textMuted} />
          </View>
          {editingName ? (
            <TextInput
              style={styles.ocrValueInput}
              value={editedName}
              onChangeText={setEditedName}
              autoFocus
              onBlur={() => setEditingName(false)}
              returnKeyType="done"
              onSubmitEditing={() => setEditingName(false)}
              placeholder="Enter student name…"
              placeholderTextColor="#94A3B8"
            />
          ) : (
            <Text style={styles.ocrValue}>{editedName || 'Unknown — tap to edit'}</Text>
          )}
        </TouchableOpacity>

        {result.sectionId && (
          <View style={styles.ocrField}>
            <Text style={styles.ocrLabel}>Section</Text>
            <Text style={styles.ocrValue}>{result.sectionId}</Text>
          </View>
        )}

        <View style={styles.ocrField}>
          <Text style={styles.ocrLabel}>Exam type</Text>
          <Text style={styles.ocrValue}>{result.examType.replace(/_/g, ' ')}</Text>
        </View>

        {/* Warnings */}
        {(hasLowConf || ambiguous) && (
          <View style={styles.warnBar}>
            <Ionicons name="warning-outline" size={13} color={Colors.amber} />
            <Text style={styles.warnText}>
              {result.ocrNotes || 'Some answers may need manual verification.'}
              {' '}
              <Text style={styles.warnBold}>Tap any answer box to correct it.</Text>
            </Text>
          </View>
        )}

        {/* Edit mode hint */}
        <View style={styles.editHint}>
          <Ionicons name="create-outline" size={12} color={Colors.primary} />
          <Text style={styles.editHintText}>
            Tap any answer box to correct it — score updates live
          </Text>
        </View>

        {/* Answer grid */}
        <SectionHeading label="Detected answers" />

        <View style={styles.ansGrid}>
          {answerEntries
            .sort((a, b) => parseInt(a.questionNumber) - parseInt(b.questionNumber))
            .map((entry) => {
              const displayAnswer = editedAnswers[entry.questionNumber] || '?';
              const isMissing     = !editedAnswers[entry.questionNumber];

              return (
                <TouchableOpacity
                  key={entry.questionNumber}
                  style={[
                    styles.ansBox,
                    isMissing
                      ? styles.ansBoxMissing
                      : entry.correct
                        ? styles.ansBoxOk
                        : styles.ansBoxWrong,
                  ]}
                  onPress={() => openEdit(entry.questionNumber, displayAnswer)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.ansQ}>Q{entry.questionNumber}</Text>
                  <Text
                    style={[
                      styles.ansA,
                      isMissing
                        ? styles.ansAMissing
                        : entry.correct
                          ? styles.ansAOk
                          : styles.ansAWrong,
                    ]}
                    numberOfLines={1}
                  >
                    {displayAnswer}
                  </Text>
                  {/* Small edit pencil icon */}
                  <Ionicons
                    name="pencil"
                    size={7}
                    color={isMissing ? Colors.amber : entry.correct ? Colors.success : Colors.danger}
                    style={{ marginTop: 2 }}
                  />
                </TouchableOpacity>
              );
            })}
        </View>

        {/* Score footer */}
        <View style={styles.scoreFooter}>
          <View>
            <Text style={[styles.scoreText, { color: passed ? Colors.success : Colors.danger }]}>
              {correctCount} / {total} correct
            </Text>
            <Text style={styles.scorePct}>
              {percent}% · {passed ? 'Passed' : 'Failed'}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.confirmBtn, { backgroundColor: passed ? Colors.success : Colors.danger }]}
            onPress={handleConfirm}
            activeOpacity={0.85}
          >
            <Text style={styles.confirmText}>Confirm →</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  errorText: {
    fontSize: 14,
    color: Colors.danger,
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.n100,
    borderRadius: Radius.md,
  },
  backBtnText: {
    fontSize: 13,
    color: Colors.textPrimary,
    fontWeight: '600',
  },

  // ── Top bar ──
  topbar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  topbarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  topbarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.4,
  },

  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginTop: 8,
    marginBottom: 8,
  },

  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, gap: 10 },

  // ── Scan preview ──
  imgPreview: {
    height: 90,
    backgroundColor: '#F1F5F9',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  imgLines: { width: '70%', gap: 6 },
  imgLine:  { height: 3, backgroundColor: '#CBD5E1', borderRadius: 2 },
  qualityBadge: {
    position: 'absolute',
    top: 6,
    right: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  qualityText: { fontSize: 8, fontWeight: '700', color: '#fff' },

  // ── OCR fields ──
  ocrField: {
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    padding: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  ocrFieldActive: {
    borderColor: Colors.primary,
    backgroundColor: '#EFF6FF',
  },
  ocrFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  ocrLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  ocrValue: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
    textTransform: 'capitalize',
  },
  ocrValueInput: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textPrimary,
    padding: 0,
    margin: 0,
  },

  // ── Warnings ──
  warnBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.amberLight,
    borderRadius: Radius.md,
    padding: 10,
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  warnText: {
    fontSize: 11,
    color: Colors.amber,
    fontWeight: '500',
    flex: 1,
    lineHeight: 16,
  },
  warnBold: {
    fontWeight: '700',
  },

  // ── Edit hint ──
  editHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EFF6FF',
    borderRadius: Radius.md,
    padding: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  editHintText: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '500',
  },

  // ── Answer grid ──
  ansGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  ansBox: {
    width: 52,
    borderRadius: Radius.sm,
    padding: 7,
    alignItems: 'center',
  },
  ansBoxOk: {
    backgroundColor: Colors.successLight,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  ansBoxWrong: {
    backgroundColor: Colors.dangerLight,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  ansBoxMissing: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FCD34D',
    borderStyle: 'dashed',
  },
  ansQ: { fontSize: 8, color: Colors.textMuted, fontWeight: '600', marginBottom: 2 },
  ansA: { fontSize: 13, fontWeight: '700' },
  ansAOk:      { color: Colors.success },
  ansAWrong:   { color: Colors.danger },
  ansAMissing: { color: Colors.amber },

  // ── Score footer ──
  scoreFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    marginTop: 4,
  },
  scoreText: { fontSize: 11, fontWeight: '700' },
  scorePct:  { fontSize: 9, color: Colors.textSecondary, marginTop: 1 },
  confirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radius.md,
  },
  confirmText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // ── Edit modal ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  modalCard: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  modalHint: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 20,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 2,
  },
  modalBtns: {
    flexDirection: 'row',
    gap: 10,
  },
  modalCancel: {
    flex: 1,
    padding: 12,
    backgroundColor: '#F1F5F9',
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textSecondary,
  },
  modalConfirm: {
    flex: 1,
    padding: 12,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  modalConfirmText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});