// src/services/resultService.ts
// ─────────────────────────────────────────────────────────────────────────────
// All existing exports are untouched below the "existing code" divider.
//
// New additions (appended at the bottom):
//   • StudentHistory + getStudentHistory()
//   • ResultsFilter  + getFilteredResults()
//   • exportResultsAsCSV()
//   • generatePDFReportText()
//   • formatSingleResultForExport()  ← enhanced replacement for formatResultForExport
//
// analyticsService and sectionService import getAllEnrichedResults() from
// scanService, so this file stays focused on result-level operations.
// ─────────────────────────────────────────────────────────────────────────────

import type { AnswerKey, ExamType, ScanResult } from '../types/exam';
import { buildScanResult, gradeAnswers } from '../utils/grading';
import type { ParsedScanPayload } from '../utils/ocrParser';
import type { EnrichedScanResult } from './scanService';
import { getAllEnrichedResults } from './scanService';

import {
  deleteScanResult,
  getAnswerKey,
  getScanResultById,
  getScanResults,
  saveScanResult,
  updateScanResult,
} from '../storage/localStorage';

// ─────────────────────────────────────────────────────────────────────────────
// Existing code — completely unchanged
// ─────────────────────────────────────────────────────────────────────────────

export interface SectionStats {
  sectionId:    string;
  total:        number;
  passed:       number;
  failed:       number;
  passRate:     number;
  averageScore: number;
  highestScore: number;
  lowestScore:  number;
}

export interface SaveScanOptions {
  studentName:    string;
  sectionId:      string | null;
  examType:       ExamType;
  scannedPayload: ParsedScanPayload;
  answerKey:      AnswerKey;
}

export async function saveCompletedScan(options: SaveScanOptions): Promise<ScanResult> {
  const { studentName, sectionId, examType, scannedPayload, answerKey } = options;

  if (!studentName?.trim()) {
    throw new Error('Student name is required before saving.');
  }
  if (!answerKey || Object.keys(answerKey).length === 0) {
    throw new Error('Answer key is empty — cannot grade.');
  }

  const resultData = buildScanResult(
    studentName.trim(),
    sectionId,
    examType,
    scannedPayload.answers || {},
    answerKey,
    scannedPayload.confidence ?? 1,
    scannedPayload.notes      ?? '',
  );

  return await saveScanResult(resultData);
}

export async function regradeResult(id: string): Promise<ScanResult | null> {
  const result = await getScanResultById(id);
  if (!result) return null;

  const graded = gradeAnswers(
    result.studentAnswers || {},
    result.answerKey      || {},
    result.examType,
  );

  await updateScanResult(id, {
    score:       graded.score,
    total:       graded.total,
    percentage:  graded.percentage,
    passed:      graded.passed,
    gradeResult: graded,
  });

  return await getScanResultById(id);
}

export async function getSectionStats(sectionId: string): Promise<SectionStats> {
  const results = await getScanResults(sectionId);

  if (!results || results.length === 0) {
    return { sectionId, total: 0, passed: 0, failed: 0, passRate: 0, averageScore: 0, highestScore: 0, lowestScore: 0 };
  }

  const passed       = results.filter(r => r.passed).length;
  const failed       = results.length - passed;
  const passRate     = Math.round((passed / results.length) * 100);
  const scores       = results.map(r => Number(r.percentage || 0));
  const averageScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);

  return {
    sectionId,
    total: results.length,
    passed,
    failed,
    passRate,
    averageScore,
    highestScore: Math.max(...scores),
    lowestScore:  Math.min(...scores),
  };
}

export const getResultsForSection = (sectionId: string) => getScanResults(sectionId);
export const getAllResults         = ()                   => getScanResults();
export const getResultById        = (id: string)         => getScanResultById(id);
export const removeResult         = (id: string)         => deleteScanResult(id);

