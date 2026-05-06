// src/services/scanService.ts
// ─────────────────────────────────────────────────────────────────────────────
// CHANGES FROM PREVIOUS VERSION:
//  ✅ EXAM_TYPE_DISPLAY now uses correct ExamType keys (bubble_omr, multiple_choice)
//  ✅ Legacy keys (bubble_mc, text_mc, trace_error, short_answer) removed
//  ✅ scanExamSheet() status message uses correct 'bubble_omr' key
//  ✅ All types use ExamType from exam.ts
//
// Data isolation per teacher account — all storage keyed by userId.
// See original file comment for full explanation.
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import type { ExamType, ScanResult } from '../types/exam';
import type { ParsedScanPayload } from '../utils/ocrParser';
import { parseOcrPayload } from '../utils/ocrParser';
import { BASE_URL, toBackendExamType } from './api';
import { supabase } from './supabaseScans';

// ─── Storage key helpers ──────────────────────────────────────────────────────

function scanKey(userId: string): string {
  if (!userId) throw new Error('[scanService] userId is required — user may not be authenticated.');
  return `scan_results:${userId}`;
}

// ─── Low-level read / write ───────────────────────────────────────────────────

async function readScanResults(userId: string): Promise<ScanResult[]> {
  const raw = await AsyncStorage.getItem(scanKey(userId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ScanResult[];
  } catch {
    return [];
  }
}

async function writeScanResults(userId: string, results: ScanResult[]): Promise<void> {
  await AsyncStorage.setItem(scanKey(userId), JSON.stringify(results));
}

// ─── Legacy data migration ────────────────────────────────────────────────────

export async function migrateLegacyScanData(userId: string): Promise<void> {
  const LEGACY_KEY = 'scan_results';
  try {
    const raw = await AsyncStorage.getItem(LEGACY_KEY);
    if (!raw) return;

    const legacy = JSON.parse(raw) as ScanResult[];
    if (!Array.isArray(legacy) || legacy.length === 0) {
      await AsyncStorage.removeItem(LEGACY_KEY);
      return;
    }

    const existing    = await readScanResults(userId);
    const existingIds = new Set(existing.map(r => r.id));
    const toAdd       = legacy.filter(r => !existingIds.has(r.id));

    if (toAdd.length > 0) {
      await writeScanResults(userId, [...toAdd, ...existing]);
    }

    await AsyncStorage.removeItem(LEGACY_KEY);
  } catch {
    // Non-fatal
  }
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function saveScanResult(userId: string, result: ScanResult): Promise<void> {
  const existing = await readScanResults(userId);
  const idx      = existing.findIndex(r => r.id === result.id);
  if (idx >= 0) {
    existing[idx] = result;
  } else {
    existing.unshift(result);
  }
  await writeScanResults(userId, existing);
}

export async function getScanResults(userId: string): Promise<ScanResult[]> {
  return readScanResults(userId);
}

export async function getScanResultById(userId: string, id: string): Promise<ScanResult | null> {
  const all = await readScanResults(userId);
  return all.find(r => r.id === id) ?? null;
}

export async function deleteScanResult(userId: string, id: string): Promise<void> {
  const existing = await readScanResults(userId);
  await writeScanResults(userId, existing.filter(r => r.id !== id));
}

export async function updateScanResult(
  userId: string,
  id:     string,
  patch:  Partial<ScanResult>,
): Promise<void> {
  const existing = await readScanResults(userId);
  const idx      = existing.findIndex(r => r.id === id);
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...patch };
    await writeScanResults(userId, existing);
  }
}

// ─── Scan types ───────────────────────────────────────────────────────────────

type MimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export interface ScanInput {
  uri:            string;
  fileExtension?: string;
}

export interface ScanOptions {
  examType:      ExamType;
  questionCount: number;
}

// ─── Enrichment types ─────────────────────────────────────────────────────────

export interface ScanMeta {
  section:       string;
  studentId:     string;
  answerKeyUsed: string;
}

export type EnrichedScanResult = ScanResult & {
  section:       string;
  studentId:     string;
  answerKeyUsed: string;
  status:        'Pass' | 'Fail' | 'Review';
  scannedAt:     string;
  examTypeLabel: string;
};

// ─── Exam-type display labels ─────────────────────────────────────────────────
//
// FIXED: now uses correct ExamType keys. Legacy keys removed.

const EXAM_TYPE_DISPLAY: Record<ExamType, string> = {
  bubble_omr:      'Bubble OMR',
  multiple_choice: 'Multiple Choice',
  identification:  'Identification',
  enumeration:     'Enumeration',
  true_or_false:   'True or False',
};

// ─── Status derivation ────────────────────────────────────────────────────────

const DEFAULT_PASSING_SCORE = 75;

export function deriveStatus(
  percentage:    number,
  ocrConfidence: number,
  passingScore   = DEFAULT_PASSING_SCORE,
): 'Pass' | 'Fail' | 'Review' {
  if (ocrConfidence < 0.6) return 'Review';
  return percentage >= passingScore ? 'Pass' : 'Fail';
}

