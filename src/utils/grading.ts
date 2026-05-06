// src/utils/grading.ts
// Strict deterministic grading — no AI, no fuzzy logic.
//
// Supported exam types: bubble_omr | multiple_choice | identification | enumeration | true_or_false
//
// CHANGES FROM PREVIOUS VERSION:
//  ✅ examType is now REQUIRED in gradeAnswers() — no heuristic fallback
//  ✅ detectNormType() removed — type is always known from the template
//  ✅ Uses FlatAnswerKey (Record<string, string>) from exam.ts
//  ✅ Enumeration: student answer matched against any semicolon-separated accepted value

import type {
  ExamType,
  FlatAnswerKey,
  GradeBreakdown,
  GradeResult,
  NewScanResult,
} from '../types/exam';

// Re-export for consumers that still import from grading.ts
export type { GradeBreakdown, GradeResult };

// ─── Internal Normalisation Strategy ──────────────────────────────────────────

type NormType = 'mcq' | 'identification' | 'enumeration' | 'true_or_false';

/** Maps every ExamType to a NormType. Compile-time exhaustive. */
function normTypeFor(examType: ExamType): NormType {
  switch (examType) {
    case 'bubble_omr':
    case 'multiple_choice':
      return 'mcq';
    case 'identification':
      return 'identification';
    case 'enumeration':
      return 'enumeration';
    case 'true_or_false':
      return 'true_or_false';
  }
}

// ─── Normalizers ───────────────────────────────────────────────────────────────

function normalizeMCQ(val: string): string {
  const v = val.trim().toUpperCase();
  return ['A', 'B', 'C', 'D'].includes(v) ? v : '';
}

function normalizeIdentification(val: string): string {
  return val
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:'"]/g, '');
}

/**
 * Normalizes one side of an enumeration answer.
 * Splits on semicolons (accepted answer separator), sorts, and joins.
 * This lets "Red;Crimson" match "Crimson;Red".
 */
function normalizeEnumerationSide(val: string): string {
  return val
    .trim()
    .toLowerCase()
    .split(/;+/)
    .map(s => s.trim())
    .filter(Boolean)
    .sort()
    .join(';');
}

/**
 * Normalizes True/False answers.
 * Accepts T, F, True, False (case-insensitive) → canonical 'T' or 'F'.
 */
function normalizeTrueFalse(val: string): string {
  const v = val.trim().toLowerCase();
  if (v === 't' || v === 'true')  return 'T';
  if (v === 'f' || v === 'false') return 'F';
  return '';
}

function normalizeByType(val: string, type: NormType): string {
  switch (type) {
    case 'mcq':            return normalizeMCQ(val);
    case 'identification': return normalizeIdentification(val);
    case 'enumeration':    return normalizeEnumerationSide(val);
    case 'true_or_false':  return normalizeTrueFalse(val);
  }
}

// ─── Enumeration matching ──────────────────────────────────────────────────────

/**
 * For enumeration, the answer key stores semicolon-separated accepted values
 * (e.g. "Red;Crimson"). A student answer is correct if it matches ANY one
 * of those accepted values after normalisation.
 */
function matchEnumeration(studentRaw: string, correctRaw: string): boolean {
  const studentNorm = normalizeIdentification(studentRaw); // treat student's answer as plain text
  const acceptedValues = correctRaw
    .split(';')
    .map(s => normalizeIdentification(s.trim()))
    .filter(Boolean);
  return acceptedValues.includes(studentNorm);
}

// ─── Core Grading ──────────────────────────────────────────────────────────────

/**
 * Grades student answers against the answer key.
 *
 * examType is REQUIRED. The exam type determines how answers are normalised
 * and compared. There is no fallback heuristic — the caller must always
 * supply the correct type from the template.
 */
