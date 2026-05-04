// screens/AddAnswerKeyScreen.tsx
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
import {
  uploadAnswerKeyJson,
  type AnswerKeyItem,
  type QuestionType,
} from '../services/api';
import { Colors, Radius, Spacing } from '../theme';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RouteParams {
  sectionId:   string;
  sectionName: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const EXAM_TYPES: { value: QuestionType; label: string }[] = [
  { value: 'mc',             label: 'Multiple Choice' },
  { value: 'truefalse',      label: 'True / False'    },
  { value: 'identification', label: 'Identification'  },
  { value: 'enumeration',    label: 'Enumeration'     },
  { value: 'traceError',     label: 'Trace Error'     },
  { value: 'shortAnswer',    label: 'Short Answer'    },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddAnswerKeyScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute();
  const { sectionId, sectionName } = route.params as RouteParams;

  const [examType, setExamType] = useState<QuestionType>('mc');
  const [answers,  setAnswers]  = useState(''); // comma-separated: A,B,C,D…
  const [saving,   setSaving]   = useState(false);

  const handleSave = async () => {
    if (!answers.trim()) {
      Alert.alert('Missing answers', 'Please enter at least one answer.');
      return;
    }

    const rawList = answers.split(',').map(a => a.trim()).filter(Boolean);

    if (rawList.length === 0) {
      Alert.alert('Invalid answers', 'Please enter answers separated by commas (e.g. A,B,C,D).');
      return;
    }

    // Build AnswerKeyItem[] — the shape fetchAnswerKey returns and EditAnswerKey expects
    const items: AnswerKeyItem[] = rawList.map((ans, i) => ({
      question: i + 1,
      type:     examType,
      answer:
        (examType === 'enumeration' || examType === 'shortAnswer') && ans.includes(';')
          ? ans.split(';').map(a => a.trim()).filter(Boolean)
          : examType === 'mc' || examType === 'truefalse'
          ? ans.toUpperCase()
          : ans,
    }));

    setSaving(true);
    try {
      await uploadAnswerKeyJson(sectionId, items);
      Alert.alert('Saved', `Answer key for "${sectionName}" has been uploaded.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      console.error('[AddAnswerKey] Save failed:', err);
      Alert.alert('Save failed', err?.message ?? 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const detectedCount = answers.split(',').filter(a => a.trim()).length;

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={styles.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()} activeOpacity={0.8}>
          <Ionicons name="chevron-back" size={20} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.topbarCenter}>
          <Text style={styles.topbarTitle}>New Answer Key</Text>
          <Text style={styles.topbarSub}>{sectionName}</Text>
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, saving && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Exam type picker */}
        <Text style={styles.label}>Question Type</Text>
        <Text style={styles.hint}>All answers in this upload will use the same type.</Text>
        <View style={styles.typeRow}>
          {EXAM_TYPES.map(t => (
            <TouchableOpacity
              key={t.value}
              style={[styles.typeChip, examType === t.value && styles.typeChipActive]}
              onPress={() => setExamType(t.value)}
              activeOpacity={0.75}
            >
              <Text style={[styles.typeChipText, examType === t.value && styles.typeChipTextActive]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Answers */}
        <Text style={[styles.label, { marginTop: 20 }]}>Answers</Text>
        <Text style={styles.hint}>
          {examType === 'enumeration' || examType === 'shortAnswer'
            ? 'Separate questions with commas. For multiple accepted answers in one question, use semicolons (e.g. Red,Blue;Indigo,Green).'
            : 'Enter answers separated by commas in order (e.g. A,B,C,D,True,False).'}
        </Text>
        <TextInput
          style={[styles.input, styles.inputTall]}
          value={answers}
          onChangeText={setAnswers}
          placeholder={
            examType === 'truefalse'
              ? 'True,False,True,True…'
              : examType === 'mc'
              ? 'A,B,C,D,A,B,C…'
              : 'Answer1,Answer2,Answer3…'
          }
          placeholderTextColor="#94A3B8"
          autoCapitalize={examType === 'mc' ? 'characters' : 'sentences'}
          multiline
          returnKeyType="done"
        />

        {answers.trim().length > 0 && (
          <Text style={styles.count}>
            {detectedCount} {detectedCount === 1 ? 'item' : 'items'} detected
          </Text>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

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
  topbarCenter: { alignItems: 'center' },
  topbarTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    letterSpacing: -0.3,
  },
  topbarSub: { fontSize: 10, color: Colors.textSecondary, marginTop: 1 },
  saveBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: Colors.primary,
    borderRadius: Radius.sm,
  },
  saveBtnText: { fontSize: 12, fontWeight: '700', color: Colors.white },

  scroll: { flex: 1 },
  content: { padding: Spacing.lg, gap: 6 },

  label: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  hint: {
    fontSize: 11,
    color: Colors.textSecondary,
    marginBottom: 6,
    lineHeight: 16,
  },
  input: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 13,
    fontWeight: '500',
    color: Colors.textPrimary,
  },
  inputTall: {
    minHeight: 100,
    textAlignVertical: 'top',
  },

  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.white,
  },
  typeChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  typeChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    textTransform: 'capitalize',
  },
  typeChipTextActive: {
    color: Colors.white,
  },

  count: {
    fontSize: 11,
    color: Colors.primary,
    fontWeight: '600',
    marginTop: 4,
  },
});