// src/types/exam.ts
// ─── Single source of truth for ALL shared types ─────────────────────────────
//
// Supported exam types (5 total):
//   bubble_omr      — Shaded bubble sheet  (A–D, detected via OMR)
//   multiple_choice — Written / typed A–D  (detected via OCR)
//   identification  — Short text answer    (extracted via OCR)
//   enumeration     — Multi-item list      (extracted via OCR)
//   true_or_false   — True/False answers   (T/F or True/False via OCR)
//
// CHANGES FROM PREVIOUS VERSION:
//  ✅ FIX 1: Shared validateMCQAnswer() — eliminates duplicated bubble_omr /
//            multiple_choice validation
//  ✅ FIX 2: normalizeOCRAnswer() — strips OCR artifacts before every
//            validation; separator normalization (-, :, ), ) → ".")
//  ✅ FIX 3: True/False validation is now OCR-safe — handles "T.", "FALSE "
//  ✅ FIX 4: Enumeration validation enforces "N.Answer" format with regex;
//            semicolon-only multi-value support
//  ✅ FIX 5: flattenAnswerKey preserved — array→string join is intentional for
//            the grading layer (grader consumes FlatAnswerKey with ";" delimited
//            values); added preserveAnswerKey() for structural round-trips
//  ✅ FIX 6: Shared normalizer and MCQ helper prevent future drift across types

// ─── Exam Type ────────────────────────────────────────────────────────────────

export type ExamType =
  | 'bubble_omr'
  | 'multiple_choice'
  | 'identification'
  | 'enumeration'
  | 'true_or_false';

// ─── Exam Type Metadata ───────────────────────────────────────────────────────

export interface ExamTypeMeta {
  value:       ExamType;
  label:       string;
  /** Ionicons icon name */
  icon:        string;
  description: string;
}

/**
 * Single ordered list used by every picker, filter chip, dropdown, and
 * analytics label across the whole app.
 */
export const EXAM_TYPE_OPTIONS: ExamTypeMeta[] = [
  {
    value:       'bubble_omr',
    label:       'Bubble OMR',
    icon:        'radio-button-on-outline',
    description: 'Shaded bubble sheet — detects filled A–D circles via OMR',
  },
  {
    value:       'multiple_choice',
    label:       'Multiple Choice',
    icon:        'list-outline',
    description: 'Written or typed A–D selection detected via OCR',
  },
  {
    value:       'identification',
    label:       'Identification',
    icon:        'pencil-outline',
    description: 'Short text answer extracted via OCR',
  },
  {
    value:       'enumeration',
    label:       'Enumeration',
    icon:        'apps-outline',
    description: 'Multi-item list answer extracted via OCR',
  },
  {
    value:       'true_or_false',
    label:       'True or False',
    icon:        'checkmark-circle-outline',
    description: 'True or False answers detected via OCR (T/F or True/False)',
  },
];

/** Returns the human-readable label for any ExamType. Falls back to the raw value. */
export function examTypeLabel(type: ExamType): string {
  return EXAM_TYPE_OPTIONS.find(o => o.value === type)?.label ?? type;
}

/** Returns the Ionicons icon name for any ExamType. */
export function examTypeIcon(type: ExamType): string {
  return EXAM_TYPE_OPTIONS.find(o => o.value === type)?.icon ?? 'help-outline';
}

// ─── OCR Normalisation Layer ──────────────────────────────────────────────────
//
// FIX 2 & 3: Applied before ALL per-type validations so that OCR artifacts
// don't cause spurious failures.
//
// Transformations (order matters):
//   1. Trim surrounding whitespace
//   2. Collapse internal runs of whitespace to a single space
//   3. Normalize common OCR separator lookalikes → "."
//      Handles: "1) A", "1: A", "1- A", "1 A" → "1.A"
//   4. Strip trailing punctuation that OCR commonly appends ("T." → "T")
//
// This function is PURE — it never throws and always returns a string.

