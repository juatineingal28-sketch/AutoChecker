// src/utils/ocrParser.ts
// ─────────────────────────────────────────────────────────────────────────────
// Type-aware OCR payload parser.
//
// Written from scratch — the previous file was a duplicate of grading.ts.
//
// This module is responsible for taking the raw JSON payload returned by the
// /api/scan endpoint and converting it into a ParsedScanPayload that the rest
// of the app can use directly.
//
// KEY DESIGN RULE:
//   The selected examType STRICTLY determines how raw OCR text is interpreted.
//   There is NO guessing, NO mixed-format parsing, NO heuristics.
//
//   bubble_omr      → extract exactly one letter A/B/C/D per bubble zone
//   multiple_choice → extract exactly one letter A/B/C/D per written answer
//   identification  → extract raw text, normalise whitespace/punctuation
//   enumeration     → extract numbered list items into a semicolon-joined string
// ─────────────────────────────────────────────────────────────────────────────

import type { ExamType, FlatAnswerKey } from '../types/exam';

// ─── Public types ─────────────────────────────────────────────────────────────

/** Raw payload shape returned by the /api/scan backend endpoint. */
export interface RawOcrPayload {
  /** Map of question number (string) → raw OCR text for that question. */
  answers:     Record<string, string>;
  studentName: string | null;
  confidence:  number;   // 0–1
  notes:       string;
}

/** Fully parsed and normalised scan output ready for grading. */
export interface ParsedScanPayload {
  studentAnswers:      FlatAnswerKey;
  detectedStudentName: string | null;
  ocrConfidence:       number;
  ocrNotes:            string;
  /** Questions where the OCR result was ambiguous or unparseable. */
  flaggedQuestions:    string[];
}

// ─── Per-type answer parsers ──────────────────────────────────────────────────

/**
 * Bubble OMR: the scanner detects a shaded circle and returns the letter.
 * We accept only A/B/C/D. Any other value (including empty) is flagged.
 */
function parseBubbleAnswer(raw: string, questionNumber: string, flagged: string[]): string {
  const v = raw.trim().toUpperCase();
  if (['A', 'B', 'C', 'D'].includes(v)) return v;
  flagged.push(questionNumber);
  return '';
}

/**
 * Multiple Choice (written): the student writes a letter on paper.
 * OCR extracts it; we accept only A/B/C/D.
 */
function parseMultipleChoiceAnswer(raw: string, questionNumber: string, flagged: string[]): string {
  // Take the first A/B/C/D character found in the raw string (handles "A." or "(B)" etc.)
  const match = raw.match(/\b([A-Da-d])\b/);
  if (match) return match[1].toUpperCase();
  flagged.push(questionNumber);
  return '';
}

/**
 * Identification: short free-text answer.
 * Normalise whitespace, strip leading/trailing punctuation.
 * Do NOT strip internal punctuation (could be part of the answer).
 */
function parseIdentificationAnswer(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')                // collapse whitespace
    .replace(/^[^a-zA-Z0-9]+/, '')       // strip leading non-alphanum
    .replace(/[^a-zA-Z0-9]+$/, '');      // strip trailing non-alphanum
}

/**
 * Enumeration: a numbered list extracted by OCR.
 *
 * The raw string may look like:
 *   "1. Mercury\n2. Venus\n3. Earth"
 * or a single item for one question slot.
 *
 * We join list items with semicolons to match the answer key format used
 * by ANSWER_KEY_TEMPLATES.enumeration (semicolons = multiple accepted values).
 *
 * If the raw text is a single value (no numbering), it is returned as-is.
 */
function parseEnumerationAnswer(raw: string): string {
  const trimmed = raw.trim();

  // Try to parse as a numbered list
  const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length > 1) {
    const items = lines
      .map(line => line.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(Boolean);
    if (items.length > 0) return items.join(';');
  }

  // Single value — return normalised
  return parseIdentificationAnswer(raw);
}

/**
 * True or False: accepts T, F, True, False (case-insensitive).
 * Normalises to canonical 'T' or 'F'. Anything else is flagged.
 */
