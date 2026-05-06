// src/screens/ScanTab.tsx
// ─── OMR + OCR AutoChecker ────────────────────────────────────────────────────
//
// KEY FIXES vs original:
//  - ExamType imported from shared types, NOT re-declared here
//  - gradeResult.correct → gradeResult.score
//  - gradeResult.details → gradeResult.breakdown (array, indexed by questionNumber)
//  - buildScanResult signature updated (accepts detectedStudentName)
//  - saveScanToSupabase called with gradeResult.score (not .correct)
//  - processedResult shape matches ScanResult type exactly
//  - [TS FIX] onStatusChange: added `if (!msg) return;` guard (msg possibly undefined)
//  - [TS FIX] setOcrConfidence / setOcrNotes: ?? fallbacks for undefined values
//  - [TS FIX] ocr_confidence / ocr_notes in Supabase payload: ?? fallbacks
//  - [TS FIX] ext from asset.name?.split — narrowed string | undefined → string via ?? ''
//  - [UI REDESIGN] Full UI layer updated to match scanner_ui_redesign.html prototype
//  - [BUG FIX] Added user_id to Supabase insert so RLS policies pass and Home/Analytics
//              can read the result; surfaced insert errors as a visible alert instead of
//              a silent console.warn that left Analytics and Home empty.
// ─────────────────────────────────────────────────────────────────────────────

import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';

import { useAuth } from '../context/AuthContext';
import { fetchAnswerKey as fetchAnswerKeyFromApi, type AnswerKeyItem } from '../services/api';
import { DEFAULT_SETTINGS, getUserSettings, type UserSettings } from '../services/settingsService';
// ── Service imports ──────────────────────────────────────────────────────────
import { saveScanResult, scanExamSheet } from '../services/scanService';
import { supabase } from '../services/supabaseScans';
import { buildScanResult, gradeAnswers } from '../utils/grading';

// Import ExamType from the single shared source of truth
import type { ExamType, GradeResult, NewScanResult, ScanResult } from '../types/exam';
import { toScanResult } from '../utils/toScanResult';

// Re-export for any legacy consumers that imported ExamType from this screen
export type { ExamType };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function apiKeyToRecord(items: AnswerKeyItem[]): Record<string, string> {
  const record: Record<string, string> = {};
  items.forEach((item) => {
    record[String(item.question)] = Array.isArray(item.answer)
      ? item.answer.join(',')
      : item.answer;
  });
  return record;
}

