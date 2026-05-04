// screens/EditAnswerKeyScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import {
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import {
    uploadAnswerKeyJson,
    type AnswerKeyItem,
    type AnswerKeyRecord,
    type QuestionType,
} from '../services/api';
import { Colors, Radius, Spacing } from '../theme';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface RouteParams {
  sectionId:   string;
  sectionName: string;
  keyRecord:   AnswerKeyRecord;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'mc',             label: 'Multiple Choice' },
  { value: 'truefalse',      label: 'True / False'    },
  { value: 'identification', label: 'Identification'  },
  { value: 'enumeration',    label: 'Enumeration'     },
  { value: 'traceError',     label: 'Trace Error'     },
  { value: 'shortAnswer',    label: 'Short Answer'    },
];

const TYPE_LABELS: Record<string, string> = {
  mc:             'MC',
  truefalse:      'T/F',
  identification: 'ID',
  enumeration:    'Enum',
  traceError:     'Trace',
  shortAnswer:    'SA',
};

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  mc:             { bg: Colors.primaryLight, text: Colors.primary },
  truefalse:      { bg: Colors.successLight, text: Colors.success },
  identification: { bg: Colors.amberLight,   text: Colors.amber   },
  enumeration:    { bg: '#EEF2FF',            text: '#4F46E5'      },
  traceError:     { bg: Colors.dangerLight,  text: Colors.danger  },
  shortAnswer:    { bg: '#F0FDF4',            text: '#16A34A'      },
};

// ─── Component ─────────────────────────────────────────────────────────────────

