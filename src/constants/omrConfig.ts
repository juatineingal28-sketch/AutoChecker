// src/constants/omrConfig.ts
// ─── OMR Configuration ────────────────────────────────────────────────────────
// Single source of truth for all OMR sheet constants, types, and defaults.
// Every util and screen imports from here — never hard-code these values.

// ─── Types ────────────────────────────────────────────────────────────────────

/** Valid bubble options on the sheet. */
export type OMROption = 'A' | 'B' | 'C' | 'D';

/** Metadata that describes one printed OMR sheet. */
export interface OMRSheetMeta {
  studentName:    string;
  studentId:      string;
  section:        string;
  subject:        string;
  date:           string;
  testTitle:      string;
  examId:         string;
  totalQuestions: number;
}

/** Result produced after scanning a completed OMR sheet. */
export interface OMRScanResult {
  studentId:  string;
  section:    string;
  examId:     string | undefined;
  scannedAt:  string;
  answers:    Record<number, OMROption | 'BLANK' | 'INVALID'>;
}

// ─── Config object ────────────────────────────────────────────────────────────

export const OMR_CONFIG = {
  /** Bubble letter options — order must match renderer column order. */
  OPTIONS: ['A', 'B', 'C', 'D'] as OMROption[],

  /** Default total number of questions on a sheet. */
  TOTAL_QUESTIONS: 50,

  /** Number of answer columns on the sheet (2 = Q1–50 left, Q51–100 right). */
  COLUMNS: 2,

  /** Questions rendered per column (TOTAL_QUESTIONS / COLUMNS). */
  QUESTIONS_PER_COLUMN: 25,

  /**
   * Fill ratio (0–1) above which a bubble is considered "filled".
   * Tune this if you see false positives/negatives during scanning.
   */
  FILL_THRESHOLD: 0.45,

  /** Target width (px) the image is resized to before pixel analysis. */
  PROC_WIDTH: 900,

  /** Target height (px) — A4 aspect ratio at PROC_WIDTH. */
  PROC_HEIGHT: 1273,

  DEFAULTS: {
    SECTION:    '',
    TEST_TITLE: 'Examination',
  },
} as const;