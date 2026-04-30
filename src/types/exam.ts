// src/types/exam.ts
// ─── Single source of truth for ALL shared types ─────────────────────────────
// Import from here everywhere. Never import types from screens.

// ─── Exam Type ────────────────────────────────────────────────────────────────

export type ExamType =
  | 'bubble_mc'
  | 'text_mc'
  | 'identification'
  | 'enumeration'
  | 'trace_error'
  | 'true_false';

// ─── Answer Key ───────────────────────────────────────────────────────────────

/** Map of question number (string) → correct answer string */
export type AnswerKey = Record<string, string>;

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

  studentAnswers: AnswerKey;
  answerKey:      AnswerKey;

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
    studentAnswers: AnswerKey,
    answerKey:      AnswerKey,
    examType?:      ExamType
  ) => GradeResult
): GradeResult {
  return (
    result.gradeResult ??
    gradeAnswersFn(result.studentAnswers, result.answerKey, result.examType)
  );
}