export default function EditAnswerKeyScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute();
  const { sectionId, sectionName, keyRecord } = route.params as RouteParams;

  const [items,   setItems]   = useState<AnswerKeyItem[]>(keyRecord?.key ?? []);
  const [saving,  setSaving]  = useState(false);
  const [dirty,   setDirty]   = useState(false);

  // Edit modal state
  const [editIdx,      setEditIdx]      = useState<number | null>(null);
  const [editAnswer,   setEditAnswer]   = useState('');
  const [editType,     setEditType]     = useState<QuestionType>('mc');
  const [showTypePick, setShowTypePick] = useState(false);

  // ── Open edit modal ──────────────────────────────────────────────────────

  const openEdit = useCallback((idx: number) => {
    const item = items[idx];
    setEditIdx(idx);
    setEditAnswer(Array.isArray(item.answer) ? item.answer.join(', ') : item.answer);
    setEditType(item.type);
  }, [items]);

  const confirmEdit = useCallback(() => {
    if (editIdx === null) return;
    const rawAnswer = editAnswer.trim();
    if (!rawAnswer) {
      Alert.alert('Empty answer', 'Please enter an answer.');
      return;
    }
    // For enumeration/shortAnswer allow comma-separated arrays
    const answer: string | string[] =
      (editType === 'enumeration' || editType === 'shortAnswer') && rawAnswer.includes(',')
        ? rawAnswer.split(',').map(a => a.trim()).filter(Boolean)
        : rawAnswer.toUpperCase();

    setItems(prev => prev.map((item, i) =>
      i === editIdx ? { ...item, type: editType, answer } : item
    ));
    setDirty(true);
    setEditIdx(null);
    setEditAnswer('');
  }, [editIdx, editAnswer, editType]);

  // ── Add question ─────────────────────────────────────────────────────────

  const addQuestion = useCallback(() => {
    const nextNum = items.length > 0
      ? Math.max(...items.map(i => i.question)) + 1
      : 1;
    setItems(prev => [...prev, { question: nextNum, type: 'mc', answer: '' }]);
    setDirty(true);
    // Open edit immediately for the new item
    setTimeout(() => openEdit(items.length), 50);
  }, [items, openEdit]);

  // ── Delete question ──────────────────────────────────────────────────────

  const deleteQuestion = useCallback((idx: number) => {
    Alert.alert('Delete question', `Remove Q${items[idx].question}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => {
          setItems(prev => prev.filter((_, i) => i !== idx));
          setDirty(true);
        },
      },
    ]);
  }, [items]);

  // ── Save — re-upload as JSON ─────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!dirty) { navigation.goBack(); return; }
    if (items.some(i => !i.answer || (Array.isArray(i.answer) && i.answer.length === 0))) {
      Alert.alert('Empty answers', 'All questions must have an answer before saving.');
      return;
    }

    setSaving(true);
    try {
      await uploadAnswerKeyJson(sectionId, items);
      Alert.alert('Saved', 'Answer key updated successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      console.error('[EditAnswerKey] Save failed:', err);
      Alert.alert('Save failed', err?.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [dirty, items, sectionId, navigation]);

  // ── Back guard ───────────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    if (!dirty) { navigation.goBack(); return; }
    Alert.alert('Unsaved changes', 'Discard your changes?', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard',      style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  }, [dirty, navigation]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>

      {/* Edit Item Modal */}
      <Modal
        visible={editIdx !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setEditIdx(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Edit Q{editIdx !== null ? items[editIdx]?.question : ''}
            </Text>

            {/* Type picker */}
            <Text style={styles.modalLabel}>Question Type</Text>
            <TouchableOpacity
              style={styles.typePickerBtn}
              onPress={() => setShowTypePick(true)}
              activeOpacity={0.75}
            >
              <Text style={styles.typePickerBtnText}>
                {QUESTION_TYPES.find(t => t.value === editType)?.label ?? editType}
              </Text>
              <Ionicons name="chevron-down" size={14} color={Colors.textSecondary} />
            </TouchableOpacity>

            {/* Answer input */}
            <Text style={styles.modalLabel}>Answer</Text>
            <TextInput
              style={styles.modalInput}
              value={editAnswer}
              onChangeText={setEditAnswer}
              placeholder={
                editType === 'truefalse'
                  ? 'True or False'
                  : editType === 'mc'
                  ? 'A, B, C or D'
                  : 'Enter answer…'
              }
              placeholderTextColor="#94A3B8"
              autoCapitalize={editType === 'mc' ? 'characters' : 'sentences'}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={confirmEdit}
            />
            {(editType === 'enumeration' || editType === 'shortAnswer') && (
              <Text style={styles.modalHint}>
                Separate multiple accepted answers with commas
              </Text>
            )}

            <View style={styles.modalBtns}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setEditIdx(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalConfirm} onPress={confirmEdit}>
                <Text style={styles.modalConfirmText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Type Picker Modal */}
      <Modal
        visible={showTypePick}
        transparent
        animationType="fade"
        onRequestClose={() => setShowTypePick(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setShowTypePick(false)}
        >
          <View style={styles.typePickerCard}>
            <Text style={styles.modalTitle}>Select Question Type</Text>
            {QUESTION_TYPES.map(t => (
              <TouchableOpacity
                key={t.value}
                style={[styles.typeOption, editType === t.value && styles.typeOptionActive]}
                onPress={() => { setEditType(t.value); setShowTypePick(false); }}
              >
                <Text style={[styles.typeOptionText, editType === t.value && styles.typeOptionTextActive]}>
                  {t.label}
                </Text>
                {editType === t.value && (
                  <Ionicons name="checkmark" size={16} color={Colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Top bar */}
      <View style={styles.topbar}>
        <TouchableOpacity onPress={handleBack} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View>
          <Text style={styles.topbarTitle}>{sectionName}</Text>
          <Text style={styles.topbarSub}>{items.length} questions</Text>
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, (saving || !dirty) && styles.saveBtnDim]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      {/* Question list */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {items.length === 0 && (
          <View style={styles.emptyWrap}>
            <Ionicons name="list-outline" size={40} color={Colors.n300} />
            <Text style={styles.emptyText}>No questions yet</Text>
            <Text style={styles.emptySub}>Tap "+ Add Question" to get started</Text>
          </View>
        )}

        {items.map((item, idx) => {
          const typeClr  = TYPE_COLORS[item.type] ?? TYPE_COLORS.mc;
          const answerStr = Array.isArray(item.answer) ? item.answer.join(', ') : item.answer;
          const isEmpty  = !item.answer || (Array.isArray(item.answer) && item.answer.length === 0);

          return (
            <TouchableOpacity
              key={`${item.question}-${idx}`}
              style={[styles.row, isEmpty && styles.rowEmpty]}
              onPress={() => openEdit(idx)}
              activeOpacity={0.75}
            >
              {/* Q number */}
              <View style={styles.qNum}>
                <Text style={styles.qNumText}>{item.question}</Text>
              </View>

              {/* Type chip */}
              <View style={[styles.typeChip, { backgroundColor: typeClr.bg }]}>
                <Text style={[styles.typeChipText, { color: typeClr.text }]}>
                  {TYPE_LABELS[item.type] ?? item.type}
                </Text>
              </View>

              {/* Answer */}
              <Text
                style={[styles.answerText, isEmpty && styles.answerEmpty]}
                numberOfLines={1}
              >
                {isEmpty ? 'Tap to set answer' : answerStr}
              </Text>

              {/* Actions */}
              <View style={styles.rowActions}>
                <Ionicons name="pencil-outline" size={13} color={Colors.textMuted} />
                <TouchableOpacity
                  onPress={() => deleteQuestion(idx)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{ marginLeft: 10 }}
                >
                  <Ionicons name="trash-outline" size={13} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Add question button */}
        <TouchableOpacity style={styles.addBtn} onPress={addQuestion} activeOpacity={0.8}>
          <Ionicons name="add-circle-outline" size={16} color={Colors.primary} />
          <Text style={styles.addBtnText}>Add Question</Text>
        </TouchableOpacity>

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: Colors.background },
  scroll:  { flex: 1 },
  content: { padding: Spacing.lg, gap: 8 },

  topbar: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.white,
  },
  topbarTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, letterSpacing: -0.3 },
  topbarSub:   { fontSize: 10, color: Colors.textSecondary, marginTop: 1 },

  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    backgroundColor: Colors.primary,
    borderRadius: Radius.sm,
  },
  saveBtnDim:  { opacity: 0.45 },
  saveBtnText: { fontSize: 12, fontWeight: '700', color: Colors.white },

  // ── Rows ──
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
  },
  rowEmpty: { borderColor: Colors.amber + '80', backgroundColor: '#FFFBEB' },

  qNum: {
    width: 28, height: 28,
    borderRadius: 8,
    backgroundColor: Colors.n100,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  qNumText: { fontSize: 11, fontWeight: '700', color: Colors.textPrimary },

  typeChip: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
  },
  typeChipText: { fontSize: 9, fontWeight: '700' },

  answerText:  { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.textPrimary },
  answerEmpty: { color: Colors.textMuted, fontStyle: 'italic', fontWeight: '400' },

  rowActions: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },

  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.primary + '60',
    borderStyle: 'dashed',
    backgroundColor: Colors.primaryLight,
    marginTop: 4,
  },
  addBtnText: { fontSize: 13, fontWeight: '600', color: Colors.primary },

  emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyText: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary },
  emptySub:  { fontSize: 12, color: Colors.textSecondary },

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
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 24,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  modalTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  modalLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  modalHint:  { fontSize: 11, color: Colors.textSecondary, marginTop: -4 },

  typePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.n50,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  typePickerBtnText: { fontSize: 13, fontWeight: '600', color: Colors.textPrimary },

  modalInput: {
    backgroundColor: Colors.n50,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: 1,
  },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancel: {
    flex: 1, padding: 12,
    backgroundColor: Colors.n100,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  modalCancelText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  modalConfirm: {
    flex: 1, padding: 12,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  modalConfirmText: { fontSize: 13, fontWeight: '700', color: Colors.white },

  // ── Type picker modal ──
  typePickerCard: {
    width: '100%',
    backgroundColor: Colors.white,
    borderRadius: 20,
    padding: 20,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  typeOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: Radius.sm,
  },
  typeOptionActive:     { backgroundColor: Colors.primaryLight },
  typeOptionText:       { fontSize: 13, fontWeight: '500', color: Colors.textPrimary },
  typeOptionTextActive: { fontWeight: '700', color: Colors.primary },
});