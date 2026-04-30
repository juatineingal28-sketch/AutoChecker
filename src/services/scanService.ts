// src/services/scanService.ts
// ─────────────────────────────────────────────────────────────────────────────
// FIX: Data isolation per teacher account.
//
// ROOT CAUSE OF DATA LEAK:
//   Previously, getScanResults() / saveScanResult() used a single global
//   AsyncStorage key (e.g. "scan_results"). Every teacher account read from
//   and wrote to the exact same bucket.
//
// FIX:
//   Every storage operation is now keyed by the authenticated user's ID:
//     "scan_results:{userId}"
//
//   This means Teacher A's scans are physically stored under a different key
//   than Teacher B's, so there is zero cross-account data visibility.
//
//   HOW TO WIRE UP:
//     Pass the userId string from your AuthContext into every function that
//     reads or writes scan records. Example in ScanTab:
//
//       const { user } = useAuth();
//       const enriched = await saveEnrichedScanResult(result, meta, user!.id);
//       const all      = await getAllEnrichedResults(user!.id);
//
// ─────────────────────────────────────────────────────────────────────────────

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import type { ExamType, ScanResult } from '../types/exam';
import type { ParsedScanPayload } from '../utils/ocrParser';
import { parseOcrPayload } from '../utils/ocrParser';
import { BASE_URL } from './api';
import { supabase } from './supabaseScans';

// ─── Storage key helpers ──────────────────────────────────────────────────────

/**
 * Returns the AsyncStorage key that belongs exclusively to this user.
 * NEVER use a bare key like "scan_results" — always call this.
 */
function scanKey(userId: string): string {
  if (!userId) throw new Error('[scanService] userId is required — user may not be authenticated.');
  return `scan_results:${userId}`;
}

// ─── Low-level read / write (now user-scoped) ─────────────────────────────────

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

/**
 * ONE-TIME migration: if data was saved before the userId-scoping fix it lives
 * under the bare key "scan_results".  On first login we move it into the
 * user-scoped key so the teacher doesn't lose their history, then delete the
 * global key so no other account can ever read it.
 *
 * Call this right after the user is confirmed authenticated (e.g. in AuthContext
 * after fetchProfile resolves, or at the top of HomeTab's loadData).
 *
 * It is safe to call on every login — after the first run the legacy key is
 * gone and this becomes a no-op.
 */
export async function migrateLegacyScanData(userId: string): Promise<void> {
  const LEGACY_KEY = 'scan_results';
  try {
    const raw = await AsyncStorage.getItem(LEGACY_KEY);
    if (!raw) return; // nothing to migrate

    const legacy = JSON.parse(raw) as ScanResult[];
    if (!Array.isArray(legacy) || legacy.length === 0) {
      await AsyncStorage.removeItem(LEGACY_KEY);
      return;
    }

    // Merge into user-scoped store (avoid duplicates by id)
    const existing = await readScanResults(userId);
    const existingIds = new Set(existing.map(r => r.id));
    const toAdd = legacy.filter(r => !existingIds.has(r.id));
    if (toAdd.length > 0) {
      await writeScanResults(userId, [...toAdd, ...existing]);
    }

    // Delete the global key — no other account must ever see this data
    await AsyncStorage.removeItem(LEGACY_KEY);
  } catch {
    // Non-fatal — migration failure must never block the user from logging in
  }
}



/** Saves one scan result under the authenticated user's key. */
export async function saveScanResult(userId: string, result: ScanResult): Promise<void> {
  const existing = await readScanResults(userId);
  // Replace if already present (re-save after edits), otherwise prepend.
  const idx = existing.findIndex(r => r.id === result.id);
  if (idx >= 0) {
    existing[idx] = result;
  } else {
    existing.unshift(result);
  }
  await writeScanResults(userId, existing);
}

/** Returns all scan results for this user, newest first. */
export async function getScanResults(userId: string): Promise<ScanResult[]> {
  return readScanResults(userId);
}

/** Returns a single scan result by ID for this user, or null. */
export async function getScanResultById(userId: string, id: string): Promise<ScanResult | null> {
  const all = await readScanResults(userId);
  return all.find(r => r.id === id) ?? null;
}

/** Deletes a single scan result for this user. */
export async function deleteScanResult(userId: string, id: string): Promise<void> {
  const existing = await readScanResults(userId);
  await writeScanResults(userId, existing.filter(r => r.id !== id));
}

/** Patches fields on an existing scan result for this user. */
export async function updateScanResult(
  userId: string,
  id: string,
  patch: Partial<ScanResult>,
): Promise<void> {
  const existing = await readScanResults(userId);
  const idx = existing.findIndex(r => r.id === id);
  if (idx >= 0) {
    existing[idx] = { ...existing[idx], ...patch };
    await writeScanResults(userId, existing);
  }
}

