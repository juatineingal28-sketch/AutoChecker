// src/screens/OMRScanScreen.tsx
// ─── OMR Scan Screen ──────────────────────────────────────────────────────────
// Camera-based OMR sheet scanner.
//
// PIPELINE:
//  1. User aligns the printed OMR sheet inside the frame overlay
//  2. Capture → preprocess image (resize, grayscale)
//  3. Send to backend /api/scan with examType = 'bubble_omr'
//  4. Parse bubble fill response → classifyBubbles() → FlatAnswerKey
//  5. gradeAnswers() → buildScanResult() → saveScanResult()
//  6. Navigate to Review screen
//
// The screen style intentionally mirrors the existing ScanTab.tsx (dark camera UI).
//
// Navigation params (optional):
//   sectionId:   string  — pre-selects a section
//   answerKey:   Record<string, string>  — grades immediately after scan

import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

import * as FileSystem from 'expo-file-system';
import { useAuth } from '../context/AuthContext';
import { BASE_URL, toBackendExamType } from '../services/api';
import { saveScanResult } from '../services/scanService';
import type { FlatAnswerKey } from '../types/exam';
import { buildScanResult } from '../utils/grading';
import {
    classifyBubbles
} from '../utils/omrAnswerExtractor';
import {
    parseBubbleFillResponse,
    preprocessOMRImage,
    processOMRLocally,
} from '../utils/omrImageProcessor';
import { toScanResult } from '../utils/toScanResult';

// ─── Constants ────────────────────────────────────────────────────────────────

const { width: SW, height: SH } = Dimensions.get('window');
const FRAME_W = SW * 0.96;
const FRAME_H = FRAME_W * 1.414; // A4 ratio

const GREEN  = '#22C55E';
const WHITE  = '#FFFFFF';
const DARK   = '#0D0D0D';
const DARK2  = '#161616';

// ─── Component ────────────────────────────────────────────────────────────────

export default function OMRScanScreen() {
  const navigation  = useNavigation<any>();
  const route       = useRoute<any>();
  const { user }    = useAuth();

  const sectionId: string | undefined = route.params?.sectionId;
  const answerKey: FlatAnswerKey | undefined = route.params?.answerKey;

  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [status, setStatus]   = useState('');
  const [loading, setLoading] = useState(false);
  const [flash,   setFlash]   = useState(false);

  // ── Permission screen ──────────────────────────────────────────────────────
  if (!permission) return <View style={styles.root} />;
  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.center]}>
        <Ionicons name="camera-outline" size={52} color={WHITE} />
        <Text style={styles.permTitle}>Camera Access Required</Text>
        <Text style={styles.permSub}>
          AutoChecker needs the camera to scan OMR answer sheets.
        </Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Capture & process ──────────────────────────────────────────────────────

  async function processUri(uri: string) {
    if (!user) {
      Alert.alert('Not signed in', 'Please sign in to save scan results.');
      return;
    }

    try {
      setLoading(true);
      setStatus('Preprocessing image…');

      // Step 1: Resize
      const processed = await preprocessOMRImage(uri);

      // Step 2: Try local processing first (Expo Web)
      setStatus('Detecting bubbles…');
      let studentAnswers: Record<string, string> | null = null;

      const localMeasurements = await processOMRLocally(
        processed.uri,
        processed.width,
        processed.height,
      );

      if (localMeasurements && localMeasurements.length > 0) {
        // Local processing succeeded
        const classifications = classifyBubbles(localMeasurements);
        studentAnswers = {};
        for (const c of classifications) {
          studentAnswers[String(c.questionNumber)] =
            c.selected === 'BLANK' || c.selected === 'INVALID' ? '' : c.selected;
        }
      } else {
        // Fall back to backend
        setStatus('Sending to server…');
        const base64 = await FileSystem.readAsStringAsync(processed.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });

        const resp = await fetch(`${BASE_URL}/api/scan`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            imageBase64:   base64,
            mimeType:      'image/png',
            examType:      toBackendExamType('bubble_omr'),
            questionCount: 100,
          }),
        });

        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(body?.error ?? `Server error (${resp.status})`);
        }

        const data      = await resp.json();
        const measures  = parseBubbleFillResponse(data);
        const classes   = classifyBubbles(measures);
        studentAnswers  = {};
        for (const c of classes) {
          studentAnswers[String(c.questionNumber)] =
            c.selected === 'BLANK' || c.selected === 'INVALID' ? '' : c.selected;
        }
      }

      // Step 3: Grade (if answer key provided)
      setStatus('Building result…');
      const key      = answerKey ?? {};
      const hasKey   = Object.keys(key).length > 0;

      const rawResult = buildScanResult(
        '',            // studentName — unknown from OMR
        sectionId ?? null,
        'bubble_omr',
        studentAnswers,
        key,
        1.0,           // ocrConfidence — OMR is deterministic
        hasKey ? '' : 'No answer key provided — grading skipped.',
      );

      const finalResult = toScanResult(rawResult, user.id);
      await saveScanResult(user.id, finalResult);

      setStatus('Done!');

      // Navigate to ReviewScreen
      navigation.navigate('ReviewScreen', {
        result:    finalResult,
        resultId:  finalResult.id,
        sectionId: sectionId ?? null,
      });

    } catch (e: any) {
      Alert.alert('Scan failed', e.message ?? 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
      setStatus('');
    }
  }

  async function handleCapture() {
    if (!cameraRef.current || loading) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.92 });
      if (photo?.uri) await processUri(photo.uri);
    } catch (e: any) {
      Alert.alert('Capture failed', e.message);
    }
  }

  async function handleUpload() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality:    0.95,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      await processUri(result.assets[0].uri);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={WHITE} />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Scan OMR Sheet</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Camera */}
      <View style={{ flex: 1, position: 'relative' }}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          flash={flash ? 'on' : 'off'}
        />

        {/* Dimmed overlay + frame cutout hint */}
        <View style={styles.overlay} pointerEvents="none">
          <View style={[styles.frame, { width: FRAME_W, height: FRAME_H }]}>
            {/* A4 corner markers */}
            <CornerMark pos="tl" />
            <CornerMark pos="tr" />
            <CornerMark pos="bl" />
            <CornerMark pos="br" />
          </View>
        </View>

        {/* Hint text */}
        <View style={styles.hintWrap} pointerEvents="none">
          <Text style={styles.hintText}>
            Align the OMR sheet inside the frame
          </Text>
        </View>

        {/* Loading overlay */}
        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color={GREEN} />
            <Text style={styles.loadingText}>{status}</Text>
          </View>
        )}
      </View>

      {/* Bottom controls */}
      <View style={styles.ctrlBar}>
        {/* Flash */}
        <TouchableOpacity
          style={styles.sideBtn}
          onPress={() => setFlash(f => !f)}
        >
          <View style={[styles.sideBtnCircle, flash && styles.sideBtnCircleOn]}>
            <Ionicons
              name={flash ? 'flash' : 'flash-off-outline'}
              size={20}
              color={flash ? '#EAB308' : WHITE}
            />
          </View>
          <Text style={styles.sideBtnLabel}>Flash</Text>
        </TouchableOpacity>

        {/* Capture */}
        <TouchableOpacity
          style={[styles.captureBtn, loading && styles.captureBtnDisabled]}
          onPress={handleCapture}
          disabled={loading}
        >
          <View style={[styles.captureInner, loading && { backgroundColor: '#9CA3AF' }]}>
            {loading
              ? <ActivityIndicator color={WHITE} size="small" />
              : <Ionicons name="scan" size={26} color={WHITE} />
            }
          </View>
        </TouchableOpacity>

        {/* Upload */}
        <TouchableOpacity style={styles.sideBtn} onPress={handleUpload} disabled={loading}>
          <View style={styles.sideBtnCircle}>
            <Ionicons name="image-outline" size={20} color={WHITE} />
          </View>
          <Text style={styles.sideBtnLabel}>Upload</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Corner mark ──────────────────────────────────────────────────────────────