// ─── Enriched save ────────────────────────────────────────────────────────────

export async function saveEnrichedScanResult(
  base:   ScanResult,
  meta:   ScanMeta,
  userId: string,
): Promise<EnrichedScanResult> {
  const ocrConfidence = (base as any).ocrConfidence ?? 1;

  const enriched: EnrichedScanResult = {
    ...base,
    section:       meta.section,
    studentId:     meta.studentId,
    answerKeyUsed: meta.answerKeyUsed,
    status:        deriveStatus(base.percentage, ocrConfidence),
    scannedAt:     (base as any).scannedAt ?? new Date().toISOString(),
    examTypeLabel: EXAM_TYPE_DISPLAY[base.examType] ?? String(base.examType),
  };

  await saveScanResult(userId, enriched as unknown as ScanResult);

  return enriched;
}

// ─── Enriched read helpers ────────────────────────────────────────────────────

export async function getAllEnrichedResults(userId: string): Promise<EnrichedScanResult[]> {
  const raw = await readScanResults(userId);

  let validSectionIds: Set<string> | null = null;
  try {
    const { data: sections } = await supabase
      .from('sections')
      .select('id')
      .eq('user_id', userId);
    if (sections) {
      validSectionIds = new Set(sections.map((s: any) => s.id));
    }
  } catch {
    // Supabase unreachable — show all results
  }

  const filtered = validSectionIds
    ? raw.filter(r => {
        const sid = (r as any).sectionId ?? (r as any).section_id;
        if (!sid) return true;
        return validSectionIds!.has(sid);
      })
    : raw;

  const enriched = filtered.map((r): EnrichedScanResult => ({
    ...r,
    section:       (r as any).section       ?? 'Unknown',
    studentId:     (r as any).studentId     ?? '',
    answerKeyUsed: (r as any).answerKeyUsed ?? '',
    status:        (r as any).status        ?? deriveStatus(r.percentage, (r as any).ocrConfidence ?? 1),
    scannedAt:     (r as any).scannedAt     ?? new Date().toISOString(),
    examTypeLabel: EXAM_TYPE_DISPLAY[r.examType] ?? String(r.examType),
  }));

  return enriched.sort(
    (a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime(),
  );
}

export async function getEnrichedResultsBySection(
  userId:      string,
  sectionName: string,
): Promise<EnrichedScanResult[]> {
  const all = await getAllEnrichedResults(userId);
  return all.filter(r => r.section === sectionName);
}

// ─── OCR scan API ─────────────────────────────────────────────────────────────

const EXT_MIME_MAP: Record<string, MimeType> = {
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  webp: 'image/webp',
  pdf:  'application/pdf',
};

async function fileToBase64(
  uri:            string,
  fileExtension?: string,
): Promise<{ base64: string; mimeType: MimeType }> {
  const ext      = (fileExtension ?? uri.split('.').pop() ?? 'jpg').toLowerCase();
  const mimeType = EXT_MIME_MAP[ext] ?? 'image/jpeg';
  const base64   = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  if (!base64 || base64.length < 100) throw new Error('File could not be read or is empty.');
  return { base64, mimeType };
}

function validateImageSize(base64: string): void {
  const approxMB = (base64.length * 0.75) / (1024 * 1024);
  if (approxMB > 20) throw new Error(`Image too large (${approxMB.toFixed(1)} MB). Use an image under 20 MB.`);
}

export async function scanExamSheet(
  input:     ScanInput,
  options:   ScanOptions,
  onStatus?: (msg: string) => void,
): Promise<ParsedScanPayload> {
  const { examType, questionCount } = options;
  if (questionCount < 1) throw new Error('Question count must be at least 1.');

  onStatus?.('Reading file...');
  const { base64, mimeType } = await fileToBase64(input.uri, input.fileExtension);
  validateImageSize(base64);

  // FIXED: was 'bubble_mc', now correctly checks 'bubble_omr'
  onStatus?.(
    examType === 'bubble_omr'
      ? 'Detecting shaded bubbles...'
      : 'Extracting written answers...'
  );

  const response = await fetch(`${BASE_URL}/api/scan`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ imageBase64: base64, mimeType, examType: toBackendExamType(examType), questionCount }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(body?.error ?? `Server error (${response.status}). Please try again.`);
  }

  const data = await response.json();
  if (!data.success) throw new Error(data.error ?? 'Scan failed. Please try again.');

  onStatus?.('Parsing results...');
  const parsed = parseOcrPayload(
    {
      answers:     data.answers,
      studentName: data.studentName,
      confidence:  data.confidence,
      notes:       data.notes,
    },
    examType,
    questionCount,
  );

  // Map ParsedScanPayload -> ScanPayloadExtended shape that ScanTab expects
  return {
    success:     true,
    answers:     parsed.studentAnswers,
    studentName: parsed.detectedStudentName ?? undefined,
    confidence:  parsed.ocrConfidence,
    notes:       parsed.ocrNotes,
  } as any;
}