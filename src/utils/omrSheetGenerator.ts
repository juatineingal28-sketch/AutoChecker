// src/utils/omrSheetGenerator.ts
// ─── OMR Sheet Generator ──────────────────────────────────────────────────────
// Generates sheet metadata, exam IDs, QR payloads, and empty result scaffolds.
// Pure utility — no React, no side effects.

import { OMR_CONFIG, OMROption, OMRScanResult, OMRSheetMeta } from '../constants/omrConfig';

// ─── Exam ID ──────────────────────────────────────────────────────────────────

/** Generates a unique exam ID: "EXAM-20250505-A3F2" */
export function generateExamId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `EXAM-${date}-${rand}`;
}

// ─── QR Payload ───────────────────────────────────────────────────────────────

/**
 * Builds the compact JSON string that gets encoded in the sheet's QR code.
 * Kept short to ensure reliable QR scanning.
 */
export function buildQRPayload(meta: OMRSheetMeta): string {
  return JSON.stringify({
    sid: meta.studentId,
    sec: meta.section,
    eid: meta.examId ?? '',
    sub: meta.subject,
  });
}

/**
 * Parses QR payload back into partial sheet meta.
 * Returns empty object on malformed input — never throws.
 */
export function parseQRPayload(raw: string): Partial<OMRSheetMeta> {
  try {
    const obj = JSON.parse(raw);
    return {
      studentId: obj.sid ?? '',
      section:   obj.sec ?? '',
      examId:    obj.eid ?? '',
      subject:   obj.sub ?? '',
    };
  } catch {
    return {};
  }
}

// ─── Default meta builder ─────────────────────────────────────────────────────

/** Returns a fully-populated OMRSheetMeta with sensible defaults. */
export function buildDefaultMeta(overrides: Partial<OMRSheetMeta> = {}): OMRSheetMeta {
  return {
    studentName:    '',
    studentId:      '',
    section:        OMR_CONFIG.DEFAULTS.SECTION,
    subject:        '',
    date:           new Date().toLocaleDateString('en-PH'),
    testTitle:      OMR_CONFIG.DEFAULTS.TEST_TITLE,
    examId:         generateExamId(),
    totalQuestions: OMR_CONFIG.TOTAL_QUESTIONS,
    ...overrides,
  };
}

// ─── Empty result scaffold ────────────────────────────────────────────────────

/** Builds a blank OMRScanResult where every question starts as BLANK. */
export function buildEmptyResult(meta: OMRSheetMeta): OMRScanResult {
  const total   = meta.totalQuestions ?? OMR_CONFIG.TOTAL_QUESTIONS;
  const answers: Record<number, OMROption | 'BLANK' | 'INVALID'> = {};
  for (let i = 1; i <= total; i++) answers[i] = 'BLANK';

  return {
    studentId: meta.studentId,
    section:   meta.section,
    examId:    meta.examId,
    scannedAt: new Date().toISOString(),
    answers,
  };
}

// ─── Result stats ─────────────────────────────────────────────────────────────

export function getResultStats(result: OMRScanResult): {
  answered: number;
  blanks:   number;
  invalids: number;
} {
  let answered = 0, blanks = 0, invalids = 0;
  for (const v of Object.values(result.answers)) {
    if (v === 'BLANK')   blanks++;
    else if (v === 'INVALID') invalids++;
    else answered++;
  }
  return { answered, blanks, invalids };
}

// ─── Convert OMRScanResult → FlatAnswerKey (for existing grading pipeline) ────

/**
 * Converts an OMRScanResult's answers into the FlatAnswerKey format used by
 * grading.ts / gradeAnswers() so the OMR sheet plugs straight into the
 * existing grading pipeline without any changes to grading.ts.
 */
export function omrAnswersToFlatKey(
  answers: Record<number, OMROption | 'BLANK' | 'INVALID'>
): Record<string, string> {
  const flat: Record<string, string> = {};
  for (const [q, v] of Object.entries(answers)) {
    // BLANK and INVALID become empty string — grader counts them as unanswered
    flat[q] = (v === 'BLANK' || v === 'INVALID') ? '' : v;
  }
  return flat;
}