export function gradeAnswers(
  studentAnswers: Record<string, string>,
  answerKey:      FlatAnswerKey,
  examType:       ExamType,
): GradeResult {
  const breakdown: GradeBreakdown[] = [];
  let score      = 0;
  let unanswered = 0;

  const total    = Object.keys(answerKey).length;
  const normType = normTypeFor(examType);

  for (const q of Object.keys(answerKey)) {
    const correctRaw = (answerKey[q] ?? '').trim();
    const studentRaw = (studentAnswers[q] ?? '').trim();

    const isUnanswered = studentRaw === '';
    if (isUnanswered) unanswered++;

    let isCorrect = false;
    let studentNorm = '';
    let correctNorm = '';

    if (!isUnanswered) {
      if (examType === 'enumeration') {
        // Enumeration: match student's answer against any accepted value
        isCorrect   = matchEnumeration(studentRaw, correctRaw);
        studentNorm = normalizeIdentification(studentRaw);
        correctNorm = normalizeEnumerationSide(correctRaw);
      } else {
        studentNorm = normalizeByType(studentRaw, normType);
        correctNorm = normalizeByType(correctRaw, normType);
        isCorrect   = correctNorm !== '' && studentNorm === correctNorm;
      }
    }

    if (isCorrect) score++;

    breakdown.push({
      questionNumber:    q,
      correct:           isCorrect,
      studentAnswer:     studentRaw || '—',
      correctAnswer:     correctRaw,
      normalizedStudent: studentNorm || '—',
      normalizedCorrect: correctNorm,
    });
  }

  const wrong      = Math.max(total - score - unanswered, 0);
  const percentage = total > 0 ? Math.round((score / total) * 100) : 0;

  return {
    score,
    total,
    wrong,
    unanswered,
    percentage,
    passed: percentage >= 75,
    breakdown,
  };
}

// ─── Answer Key Validator ──────────────────────────────────────────────────────

export function validateAnswerKey(
  key:      FlatAnswerKey,
  examType: ExamType,
): { valid: boolean; error?: string } {
  const { getTemplate } = require('../types/exam');
  const template = getTemplate(examType);
  const entries  = Object.entries(key);

  if (entries.length === 0) {
    return { valid: false, error: 'Answer key is empty.' };
  }

  for (const [q, a] of entries) {
    if (!a?.trim()) {
      return { valid: false, error: `Question ${q} has no answer.` };
    }
    const err = template.validateAnswer(a.trim(), Number(q));
    if (err) return { valid: false, error: err };
  }

  return { valid: true };
}

// ─── Answer Key Text Parser ────────────────────────────────────────────────────

/**
 * Parses a plain-text answer key into a FlatAnswerKey.
 * Accepts lines like:
 *   "1. A"  "1) B"  "1: C"  "1 D"
 */
export function parseAnswerKeyText(text: string): FlatAnswerKey {
  const key: FlatAnswerKey = {};

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^(\d+)[.):\s]\s*(.+)/);
    if (match) {
      key[match[1]] = match[2].trim();
    }
  }

  return key;
}

// ─── Result Builder ────────────────────────────────────────────────────────────

/**
 * Builds a NewScanResult (no id / scannedAt) from raw scan data.
 * Embeds gradeResult so downstream consumers (ResultScreen, etc.) never
 * need to re-grade.
 */
export function buildScanResult(
  studentName:         string,
  sectionId:           string | null,
  examType:            ExamType,
  studentAnswers:      FlatAnswerKey,
  answerKey:           FlatAnswerKey,
  ocrConfidence:       number,
  ocrNotes:            string,
  detectedStudentName: string | null = null,
): NewScanResult {
  const gradeResult = gradeAnswers(studentAnswers, answerKey, examType);

  return {
    studentName:         studentName.trim(),
    sectionId,
    examType,
    studentAnswers,
    answerKey,
    score:               gradeResult.score,
    total:               gradeResult.total,
    percentage:          gradeResult.percentage,
    passed:              gradeResult.passed,
    ocrConfidence,
    ocrNotes,
    gradeResult,
    detectedStudentName,
  };
}