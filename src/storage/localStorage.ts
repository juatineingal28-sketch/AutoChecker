// src/storage/localStorage.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ExamType, GradeResult } from '../types/exam';

const RESULTS_KEY      = 'autochecker_scan_results';
const ANSWER_KEY_PREFIX = 'autochecker_answer_key_';

export type AnswerKey = Record<string, string>;

export interface ScanResult {
  id:             string;
  studentName:    string;
  sectionId:      string | null;
  examType:       ExamType;

  studentAnswers: Record<string, string>;
  answerKey:      AnswerKey;

  score:      number;
  total:      number;
  percentage: number;
  passed:     boolean;

  ocrConfidence: number;
  ocrNotes:      string;

  scannedAt:   string;
  reviewNotes?: string;

  // ─── Added fields ──────────────────────────────────────────────────────────
  // Optional so existing saved results (without these fields) don't break.
  // Use resolveGradeResult() helper when reading gradeResult.
  gradeResult?:         GradeResult;
  detectedStudentName?: string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// ─── Scan Results ─────────────────────────────────────────────────────────────

export async function getScanResults(sectionId?: string): Promise<ScanResult[]> {
  try {
    const raw     = await AsyncStorage.getItem(RESULTS_KEY);
    const results: ScanResult[] = raw ? JSON.parse(raw) : [];
    if (sectionId) return results.filter(r => r.sectionId === sectionId);
    return results;
  } catch {
    return [];
  }
}

export async function saveScanResult(
  result: Omit<ScanResult, 'id' | 'scannedAt'>
): Promise<ScanResult> {
  const fullResult: ScanResult = {
    ...result,
    id:        generateId(),
    scannedAt: new Date().toISOString(),
  };

  const existing = await getScanResults();
  existing.unshift(fullResult);
  await AsyncStorage.setItem(RESULTS_KEY, JSON.stringify(existing));
  return fullResult;
}

export async function getScanResultById(id: string): Promise<ScanResult | null> {
  const results = await getScanResults();
  return results.find(r => r.id === id) ?? null;
}

export async function updateScanResult(
  id:      string,
  updates: Partial<ScanResult>
): Promise<void> {
  const results = await getScanResults();
  const updated = results.map(r => r.id === id ? { ...r, ...updates } : r);
  await AsyncStorage.setItem(RESULTS_KEY, JSON.stringify(updated));
}

export async function deleteScanResult(id: string): Promise<void> {
  const results = await getScanResults();
  const filtered = results.filter(r => r.id !== id);
  await AsyncStorage.setItem(RESULTS_KEY, JSON.stringify(filtered));
}

// ─── Answer Key ───────────────────────────────────────────────────────────────

export async function getAnswerKey(sectionId: string): Promise<AnswerKey | null> {
  try {
    const raw = await AsyncStorage.getItem(`${ANSWER_KEY_PREFIX}${sectionId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function saveAnswerKey(
  sectionId: string,
  answerKey:  AnswerKey
): Promise<void> {
  await AsyncStorage.setItem(
    `${ANSWER_KEY_PREFIX}${sectionId}`,
    JSON.stringify(answerKey)
  );
}