export async function answerKeyExists(sectionId: string): Promise<boolean> {
  const key = await getAnswerKey(sectionId);
  return !!key && Object.keys(key).length > 0;
}

/** Original export formatter — kept for backwards compatibility. */
export function formatResultForExport(result: ScanResult): string {
  const lines: string[] = [
    `Student: ${result.studentName}`,
    `Section: ${(result as any).sectionId ?? 'N/A'}`,
    `Exam Type: ${result.examType}`,
    `Score: ${result.score} / ${result.total}`,
    `Percentage: ${result.percentage}%`,
    `Status: ${result.passed ? 'PASSED' : 'FAILED'}`,
    `Date: ${new Date((result as any).scannedAt ?? Date.now()).toLocaleString()}`,
    '',
    'Answers:',
  ];

  const keyNums = Object.keys(result.answerKey || {}).sort(
    (a, b) => parseInt(a, 10) - parseInt(b, 10),
  );

  for (const q of keyNums) {
    const student   = result.studentAnswers?.[q] ?? '—';
    const correct   = result.answerKey?.[q]      ?? '';
    const isCorrect =
      String(student).trim().toUpperCase() ===
      String(correct).trim().toUpperCase();
    lines.push(`Q${q}: ${student} ${isCorrect ? '✓' : `✗ (correct: ${correct})`}`);
  }

  if ((result as any).ocrNotes?.trim()) {
    lines.push('', `Notes: ${(result as any).ocrNotes}`);
  }

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// New additions — Analytics, export, history
// ─────────────────────────────────────────────────────────────────────────────

// ─── New types ────────────────────────────────────────────────────────────────

export interface StudentHistory {
  studentId:   string;
  studentName: string;
  section:     string;
  scans:       EnrichedScanResult[];
  bestScore:   number;
  worstScore:  number;
  average:     number;
  /** 'improving' when recent avg > early avg by >5 pts, vice-versa for declining. */
  trend:       'improving' | 'declining' | 'stable';
}

export interface ResultsFilter {
  section?:  string;
  status?:   'Pass' | 'Fail' | 'Review';
  fromDate?: Date;
  toDate?:   Date;
  /** Matches against studentName or studentId (case-insensitive). */
  search?:   string;
}

// ─── New: filtered results ────────────────────────────────────────────────────

/**
 * Returns enriched results matching the supplied filter criteria.
 * All fields are optional — omitting them returns everything.
 *
 * ```ts
 * const failed = await getFilteredResults({ status: 'Fail', section: 'Luna' });
 * ```
 */
export async function getFilteredResults(
  filter: ResultsFilter,
): Promise<EnrichedScanResult[]> {
  let results = await getAllEnrichedResults();

  if (filter.section) {
    results = results.filter(r => r.section === filter.section);
  }
  if (filter.status) {
    results = results.filter(r => r.status === filter.status);
  }
  if (filter.fromDate) {
    const from = filter.fromDate.getTime();
    results = results.filter(r => new Date(r.scannedAt).getTime() >= from);
  }
  if (filter.toDate) {
    const to = filter.toDate.getTime();
    results = results.filter(r => new Date(r.scannedAt).getTime() <= to);
  }
  if (filter.search) {
    const q = filter.search.toLowerCase();
    results = results.filter(
      r =>
        r.studentName.toLowerCase().includes(q) ||
        r.studentId.toLowerCase().includes(q),
    );
  }

  return results;
}

// ─── New: per-student history ─────────────────────────────────────────────────

/**
 * Groups scan records by student and returns per-student performance history
 * with trend analysis (improving / declining / stable).
 *
 * Pass a sectionName to restrict to one class.
 */
export async function getStudentHistory(
  sectionFilter?: string,
): Promise<StudentHistory[]> {
  const all      = await getAllEnrichedResults();
  const filtered = sectionFilter ? all.filter(r => r.section === sectionFilter) : all;

  const byStudent: Record<string, EnrichedScanResult[]> = {};
  for (const r of filtered) {
    const key = r.studentId || r.studentName; // fall back to name if no ID
    if (!byStudent[key]) byStudent[key] = [];
    byStudent[key].push(r);
  }

  return Object.values(byStudent).map(scans => {
    const sorted      = [...scans].sort(
      (a, b) => new Date(a.scannedAt).getTime() - new Date(b.scannedAt).getTime(),
    );
    const percentages = sorted.map(s => s.percentage);
    const avg         = percentages.reduce((s, p) => s + p, 0) / percentages.length;

    // Compare first-half avg vs second-half avg to determine trend
    const mid       = Math.floor(percentages.length / 2);
    const early     = percentages.slice(0, Math.max(mid, 1));
    const recent    = percentages.slice(Math.max(mid, 1));
    const earlyAvg  = early.reduce((s, p) => s + p, 0)  / early.length;
    const recentAvg = recent.length > 0
      ? recent.reduce((s, p) => s + p, 0) / recent.length
      : earlyAvg;

    let trend: StudentHistory['trend'] = 'stable';
    if (recentAvg - earlyAvg >  5) trend = 'improving';
    if (earlyAvg  - recentAvg > 5) trend = 'declining';

    return {
      studentId:   scans[0].studentId,
      studentName: scans[0].studentName,
      section:     scans[0].section,
      scans:       sorted,
      bestScore:   Math.max(...percentages),
      worstScore:  Math.min(...percentages),
      average:     Math.round(avg * 10) / 10,
      trend,
    };
  });
}

// ─── New: CSV export ──────────────────────────────────────────────────────────

/** Wraps a cell value in quotes if it contains commas, quotes, or newlines. */
function csvCell(value: string | number | boolean): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts a result array to a UTF-8 CSV string ready for sharing.
 *
 * To write and share with expo:
 * ```ts
 * import * as FileSystem from 'expo-file-system';
 * import * as Sharing    from 'expo-sharing';
 *
 * const csv  = exportResultsAsCSV(results);
 * const path = FileSystem.cacheDirectory + 'results.csv';
 * await FileSystem.writeAsStringAsync(path, csv, { encoding: 'utf8' });
 * await Sharing.shareAsync(path, { mimeType: 'text/csv' });
 * ```
 */
export function exportResultsAsCSV(results: EnrichedScanResult[]): string {
  const header = [
    'Student Name',
    'Student ID',
    'Section',
    'Exam Type',
    'Score',
    'Total Items',
    'Percentage',
    'Status',
    'OCR Confidence',
    'Answer Key Used',
    'Scanned At',
  ].join(',');

  const rows = results.map(r =>
    [
      csvCell(r.studentName),
      csvCell(r.studentId),
      csvCell(r.section),
      csvCell(r.examTypeLabel),
      csvCell(r.score),
      csvCell(r.total),
      csvCell(`${r.percentage}%`),
      csvCell(r.status),
      csvCell(`${Math.round(((r as any).ocrConfidence ?? 1) * 100)}%`),
      csvCell(r.answerKeyUsed),
      csvCell(r.scannedAt),
    ].join(','),
  );

  return [header, ...rows].join('\n');
}

// ─── New: plain-text PDF report ───────────────────────────────────────────────

function col(text: string, width: number, align: 'left' | 'right' = 'left'): string {
  const str = String(text).slice(0, width);
  return align === 'right' ? str.padStart(width) : str.padEnd(width);
}

/**
 * Generates a formatted plain-text grading report.
 *
 * To print via expo-print:
 * ```ts
 * import * as Print from 'expo-print';
 * const report = generatePDFReportText(results);
 * await Print.printAsync({ html: `<pre style="font-family:monospace;font-size:12px">${report}</pre>` });
 * ```
 */
export function generatePDFReportText(
  results: EnrichedScanResult[],
  title   = 'AutoChecker — Grading Report',
): string {
  const now      = new Date().toLocaleString();
  const total    = results.length;
  const passed   = results.filter(r => r.status === 'Pass').length;
  const failed   = results.filter(r => r.status === 'Fail').length;
  const review   = results.filter(r => r.status === 'Review').length;
  const avgPct   = total > 0
    ? Math.round(results.reduce((s, r) => s + r.percentage, 0) / total)
    : 0;

  // Group by section for the summary block
  const bySec: Record<string, EnrichedScanResult[]> = {};
  for (const r of results) {
    const key = r.section || 'Unknown';
    if (!bySec[key]) bySec[key] = [];
    bySec[key].push(r);
  }

  const divider = '─'.repeat(66);

  const lines: string[] = [
    title,
    `Generated : ${now}`,
    divider,
    '',
    `Total Papers Graded : ${total}`,
    `Class Average       : ${avgPct}%`,
    `Passed              : ${passed}  (${total ? Math.round((passed / total) * 100) : 0}%)`,
    `Failed              : ${failed}  (${total ? Math.round((failed / total) * 100) : 0}%)`,
    `Needs Review        : ${review}`,
    '',
    divider,
    'SECTION SUMMARY',
    divider,
  ];

  for (const [sec, items] of Object.entries(bySec)) {
    const secAvg  = Math.round(items.reduce((s, r) => s + r.percentage, 0) / items.length);
    const secPass = items.filter(r => r.status === 'Pass').length;
    lines.push(
      `${col(sec, 16)} │ ${col(`${items.length} students`, 14)} │ Avg: ${col(`${secAvg}%`, 5, 'right')} │ Pass rate: ${Math.round((secPass / items.length) * 100)}%`,
    );
  }

  lines.push(
    '',
    divider,
    'INDIVIDUAL RESULTS',
    divider,
    [
      col('Name',     22),
      col('Section',  12),
      col('Score',     6, 'right'),
      col('Pct',       5, 'right'),
      col('Status',    8),
    ].join('  '),
    divider,
  );

  for (const r of results) {
    lines.push(
      [
        col(r.studentName,           22),
        col(r.section,               12),
        col(`${r.score}/${r.total}`,  6, 'right'),
        col(`${r.percentage}%`,       5, 'right'),
        col(r.status,                 8),
      ].join('  '),
    );
  }

  lines.push('', divider, 'End of report — AutoChecker');
  return lines.join('\n');
}

// ─── New: enhanced single-result export ──────────────────────────────────────

/**
 * Formats one scan result for clipboard / sharing.
 * Uses enriched fields (section, studentId, status, etc.) when available,
 * and falls back gracefully for legacy records.
 *
 * Replaces the original `formatResultForExport` in ResultsTab — but the
 * original is still exported above for any existing call sites.
 */
export function formatSingleResultForExport(r: EnrichedScanResult): string {
  const breakdown = Object.keys(r.answerKey || {})
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .map(q => {
      const student   = r.studentAnswers?.[q] ?? '—';
      const correct   = r.answerKey?.[q]      ?? '';
      const ok        =
        student.trim().toUpperCase() === correct.trim().toUpperCase() &&
        student.trim() !== '';
      return `  Q${q}: ${student} ${ok ? '✓' : `✗ (${correct})`}`;
    })
    .join('\n');

  return [
    '─── AutoChecker Result ───',
    `Student   : ${r.studentName}`,
    `ID        : ${r.studentId  || '—'}`,
    `Section   : ${r.section}`,
    `Exam Type : ${r.examTypeLabel}`,
    `Score     : ${r.score} / ${r.total}  (${r.percentage}%)`,
    `Status    : ${r.status}`,
    `Key Used  : ${r.answerKeyUsed || '—'}`,
    `Scanned   : ${new Date(r.scannedAt).toLocaleString()}`,
    '─────────────────────────',
    'Answer Breakdown:',
    breakdown,
  ].join('\n');
}