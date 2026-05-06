// src/screens/GenerateSheetScreen.tsx
// ─── Generate OMR Sheet Screen ────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { OMRSheetMeta } from '../constants/omrConfig';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { COLORS, FONT_SIZES, RADIUS, SPACING } from '../theme/theme';
import { printOMRSheet, shareOMRSheet } from '../utils/omrPDFRenderer';
import { buildDefaultMeta, generateExamId } from '../utils/omrSheetGenerator';

type NavProp = NativeStackNavigationProp<RootStackParamList>;

// ─── Component ────────────────────────────────────────────────────────────────

export default function GenerateSheetScreen() {
  const navigation = useNavigation<NavProp>();

  const [meta, setMeta]       = useState<OMRSheetMeta>(buildDefaultMeta());
  const [loading, setLoading] = useState<'print' | 'share' | null>(null);

  function updateField(field: keyof OMRSheetMeta, value: string | number) {
    setMeta((prev: OMRSheetMeta) => ({ ...prev, [field]: value }));
  }

  async function handlePrint() {
    if (!meta.testTitle.trim()) {
      Alert.alert('Missing field', 'Please enter a test title before printing.');
      return;
    }
    try {
      setLoading('print');
      await printOMRSheet(meta);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not open print dialog.';
      Alert.alert('Print failed', msg);
    } finally {
      setLoading(null);
    }
  }

  async function handleShare() {
    if (!meta.testTitle.trim()) {
      Alert.alert('Missing field', 'Please enter a test title before sharing.');
      return;
    }
    try {
      setLoading('share');
      await shareOMRSheet(meta);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Could not generate PDF.';
      Alert.alert('Share failed', msg);
    } finally {
      setLoading(null);
    }
  }

  function regenerateExamId() {
    setMeta((prev: OMRSheetMeta) => ({ ...prev, examId: generateExamId() }));
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ── Top bar ───────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Generate OMR Sheet</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* ── Info card ─────────────────────────────────────────────── */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={16} color={COLORS.primary} />
          <Text style={styles.infoText}>
            Fill in the exam details below, then print or share the OMR answer sheet as a PDF.
            Students fill it in and you scan it with AutoChecker.
          </Text>
        </View>

        {/* ── Form ──────────────────────────────────────────────────── */}
        <SectionHeader label="Exam Info" />

        <FormField
          label="Test Title *"
          value={meta.testTitle}
          onChangeText={v => updateField('testTitle', v)}
          placeholder="e.g. First Quarter Examination"
        />
        <FormField
          label="Subject"
          value={meta.subject}
          onChangeText={v => updateField('subject', v)}
          placeholder="e.g. Science 10"
        />

        <SectionHeader label="Class Info" />

        <View style={styles.rowFields}>
          <View style={{ flex: 1 }}>
            <FormField
              label="Section"
              value={meta.section}
              onChangeText={v => updateField('section', v)}
              placeholder="e.g. BSIT-3B"
            />
          </View>
          <View style={{ flex: 1 }}>
            <FormField
              label="Date"
              value={meta.date}
              onChangeText={v => updateField('date', v)}
              placeholder="e.g. May 5, 2026"
            />
          </View>
        </View>

        <SectionHeader label="Student Info (optional — leave blank for blank sheet)" />

        <FormField
          label="Student Name"
          value={meta.studentName}
          onChangeText={v => updateField('studentName', v)}
          placeholder="Leave blank for a blank sheet"
        />
        <FormField
          label="Student ID"
          value={meta.studentId}
          onChangeText={v => updateField('studentId', v)}
          placeholder="e.g. 2023-00123"
        />

        <SectionHeader label="Sheet Config" />

        {/* Total questions */}
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Total Questions</Text>
          <View style={styles.quantityRow}>
            {([25, 50, 75, 100] as const).map(n => (
              <TouchableOpacity
                key={n}
                style={[
                  styles.qtyBtn,
                  meta.totalQuestions === n && styles.qtyBtnActive,
                ]}
                onPress={() => updateField('totalQuestions', n)}
              >
                <Text
                  style={[
                    styles.qtyBtnText,
                    meta.totalQuestions === n && styles.qtyBtnTextActive,
                  ]}
                >
                  {n}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Exam ID */}
        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Exam ID (auto-generated)</Text>
          <View style={styles.examIdRow}>
            <Text style={styles.examIdValue}>{meta.examId}</Text>
            <TouchableOpacity onPress={regenerateExamId} style={styles.regenBtn}>
              <Ionicons name="refresh" size={14} color={COLORS.primary} />
              <Text style={styles.regenText}>New ID</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Preview hint ──────────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.previewHint}
          onPress={() => navigation.navigate('OMRSheetPreview', { meta })}
        >
          <Ionicons name="eye-outline" size={16} color={COLORS.primary} />
          <Text style={styles.previewHintText}>Preview sheet before printing</Text>
          <Ionicons name="chevron-forward" size={14} color={COLORS.primary} />
        </TouchableOpacity>

        {/* ── Action buttons ────────────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.primaryBtn, loading === 'print' && styles.btnDisabled]}
          onPress={handlePrint}
          disabled={!!loading}
        >
          {loading === 'print' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="print-outline" size={18} color="#fff" />
              <Text style={styles.primaryBtnText}>Print Sheet</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryBtn, loading === 'share' && styles.btnDisabled]}
          onPress={handleShare}
          disabled={!!loading}
        >
          {loading === 'share' ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : (
            <>
              <Ionicons name="share-outline" size={18} color={COLORS.primary} />
              <Text style={styles.secondaryBtnText}>Save / Share PDF</Text>
            </>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ label }: { label: string }) {
  return <Text style={styles.sectionHeader}>{label.toUpperCase()}</Text>;
}

function FormField({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label:        string;
  value:        string;
  onChangeText: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={COLORS.textMuted}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: COLORS.background },
  scroll:        { flex: 1 },
  scrollContent: { padding: SPACING.lg, gap: 4 },

  topBar: {
    backgroundColor:   COLORS.primary,
    paddingTop:        Platform.OS === 'ios' ? 54 : 16,
    paddingBottom:     16,
    paddingHorizontal: SPACING.lg,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { fontSize: FONT_SIZES.base, fontWeight: '700', color: '#fff' },

  infoCard: {
    flexDirection:   'row',
    gap:             10,
    backgroundColor: '#EFF6FF',
    borderRadius:    RADIUS.md,
    padding:         SPACING.md,
    borderWidth:     1,
    borderColor:     '#BFDBFE',
    marginBottom:    8,
  },
  infoText: { flex: 1, fontSize: 12, color: '#1E40AF', lineHeight: 18 },

  sectionHeader: {
    fontSize:      10,
    fontWeight:    '700',
    color:         COLORS.textMuted,
    letterSpacing: 1.2,
    marginTop:     16,
    marginBottom:  6,
  },

  fieldWrap:  { marginBottom: SPACING.sm },
  fieldLabel: { fontSize: FONT_SIZES.sm - 1, fontWeight: '600', color: COLORS.textSecondary, marginBottom: 5 },
  input: {
    backgroundColor:   COLORS.surface,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical:   11,
    fontSize:          FONT_SIZES.md,
    color:             COLORS.text,
  },

  rowFields:    { flexDirection: 'row', gap: SPACING.sm },

  quantityRow:      { flexDirection: 'row', gap: 8 },
  qtyBtn: {
    flex:            1,
    paddingVertical: 11,
    borderRadius:    RADIUS.md,
    borderWidth:     1.5,
    borderColor:     COLORS.border,
    alignItems:      'center',
    backgroundColor: COLORS.surface,
  },
  qtyBtnActive:     { borderColor: COLORS.primary, backgroundColor: '#EFF6FF' },
  qtyBtnText:       { fontSize: FONT_SIZES.base, fontWeight: '600', color: COLORS.textSecondary },
  qtyBtnTextActive: { color: COLORS.primary },

  examIdRow: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    backgroundColor:   COLORS.surface,
    borderRadius:      RADIUS.md,
    borderWidth:       1,
    borderColor:       COLORS.border,
    paddingHorizontal: SPACING.md,
    paddingVertical:   11,
  },
  examIdValue: {
    fontSize:    FONT_SIZES.md,
    color:       COLORS.text,
    fontWeight:  '600',
    fontFamily:  Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  regenBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
  regenText: { fontSize: FONT_SIZES.sm, color: COLORS.primary, fontWeight: '600' },

  previewHint: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             8,
    backgroundColor: '#EFF6FF',
    borderRadius:    RADIUS.md,
    padding:         SPACING.md,
    marginTop:       12,
    marginBottom:    4,
  },
  previewHintText: { flex: 1, fontSize: FONT_SIZES.sm, color: COLORS.primary, fontWeight: '600' },

  primaryBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             10,
    backgroundColor: COLORS.primary,
    borderRadius:    RADIUS.lg,
    paddingVertical: 16,
    marginTop:       16,
  },
  primaryBtnText: { fontSize: FONT_SIZES.base, fontWeight: '700', color: '#fff' },

  secondaryBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             10,
    backgroundColor: '#EFF6FF',
    borderRadius:    RADIUS.lg,
    paddingVertical: 15,
    borderWidth:     1.5,
    borderColor:     COLORS.primary,
    marginTop:       10,
  },
  secondaryBtnText: { fontSize: FONT_SIZES.base, fontWeight: '700', color: COLORS.primary },
  btnDisabled:      { opacity: 0.6 },
});