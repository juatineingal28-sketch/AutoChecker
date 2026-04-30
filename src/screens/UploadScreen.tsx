// src/screens/UploadScreen.tsx

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
};

const ALLOWED_EXTENSIONS  = ['pdf', 'jpg', 'jpeg', 'png', 'xls', 'xlsx'];
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

// ─── Mock parser (replace with real OCR/parse logic) ─────────────────────────

async function parseAnswerKeyFromFile(_file: UploadedFile): Promise<AnswerKeyItem[]> {
  await new Promise<void>(r => setTimeout(() => r(), 1800));
  return [
    { id: '1', number: 1, type: 'multiple_choice', answer: 'B',              points: 1, choices: ['A','B','C','D'] },
    { id: '2', number: 2, type: 'true_or_false',   answer: 'true',           points: 1 },
    { id: '3', number: 3, type: 'omr_bubble',      answer: 'A',              points: 1, choices: ['A','B','C','D'] },
    { id: '4', number: 4, type: 'identification',  answer: 'photosynthesis', points: 2 },
    { id: '5', number: 5, type: 'enumeration',     answer: 'mitosis,meiosis',points: 2 },
  ];
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

      {answerKey.length > 0 && (
        <View style={fc.pillRow}>
          {Object.entries(
            answerKey.reduce<Record<string, number>>((acc, q) => {
              acc[q.type] = (acc[q.type] ?? 0) + 1;
              return acc;
            }, {})
          ).map(([type, count]) => (
            <View key={type} style={fc.pill}>
              <Text style={fc.pillTxt}>{count} {type.replace(/_/g, ' ')}</Text>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={fc.replaceBtn} onPress={onReplace} activeOpacity={0.7}>
        <Ionicons name="refresh-outline" size={14} color={COLORS.primaryMid} />
        <Text style={fc.replaceTxt}>Replace Answer Key</Text>
      </TouchableOpacity>
    </View>
  );
}

const fc = StyleSheet.create({
  wrap:       { backgroundColor: '#F0FDF4', borderRadius: 14, borderWidth: 1.5, borderColor: COLORS.accent, padding: 14, gap: 10 },
  row:        { flexDirection: 'row', alignItems: 'center', gap: 12 },
  typeBox:    { width: 50, height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 2 },
  typeLabel:  { fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  details:    { flex: 1 },
  name:       { fontSize: 14, fontWeight: '700', color: COLORS.text, marginBottom: 3 },
  metaRow:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3 },
  metaTxt:    { fontSize: 11, color: COLORS.textMuted },
  dot:        { fontSize: 11, color: COLORS.textMuted },
  keyInfo:    { fontSize: 11, color: COLORS.accent, fontWeight: '600' },
  trashBtn:   { padding: 4 },
  pillRow:    { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill:       { backgroundColor: COLORS.surface, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: COLORS.borderGreen },
  pillTxt:    { fontSize: 10, fontWeight: '600', color: COLORS.primaryMid, textTransform: 'capitalize' },
  replaceBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', backgroundColor: COLORS.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: COLORS.borderGreen },
  replaceTxt: { fontSize: 12, fontWeight: '600', color: COLORS.primaryMid },
});

// ─── Tip Row ──────────────────────────────────────────────────────────────────

function TipRow({ icon, text, color }: { icon: string; text: string; color?: string }) {
  return (
    <View style={tip.row}>
      <View style={[tip.iconBox, { backgroundColor: color ? `${color}15` : COLORS.accentLight }]}>
        <Ionicons name={icon as any} size={14} color={color ?? COLORS.accent} />
      </View>
      <Text style={tip.txt}>{text}</Text>
    </View>
  );
}

const tip = StyleSheet.create({
  row:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  iconBox: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txt:     { fontSize: 12, color: COLORS.textLight, lineHeight: 18, flex: 1 },
});

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  // ✅ FIX: callback returns void explicitly — matches strict mode requirement
  onKeyReady?:      (file: UploadedFile, answerKey: AnswerKeyItem[]) => void;
  initialFile?:     UploadedFile | null;
  initialAnswerKey?: AnswerKeyItem[];
}

export default function UploadScreen({
  onKeyReady,
  initialFile     = null,
  initialAnswerKey = [],
}: Props) {
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(initialFile);
  const [answerKey,    setAnswerKey]    = useState<AnswerKeyItem[]>(initialAnswerKey);
  const [uploading,    setUploading]    = useState(false);
  const [parsing,      setParsing]      = useState(false);
  const [uploadStep,   setUploadStep]   = useState<'idle' | 'uploading' | 'parsing' | 'done'>('idle');

  const progressAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim     = useRef(new Animated.Value(0)).current;

  const isReady = !!uploadedFile && answerKey.length > 0;

  // ── Animate progress bar ──────────────────────────────────────────────────

  const animateProgress = (toValue: number, duration = 600): Promise<void> =>
    new Promise<void>(resolve =>
      Animated.timing(progressAnim, {
        toValue, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false,
      }).start(() => resolve())
    );

  const fadeIn = () =>
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();

  // ── Validate file ─────────────────────────────────────────────────────────

  const validateFile = (name: string, size?: number): string | null => {
    const ext = getFileExt(name);
    if (!ALLOWED_EXTENSIONS.includes(ext))
      return `"${ext.toUpperCase()}" is not supported.\nPlease use PDF, JPG, PNG, XLS, or XLSX.`;
    if (size && size > MAX_FILE_SIZE_MB * 1024 * 1024)
      return `File is too large (${formatBytes(size)}).\nMaximum allowed size is ${MAX_FILE_SIZE_MB} MB.`;
    return null;
  };

  // ── Pick file ─────────────────────────────────────────────────────────────

  const handlePickFile = async (): Promise<void> => {
    try {
      setUploading(true);
      setUploadStep('uploading');
      progressAnim.setValue(0);
      fadeAnim.setValue(0);

      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'image/*',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) {
        setUploading(false);
        setUploadStep('idle');
        return;
      }

      const file = result.assets[0];

      const err = validateFile(file.name, file.size);
      if (err) {
        Alert.alert('Invalid File', err);
        setUploading(false);
        setUploadStep('idle');
        return;
      }

      await animateProgress(0.45, 400);

      const uploaded: UploadedFile = {
        name:       file.name,
        uri:        file.uri,
        mimeType:   file.mimeType,
        size:       file.size,
        uploadedAt: new Date(),
      };

      setUploadedFile(uploaded);
      await animateProgress(0.7, 300);

      setUploading(false);
      setParsing(true);
      setUploadStep('parsing');

      const key = await parseAnswerKeyFromFile(uploaded);
      await animateProgress(1, 300);

      setAnswerKey(key);
      setParsing(false);
      setUploadStep('done');
      fadeIn();

      // ✅ FIX: onKeyReady is (file, key) => void — call with both args, return nothing
      onKeyReady?.(uploaded, key);

      Alert.alert(
        '✓ Answer Key Ready',
        `"${file.name}" parsed successfully.\n${key.length} question(s) loaded.`,
        [{ text: 'OK' }],
      );
    } catch (error: unknown) {
      // ✅ FIX: catch param typed as unknown (strict mode requirement)
      setUploading(false);
      setParsing(false);
      setUploadStep('idle');
      const message = error instanceof Error ? error.message : 'Could not open the file picker.';
      Alert.alert('Upload Failed', `${message} Please try again.`);
    }
  };

  // ── Remove file ───────────────────────────────────────────────────────────

  const handleRemoveFile = (): void => {
    Alert.alert(
      'Remove Answer Key',
      'The scanner will be locked until a new answer key is uploaded.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: () => {
            setUploadedFile(null);
            setAnswerKey([]);
            setUploadStep('idle');
            progressAnim.setValue(0);
            fadeAnim.setValue(0);
          },
        },
      ]
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const isLoading = uploading || parsing;
  const loadLabel = uploading ? 'Uploading file…' : 'Reading answer key…';

  return (
    <SafeAreaView style={s.container}>
      {/* ── Top Bar ── */}
      <View style={s.topBar}>
        <View style={s.topBarLeft}>
          <View style={s.logoBox}>
            <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
          </View>
          <View>
            <Text style={s.appName}>Upload Answer Key</Text>
            <Text style={s.appTagline}>PDF · JPG · PNG · XLS · XLSX</Text>
          </View>
        </View>
        {isReady && (
          <View style={s.readyBadge}>
            <View style={s.readyDot} />
            <Text style={s.readyTxt}>READY</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Step 1: Upload Zone ── */}
        <View style={s.card}>
          <View style={s.cardHeader}>
            <View style={s.stepNum}>
              <Text style={s.stepNumTxt}>1</Text>
            </View>
            <Text style={s.cardTitle}>Select Answer Key File</Text>
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
                  <ActivityIndicator color={COLORS.primary} size="large" />
                  <Text style={s.loadingLabel}>{loadLabel}</Text>
                  <ProgressBar progress={progressAnim} />
                </View>
              ) : (
                <>
                  <View style={s.uploadIconRing}>
                    <Ionicons name="cloud-upload-outline" size={32} color={COLORS.primary} />
                  </View>
                  <Text style={s.dropTitle}>Tap to select file</Text>
                  <Text style={s.dropSub}>PDF, JPG, PNG, XLS, or XLSX — max {MAX_FILE_SIZE_MB} MB</Text>
                  <View style={s.formatPills}>
                    {['PDF', 'JPG', 'PNG', 'XLS', 'XLSX'].map(f => (
                      <View key={f} style={s.pill}>
                        <Text style={s.pillTxt}>{f}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </TouchableOpacity>
          ) : (
            <Animated.View style={{ opacity: fadeAnim || 1 }}>
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
          <TipRow icon="document-text-outline" text="Use a PDF with clearly labeled question numbers and answers (e.g. '1. B', '2. True')." />
          <TipRow icon="image-outline"          text="For images, ensure good lighting and no skew. 300 DPI or higher recommended." />
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
  scroll:    { padding: 16, paddingBottom: 40 },

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