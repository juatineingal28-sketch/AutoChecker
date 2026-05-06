// src/components/omr/OMRSheetRenderer.tsx
// ─── OMR Sheet Renderer ───────────────────────────────────────────────────────
// Renders a pixel-accurate preview of the OMR answer sheet inside the app.
// Used by OMRSheetPreviewScreen to show the sheet before printing.
//
// The layout constants here are the source of truth; omrImageProcessor.ts
// mirrors these fractions to locate bubbles during scanning.

import React from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { OMR_CONFIG, OMROption, OMRSheetMeta } from '../../constants/omrConfig';

// ─── Props ────────────────────────────────────────────────────────────────────

interface OMRSheetRendererProps {
  meta:           OMRSheetMeta;
  /** Scale factor applied to the whole sheet (default 1). Use 0.44 for preview. */
  scale?:         number;
  /** Render with white background card (default false). */
  showBackground?: boolean;
  /**
   * Optional map of pre-filled answers to highlight (e.g. for review mode).
   * Key = question number (1-based), value = selected option.
   */
  filled?:        Record<number, OMROption>;
}

// ─── Layout constants (must mirror omrImageProcessor LAYOUT object) ───────────

/** Page dimensions in logical pixels (A4 @ 96 dpi equivalent). */
const PAGE_W = 794;
const PAGE_H = 1123;

const BUBBLE_SIZE    = 20;   // diameter px
const BUBBLE_MARGIN  = 6;    // horizontal gap between bubbles
const Q_NUM_WIDTH    = 34;   // width of question-number label
const ROW_HEIGHT     = 26;   // px per question row
const GRID_TOP       = 264;  // y where answer rows start
const COL_LEFT       = [16, PAGE_W / 2 + 8] as const; // x start of each column

// ─── Component ────────────────────────────────────────────────────────────────

