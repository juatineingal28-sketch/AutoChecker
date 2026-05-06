// src/screens/UploadScreen.tsx
// ─── UPDATED: Integrated real parseAnswerKey parser ───────────────────────────
// Replaces the mock `parseAnswerKeyFromFile` with real section-aware parsing.
// Supports pasted text, .txt files, and .docx (via extracted text).
// All other UI logic and styles are preserved exactly.

import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated, Easing,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

// ─── Parser import ────────────────────────────────────────────────────────────
import { parseAnswerKey, type ParseResult } from '../utils/parseAnswerKey';

// ─── Types ────────────────────────────────────────────────────────────────────

export type QuestionType =
  | 'identification' | 'multiple_choice' | 'omr_bubble'
  | 'enumeration' | 'true_or_false' | 'omr_shading';

export interface AnswerKeyItem {
  id:       string;
  number:   number;
  type:     QuestionType;
  answer:   string;
  choices?: string[];
  points:   number;
}

export interface UploadedFile {
  name:        string;
  uri:         string;
  mimeType?:   string;
  size?:       number;
  uploadedAt:  Date;
}

// ─── Design Tokens ────────────────────────────────────────────────────────────

const COLORS = {
  primary:      '#065F46',
  primaryMid:   '#047857',
  accent:       '#10B981',
  accentLight:  '#D1FAE5',
  bg:           '#F0FDF4',
  surface:      '#FFFFFF',
  text:         '#111827',
  textLight:    '#6B7280',
  textMuted:    '#9CA3AF',
  border:       '#E5E7EB',
  borderGreen:  '#A7F3D0',
  error:        '#EF4444',
  errorLight:   '#FEE2E2',
  disabled:     '#D1D5DB',
  warning:      '#F59E0B',
  warningLight: '#FEF3C7',
};

const FILE_TYPE_META: Record<string, { icon: string; color: string; bg: string; label: string }> = {
  pdf:  { icon: 'document-text', color: '#DC2626', bg: '#FEF2F2', label: 'PDF'  },
  jpg:  { icon: 'image',         color: '#7C3AED', bg: '#F5F3FF', label: 'JPG'  },
  jpeg: { icon: 'image',         color: '#7C3AED', bg: '#F5F3FF', label: 'JPEG' },
  png:  { icon: 'image-outline', color: '#2563EB', bg: '#EFF6FF', label: 'PNG'  },
  xls:  { icon: 'grid',          color: '#16A34A', bg: '#F0FDF4', label: 'XLS'  },
  xlsx: { icon: 'grid',          color: '#16A34A', bg: '#F0FDF4', label: 'XLSX' },
  txt:  { icon: 'document-text-outline', color: '#6B7280', bg: '#F3F4F6', label: 'TXT' },
  docx: { icon: 'document-text', color: '#2563EB', bg: '#EFF6FF', label: 'DOCX' },
};

const ALLOWED_EXTENSIONS  = ['pdf', 'jpg', 'jpeg', 'png', 'xls', 'xlsx', 'txt', 'docx'];
const MAX_FILE_SIZE_MB     = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFileExt(name: string): string {
  return (name.split('.').pop() ?? '').toLowerCase();
}

