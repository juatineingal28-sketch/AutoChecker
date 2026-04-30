// src/utils/grading.ts
// Strict deterministic grading — no AI, no fuzzy logic.

import type { AnswerKey, ExamType, GradeBreakdown, GradeResult, NewScanResult } from '../types/exam';

// Re-export for consumers that still import from grading.ts
export type { GradeBreakdown, GradeResult };

// ─── Normalizers ───────────────────────────────────────────────────────────────

function normalizeMCQ(val: string): string {
  const v = val.trim().toUpperCase();
  return ['A', 'B', 'C', 'D'].includes(v) ? v : '';
}

function normalizeTrueFalse(val: string): string {
  const v = val.trim().toUpperCase();
  if (v === 'T' || v === 'TRUE')  return 'T';
  if (v === 'F' || v === 'FALSE') return 'F';
  return '';
}

function normalizeIdentification(val: string): string {
  return val
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.,!?;:'"]/g, '');
}

function normalizeEnumeration(val: string): string {
  return val
    .trim()
    .toLowerCase()
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .sort()
    .join(',');
}

function normalizeShortAnswer(val: string): string {
  return val.trim().toLowerCase().replace(/\s+/g, ' ');
}

type QuestionType =
  | 'mcq'
  | 'truefalse'
  | 'identification'
  | 'enumeration'
  | 'short_answer';

function detectQuestionType(answer: string, examType?: ExamType): QuestionType {
  if (examType === 'bubble_mc' || examType === 'text_mc') return 'mcq';
  if (examType === 'enumeration')                         return 'enumeration';
  if (examType === 'trace_error')                         return 'short_answer';
  if (examType === 'identification')                      return 'identification';

  const v = answer.trim().toUpperCase();
  if (['A', 'B', 'C', 'D'].includes(v))          return 'mcq';
  if (['T', 'F', 'TRUE', 'FALSE'].includes(v))    return 'truefalse';
  if (answer.includes(','))                        return 'enumeration';

  return 'identification';
}

function normalizeByType(val: string, type: QuestionType): string {
  switch (type) {
    case 'mcq':           return normalizeMCQ(val);
    case 'truefalse':     return normalizeTrueFalse(val);
    case 'identification':return normalizeIdentification(val);
    case 'enumeration':   return normalizeEnumeration(val);
    case 'short_answer':  return normalizeShortAnswer(val);
  }
}

// ─── Core Grading ──────────────────────────────────────────────────────────────

export function gradeAnswers(
  studentAnswers: Record<string, string>,
  answerKey:      AnswerKey,
  examType?:      ExamType
): GradeResult {
  const breakdown: GradeBreakdown[] = [];
  let score      = 0;
  let unanswered = 0;

  const total = Object.keys(answerKey).length;

  for (const q of Object.keys(answerKey)) {
    const correctRaw = (answerKey[q] ?? '').trim();
    const studentRaw = (studentAnswers[q] ?? '').trim();

    const type = detectQuestionType(correctRaw, examType);

    const correctNorm = normalizeByType(correctRaw, type);
    const studentNorm = normalizeByType(studentRaw, type);

    const isUnanswered = studentRaw === '' || studentNorm === '';
    if (isUnanswered) unanswered++;

    const isCorrect =
      !isUnanswered &&
      correctNorm !== '' &&
      studentNorm === correctNorm;

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

// ─── Answer Key Parser ─────────────────────────────────────────────────────────

export function parseAnswerKeyText(text: string): AnswerKey {
  const key: AnswerKey = {};
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(/^(\d+)[.):\s]\s*([A-Za-z](?:\s+\S+)*)/);
    if (match) {
      key[match[1]] = match[2].trim();
    }
  }

  return key;
}

export function validateAnswerKey(key: AnswerKey): { valid: boolean; error?: string } {
  const entries = Object.entries(key);

  if (entries.length === 0) {
    return { valid: false, error: 'Answer key is empty.' };
  }

  for (const [q, a] of entries) {
    if (!a?.trim()) {
      return { valid: false, error: `Question ${q} has no answer.` };
    }
  }

  return { valid: true };
}

// ─── Result Builder ────────────────────────────────────────────────────────────

/**
 * Builds a NewScanResult (no id/scannedAt) from raw scan data.
 * Embeds gradeResult so downstream consumers (ResultScreen, etc.) never
 * need to re-grade.
 */
export function buildScanResult(
  studentName:         string,
  sectionId:           string | null,
  examType:            ExamType,
  studentAnswers:      AnswerKey,
  answerKey:           AnswerKey,
  ocrConfidence:       number,
  ocrNotes:            string,
  detectedStudentName: string | null = null
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