function parseTrueFalseAnswer(raw: string, questionNumber: string, flagged: string[]): string {
  const v = raw.trim().toLowerCase();
  if (v === 't' || v === 'true')  return 'T';
  if (v === 'f' || v === 'false') return 'F';
  flagged.push(questionNumber);
  return '';
}

// ─── Main parser ──────────────────────────────────────────────────────────────

/**
 * Converts a raw OCR payload into a ParsedScanPayload.
 *
 * @param raw           Raw payload from /api/scan
 * @param examType      The template type selected before scanning (REQUIRED)
 * @param questionCount Expected number of questions (used to fill gaps)
 */
export function parseOcrPayload(
  raw:           RawOcrPayload,
  examType:      ExamType,
  questionCount: number,
): ParsedScanPayload {
  const studentAnswers: FlatAnswerKey = {};
  const flaggedQuestions: string[]    = [];

  for (let i = 1; i <= questionCount; i++) {
    const qKey    = String(i);
    const rawText = (raw.answers[qKey] ?? '').trim();

    if (rawText === '') {
      // No answer detected — leave blank (grader will count as unanswered)
      studentAnswers[qKey] = '';
      flaggedQuestions.push(qKey);
      continue;
    }

    switch (examType) {
      case 'bubble_omr':
        studentAnswers[qKey] = parseBubbleAnswer(rawText, qKey, flaggedQuestions);
        break;

      case 'multiple_choice':
        studentAnswers[qKey] = parseMultipleChoiceAnswer(rawText, qKey, flaggedQuestions);
        break;

      case 'identification':
        studentAnswers[qKey] = parseIdentificationAnswer(rawText);
        break;

      case 'enumeration':
        studentAnswers[qKey] = parseEnumerationAnswer(rawText);
        break;

      case 'true_or_false':
        studentAnswers[qKey] = parseTrueFalseAnswer(rawText, qKey, flaggedQuestions);
        break;

      default: {
        // TypeScript exhaustive check — this should never happen
        const _exhaustive: never = examType;
        console.warn('[ocrParser] Unknown exam type:', _exhaustive);
        studentAnswers[qKey] = rawText;
        flaggedQuestions.push(qKey);
      }
    }
  }

  // Build notes string
  const baseNotes = raw.notes?.trim() ?? '';
  const flagNotes =
    flaggedQuestions.length > 0
      ? `Flagged questions (low confidence or unparseable): ${flaggedQuestions.join(', ')}.`
      : '';
  const ocrNotes = [baseNotes, flagNotes].filter(Boolean).join(' ');

  return {
    studentAnswers,
    detectedStudentName: raw.studentName?.trim() || null,
    ocrConfidence:       raw.confidence ?? 0,
    ocrNotes,
    flaggedQuestions,
  };
}

// ─── Student name extractor ───────────────────────────────────────────────────

/**
 * Attempts to extract a student name from a raw OCR string.
 * Looks for common patterns like "Name: Juan dela Cruz" or a standalone
 * name line at the top of the document.
 *
 * Returns null if nothing reliable is found.
 */
export function extractStudentName(rawText: string): string | null {
  if (!rawText) return null;

  // "Name: ..." pattern
  const nameMatch = rawText.match(/name[:\s]+([A-Za-z\s,.''-]{3,60})/i);
  if (nameMatch) {
    return nameMatch[1].trim().replace(/\s+/g, ' ');
  }

  // First non-empty line under 60 chars that looks like a name
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines.slice(0, 3)) {
    if (/^[A-Za-z\s,.''-]{3,60}$/.test(line)) {
      return line;
    }
  }

  return null;
}

// ─── Confidence classifier ────────────────────────────────────────────────────

export type OcrConfidenceLevel = 'high' | 'medium' | 'low';

/** Classifies the numeric confidence score into a human-readable level. */
export function classifyConfidence(confidence: number): OcrConfidenceLevel {
  if (confidence >= 0.85) return 'high';
  if (confidence >= 0.60) return 'medium';
  return 'low';
}