function getFileMeta(name: string) {
  const ext = getFileExt(name);
  return (
    FILE_TYPE_META[ext] ?? {
      icon: 'document', color: COLORS.textLight, bg: '#F3F4F6', label: ext.toUpperCase(),
    }
  );
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTime(date: Date): string {
  return date.toLocaleString('en-PH', {
    month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── ExamType → QuestionType bridge ──────────────────────────────────────────

/**
 * Maps the parser's SectionType (= ExamType) to the legacy QuestionType
 * used by AnswerKeyItem so the rest of the app stays compatible.
 */
function sectionTypeToQuestionType(
  sectionType: string,
): QuestionType {
  switch (sectionType) {
    case 'bubble_omr':      return 'omr_bubble';
    case 'multiple_choice': return 'multiple_choice';
    case 'identification':  return 'identification';
    case 'enumeration':     return 'enumeration';
    case 'true_or_false':   return 'true_or_false';
    default:                return 'identification';
  }
}

// ─── File Text Extractor ──────────────────────────────────────────────────────

const BACKEND_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

/**
 * Sends a file to the backend /api/extract-text endpoint
 * and returns the plain text content.
 * Works for .docx, .txt, and .pdf files.
 */
async function extractTextFromFile(file: UploadedFile): Promise<string | null> {
  const ext = getFileExt(file.name);

  if (!['txt', 'docx', 'doc', 'pdf'].includes(ext)) return null;

  const formData = new FormData();
  formData.append('file', {
    uri:  file.uri,
    name: file.name,
    type: file.mimeType ?? 'application/octet-stream',
  } as any);

  const response = await fetch(`${BACKEND_URL}/api/extract-text`, {
    method: 'POST',
    body:   formData,
  });

  const json = await response.json();

  if (!json.success) {
    throw new Error(json.error ?? 'Failed to extract text from file.');
  }

  return json.text as string;
}

// ─── Real Answer Key Parser (replaces mock) ───────────────────────────────────

/**
 * Converts a ParseResult into AnswerKeyItem[] for display.
 * Uses section metadata when available (teacher format),
 * falls back to 'identification' type for legacy format entries.
 */
function buildAnswerKeyItems(result: ParseResult): AnswerKeyItem[] {
  if (!result.success || !result.data) return [];

  const { sections, flat } = result.data;
  const items: AnswerKeyItem[] = [];

  if (sections.length > 0) {
    // Teacher format: we know exact types per section
    for (const section of sections) {
      const qType = sectionTypeToQuestionType(section.sectionType);
      const isChoice = section.sectionType === 'bubble_omr' ||
                       section.sectionType === 'multiple_choice';

      section.answers.forEach((answer, idx) => {
        const globalNum = section.startIndex + idx;
        items.push({
          id:      String(globalNum),
          number:  globalNum,
          type:    qType,
          answer,
          points:  1,
          choices: isChoice ? ['A', 'B', 'C', 'D'] : undefined,
        });
      });
    }
  } else {
    // Legacy format: type unknown — default to identification
    Object.entries(flat).forEach(([num, answer]) => {
      const n = parseInt(num, 10);
      items.push({
        id:     num,
        number: n,
        type:   'identification',
        answer,
        points: 1,
      });
    });
  }

  return items.sort((a, b) => a.number - b.number);
}

async function parseAnswerKeyFromFile(file: UploadedFile): Promise<AnswerKeyItem[]> {
  const ext = getFileExt(file.name);

  if (['txt', 'docx', 'doc', 'pdf'].includes(ext)) {
    const text = await extractTextFromFile(file);

    if (!text) throw new Error('Could not extract text from file.');

    const result = parseAnswerKey(text);

    if (!result.success) {
      const msg = result.errors.map(e => e.message).join('\n');
      throw new Error(`Answer key parse errors:\n${msg}`);
    }

    return buildAnswerKeyItems(result);
  }

  // Images / Excel — require OCR/backend processing
  await new Promise<void>(r => setTimeout(r, 800));
  throw new Error(
    `${ext.toUpperCase()} files are not supported for answer key upload. ` +
    'Please upload a .docx, .txt, or .pdf file.',
  );
}

/**
 * Parses a pasted text answer key directly (no file upload).
 * Call this when the teacher pastes text into a TextInput.
 */
export function parsePastedAnswerKey(text: string): {
  items: AnswerKeyItem[];
  warnings: string[];
  errors: string[];
} {
  const result = parseAnswerKey(text);

  if (!result.success) {
    return {
      items:    [],
      warnings: result.warnings,
      errors:   result.errors.map(e => e.message),
    };
  }

  return {
    items:    buildAnswerKeyItems(result),
    warnings: result.warnings,
    errors:   [],
  };
}

// ─── Upload Progress Bar ──────────────────────────────────────────────────────

function ProgressBar({ progress }: { progress: Animated.Value }) {
  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={pb.track}>
      <Animated.View style={[pb.fill, { width }]} />
    </View>
  );
}

const pb = StyleSheet.create({
  track: { height: 6, backgroundColor: COLORS.accentLight, borderRadius: 3, overflow: 'hidden', marginTop: 10 },
  fill:  { height: '100%', backgroundColor: COLORS.accent, borderRadius: 3 },
});

// ─── File Preview Card ────────────────────────────────────────────────────────

interface FileCardProps {
  file:      UploadedFile;
  answerKey: AnswerKeyItem[];
  onReplace: () => void;
  onRemove:  () => void;
}

function FileCard({ file, answerKey, onReplace, onRemove }: FileCardProps) {
  const meta     = getFileMeta(file.name);
  const totalPts = answerKey.reduce((s, q) => s + q.points, 0);

  // Group answers by type for the pill display
  const typeCounts = answerKey.reduce<Record<string, number>>((acc, q) => {
    acc[q.type] = (acc[q.type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <View style={fc.wrap}>
      <View style={fc.row}>
        <View style={[fc.typeBox, { backgroundColor: meta.bg }]}>
          <Ionicons name={meta.icon as any} size={22} color={meta.color} />
          <Text style={[fc.typeLabel, { color: meta.color }]}>{meta.label}</Text>
        </View>

        <View style={fc.details}>
          <Text style={fc.name} numberOfLines={1}>{file.name}</Text>
          <View style={fc.metaRow}>
            <Ionicons name="document-outline" size={11} color={COLORS.textMuted} />
            <Text style={fc.metaTxt}>{formatBytes(file.size)}</Text>
            <Text style={fc.dot}>·</Text>
            <Ionicons name="time-outline" size={11} color={COLORS.textMuted} />
            <Text style={fc.metaTxt}>{formatTime(file.uploadedAt)}</Text>
          </View>
          {answerKey.length > 0 && (
            <Text style={fc.keyInfo}>{answerKey.length} questions · {totalPts} pts total</Text>
          )}
        </View>

        <TouchableOpacity
          onPress={onRemove}
          style={fc.trashBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="trash-outline" size={19} color={COLORS.error} />
        </TouchableOpacity>
      </View>

      {answerKey.length > 0 && Object.keys(typeCounts).length > 0 && (
        <View style={fc.pillRow}>
          {Object.entries(typeCounts).map(([type, count]) => (
            <View key={type} style={fc.pill}>
              <Text style={fc.pillTxt}>
                {type.replace(/_/g, ' ')} × {count}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const fc = StyleSheet.create({
  wrap:      { backgroundColor: COLORS.bg, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: COLORS.borderGreen },
  row:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  typeBox:   { width: 48, borderRadius: 10, paddingVertical: 6, alignItems: 'center', gap: 2 },
  typeLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  details:   { flex: 1 },
  name:      { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  metaRow:   { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  metaTxt:   { fontSize: 11, color: COLORS.textMuted },
  dot:       { fontSize: 11, color: COLORS.textMuted },
  keyInfo:   { fontSize: 11, color: COLORS.primary, fontWeight: '600', marginTop: 3 },
  trashBtn:  { padding: 4 },
  pillRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  pill:      { backgroundColor: COLORS.surface, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, borderWidth: 1, borderColor: COLORS.border },
  pillTxt:   { fontSize: 10, fontWeight: '700', color: COLORS.textLight },
});

// ─── Tip Row ──────────────────────────────────────────────────────────────────

function TipRow({ icon, text, color }: { icon: string; text: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
      <Ionicons name={icon as any} size={14} color={color ?? COLORS.textMuted} style={{ marginTop: 1 }} />
      <Text style={{ fontSize: 12, color: COLORS.textLight, flex: 1, lineHeight: 17 }}>{text}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function UploadScreen() {
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [answerKey,    setAnswerKey]    = useState<AnswerKeyItem[]>([]);
  const [isLoading,    setIsLoading]    = useState(false);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  const progress = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const isReady = uploadedFile !== null && answerKey.length > 0;

  const animateProgress = () => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue:         0.85,
      duration:        1400,
      easing:          Easing.out(Easing.quad),
      useNativeDriver: false,
    }).start();
  };

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'image/*',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'text/plain',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const ext   = getFileExt(asset.name);

      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        Alert.alert(
          'Unsupported File',
          `".${ext}" files are not supported.\nAllowed: ${ALLOWED_EXTENSIONS.join(', ').toUpperCase()}`,
        );
        return;
      }

      const sizeMB = (asset.size ?? 0) / (1024 * 1024);
      if (sizeMB > MAX_FILE_SIZE_MB) {
        Alert.alert('File Too Large', `Max file size is ${MAX_FILE_SIZE_MB} MB.`);
        return;
      }

      const file: UploadedFile = {
        name:       asset.name,
        uri:        asset.uri,
        mimeType:   asset.mimeType,
        size:       asset.size,
        uploadedAt: new Date(),
      };

      setIsLoading(true);
      setUploadedFile(file);
      setAnswerKey([]);
      setParseWarnings([]);
      animateProgress();

      try {
        const items = await parseAnswerKeyFromFile(file);

        Animated.timing(progress, {
          toValue: 1, duration: 300,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        }).start();

        setAnswerKey(items);
        fadeAnim.setValue(0);
        Animated.timing(fadeAnim, {
          toValue: 1, duration: 500,
          useNativeDriver: true,
        }).start();
      } catch (err: any) {
        Alert.alert('Parse Error', err?.message ?? 'Could not parse the answer key.');
        setUploadedFile(null);
      }
    } catch (err: any) {
      if (err?.code !== 'DOCUMENT_PICKER_CANCELED') {
        Alert.alert('Upload Failed', err?.message ?? 'An unexpected error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    setAnswerKey([]);
    setParseWarnings([]);
    progress.setValue(0);
  };

  return (
    <SafeAreaView style={s.container}>
      {/* ── Top Bar ── */}
      <View style={s.topBar}>
        <View style={s.topBarLeft}>
          <View style={s.logoBox}>
            <Ionicons name="scan-outline" size={20} color="#fff" />
          </View>
          <View>
            <Text style={s.appName}>AutoChecker</Text>
            <Text style={s.appTagline}>Answer Key Upload</Text>
          </View>
        </View>
        {isReady && (
          <View style={s.readyBadge}>
            <View style={s.readyDot} />
            <Text style={s.readyTxt}>READY</Text>
          </View>
        )}
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* ── Step 1: Upload ── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={[s.stepNum, s.stepNumActive]}>
              <Text style={[s.stepNumTxt, s.stepNumTxtActive]}>1</Text>
            </View>
            <Text style={s.cardTitle}>Upload Answer Key</Text>
          </View>

          {!uploadedFile ? (
            <TouchableOpacity
              style={[s.dropZone, isLoading && s.dropZoneLoading]}
              onPress={handlePickFile}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              {isLoading ? (
                <View style={s.loadingState}>
                  <ActivityIndicator size="large" color={COLORS.accent} />
                  <Text style={s.loadingLabel}>Parsing answer key…</Text>
                  <ProgressBar progress={progress} />
                </View>
              ) : (
                <>
                  <View style={s.uploadIconRing}>
                    <Ionicons name="cloud-upload-outline" size={28} color={COLORS.primary} />
                  </View>
                  <Text style={s.dropTitle}>Tap to upload answer key</Text>
                  <Text style={s.dropSub}>Supports PDF, Image, Excel, TXT, DOCX</Text>
                  <View style={s.formatPills}>
                    {['PDF', 'JPG', 'PNG', 'XLS', 'TXT', 'DOCX'].map(f => (
                      <View key={f} style={s.pill}>
                        <Text style={s.pillTxt}>{f}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <Animated.View style={{ opacity: fadeAnim }}>
              <FileCard
                file={uploadedFile}
                answerKey={answerKey}
                onReplace={handlePickFile}
                onRemove={handleRemoveFile}
              />
            </Animated.View>
          )}

          <TouchableOpacity
            style={[s.primaryBtn, isLoading && s.primaryBtnDisabled]}
            onPress={handlePickFile}
            disabled={isLoading}
            activeOpacity={0.8}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <>
                <Ionicons
                  name={isReady ? 'refresh-outline' : 'cloud-upload-outline'}
                  size={18} color="#fff"
                />
                <Text style={s.primaryBtnTxt}>
                  {isReady ? 'Replace Answer Key' : 'Upload Answer Key'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* ── Parse Warnings ── */}
        {parseWarnings.length > 0 && (
          <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: COLORS.warning }]}>
            <View style={s.cardHeader}>
              <Ionicons name="warning-outline" size={16} color={COLORS.warning} />
              <Text style={[s.cardTitle, { color: COLORS.warning }]}>Parse Warnings</Text>
            </View>
            {parseWarnings.map((w, i) => (
              <Text key={i} style={{ fontSize: 12, color: COLORS.textLight, marginBottom: 4 }}>• {w}</Text>
            ))}
          </View>
        )}

        {/* ── Step 2: Key Preview ── */}
        {isReady && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <View style={[s.stepNum, s.stepNumActive]}>
                <Text style={[s.stepNumTxt, s.stepNumTxtActive]}>2</Text>
              </View>
              <Text style={s.cardTitle}>Answer Key Preview</Text>
            </View>

            <View style={s.summaryRow}>
              {[
                { value: answerKey.length,                                    label: 'Questions', color: COLORS.primary },
                { value: answerKey.reduce((sum, q) => sum + q.points, 0),     label: 'Total Pts', color: COLORS.accent },
                { value: new Set(answerKey.map(q => q.type)).size,            label: 'Types',     color: COLORS.warning },
              ].map(stat => (
                <View key={stat.label} style={s.statBox}>
                  <Text style={[s.statNum, { color: stat.color }]}>{stat.value}</Text>
                  <Text style={s.statLbl}>{stat.label}</Text>
                </View>
              ))}
            </View>

            <ScrollView style={s.previewList} nestedScrollEnabled>
              {answerKey.map((item, idx) => (
                <View
                  key={item.id}
                  style={[s.previewRow, idx === answerKey.length - 1 && { borderBottomWidth: 0 }]}
                >
                  <View style={s.previewNum}>
                    <Text style={s.previewNumTxt}>{item.number}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.previewType}>{item.type.replace(/_/g, ' ')}</Text>
                  </View>
                  <View style={s.previewAnswer}>
                    <Text style={s.previewAnswerTxt} numberOfLines={1}>{item.answer}</Text>
                  </View>
                  <Text style={s.previewPts}>{item.points}pt</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Tips Card ── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Ionicons name="bulb-outline" size={16} color={COLORS.warning} />
            <Text style={[s.cardTitle, { color: COLORS.textLight }]}>Tips for best results</Text>
          </View>
          <TipRow icon="document-text-outline" text="Paste or upload a .txt file with section headers like 'Multiple Choice:' and numbered answers — e.g. '1. B'." />
          <TipRow icon="list-outline"          text="Sections supported: Multiple Choice, Bubble OMR, Identification, Enumeration, True or False." />
          <TipRow icon="image-outline"          text="For images and PDFs, ensure good lighting and no skew. 300 DPI or higher recommended." />
          <TipRow icon="grid-outline"           color={COLORS.warning} text="Excel files: use column A for question numbers, column B for answers." />
          <TipRow icon="lock-closed-outline"    color={COLORS.error}   text="Encrypted or password-protected files cannot be parsed." />
        </View>

        {/* ── Status Banner ── */}
        {isReady ? (
          <View style={[s.statusBanner, s.statusBannerReady]}>
            <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
            <Text style={[s.statusTxt, { color: COLORS.primary }]}>
              Scanner is unlocked — go to Scan tab to start grading.
            </Text>
          </View>
        ) : (
          <View style={[s.statusBanner, s.statusBannerWarn]}>
            <Ionicons name="lock-closed-outline" size={18} color={COLORS.warning} />
            <Text style={[s.statusTxt, { color: COLORS.warning }]}>
              Scanner is locked until an answer key is uploaded.
            </Text>
          </View>
        )}

        <View style={{ height: 48 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll:    { padding: 16 },

  topBar:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoBox:    { width: 36, height: 36, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  appName:    { fontSize: 17, fontWeight: '800', color: COLORS.text },
  appTagline: { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
  readyBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: COLORS.borderGreen },
  readyDot:   { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.accent },
  readyTxt:   { fontSize: 11, fontWeight: '700', color: COLORS.primary, letterSpacing: 0.5 },

  card: { backgroundColor: COLORS.surface, borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },

  cardHeader:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  cardTitle:        { fontSize: 15, fontWeight: '700', color: COLORS.text },
  stepNum:          { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  stepNumActive:    { backgroundColor: COLORS.primary },
  stepNumTxt:       { fontSize: 12, fontWeight: '800', color: COLORS.textMuted },
  stepNumTxtActive: { color: '#fff' },

  dropZone:        { borderWidth: 1.5, borderStyle: 'dashed', borderColor: COLORS.borderGreen, borderRadius: 14, paddingVertical: 32, alignItems: 'center', backgroundColor: '#F0FDF4', marginBottom: 12 },
  dropZoneLoading: { borderStyle: 'solid', borderColor: COLORS.accent },
  loadingState:    { width: '80%', alignItems: 'center' },
  loadingLabel:    { fontSize: 13, color: COLORS.primaryMid, fontWeight: '600', marginTop: 10 },
  uploadIconRing:  { width: 64, height: 64, borderRadius: 32, backgroundColor: '#D1FAE5', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  dropTitle:       { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  dropSub:         { fontSize: 12, color: COLORS.textMuted, marginBottom: 12 },
  formatPills:     { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  pill:            { backgroundColor: COLORS.surface, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.border },
  pillTxt:         { fontSize: 11, fontWeight: '700', color: COLORS.textLight },

  primaryBtn:         { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12 },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnTxt:      { color: '#fff', fontSize: 14, fontWeight: '700' },

  summaryRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  statBox:    { flex: 1, backgroundColor: COLORS.bg, borderRadius: 12, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  statNum:    { fontSize: 22, fontWeight: '900', marginBottom: 2 },
  statLbl:    { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },

  previewList:      { maxHeight: 220, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  previewRow:       { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, backgroundColor: COLORS.surface },
  previewNum:       { width: 28, height: 28, borderRadius: 14, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' },
  previewNumTxt:    { fontSize: 12, fontWeight: '800', color: COLORS.textLight },
  previewType:      { fontSize: 12, color: COLORS.textLight, textTransform: 'capitalize' },
  previewAnswer:    { backgroundColor: '#ECFDF5', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  previewAnswerTxt: { fontSize: 12, fontWeight: '700', color: COLORS.primary, maxWidth: 80 },
  previewPts:       { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, minWidth: 28, textAlign: 'right' },

  statusBanner:      { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 14, borderWidth: 1 },
  statusBannerReady: { backgroundColor: '#ECFDF5', borderColor: COLORS.borderGreen },
  statusBannerWarn:  { backgroundColor: COLORS.warningLight, borderColor: '#FCD34D' },
  statusTxt:         { fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 18 },
});