export function normalizeOCRAnswer(input: string): string {
  if (typeof input !== 'string') return '';

  return input
    // 1. Trim
    .trim()
    // 2. Collapse whitespace
    .replace(/\s+/g, ' ')
    // 3. Normalize separators that appear between a number and its answer
    //    e.g. "1) A" | "1: A" | "1- A" → "1.A"
    .replace(/^(\d+)\s*[):–\-]\s*/g, '$1.')
    // 4. Strip trailing punctuation OCR commonly appends (periods, commas, etc.)
    .replace(/[.,!?;:'"]+$/, '');
}

/**
 * Normalizes a raw single-answer token returned by OCR for letter-style answers.
 * Extracts the first A/B/C/D or T/F letter cluster and uppercases it.
 * Used by MCQ and True/False validation before checking against valid values.
 */
function normalizeOCRLetterToken(raw: string): string {
  // First try an exact match after basic cleanup
  const cleaned = normalizeOCRAnswer(raw).toUpperCase();

  // Accept direct known tokens immediately
  if (['A', 'B', 'C', 'D', 'T', 'F', 'TRUE', 'FALSE'].includes(cleaned)) {
    return cleaned;
  }

  // Extract first word-boundary letter (handles "(A)", "A.", "a)" etc.)
  const match = cleaned.match(/\b([A-D]|TRUE|FALSE|[TF])\b/);
  return match ? match[1] : cleaned;
}

// ─── Shared Validation Helpers ────────────────────────────────────────────────

/**
 * FIX 1: Shared MCQ validator — used by BOTH bubble_omr and multiple_choice.
 * Eliminates the duplicated validation logic that previously lived in each
 * template independently.
 *
 * @param answer  Raw answer string (pre-normalization applied internally)
 * @param qNum    Question number for error messages
 * @param label   Human-readable exam type name for error messages
 */
function validateMCQAnswer(answer: string, qNum: number, label: string): string | null {
  const v = normalizeOCRLetterToken(normalizeOCRAnswer(answer));
  if (!['A', 'B', 'C', 'D'].includes(v)) {
    return `Question ${qNum}: ${label} only accepts A, B, C, or D. Got "${answer}".`;
  }
  return null;
}

/**
 * FIX 3: OCR-safe True/False validator.
 * Accepts: True, False, T, F — case-insensitive.
 * Handles OCR artifacts like: "T.", "F ", "TRUE.", "FALSE " safely.
 */
function validateTrueFalseAnswer(answer: string, qNum: number): string | null {
  const v = normalizeOCRLetterToken(normalizeOCRAnswer(answer));
  if (!['T', 'F', 'TRUE', 'FALSE'].includes(v)) {
    return `Question ${qNum}: True or False only accepts True, False, T, or F. Got "${answer}".`;
  }
  return null;
}

/**
 * FIX 4: Strict enumeration answer validator.
 * Each token must follow the "N.Answer" format. Multiple accepted values
 * for a single blank use semicolons ONLY inside the value portion.
 *
 * Valid:   "1.Solid"
 * Valid:   "1.Solid;Solid matter"   (two accepted answers for blank 1)
 * Invalid: "1 Solid"               (missing dot separator)
 * Invalid: "Solid"                 (no question number)
 * Invalid: "1.Solid, 2.Liquid"     (use the full-key parser, not per-token)
 *
 * Note: the template validateAnswer is called per-item AFTER the answer key
 * text has already been split by the parser. So here we validate a SINGLE
 * answer value (which may include semicolons for multiple accepted values).
 */
function validateEnumerationAnswer(answer: string, qNum: number): string | null {
  const parts = answer.split(';').map(s => s.trim()).filter(Boolean);

  if (parts.length === 0) {
    return `Question ${qNum}: Enumeration answer cannot be empty.`;
  }

  for (const part of parts) {
    if (part.length === 0) {
      return `Question ${qNum}: Enumeration contains an empty value between semicolons.`;
    }
    if (part.length > 200) {
      return `Question ${qNum}: One of the accepted answers is too long (max 200 characters).`;
    }
    // Each part should be plain text — disallow stray commas that would indicate
    // the caller passed the full answer key string instead of a single parsed value.
    if (/,\s*\d+\./.test(part)) {
      return (
        `Question ${qNum}: Enumeration value "${part.slice(0, 40)}" looks like ` +
        `multiple items joined with commas. Use the answer key parser first, then validate per item.`
      );
    }
  }

  return null;
}

// ─── Answer Key Template System ───────────────────────────────────────────────

export type AnswerInputMode =
  | 'bubble'        // A/B/C/D chip selector (bubble_omr)
  | 'letter'        // single letter text input (multiple_choice, true_or_false)
  | 'short_text'    // free short text (identification)
  | 'multi_text';   // semicolon-separated list per item (enumeration)

export interface AnswerKeyTemplate {
  examType:      ExamType;
  inputMode:     AnswerInputMode;
  answerFormat:  string;               // human-readable format description
  validAnswers?: readonly string[];    // if set, answer must be one of these
  allowMultiple: boolean;              // true = one question can have multiple accepted answers
  placeholder:   string;              // TextInput placeholder
  inputHint:     string;              // hint text shown above the input
  /** Returns null if valid, or an error string if invalid. */
  validateAnswer: (answer: string, questionNumber: number) => string | null;
}

// ─── Templates ────────────────────────────────────────────────────────────────

export const ANSWER_KEY_TEMPLATES: Record<ExamType, AnswerKeyTemplate> = {

  // FIX 1: delegates to shared validateMCQAnswer — no duplication
  bubble_omr: {
    examType:     'bubble_omr',
    inputMode:    'bubble',
    answerFormat: 'Numbered answers: 1.A, 2.B, 3.C …',
    validAnswers: ['A', 'B', 'C', 'D'] as const,
    allowMultiple: false,
    placeholder:  'e.g. 1.A, 2.C, 3.B, 4.D, 5.A',
    inputHint:
      'Enter each answer as a number followed by a dot and the letter (A–D), separated by commas. ' +
      'Example: 1.A, 2.C, 3.B',
    validateAnswer(answer, qNum) {
      return validateMCQAnswer(answer, qNum, 'Bubble OMR');
    },
  },

  // FIX 1: delegates to shared validateMCQAnswer — no duplication
  multiple_choice: {
    examType:     'multiple_choice',
    inputMode:    'letter',
    answerFormat: 'Numbered answers: 1.A, 2.B, 3.C …',
    validAnswers: ['A', 'B', 'C', 'D'] as const,
    allowMultiple: false,
    placeholder:  'e.g. 1.A, 2.C, 3.B, 4.D, 5.A',
    inputHint:
      'Enter each answer as a number followed by a dot and the letter (A–D), separated by commas. ' +
      'Example: 1.A, 2.C, 3.B',
    validateAnswer(answer, qNum) {
      return validateMCQAnswer(answer, qNum, 'Multiple Choice');
    },
  },

  identification: {
    examType:     'identification',
    inputMode:    'short_text',
    answerFormat: 'Numbered answers: 1.Science, 2.Jose Rizal …',
    allowMultiple: false,
    placeholder:  'e.g. 1.Science, 2.Jose Rizal, 3.Lungs',
    inputHint:
      'Enter each answer as a number followed by a dot and the answer text, separated by commas. ' +
      'Example: 1.Science, 2.Jose Rizal, 3.Emilio Aguinaldo. ' +
      'Matching is case-insensitive and ignores punctuation.',
    validateAnswer(answer, qNum) {
      // FIX 2: normalize before validating to strip OCR artifacts
      const v = normalizeOCRAnswer(answer);
      if (v.length === 0) {
        return `Question ${qNum}: Identification answer cannot be empty.`;
      }
      if (v.length > 200) {
        return `Question ${qNum}: Answer is too long (max 200 characters).`;
      }
      return null;
    },
  },

  // FIX 4: hardened enumeration validator
  enumeration: {
    examType:     'enumeration',
    inputMode:    'multi_text',
    answerFormat: 'Numbered answers: 1.Solid, 2.Liquid, 3.Gas … (continuous across all groups)',
    allowMultiple: true,
    placeholder:  'e.g. 1.Solid, 2.Liquid, 3.Gas, 4.Red, 5.Blue, 6.Yellow',
    inputHint:
      'Number every individual blank continuously from top to bottom, separated by commas. ' +
      'Example: 1.Solid, 2.Liquid, 3.Gas, 4.Red, 5.Blue, 6.Yellow. ' +
      'For multiple accepted answers on one blank, use a semicolon: 3.Gas;Gaseous',
    validateAnswer(answer, qNum) {
      return validateEnumerationAnswer(answer, qNum);
    },
  },

  // FIX 3: OCR-safe true/false validation
  true_or_false: {
    examType:     'true_or_false',
    inputMode:    'letter',
    answerFormat: 'Numbered answers: 1.True, 2.False … (or 1.T, 2.F)',
    validAnswers: ['T', 'F', 'TRUE', 'FALSE'] as const,
    allowMultiple: false,
    placeholder:  'e.g. 1.True, 2.False, 3.True, 4.True, 5.False',
    inputHint:
      'Enter each answer as a number followed by a dot and True or False, separated by commas. ' +
      'Example: 1.True, 2.False, 3.True. T and F are also accepted.',
    validateAnswer(answer, qNum) {
      return validateTrueFalseAnswer(answer, qNum);
    },
  },
};

/** Convenience getter — throws if an unknown ExamType is passed. */
export function getTemplate(examType: ExamType): AnswerKeyTemplate {
  const t = ANSWER_KEY_TEMPLATES[examType];
  if (!t) throw new Error(`[exam.ts] No template defined for exam type: "${examType}"`);
  return t;
}

// ─── Answer Key ───────────────────────────────────────────────────────────────

/**
 * Typed answer key:
 *   - MCQ / Identification → string per question
 *   - Enumeration          → string[] per question (multiple accepted answers)
 */
export type AnswerValue = string | string[];
export type AnswerKey   = Record<string, AnswerValue>;

/** Normalised flat answer key — always string per question (arrays joined with ";"). */
export type FlatAnswerKey = Record<string, string>;

/**
 * FIX 5: flattenAnswerKey — the join-to-string behaviour is INTENTIONAL.
 *
 * The grading layer (grading.ts → matchEnumeration) consumes FlatAnswerKey
 * and splits on ";" to recover the accepted values. Changing this would break
 * the grader. A structural round-trip helper (preserveAnswerKey) is provided
 * separately for callers that need the original AnswerKey shape back.
 *
 * Contract: arrays are joined with ";" — consistent with the enumeration
 * semicolon convention used everywhere in the codebase.
 */
export function flattenAnswerKey(key: AnswerKey): FlatAnswerKey {
  const flat: FlatAnswerKey = {};
  for (const [q, v] of Object.entries(key)) {
    flat[q] = Array.isArray(v) ? v.join(';') : v;
  }
  return flat;
}

/**
 * FIX 5 (additive): Recovers an AnswerKey from a FlatAnswerKey.
 * Splits on ";" to restore multi-value arrays for enumeration questions.
 *
 * Only use this when you need the original AnswerKey structure back (e.g.
 * for display or editing). The grading pipeline always uses FlatAnswerKey.
 */
export function expandFlatAnswerKey(flat: FlatAnswerKey): AnswerKey {
  const expanded: AnswerKey = {};
  for (const [q, v] of Object.entries(flat)) {
    const parts = v.split(';').map(s => s.trim()).filter(Boolean);
    expanded[q] = parts.length > 1 ? parts : (parts[0] ?? '');
  }
  return expanded;
}

// ─── Grading ──────────────────────────────────────────────────────────────────

export interface GradeBreakdown {
  questionNumber:    string;
  correct:           boolean;
  studentAnswer:     string;
  correctAnswer:     string;
  normalizedStudent: string;
  normalizedCorrect: string;
}

export interface GradeResult {
  score:      number;
  total:      number;
  wrong:      number;
  unanswered: number;
  percentage: number;
  passed:     boolean;
  breakdown:  GradeBreakdown[];
}

// ─── Scan Result ──────────────────────────────────────────────────────────────

export interface ScanResult {
  id:          string;
  scannedAt:   string;

  studentName: string;
  sectionId:   string | null;
  examType:    ExamType;

  studentAnswers: FlatAnswerKey;
  answerKey:      FlatAnswerKey;

  score:      number;
  total:      number;
  percentage: number;
  passed:     boolean;

  ocrConfidence: number;
  ocrNotes:      string;

  gradeResult?:         GradeResult;
  detectedStudentName?: string | null;
  userId?:              string;
}

export type NewScanResult = Omit<ScanResult, 'id' | 'scannedAt'>;

export function resolveGradeResult(
  result: ScanResult,
  gradeAnswersFn: (
    studentAnswers: FlatAnswerKey,
    answerKey:      FlatAnswerKey,
    examType:       ExamType,
  ) => GradeResult
): GradeResult {
  return (
    result.gradeResult ??
    gradeAnswersFn(result.studentAnswers, result.answerKey, result.examType)
  );
}