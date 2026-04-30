// src/utils/ocrParser.ts

import type { ExamType } from '../types/exam';

export interface RawScanPayload {
  examType?:    string;
  studentName?: string | null;
  answers?:     Record<string, unknown>;
  confidence?:  number;
  notes?:       string;
}

export interface ParsedScanPayload {
  answers:     Record<string, string>;
  studentName: string | null;
  confidence:  number;
  notes:       string;
  warnings:    string[];
}

// ─── Sanitizers ───────────────────────────────────────────────────────────────

function sanitiseMCQAnswer(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const value = raw.trim().toUpperCase();
  const match = value.match(/^[(\s]*([ABCD])[)\s]*$/);
  return match ? match[1] : '';
}

function sanitiseTextAnswer(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.trim();
}

const sanitiserMap: Record<ExamType, (value: unknown) => string> = {
  bubble_mc:      sanitiseMCQAnswer,
  text_mc:        sanitiseMCQAnswer,
  identification: sanitiseTextAnswer,
  enumeration:    sanitiseTextAnswer,
  trace_error:    sanitiseTextAnswer,
  short_answer:   sanitiseTextAnswer,
};

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseOcrPayload(
  raw:           RawScanPayload,
  examType:      ExamType,
  expectedCount: number
): ParsedScanPayload {
  const warnings: string[] = [];
  const sanitise = sanitiserMap[examType] ?? sanitiseTextAnswer;

  const rawAnswers = raw.answers || {};
  const answers: Record<string, string> = {};

  // Step 1 — copy whatever the server detected
  for (const [key, value] of Object.entries(rawAnswers)) {
    const questionNumber = parseInt(key, 10);
    if (isNaN(questionNumber) || questionNumber < 1) continue;
    answers[String(questionNumber)] = sanitise(value);
  }

  // Step 2 — guarantee EVERY question 1 to expectedCount exists in the map.
  // Without this, missing questions are never added to answers, so the UI
  // only renders boxes for questions it received (e.g. 6 out of 10).
  for (let i = 1; i <= expectedCount; i++) {
    if (!(String(i) in answers)) {
      answers[String(i)] = '';
    }
  }

  // Step 3 — count how many actually have a non-blank answer
  const detectedCount = Object.values(answers).filter((v) => v !== '').length;
  const missingFraction = expectedCount > 0 ? (expectedCount - detectedCount) / expectedCount : 0;
  if (missingFraction > 0.3) {
    warnings.push(`Only ${detectedCount} of ${expectedCount} questions detected.`);
  }

  const blankCount = Object.values(answers).filter((v) => v === '').length;
  if (blankCount > 0) {
    warnings.push(`${blankCount} answer(s) unreadable and marked blank.`);
  }

  const rawConfidence = typeof raw.confidence === 'number' ? raw.confidence : null;

  // Treat confidence === 0 as "not provided" — the backend emits 0 when it
  // simply has no value, not as a meaningful low score. Default to 1.0 so we
  // don't fire spurious low-confidence warnings on every scan.
  const confidenceProvided = rawConfidence !== null && rawConfidence > 0;
  let confidence = confidenceProvided ? rawConfidence! : 1.0;
  confidence = Math.max(0, Math.min(1, confidence));

  if (confidenceProvided && confidence < 0.6) {
    warnings.push('Low OCR confidence detected.');
  }

  const studentName =
    typeof raw.studentName === 'string' && raw.studentName.trim().length > 0
      ? raw.studentName.trim()
      : null;

  const notes = [raw.notes || '', ...warnings].filter(Boolean).join(' | ');

  return { answers, studentName, confidence, notes, warnings };
}

export function extractJsonFromClaudeResponse(raw: string): RawScanPayload {
  const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch { /* fall through */ }
    }
  }

  return { answers: {}, confidence: 0, notes: 'Failed to parse OCR JSON.' };
}