// ─── Existing types ───────────────────────────────────────────────────────────

type MimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export interface ScanInput {
  uri: string;
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

const EXAM_TYPE_DISPLAY: Record<string, string> = {
  bubble_mc:      'Bubble OMR',
  text_mc:        'Multiple Choice',
  identification: 'Identification',
  enumeration:    'Enumeration',
  trace_error:    'Trace the Error',
  short_answer:   'Short Answer',
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

/**
 * Saves a scan result enriched with section / student / key metadata.
 * NOW REQUIRES userId so the record is stored under the correct account.
 *
 * Usage in ScanTab:
 * ```ts
 * const { user } = useAuth();
 * const enriched = await saveEnrichedScanResult(processedResult, {
 *   section:       currentSection.name,
 *   studentId:     studentIdInput.trim(),
 *   answerKeyUsed: activeAnswerKeyLabel,
 * }, user!.id);
 * navigation.navigate('Results', { result: enriched });
 * ```
 */
export async function saveEnrichedScanResult(
  base:   ScanResult,
  meta:   ScanMeta,
  userId: string,           // ← NEW required param
): Promise<EnrichedScanResult> {
  const ocrConfidence = (base as any).ocrConfidence ?? 1;

  const enriched: EnrichedScanResult = {
    ...base,
    section:       meta.section,
    studentId:     meta.studentId,
    answerKeyUsed: meta.answerKeyUsed,
    status:        deriveStatus(base.percentage, ocrConfidence),
    scannedAt:     (base as any).scannedAt ?? new Date().toISOString(),
    examTypeLabel: EXAM_TYPE_DISPLAY[base.examType as string] ?? String(base.examType),
  };

  await saveScanResult(userId, enriched as unknown as ScanResult);

  return enriched;
}

// ─── Enriched read helpers ────────────────────────────────────────────────────

/**
 * Returns every stored record for THIS USER cast to EnrichedScanResult,
 * newest first.
 *
 * BEFORE (leaking):  const raw = await getScanResults();  // global key!
 * AFTER  (safe):     const raw = await getAllEnrichedResults(user.id);
 */
export async function getAllEnrichedResults(userId: string): Promise<EnrichedScanResult[]> {
  const raw = await readScanResults(userId);

  // ── Filter out results whose section has been deleted from Supabase ──────
  // Fetch all section IDs that still exist for this user.
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
    // If Supabase is unreachable, skip filtering — show all results.
  }

  const filtered = validSectionIds
    ? raw.filter(r => {
        const sid = (r as any).sectionId ?? (r as any).section_id;
        // Keep results that have no sectionId OR whose sectionId still exists
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
    examTypeLabel: EXAM_TYPE_DISPLAY[r.examType as string] ?? String(r.examType),
  }));

  return enriched.sort(
    (a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime(),
  );
}

/**
 * Returns enriched results filtered to a single section for THIS USER.
 */
export async function getEnrichedResultsBySection(
  userId:      string,
  sectionName: string,
): Promise<EnrichedScanResult[]> {
  const all = await getAllEnrichedResults(userId);
  return all.filter(r => r.section === sectionName);
}

// ─────────────────────────────────────────────────────────────────────────────
// Existing OCR API logic — unchanged
// ─────────────────────────────────────────────────────────────────────────────

const EXT_MIME_MAP: Record<string, MimeType> = {
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  webp: 'image/webp',
  pdf:  'application/pdf',
};

async function fileToBase64(
  uri: string,
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
  input: ScanInput,
  options: ScanOptions,
  onStatus?: (msg: string) => void,
): Promise<ParsedScanPayload> {
  const { examType, questionCount } = options;
  if (questionCount < 1) throw new Error('Question count must be at least 1.');

  onStatus?.('Reading file...');
  const { base64, mimeType } = await fileToBase64(input.uri, input.fileExtension);
  validateImageSize(base64);

  onStatus?.(examType === 'bubble_mc' ? 'Detecting shaded bubbles...' : 'Extracting written answers...');

  const response = await fetch(`${BASE_URL}/api/scan`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ imageBase64: base64, mimeType, examType, questionCount }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(body?.error ?? `Server error (${response.status}). Please try again.`);
  }

  const data = await response.json();
  if (!data.success) throw new Error(data.error ?? 'Scan failed. Please try again.');

  onStatus?.('Parsing results...');
  return parseOcrPayload(
    { answers: data.answers, studentName: data.studentName, confidence: data.confidence, notes: data.notes },
    examType,
    questionCount,
  );
}