function CornerMark({ pos }: { pos: 'tl' | 'tr' | 'bl' | 'br' }) {
  const size = 22, thick = 3;
  const base: any = { position: 'absolute', width: size, height: size };
  const posMap: any = {
    tl: { top: 0,    left: 0 },
    tr: { top: 0,    right: 0 },
    bl: { bottom: 0, left: 0 },
    br: { bottom: 0, right: 0 },
  };
  const isTop    = pos.startsWith('t');
  const isLeft   = pos.endsWith('l');
  return (
    <View style={[base, posMap[pos]]}>
      <View style={{ position: 'absolute', width: size, height: thick, backgroundColor: GREEN, top: isTop ? 0 : undefined, bottom: isTop ? undefined : 0 }} />
      <View style={{ position: 'absolute', width: thick, height: size, backgroundColor: GREEN, left: isLeft ? 0 : undefined, right: isLeft ? undefined : 0 }} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: DARK },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 36 },

  topBar: {
    backgroundColor:   DARK2,
    paddingTop:        Platform.OS === 'ios' ? 54 : 16,
    paddingBottom:     14,
    paddingHorizontal: 20,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    zIndex:            20,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  topTitle: { fontSize: 15, fontWeight: '600', color: WHITE },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  frame: {
    borderWidth:  2,
    borderColor:  GREEN,
    borderRadius: 4,
    position:     'relative',
    backgroundColor: 'transparent',
  },

  hintWrap: {
    position: 'absolute',
    bottom:   24,
    left:     0,
    right:    0,
    alignItems: 'center',
  },
  hintText: { fontSize: 12, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },

  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             16,
  },
  loadingText: { fontSize: 14, color: WHITE, fontWeight: '600' },

  ctrlBar: {
    backgroundColor:   DARK2,
    paddingTop:        16,
    paddingHorizontal: 28,
    paddingBottom:     Platform.OS === 'ios' ? 32 : 16,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
  },

  sideBtn:          { alignItems: 'center', gap: 6 },
  sideBtnCircle:    {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  sideBtnCircleOn:  { backgroundColor: 'rgba(234,179,8,0.18)', borderWidth: 1, borderColor: 'rgba(234,179,8,0.4)' },
  sideBtnLabel:     { fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: '500' },

  captureBtn:        {
    width: 72, height: 72, borderRadius: 36,
    borderWidth: 2, borderColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
  },
  captureBtnDisabled: { borderColor: 'rgba(255,255,255,0.2)' },
  captureInner:       {
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
  },

  permTitle:   { fontSize: 16, fontWeight: '700', color: WHITE, textAlign: 'center', marginTop: 12 },
  permSub:     { fontSize: 12, color: '#9CA3AF', textAlign: 'center', lineHeight: 18 },
  permBtn:     { marginTop: 8, backgroundColor: GREEN, paddingHorizontal: 24, paddingVertical: 11, borderRadius: 99 },
  permBtnText: { fontSize: 13, fontWeight: '700', color: DARK },
});