export default function OMRSheetRenderer({
  meta,
  scale        = 1,
  showBackground = false,
  filled        = {},
}: OMRSheetRendererProps) {
  const totalQ = meta.totalQuestions ?? OMR_CONFIG.TOTAL_QUESTIONS;

  // Split questions into two columns
  const half   = Math.ceil(totalQ / 2);
  const col1Qs = Array.from({ length: half }, (_, i) => i + 1);
  const col2Qs = Array.from({ length: totalQ - half }, (_, i) => half + i + 1);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ alignItems: 'center', paddingVertical: 8 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Outer scale wrapper */}
      <View style={{ transform: [{ scale }], transformOrigin: 'top center' }}>
        <View
          style={[
            styles.page,
            showBackground && styles.pageShadow,
          ]}
        >
          {/* ── Corner markers ────────────────────────────────────────── */}
          <View style={[styles.corner, styles.cTL]} />
          <View style={[styles.corner, styles.cTR]} />
          <View style={[styles.corner, styles.cBL]} />
          <View style={[styles.corner, styles.cBR]} />

          {/* ── Header ───────────────────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View>
                <Text style={styles.appName}>AutoChecker</Text>
                <Text style={styles.sheetLabel}>BUBBLE ANSWER SHEET</Text>
              </View>
              <View style={styles.qrBox}>
                <Text style={styles.qrText}>QR</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.fieldRow}>
              <FieldLine label="Name" value={meta.studentName} flex={2} />
              <FieldLine label="Student ID" value={meta.studentId} flex={1.2} />
            </View>

            <View style={styles.fieldRow}>
              <FieldLine label="Subject" value={meta.subject} flex={2} />
              <FieldLine label="Section" value={meta.section} flex={1.2} />
              <FieldLine label="Date" value={meta.date} flex={0.9} />
            </View>

            <View style={styles.titleRow}>
              <Text style={styles.testTitle}>{meta.testTitle}</Text>
              {meta.examId ? (
                <Text style={styles.examId}>ID: {meta.examId}</Text>
              ) : null}
            </View>
          </View>

          {/* ── Instructions ─────────────────────────────────────────── */}
          <View style={styles.instructions}>
            <Text style={styles.instructionsText}>
              DIRECTIONS: Use a BLACK ballpen. Shade only ONE circle per item COMPLETELY.
              Erase cleanly for corrections. Do NOT bend or fold this sheet.
            </Text>
          </View>

          {/* ── Answer grid ──────────────────────────────────────────── */}
          <View style={styles.gridRow}>
            <BubbleColumn questions={col1Qs} filled={filled} />
            <View style={styles.colDivider} />
            <BubbleColumn questions={col2Qs} filled={filled} />
          </View>

          {/* ── Footer ───────────────────────────────────────────────── */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>AutoChecker © {new Date().getFullYear()}</Text>
            <Text style={styles.footerText}>
              Total Items: {totalQ}{meta.examId ? ` · Exam ID: ${meta.examId}` : ''}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLine({ label, value, flex }: { label: string; value: string; flex: number }) {
  return (
    <View style={{ flex, marginHorizontal: 3 }}>
      <Text style={styles.fieldLabel}>{label.toUpperCase()}</Text>
      <View style={styles.fieldLine}>
        <Text style={styles.fieldValue}>{value}</Text>
      </View>
    </View>
  );
}

function BubbleColumn({
  questions,
  filled,
}: {
  questions: number[];
  filled:    Record<number, OMROption>;
}) {
  return (
    <View style={{ flex: 1 }}>
      {/* Column header */}
      <View style={styles.colHeader}>
        <Text style={[styles.colHeaderText, { width: Q_NUM_WIDTH }]}>No.</Text>
        {OMR_CONFIG.OPTIONS.map((opt: OMROption) => (
          <Text key={opt} style={styles.colHeaderOpt}>{opt}</Text>
        ))}
      </View>

      {/* Question rows */}
      {questions.map((qNum) => (
        <View key={qNum} style={styles.qRow}>
          <Text style={styles.qNum}>{String(qNum).padStart(2, '0')}.</Text>
          {OMR_CONFIG.OPTIONS.map((opt: OMROption) => {
            const isFilled = filled[qNum] === opt;
            return (
              <View
                key={opt}
                style={[styles.bubble, isFilled && styles.bubbleFilled]}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    width:           PAGE_W,
    minHeight:       PAGE_H,
    backgroundColor: '#fff',
    padding:         24,
    position:        'relative',
  },
  pageShadow: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius:  8,
    elevation:     6,
  },

  // Corner markers
  corner: { position: 'absolute', width: 20, height: 20, backgroundColor: '#000' },
  cTL: { top: 8,  left: 8  },
  cTR: { top: 8,  right: 8 },
  cBL: { bottom: 8, left: 8  },
  cBR: { bottom: 8, right: 8 },

  // Header
  header:    { marginBottom: 8 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  appName:   { fontSize: 22, fontWeight: '900', letterSpacing: 2, color: '#000' },
  sheetLabel:{ fontSize: 8, fontWeight: '700', letterSpacing: 3, color: '#333', marginTop: 2 },
  qrBox:     { width: 62, height: 62, borderWidth: 2, borderColor: '#000', alignItems: 'center', justifyContent: 'center' },
  qrText:    { fontSize: 8, color: '#999', fontWeight: '700' },

  divider:   { height: 1, backgroundColor: '#ccc', marginVertical: 5 },

  fieldRow:   { flexDirection: 'row', marginBottom: 5 },
  fieldLabel: { fontSize: 7, fontWeight: '700', letterSpacing: 1, color: '#444', marginBottom: 2, textTransform: 'uppercase' },
  fieldLine:  { borderBottomWidth: 1, borderBottomColor: '#000', minHeight: 18, paddingBottom: 2 },
  fieldValue: { fontSize: 10, fontWeight: '600', color: '#000' },

  titleRow:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 },
  testTitle: { fontSize: 11, fontWeight: '700', color: '#000' },
  examId:    { fontSize: 7, color: '#999' },

  // Instructions
  instructions: {
    backgroundColor: '#F3F4F6',
    borderWidth:      0.5,
    borderColor:      '#ccc',
    borderRadius:     3,
    padding:          6,
    marginBottom:     10,
  },
  instructionsText: { fontSize: 7.5, color: '#333', textAlign: 'center', lineHeight: 12 },

  // Grid
  gridRow:    { flexDirection: 'row', gap: 0 },
  colDivider: { width: 1, backgroundColor: '#ccc', marginHorizontal: 8 },

  colHeader:    { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 0.5, borderBottomColor: '#999', marginBottom: 3, paddingBottom: 2 },
  colHeaderText:{ fontSize: 7, fontWeight: '700', color: '#444' },
  colHeaderOpt: { width: BUBBLE_SIZE + BUBBLE_MARGIN * 2, textAlign: 'center', fontSize: 7, fontWeight: '700', color: '#111' },

  qRow:  { flexDirection: 'row', alignItems: 'center', height: ROW_HEIGHT },
  qNum:  { width: Q_NUM_WIDTH, fontSize: 7.5, fontWeight: '700', color: '#111' },
  bubble: {
    width:        BUBBLE_SIZE,
    height:       BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    borderWidth:  1.5,
    borderColor:  '#111',
    backgroundColor: '#fff',
    marginHorizontal: BUBBLE_MARGIN,
  },
  bubbleFilled: { backgroundColor: '#111' },

  // Footer
  footer:     { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#ccc' },
  footerText: { fontSize: 6.5, color: '#999' },
});