/** Convert GradeResult breakdown array to a question-keyed lookup */
function breakdownMap(gradeResult: GradeResult): Record<string, { correct: boolean }> {
  const map: Record<string, { correct: boolean }> = {};
  for (const entry of gradeResult.breakdown) {
    map[entry.questionNumber] = { correct: entry.correct };
  }
  return map;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RouteParams {
  sectionId?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const GREEN     = '#22C55E';
const GREEN_DIM = '#16A34A';
const YELLOW    = '#EAB308';
const WHITE     = '#FFFFFF';
const DARK      = '#0D0D0D';
const DARK2     = '#161616';
const DARK3     = '#1E1E1E';
const GRAY      = '#9CA3AF';
const GRAY_DIM  = 'rgba(255,255,255,0.12)';

const FRAME_W = SCREEN_W * 0.96;
const FRAME_H = FRAME_W * 1.55;

const EXAM_TYPE_LABELS: Record<string, string> = {
  bubble_omr:      '⬤  Bubble OMR',
  multiple_choice: '①  Multiple Choice',
  identification:  '📝  Identification',
  enumeration:     '📋  Enumeration',
  true_or_false:   '✓✗  True or False',
} satisfies Partial<Record<ExamType, string>>;

const EXAM_TYPE_SHORT: Record<string, string> = {
  bubble_omr:      'Bubble OMR',
  multiple_choice: 'MC',
  identification:  'ID',
  enumeration:     'Enum',
  true_or_false:   'T/F',
} satisfies Partial<Record<ExamType, string>>;

// ─── Exam-type validation ─────────────────────────────────────────────────────

const EXAM_TYPE_HINTS: Record<string, string> = {
  bubble_omr:      'filled bubble circles (OMR sheet)',
  multiple_choice: 'letter choices written in boxes or blanks (A / B / C / D)',
  identification:  'written words or phrases as answers',
  enumeration:     'a numbered list of written items',
  true_or_false:   'True or False written answers (T / F or True / False)',
} satisfies Partial<Record<ExamType, string>>;

function validateAnswersMatchType(
  answers: Record<string, string>,
  examType: ExamType,
): { valid: boolean; reason: string } {
  const values = Object.values(answers).filter(v => v && v !== '?' && v !== '—');
  if (values.length === 0) {
    return { valid: false, reason: 'No answers could be read from the sheet.' };
  }

  const singleLetterCount = values.filter(v => /^[A-Ea-e]$/.test(v.trim())).length;
  const singleLetterRatio = singleLetterCount / values.length;
  const avgLength = values.reduce((s, v) => s + v.trim().length, 0) / values.length;

  if (examType === 'multiple_choice' || examType === 'bubble_omr') {
    if (singleLetterRatio < 0.15) {
      return {
        valid: false,
        reason:
          `This looks like it might not be a "${EXAM_TYPE_LABELS[examType]}" paper. ` +
          `Only ${Math.round(singleLetterRatio * 100)}% of answers are single letters (A–E). ` +
          `Expected: ${EXAM_TYPE_HINTS[examType]}.`,
      };
    }
  }

  if (examType === 'identification' || examType === 'enumeration') {
    if (singleLetterRatio > 0.8 && avgLength <= 1.2) {
      return {
        valid: false,
        reason:
          `This looks like a multiple-choice sheet, not a "${EXAM_TYPE_LABELS[examType]}" paper. ` +
          `${Math.round(singleLetterRatio * 100)}% of answers are single letters. ` +
          `Expected: ${EXAM_TYPE_HINTS[examType]}.`,
      };
    }
  }

  if (examType === 'true_or_false') {
    const tfCount = values.filter(v => /^(true|false|t|f)$/i.test(v.trim())).length;
    const tfRatio  = tfCount / values.length;
    if (tfRatio < 0.3) {
      return {
        valid: false,
        reason:
          `This doesn't look like a True or False sheet. ` +
          `Only ${Math.round(tfRatio * 100)}% of answers are T/F values. ` +
          `Expected: ${EXAM_TYPE_HINTS[examType]}.`,
      };
    }
  }

  return { valid: true, reason: '' };
}

// ─── Local type extensions ────────────────────────────────────────────────────
// ParsedScanPayload from scanApi may not yet expose all fields used here.
// Extend it locally until the shared type is updated.
interface ScanPayloadExtended {
  success: boolean;
  message?: string;
  answers?: Record<string, string>;
  studentName?: string;
  confidence?: number;
  notes?: string;
}



type CornerPos = 'tl' | 'tr' | 'bl' | 'br';
function FrameCorner({ pos, color, size = 22, thickness = 3 }: {
  pos: CornerPos; color: string; size?: number; thickness?: number;
}) {
  const base: object = { position: 'absolute', width: size, height: size };
  const corners: Record<CornerPos, object> = {
    tl: { top: 0, left: 0,     borderTopWidth: thickness,    borderLeftWidth: thickness,   borderTopLeftRadius: 4 },
    tr: { top: 0, right: 0,    borderTopWidth: thickness,    borderRightWidth: thickness,  borderTopRightRadius: 4 },
    bl: { bottom: 0, left: 0,  borderBottomWidth: thickness, borderLeftWidth: thickness,   borderBottomLeftRadius: 4 },
    br: { bottom: 0, right: 0, borderBottomWidth: thickness, borderRightWidth: thickness,  borderBottomRightRadius: 4 },
  };
  return <View style={[base, corners[pos], { borderColor: color }]} />;
}

// ─── SVG Icons (inline, no external dependency) ───────────────────────────────

const BackIcon = () => (
  <View style={{ width: 16, height: 16, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: WHITE, fontSize: 18, lineHeight: 20, marginTop: -2 }}>‹</Text>
  </View>
);

const ChevronDown = () => (
  <Text style={{ color: '#aaa', fontSize: 9, lineHeight: 10 }}>▾</Text>
);

const CheckIcon = () => (
  <Text style={{ color: WHITE, fontSize: 11, fontWeight: '700' }}>✓</Text>
);

const FlashIcon = ({ active }: { active: boolean }) => (
  <Text style={{ fontSize: 18, color: active ? YELLOW : WHITE }}>⚡</Text>
);

const CameraIcon = () => (
  <Text style={{ fontSize: 22, color: WHITE }}>📷</Text>
);

const UploadIcon = () => (
  <Text style={{ fontSize: 18, color: WHITE }}>⬆</Text>
);

// ─── Component ────────────────────────────────────────────────────────────────

export default function ScanTab() {
  const navigation = useNavigation<any>();
  const route      = useRoute();
  const { sectionId } = (route.params as RouteParams) ?? {};
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // Hide the bottom tab bar while this screen is focused
  useFocusEffect(
    useCallback(() => {
      setNoPaperError(false);
      setIsProcessing(false);
      getUserSettings()
        .then(s => setSettings(s))
        .catch(() => setSettings(DEFAULT_SETTINGS));
    }, [])
  );

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);

  const [flashOn, setFlashOn]           = useState(false);
  const [edgeDetected, setEdgeDetected] = useState(false);
  const [isProcessing, setIsProcessing]  = useState(false);
  const [showResult, setShowResult]     = useState(false);
  const [studentName, setStudentName]   = useState('');

  const [gradeResult, setGradeResult]   = useState<GradeResult | null>(null);
  const [scannedAnswers, setScannedAnswers] = useState<Record<string, string>>({});
  const [hasKey, setHasKey]             = useState(false);
  const [step, setStep]                 = useState(1);

  const [examType, setExamType]                   = useState<ExamType>('multiple_choice');
  const [showExamTypeModal, setShowExamTypeModal] = useState(false);
  const [ocrConfidence, setOcrConfidence]         = useState<number>(1);
  const [noPaperError, setNoPaperError]           = useState(false);
  const [ocrNotes, setOcrNotes]                   = useState<string>('');
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);

  const [processingStatus, setProcessingStatus]       = useState<string>('Processing…');
  const [processingSubStatus, setProcessingSubStatus] = useState<string>('');

  const scanAnim     = useRef(new Animated.Value(0)).current;
  const glowAnim     = useRef(new Animated.Value(0)).current;
  const detectedAnim = useRef(new Animated.Value(0)).current;
  const captureScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(detectedAnim, { toValue: edgeDetected ? 1 : 0, useNativeDriver: true, tension: 80, friction: 8 }).start();
  }, [edgeDetected]);

  useEffect(() => {
    const scanLoop = Animated.loop(Animated.sequence([
      Animated.timing(scanAnim, { toValue: 1, duration: 2000, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      Animated.timing(scanAnim, { toValue: 0, duration: 2000, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
    ]));
    const glowLoop = Animated.loop(Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1,   duration: 1400, useNativeDriver: true }),
      Animated.timing(glowAnim, { toValue: 0.4, duration: 1400, useNativeDriver: true }),
    ]));
    scanLoop.start(); glowLoop.start();
    return () => { scanLoop.stop(); glowLoop.stop(); };
  }, []);

  // Fetch answer key on mount AND every time screen is focused
  // so returning from AddAnswerKey immediately reflects the new key
  const refreshAnswerKey = useCallback(() => {
    if (sectionId) {
      fetchAnswerKeyFromApi(sectionId).then(rec => setHasKey(!!rec?.key?.length));
    }
  }, [sectionId]);

  useEffect(() => { refreshAnswerKey(); }, [refreshAnswerKey]);

  useFocusEffect(refreshAnswerKey);

  // Reload user settings every time the screen is focused
  useFocusEffect(
    useCallback(() => {
      getUserSettings()
        .then(s => setSettings(s))
        .catch(() => setSettings(DEFAULT_SETTINGS));
    }, [])
  );

  const scanTranslate   = scanAnim.interpolate({ inputRange: [0, 1], outputRange: [0, FRAME_H] });
  const scanLineOpacity = scanAnim.interpolate({ inputRange: [0, 0.05, 0.95, 1], outputRange: [0, 1, 1, 0] });
  const frameColor      = edgeDetected ? GREEN : WHITE;

  // ── Core OMR/OCR ─────────────────────────────────────────────────────────

  async function processImage(uri: string, ext?: string) {
    if (!sectionId) { navigation.navigate('Review'); return; }

    const keyRecord = await fetchAnswerKeyFromApi(sectionId);
    if (!keyRecord?.key?.length) {
      Alert.alert('No Answer Key', 'Please upload an answer key for this section first.');
      return;
    }

    const answerKey = apiKeyToRecord(keyRecord.key);
    const totalQs   = Object.keys(answerKey).length;

    setIsProcessing(true);
    setEdgeDetected(false);
    setStep(2);
    setProcessingStatus('Reading image…');
    setProcessingSubStatus('');

    const SCAN_TIMEOUT_MS = 30_000;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Scan timed out. The server took too long to respond.\n\nMake sure your backend is running and your phone can reach it.'));
      }, SCAN_TIMEOUT_MS);
    });

    try {
      const ocrResult = await Promise.race([
        scanExamSheet(
          { uri, fileExtension: ext },
          { examType, questionCount: totalQs },
          (msg: string) => {
            if (msg.startsWith('Retrying')) {
              setProcessingStatus(msg);
              setProcessingSubStatus('Poor network or temporary server issue');
            } else {
              setProcessingStatus(msg);
              setProcessingSubStatus('');
            }
          },
        ),
        timeoutPromise,
      ]) as unknown as ScanPayloadExtended;

      if (timeoutId) clearTimeout(timeoutId);

      if (!ocrResult.success) {
        setIsProcessing(false);
        const errMsg = ocrResult.message ?? 'The scanner could not read this image.';
        Alert.alert('Scan Failed', errMsg, [
          { text: 'Try Again',   onPress: () => { setStep(1); setEdgeDetected(false); } },
          { text: 'Change Type', onPress: () => { setStep(1); setEdgeDetected(false); setShowExamTypeModal(true); } },
          { text: 'Cancel', style: 'cancel', onPress: () => setStep(1) },
        ]);
        return;
      }

      const { answers: rawAnswers, studentName: detectedName, confidence, notes } = ocrResult;

      // Normalize OCR noise: "Cc" -> "C", "8" -> "B", "0" -> "D" etc.
      const digitToLetter: Record<string, string> = { '8': 'B', '6': 'B', '0': 'D', '1': 'A', '4': 'A' };
      const answers: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawAnswers ?? {})) {
        const trimmed = v.trim();
        const letterMatch = trimmed.match(/^([A-Ea-e])/i);
        if (letterMatch) {
          answers[k] = letterMatch[1].toUpperCase();
        } else if (digitToLetter[trimmed]) {
          answers[k] = digitToLetter[trimmed];
        } else {
          answers[k] = trimmed;
        }
      }

      if (!answers || Object.keys(answers).length === 0) {
        setIsProcessing(false);
        Alert.alert(
          '❌ No Test Paper Detected',
          'The scanner could not find a valid answer sheet in this image.\n\nPlease make sure:\n• A test paper is clearly visible\n• The sheet is flat and well-lit\n• Avoid glare, shadows, or covering the page',
          [{ text: 'Try Again', onPress: () => { setStep(1); setEdgeDetected(false); } }]
        );
        return;
      }

      // ── Bubble OMR: skip letter-ratio validation ──────────────────────────
      // The OCR backend uses Tesseract (text recognition) for all exam types,
      // including bubble_omr. Tesseract reads printed characters — it cannot
      // detect filled circles. When a true OMR sheet is scanned, bubble marks
      // often come back as noise, digits, or empty strings that fail the
      // single-letter ratio check, producing a false "Wrong Exam Type" alert.
      //
      // Skip validateAnswersMatchType for bubble_omr entirely.
      // If the backend returns no recognisable answers for a bubble sheet,
      // show a specific OMR error instead of the misleading "Wrong Exam Type".
      if (examType === 'bubble_omr') {
        const validBubbleAnswers = Object.values(answers).filter(
          v => v && v !== '?' && v !== '—' && /^[A-Da-d]$/.test(v.trim())
        );
        if (validBubbleAnswers.length === 0) {
          setIsProcessing(false);
          setStep(1);
          setEdgeDetected(false);
          Alert.alert(
            '⬤  Bubble OMR Not Detected',
            'The scanner could not read any filled bubbles from this sheet.\n\n' +
            'This happens because the scan engine reads printed text, not shaded circles.\n\n' +
            'Tips:\n' +
            '• Make sure bubbles are filled darkly (not lightly shaded)\n' +
            '• Use bright, even lighting with no glare\n' +
            '• Hold the camera directly above the sheet\n\n' +
            'If your sheet has letters written in boxes instead of bubbles, switch to ① Multiple Choice.',
            [
              { text: '🔄 Switch to MC', onPress: () => { setShowExamTypeModal(true); } },
              { text: 'Try Again',       onPress: () => { setStep(1); setEdgeDetected(false); } },
              { text: 'Cancel',          style: 'cancel', onPress: () => setStep(1) },
            ]
          );
          return;
        }
      } else {
        // For all non-bubble types, run the normal answer-format validation.
        const typeCheck = validateAnswersMatchType(answers, examType);
        if (!typeCheck.valid) {
          // Hard block — scan is rejected, no "Save Anyway" bypass allowed.
          setIsProcessing(false);
          setStep(1);
          setEdgeDetected(false);
          await new Promise<never>((_, reject) => {
            Alert.alert(
              '❌ Wrong Exam Type',
              `This answer sheet does not match the selected exam type.\n\n` +
              `Selected:  ${EXAM_TYPE_LABELS[examType]}\n` +
              `Expected:  ${EXAM_TYPE_HINTS[examType]}\n\n` +
              `${typeCheck.reason}\n\n` +
              `Please select the correct exam type and scan again.`,
              [
                {
                  text: '🔄 Change Type',
                  onPress: () => {
                    setShowExamTypeModal(true);
                    reject(new Error('__type_mismatch_rescan__'));
                  },
                },
                {
                  text: 'Try Again',
                  onPress: () => reject(new Error('__type_mismatch_rescan__')),
                },
              ],
              { cancelable: false },
            );
          });
        }
      }

      if (settings.autoDetect && detectedName && !studentName.trim()) setStudentName(detectedName);

      const graded = gradeAnswers(answers, answerKey, examType);
      setScannedAnswers(answers);
      setGradeResult(graded);
      setOcrConfidence(settings.flagLow ? (confidence ?? 1) : 1);
      setOcrNotes(settings.scanTips ? (notes ?? '') : '');

      setProcessingStatus('Saving result…');
      setProcessingSubStatus('');

      const newResult: NewScanResult = buildScanResult(
        detectedName ?? '',
        sectionId ?? null,
        examType,
        answers,
        answerKey,
        confidence ?? 1,
        notes ?? '',
        detectedName ?? null
      );
      // Stamp id + scannedAt so the type is ScanResult before saving
      const processedResult: ScanResult = toScanResult(newResult, userId ?? undefined);
      await saveScanResult(userId!, processedResult);

      const { error: supabaseError } = await supabase
        .from('scan_results')
        .insert({
          id:           processedResult.id,
          user_id:      userId,
          section_id:   sectionId ?? null,
          student_name: detectedName ?? null,
          exam_type:    examType,
          scanned_at:   processedResult.scannedAt,
          student_answers: answers,
          answer_key:      answerKey,
          score:      graded.score,
          total:      graded.total,
          percentage: graded.percentage,
          ocr_confidence: confidence ?? 1,
          ocr_notes:      notes ?? '',
        });

      if (supabaseError) {
        // Surface the error to the user so it is never silently lost.
        // Home and Analytics read from Supabase — if the insert fails, they will
        // show no data even though ResultScreen displayed a result.
        console.error('[ScanTab] Supabase insert failed:', supabaseError.code, supabaseError.message);
        Alert.alert(
          '⚠️ Save Warning',
          `The scan result was graded but could not be saved to the database.\n\nReason: ${supabaseError.message}\n\nYour result is stored locally, but it may not appear in Analytics or Home until the issue is resolved.`,
          [{ text: 'OK' }],
        );
      }

      setIsProcessing(false);
      setEdgeDetected(true);
      setStep(3);

      navigation.navigate('ResultScreen', {
        result:    processedResult,
        resultId:  processedResult.id,
        sectionId: sectionId ?? undefined,
      });

    } catch (err: unknown) {
      if (timeoutId) clearTimeout(timeoutId);
      const msg = err instanceof Error ? err.message : String(err);

      if (msg === '__type_mismatch_rescan__') return;

      console.error('[ScanTab] processImage failed:', msg);

      let userMessage: string;

      if (msg.includes('Could not extract text') || msg.includes('extract text from image')) {
        userMessage =
          `The scanner could not read text from this image.\n\n` +
          `This often happens when the paper type doesn't match the selected exam type.\n\n` +
          `Current type: ${EXAM_TYPE_LABELS[examType]}\n` +
          `Expected format: ${EXAM_TYPE_HINTS[examType]}\n\n` +
          `Tips:\n• Make sure the correct exam type is selected\n• Use better lighting\n• Hold the camera directly above the sheet`;
      } else if (msg.includes('Server is not configured') || msg.includes('GOOGLE_VISION_API_KEY')) {
        userMessage = 'The server is missing the AI configuration. Contact support.';
      } else if (msg.includes('Server error (4')) {
        userMessage = msg;
      } else if (msg.includes('Failed to fetch') || msg.includes('Network request failed')) {
        userMessage = `Cannot reach the scan server.\n\nMake sure your backend is running and BASE_URL is correct.\n\nDetails: ${msg}`;
      } else if (msg.includes('after multiple attempts')) {
        userMessage = 'The AI service is temporarily unavailable. Please try again in a moment.';
      } else {
        userMessage = msg || 'An unknown error occurred.';
      }

      Alert.alert('Scan Failed', userMessage, [
        { text: 'Change Type', onPress: () => { setStep(1); setIsProcessing(false); setEdgeDetected(false); setShowExamTypeModal(true); } },
        { text: 'Try Again',   onPress: () => { setStep(1); setIsProcessing(false); setEdgeDetected(true); } },
        { text: 'Cancel',      style: 'cancel', onPress: () => { setStep(1); setIsProcessing(false); } },
      ]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  // ── Shutter ───────────────────────────────────────────────────────────────

  const handleShutter = async () => {
    if (!settings.scanning) {
      Alert.alert('Scanning Disabled', 'Enable scanning in Settings to use the camera scanner.');
      return;
    }
    if (!sectionId) { navigation.navigate('Review'); return; }
    const keyRecord = await fetchAnswerKeyFromApi(sectionId);
    if (!keyRecord?.key?.length) { Alert.alert('No Answer Key', 'Please upload an answer key first.'); return; }

    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) { Alert.alert('Camera Permission', 'Camera access is required to scan answer sheets.'); return; }
    }
    if (!cameraRef.current) { Alert.alert('Camera not ready', 'Please wait for the camera to initialize.'); return; }

    Animated.sequence([
      Animated.timing(captureScale, { toValue: 0.88, duration: 80,  useNativeDriver: true }),
      Animated.spring(captureScale,  { toValue: 1,    useNativeDriver: true, tension: 200, friction: 6 }),
    ]).start();
    if (Platform.OS !== 'web') Vibration.vibrate(40);

    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.92, base64: true, skipProcessing: false });
      if (!photo?.uri) return;

      // ── Paper detection via real pixel byte analysis ───────────────────────
      // Decode base64 → actual byte values (0–255), then measure variance.
      // Blank/empty frame = uniform colour = low variance.
      // A paper sheet with text = white + dark ink = high variance.
      const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let noPaperDetected = true;

      if (photo.base64 && photo.base64.length > 100) {
        const b64 = photo.base64;
        const stride = Math.max(4, Math.floor(b64.length / 2000) * 4);
        const samples: number[] = [];
        for (let i = 0; i + 3 < b64.length; i += stride) {
          const c0 = B64.indexOf(b64[i]);
          const c1 = B64.indexOf(b64[i + 1]);
          const c2 = B64.indexOf(b64[i + 2]);
          const c3 = B64.indexOf(b64[i + 3]);
          if (c0 < 0 || c1 < 0) continue;
          samples.push((c0 << 2) | (c1 >> 4));
          if (c2 >= 0) samples.push(((c1 & 0xf) << 4) | (c2 >> 2));
          if (c3 >= 0) samples.push(((c2 & 0x3) << 6) | c3);
        }
        if (samples.length >= 50) {
          const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
          const variance = samples.reduce((s, v) => s + (v - mean) ** 2, 0) / samples.length;
          // Paper with text/bubbles → high contrast → variance > 1000
          // Blank wall/floor/nothing → near-uniform → variance < 1000
          noPaperDetected = variance < 1000;
        }
      }

      if (noPaperDetected) {
        setEdgeDetected(false);
        setNoPaperError(true);
        if (Platform.OS !== 'web') Vibration.vibrate([0, 80, 60, 80]);
        Alert.alert(
          '📄 No Test Paper Detected',
          'The camera cannot see an answer sheet inside the frame.\n\nPlease:\n• Place the test paper flat inside the frame\n• Ensure good lighting — avoid glare or shadows\n• Hold the camera directly above the sheet\n• Make sure the full sheet is visible',
          [{ text: 'Got It', onPress: () => setNoPaperError(false) }]
        );
        return; // hard stop — processImage is never called
      }

      setNoPaperError(false);
      setEdgeDetected(true);

      await processImage(photo.uri);
    } catch (err: unknown) {
      setIsProcessing(false);
      Alert.alert('Capture Failed', err instanceof Error ? err.message : 'Could not take photo.');
    }
  };

  // ── Pick from Gallery ─────────────────────────────────────────────────────

  const handlePickGallery = async () => {
    if (!settings.scanning) {
      Alert.alert('Scanning Disabled', 'Enable scanning in Settings to use the camera scanner.');
      return;
    }
    if (!sectionId) { navigation.navigate('Review'); return; }
    const keyRecord = await fetchAnswerKeyFromApi(sectionId);
    if (!keyRecord?.key?.length) { Alert.alert('No Answer Key', 'Please upload an answer key first.'); return; }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Please allow photo library access.'); return; }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality:    1,
      allowsEditing: false,
    });

    if (picked.canceled || !picked.assets?.[0]) return;
    await processImage(picked.assets[0].uri);
  };

  // ── Pick from Files ───────────────────────────────────────────────────────

  const handlePickFile = async () => {
    if (!settings.scanning) {
      Alert.alert('Scanning Disabled', 'Enable scanning in Settings to use the camera scanner.');
      return;
    }
    if (!sectionId) { navigation.navigate('Review'); return; }
    const keyRecord = await fetchAnswerKeyFromApi(sectionId);
    if (!keyRecord?.key?.length) { Alert.alert('No Answer Key', 'Please upload an answer key first.'); return; }

    const doc = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
    });

    if (doc.canceled || !doc.assets?.[0]) return;
    const asset = doc.assets[0];
    const ext: string | undefined = asset.name?.split('.').pop();
    await processImage(asset.uri, ext);
  };

  // ── File Upload ───────────────────────────────────────────────────────────

  const handleFileUpload = async () => {
    Alert.alert('Upload Answer Sheet', 'Choose source:', [
      { text: '🖼️  Photo Gallery', onPress: handlePickGallery },
      { text: '📄  PDF / File',    onPress: handlePickFile    },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  // ── Save result ───────────────────────────────────────────────────────────

  const handleSaveResult = async () => {
    if (!sectionId || !gradeResult || !studentName.trim()) {
      Alert.alert('Student Name Required', "Please enter the student's name before saving.");
      return;
    }

    const builtNew: NewScanResult = buildScanResult(
      studentName,
      sectionId,
      examType,
      scannedAnswers,
      {},
      ocrConfidence,
      ocrNotes
    );
    const builtResult: ScanResult = toScanResult(builtNew, userId ?? undefined);
    await saveScanResult(userId!, builtResult);

    setShowResult(false);
    setStep(1);
    Alert.alert('✅ Saved', `Result for ${studentName} has been saved.`);
  };

  // ── Permission screen ─────────────────────────────────────────────────────

  if (!permission) return <View style={s.camArea} />;

  if (!permission.granted) {
    return (
      <View style={[s.camArea, s.permWrap]}>
        <Text style={s.permIcon}>📷</Text>
        <Text style={s.permTitle}>Camera Access Needed</Text>
        <Text style={s.permSub}>Allow camera access to scan answer sheets. You can also upload images from your gallery.</Text>
        <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
          <Text style={s.permBtnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <View style={{ flex: 1, backgroundColor: '#111' }}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0a" />

      {/* ── Top nav bar (outside camera, on solid dark bg) ─────────────────── */}
      <View style={s.topBar}>
        <View style={s.navRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.75}>
            <Text style={s.backBtnIcon}>‹</Text>
          </TouchableOpacity>
          <Text style={s.navTitle}>Scan answer sheet</Text>
          <TouchableOpacity style={s.examPill} onPress={() => setShowExamTypeModal(true)} activeOpacity={0.75}>
            <Text style={s.examPillLabel}>{EXAM_TYPE_SHORT[examType]}</Text>
            <Text style={s.examPillCaret}>▾</Text>
          </TouchableOpacity>
        </View>
        <View style={s.stepRow}>
          {[1, 2, 3].map((n) => {
            const done   = step > n;
            const active = step >= n;
            const labels = ['Scan', 'Process', 'Result'];
            return (
              <React.Fragment key={n}>
                <View style={s.stepItem}>
                  <View style={[s.stepDot, active && s.stepDotActive]}>
                    {done
                      ? <Text style={s.stepCheckmark}>✓</Text>
                      : <Text style={[s.stepNum, active && s.stepNumActive]}>{n}</Text>
                    }
                  </View>
                  <Text style={[s.stepLabel, active && s.stepLabelActive]}>{labels[n - 1]}</Text>
                </View>
                {n < 3 && <View style={s.stepLine} />}
              </React.Fragment>
            );
          })}
        </View>
      </View>

      {/* ── Camera viewfinder area ──────────────────────────────────────────── */}
      <View style={s.camArea}>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" enableTorch={flashOn} />

        {/* Dark mask with transparent cutout */}
        <View style={[StyleSheet.absoluteFill, s.overlay]}>
          <View style={[s.mask, { flex: 1 }]} />
          <View style={{ flexDirection: 'row' }}>
            <View style={[s.mask, { flex: 1 }]} />
            <View style={{ width: FRAME_W, height: FRAME_H, borderRadius: 20, overflow: 'hidden' }} />
            <View style={[s.mask, { flex: 1 }]} />
          </View>
          <View style={[s.mask, { flex: 1 }]} />
        </View>

        {/* Scan frame + corners + badges */}
        <View style={s.frameWrap}>
          <View style={s.scanFrame}>
            <Animated.View style={[s.scanLine, { opacity: scanLineOpacity, transform: [{ translateY: scanTranslate }], backgroundColor: frameColor }]} />
          </View>

          {/* Green corner guide brackets */}
          <FrameCorner pos="tl" color={GREEN} size={28} thickness={3} />
          <FrameCorner pos="tr" color={GREEN} size={28} thickness={3} />
          <FrameCorner pos="bl" color={GREEN} size={28} thickness={3} />
          <FrameCorner pos="br" color={GREEN} size={28} thickness={3} />

          {/* Center crosshair */}
          <View style={s.crosshairV} />
          <View style={s.crosshairH} />

          {/* Processing overlay inside frame */}
          {isProcessing && (
            <View style={s.processingOverlay}>
              <View style={s.processingSpinner}>
                <Text style={s.processingSpinnerIcon}>⚙️</Text>
              </View>
              <Text style={s.processingText}>{processingStatus}</Text>
              {!!processingSubStatus && <Text style={s.processingSubText}>{processingSubStatus}</Text>}
            </View>
          )}

          {/* Center align instruction pill — hidden when noPaperError */}
          {!isProcessing && !noPaperError && (
            <View style={s.alignHintWrap}>
              <Text style={s.alignHintText}>Align sheet inside the frame</Text>
            </View>
          )}

          {/* No paper error banner */}
          {!isProcessing && noPaperError && (
            <View style={s.noPaperBanner}>
              <Text style={s.noPaperIcon}>📄</Text>
              <Text style={s.noPaperTitle}>No Test Paper Detected</Text>
              <Text style={s.noPaperSub}>Place the answer sheet flat{'\n'}inside the frame and try again</Text>
            </View>
          )}

          {/* Detection badge at bottom of frame */}
          <Animated.View
            style={[
              s.detectionBadge,
              edgeDetected ? s.detectedBadge : s.scanningBadge,
              { opacity: detectedAnim },
            ]}
          >
            {edgeDetected && <View style={s.detectionDot} />}
            <Text style={edgeDetected ? s.detectionBadgeText : s.scanningBadgeText}>
              {edgeDetected ? 'Sheet detected' : '⟳ Scanning…'}
            </Text>
          </Animated.View>
        </View>

      </View>

      {/* Hint text below viewfinder */}
      <View style={s.hintRow}>
        <Text style={s.hintText}>Hold steady for best results</Text>
      </View>

      {/* ── Bottom control bar ─────────────────────────────────────────────── */}
      <View style={s.ctrlBar}>

        {/* Flash */}
        <TouchableOpacity style={s.sideBtn} onPress={() => setFlashOn(f => !f)} activeOpacity={0.75}>
          <View style={[s.sideBtnCircle, flashOn && s.sideBtnCircleOn]}>
            <FlashIcon active={flashOn} />
          </View>
          <Text style={s.sideBtnLabel}>{flashOn ? 'On' : 'Flash'}</Text>
        </TouchableOpacity>

        {/* Shutter — green ring + green fill */}
        <Animated.View style={{ transform: [{ scale: captureScale }] }}>
          <TouchableOpacity
            style={[s.captureBtn, (isProcessing || noPaperError) && s.captureBtnDisabled]}
            onPress={handleShutter}
            disabled={isProcessing || noPaperError}
            activeOpacity={0.85}
          >
            <View style={[s.captureInner, (isProcessing || noPaperError) && { opacity: 0.7 }]} />
          </TouchableOpacity>
        </Animated.View>

        {/* Upload */}
        <TouchableOpacity
          style={[s.sideBtn, isProcessing && { opacity: 0.4 }]}
          onPress={handleFileUpload}
          disabled={isProcessing}
          activeOpacity={0.75}
        >
          <View style={s.sideBtnCircle}>
            <UploadIcon />
          </View>
          <Text style={s.sideBtnLabel}>Upload</Text>
        </TouchableOpacity>

      </View>

      {/* ── Exam Type Modal ────────────────────────────────────────────────── */}
      <Modal visible={showExamTypeModal} transparent animationType="slide" onRequestClose={() => setShowExamTypeModal(false)}>
        <View style={m.backdrop}>
          <View style={m.sheet}>
            <View style={m.handle} />
            <Text style={m.sheetTitle}>Select Exam Type</Text>
            <ScrollView contentContainerStyle={m.scrollContent}>
              {(Object.keys(EXAM_TYPE_LABELS) as ExamType[]).map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[m.typeRow, examType === type && m.typeRowActive]}
                  onPress={() => { setExamType(type); setShowExamTypeModal(false); }}
                >
                  <Text style={[m.typeLabel, examType === type && m.typeLabelActive]}>{EXAM_TYPE_LABELS[type]}</Text>
                  {examType === type && <Text style={m.typeCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Result Modal ───────────────────────────────────────────────────── */}
      {showResult && gradeResult && (
        <Modal visible={showResult} transparent animationType="slide" onRequestClose={() => setShowResult(false)}>
          <View style={m.backdrop}>
            <View style={m.sheet}>
              <View style={m.handle} />
              <Text style={m.sheetTitle}>Scan Result</Text>
              <ScrollView contentContainerStyle={m.scrollContent}>

                <View style={[m.hero, { backgroundColor: gradeResult.percentage >= 75 ? GREEN_DIM : '#DC2626' }]}>
                  <Text style={m.heroCtx}>{EXAM_TYPE_SHORT[examType]}</Text>
                  <Text style={m.heroScore}>{gradeResult.score}/{gradeResult.total}</Text>
                  <Text style={m.heroPct}>{gradeResult.percentage.toFixed(1)}%</Text>
                  <View style={[m.heroBadge, gradeResult.percentage >= 75 ? m.badgePass : m.badgeFail]}>
                    <Text style={m.heroBadgeText}>{gradeResult.percentage >= 75 ? 'PASSED' : 'FAILED'}</Text>
                  </View>
                </View>

                {(() => {
                  const unreadable = Object.values(scannedAnswers).filter((a: string) => !a || a === '?' || a === '—').length;
                  const totalQ = Object.keys(scannedAnswers).length;
                  const unreadablePct = totalQ > 0 ? unreadable / totalQ : 0;
                  const isCritical = ocrConfidence < 0.4 || unreadablePct > 0.5;
                  const isWarning  = !isCritical && (ocrConfidence < 0.7 || unreadablePct > 0.2);

                  if (isCritical) return (
                    <View style={m.criticalWarning}>
                      <Text style={m.criticalWarningTitle}>🚫 Scan Quality Too Low to Save</Text>
                      <Text style={m.criticalWarningText}>
                        {`Confidence: ${(ocrConfidence * 100).toFixed(0)}% — ${unreadable} of ${totalQ} answer(s) unreadable.\n\nPlease rescan with better lighting, camera directly above the sheet, and no shadows or folds.`}
                        {ocrNotes ? `\n\n${ocrNotes}` : ''}
                      </Text>
                    </View>
                  );

                  if (isWarning) return (
                    <View style={m.confidenceWarning}>
                      <Text style={m.confidenceText}>
                        {`⚠️ Confidence: ${(ocrConfidence * 100).toFixed(0)}% — ${unreadable} answer(s) unreadable. Verify before saving.`}
                        {ocrNotes ? `\n\n${ocrNotes}` : ''}
                      </Text>
                    </View>
                  );

                  return null;
                })()}

                <Text style={m.sectionHeading}>Student Name</Text>
                <TextInput
                  style={m.input}
                  value={studentName}
                  onChangeText={setStudentName}
                  placeholder="Enter student name…"
                  placeholderTextColor="#94A3B8"
                />

                <Text style={m.sectionHeading}>Answers</Text>
                <View style={m.ansGrid}>
                  {(() => {
                    const details = breakdownMap(gradeResult);
                    return Object.entries(scannedAnswers).map(([q, ans]) => {
                      const ok = details[q]?.correct ?? false;
                      return (
                        <View key={q} style={[m.ansBox, ok ? m.ansBoxOk : m.ansBoxWrong]}>
                          <Text style={m.ansQ}>Q{q}</Text>
                          <Text style={[m.ansA, ok ? m.ansAOk : m.ansAWrong]}>{ans || '—'}</Text>
                        </View>
                      );
                    });
                  })()}
                </View>

                {(() => {
                  const unreadable = Object.values(scannedAnswers).filter((a: string) => !a || a === '?' || a === '—').length;
                  const totalQ = Object.keys(scannedAnswers).length;
                  const unreadablePct = totalQ > 0 ? unreadable / totalQ : 0;
                  const isCritical = ocrConfidence < 0.4 || unreadablePct > 0.5;

                  if (isCritical) return (
                    <TouchableOpacity style={m.rescanBtnPrimary} onPress={() => { setShowResult(false); setStep(1); }}>
                      <Text style={m.rescanBtnPrimaryText}>Rescan Sheet</Text>
                    </TouchableOpacity>
                  );

                  return (
                    <>
                      <TouchableOpacity style={[m.confirmBtn, !studentName.trim() && m.confirmBtnDisabled]} onPress={handleSaveResult} disabled={!studentName.trim()}>
                        <Text style={m.confirmBtnText}>Save Result</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={m.rescanBtn} onPress={() => { setShowResult(false); setStep(1); }}>
                        <Text style={m.rescanBtnText}>Scan Another Sheet</Text>
                      </TouchableOpacity>
                    </>
                  );
                })()}

              </ScrollView>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({

  // ── Camera area ──────────────────────────────────────────────────────────
  camArea: { flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'flex-start', paddingTop: 0, overflow: 'hidden' },
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 2 },
  mask:    { backgroundColor: 'rgba(0,0,0,0.55)' },

  // ── Scan frame wrapper ────────────────────────────────────────────────────
  // Matches prototype: rounded viewfinder with corner green brackets
  frameWrap: {
    width: FRAME_W,
    height: FRAME_H,
    zIndex: 3,
    borderRadius: 20,
    overflow: 'hidden',
  },
  scanFrame: { flex: 1, borderRadius: 20, overflow: 'hidden' },
  scanLine:  {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 1,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 6,
  },

  // ── Center crosshair ──────────────────────────────────────────────────────
  crosshairV: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -0.5,
    marginTop: -10,
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
    zIndex: 4,
  },
  crosshairH: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -0.5,
    marginLeft: -10,
    width: 20,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    zIndex: 4,
  },

  // ── Processing overlay ────────────────────────────────────────────────────
  processingOverlay:     {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    zIndex: 10,
    borderRadius: 20,
  },
  processingSpinner:     {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(34,197,94,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingSpinnerIcon: { fontSize: 28 },
  processingText:        { fontSize: 15, color: WHITE, fontWeight: '700', textAlign: 'center' },
  processingSubText:     { fontSize: 12, color: GRAY, textAlign: 'center' },

  // ── Detection badge — pill at bottom of viewfinder ───────────────────────
  detectionBadge:     {
    position: 'absolute',
    bottom: 16,
    alignSelf: 'center',
    zIndex: 5,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 99,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detectedBadge:      { backgroundColor: 'rgba(20,80,40,0.85)', borderWidth: 0.5, borderColor: GREEN },
  scanningBadge:      { backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.15)' },
  detectionDot:       { width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN },
  detectionBadgeText: { fontSize: 13, fontWeight: '500', color: '#86efac' },
  scanningBadgeText:  { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.8)' },

  // ── Center align hint pill ────────────────────────────────────────────────
  alignHintWrap: {
    position: 'absolute',
    top: '42%',
    alignSelf: 'center',
    zIndex: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  alignHintText: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },

  // ── Hint text below viewfinder ────────────────────────────────────────────
  hintRow:  {
    backgroundColor: '#111',
    paddingTop: 14,
    paddingBottom: 2,
    alignItems: 'center',
    zIndex: 5,
  },
  hintText: { fontSize: 12, color: 'rgba(255,255,255,0.35)' },

  // ── Top nav bar (solid, outside camera) ─────────────────────────────────
 topBar: {
  backgroundColor: '#111',
 paddingTop: Platform.OS === 'ios' ? 52 : 8,
  paddingBottom: 14,
  paddingHorizontal: 20,
  gap: 14,
  zIndex: 20,
},
  // Nav row: back | title | exam type pill
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },

  // Back button — 36×36 circular ghost
  backBtn:     {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnIcon: { fontSize: 22, color: WHITE, lineHeight: 24, marginTop: -1 },

  // Title
  navTitle: { fontSize: 15, fontWeight: '500', color: WHITE },

  // Exam type pill
  examPill:      {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  examPillLabel: { fontSize: 12, color: '#ccc' },
  examPillCaret: { fontSize: 10, color: '#aaa' },

  // Step progress row
  stepRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  stepItem:        { flexDirection: 'row', alignItems: 'center', gap: 6 },

  // Step dot — inactive state
  stepDot:         {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  // Step dot — active/completed state (green fill)
  stepDotActive:   { backgroundColor: GREEN, borderColor: GREEN },

  stepNum:         { fontSize: 11, color: WHITE, fontWeight: '500' },
  stepNumActive:   { color: WHITE },
  stepCheckmark:   { fontSize: 11, color: WHITE, fontWeight: '700' },

  stepLabel:       { fontSize: 12, color: 'rgba(255,255,255,0.45)', fontWeight: '500' },
  stepLabelActive: { color: GREEN, fontWeight: '500' },

  // Connector line between steps
  stepLine:        { width: 28, height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 8 },

  // ── Permission screen ────────────────────────────────────────────────────
  permWrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, gap: 10 },
  permIcon:    { fontSize: 52 },
  permTitle:   { fontSize: 16, fontWeight: '700', color: WHITE, textAlign: 'center' },
  permSub:     { fontSize: 12, color: GRAY, textAlign: 'center', lineHeight: 18 },
  permBtn:     { marginTop: 8, backgroundColor: GREEN, paddingHorizontal: 24, paddingVertical: 11, borderRadius: 99 },
  permBtnText: { fontSize: 13, fontWeight: '700', color: DARK },

  // ── Bottom control bar ───────────────────────────────────────────────────
  // Matches prototype: #111 bg, Flash | Capture | Upload layout
  ctrlBar: {
    backgroundColor: '#111',
    paddingTop: 16,
    paddingHorizontal: 28,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  // Side buttons — circular with label below
  sideBtn:        { alignItems: 'center', gap: 6 },
  sideBtnCircle:  {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideBtnCircleOn: {
    backgroundColor: 'rgba(234,179,8,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(234,179,8,0.4)',
  },
  sideBtnLabel:   { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },

  // Capture button — green outer ring + green filled inner
  captureBtn:         {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnDisabled: { borderColor: 'rgba(255,255,255,0.12)', opacity: 0.5 },
  captureInner:       {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── No-paper error banner (shown inside frame) ────────────────────────────
  noPaperBanner: {
    position: 'absolute',
    top: '30%',
    alignSelf: 'center',
    zIndex: 6,
    backgroundColor: 'rgba(220,38,38,0.88)',
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingVertical: 18,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,100,100,0.5)',
  },
  noPaperIcon:  { fontSize: 32 },
  noPaperTitle: { fontSize: 14, fontWeight: '700', color: WHITE, textAlign: 'center' },
  noPaperSub:   { fontSize: 11, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 16 },
});

const m = StyleSheet.create({
  backdrop:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  sheet:      { backgroundColor: '#FAFAFA', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '92%' },
  handle:     { width: 40, height: 4, backgroundColor: '#CBD5E1', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 2 },
  sheetTitle: { fontSize: 16, fontWeight: '700', color: '#0F172A', textAlign: 'center', paddingTop: 8, paddingBottom: 4 },
  scrollContent: { padding: 20, paddingBottom: 40, gap: 14 },

  hero:          { borderRadius: 18, padding: 22, alignItems: 'center', gap: 4 },
  heroCtx:       { fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: '600', textAlign: 'center' },
  heroScore:     { fontSize: 56, fontWeight: '900', color: WHITE, letterSpacing: -2, lineHeight: 60 },
  heroPct:       { fontSize: 14, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  heroBadge:     { borderRadius: 99, paddingHorizontal: 16, paddingVertical: 5, marginTop: 8 },
  badgePass:     { backgroundColor: GREEN },
  badgeFail:     { backgroundColor: '#DC2626' },
  heroBadgeText: { fontSize: 11, fontWeight: '800', color: WHITE, letterSpacing: 1 },

  sectionHeading: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 1.2, textTransform: 'uppercase' },

  confidenceWarning: { backgroundColor: '#FFFBEB', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#FCD34D' },
  confidenceText:    { fontSize: 11, color: '#92400E', fontWeight: '500', lineHeight: 16 },

  ansGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  ansBox:      { width: 48, borderRadius: 10, padding: 7, alignItems: 'center', gap: 3 },
  ansBoxOk:    { backgroundColor: '#ECFDF5' },
  ansBoxWrong: { backgroundColor: '#FEF2F2' },
  ansQ:        { fontSize: 8,  fontWeight: '700', color: '#64748B' },
  ansA:        { fontSize: 15, fontWeight: '800' },
  ansAOk:      { color: '#15803D' },
  ansAWrong:   { color: '#DC2626' },

  input: { backgroundColor: WHITE, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 16, paddingVertical: 12, fontSize: 14, color: '#0F172A', fontWeight: '500' },

  confirmBtn:         { backgroundColor: GREEN, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  confirmBtnDisabled: { backgroundColor: '#CBD5E1' },
  confirmBtnText:     { color: WHITE, fontWeight: '700', fontSize: 15, letterSpacing: 0.2 },

  rescanBtn:          { backgroundColor: '#F1F5F9', borderRadius: 14, paddingVertical: 13, alignItems: 'center' },
  rescanBtnText:      { color: '#475569', fontWeight: '600', fontSize: 14 },

  rescanBtnPrimary:     { backgroundColor: '#EF4444', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  rescanBtnPrimaryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },

  criticalWarning:      { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#FCA5A5' },
  criticalWarningTitle: { fontSize: 13, fontWeight: '700', color: '#991B1B', marginBottom: 6 },
  criticalWarningText:  { fontSize: 11, color: '#7F1D1D', lineHeight: 17 },

  typeRow:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 15, paddingHorizontal: 16, borderRadius: 14, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  typeRowActive:   { backgroundColor: '#F0FDF4', borderColor: GREEN },
  typeLabel:       { fontSize: 14, fontWeight: '600', color: '#334155' },
  typeLabelActive: { color: GREEN_DIM },
  typeCheck:       { fontSize: 17, color: GREEN, fontWeight: '800' },
});