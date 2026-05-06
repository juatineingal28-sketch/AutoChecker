// src/utils/omrAnswerExtractor.ts
// ─── OMR Answer Extractor ─────────────────────────────────────────────────────
// Takes the raw per-bubble fill ratios produced by omrImageProcessor and
// converts them into a structured OMRScanResult.
//
// This is the ONLY place where the fill threshold decision is made.
// All callers get a clean OMROption | 'BLANK' | 'INVALID' per question.

import { OMR_CONFIG, OMROption, OMRScanResult, OMRSheetMeta } from '../constants/omrConfig';
import { omrAnswersToFlatKey } from './omrSheetGenerator';

// ─── Types ────────────────────────────────────────────────────────────────────

/** One bubble's fill measurement — produced by omrImageProcessor. */
export interface BubbleMeasurement {
  questionNumber: number;
  option:         OMROption;
  /** 0–1: fraction of pixels darker than the threshold inside the bubble circle. */
  fillRatio:      number;
}

/** Per-question classification result. */
export interface QuestionClassification {
  questionNumber: number;
  selected:       OMROption | 'BLANK' | 'INVALID';
  fillRatios:     Record<OMROption, number>;
  /** True when two or more bubbles exceeded the threshold. */
  multipleMarked: boolean;
}

// ─── Core extractor ───────────────────────────────────────────────────────────

/**
 * Classifies each question by finding which (if any) bubble is filled.
 *
 * Rules:
 *   0 filled → BLANK
 *   1 filled → that option (A/B/C/D)
 *   2+ filled → INVALID
 *
 * @param measurements  Array of BubbleMeasurement from omrImageProcessor
 * @param threshold     Fill ratio cutoff (default: OMR_CONFIG.FILL_THRESHOLD)
 */
export function classifyBubbles(
  measurements: BubbleMeasurement[],
  threshold: number = OMR_CONFIG.FILL_THRESHOLD,
): QuestionClassification[] {
  // Group by question number
  const grouped: Record<number, BubbleMeasurement[]> = {};
  for (const m of measurements) {
    if (!grouped[m.questionNumber]) grouped[m.questionNumber] = [];
    grouped[m.questionNumber].push(m);
  }

  const results: QuestionClassification[] = [];

  for (const [qStr, bubbles] of Object.entries(grouped)) {
    const qNum = Number(qStr);

    // Build fill map
    const fillRatios = {} as Record<OMROption, number>;
    for (const b of bubbles) fillRatios[b.option] = b.fillRatio;

    // Find filled bubbles
    const filled = bubbles.filter(b => b.fillRatio >= threshold);

    let selected: OMROption | 'BLANK' | 'INVALID';
    let multipleMarked = false;

    if (filled.length === 0) {
      selected = 'BLANK';
    } else if (filled.length === 1) {
      selected = filled[0].option;
    } else {
      // Multiple filled — pick the most filled one but mark INVALID
      selected      = 'INVALID';
      multipleMarked = true;
    }

    results.push({ questionNumber: qNum, selected, fillRatios, multipleMarked });
  }

  return results.sort((a, b) => a.questionNumber - b.questionNumber);
}

// ─── Build OMRScanResult ──────────────────────────────────────────────────────

/**
 * Converts classified bubbles + sheet meta into an OMRScanResult that can be
 * passed directly to omrAnswersToFlatKey() → gradeAnswers() in grading.ts.
 */
export function buildOMRScanResult(
  classifications: QuestionClassification[],
  meta:            Partial<OMRSheetMeta>,
): OMRScanResult {
  const answers: Record<number, OMROption | 'BLANK' | 'INVALID'> = {};
  for (const c of classifications) answers[c.questionNumber] = c.selected;

  return {
    studentId:  meta.studentId  ?? '',
    section:    meta.section    ?? '',
    examId:     meta.examId,
    scannedAt:  new Date().toISOString(),
    answers,
  };
}

// ─── Integration helper: OMR → existing grading pipeline ─────────────────────

/**
 * One-stop conversion:
 *   BubbleMeasurement[] + meta  →  FlatAnswerKey (Record<string, string>)
 *
 * Call this, then pass the result directly to gradeAnswers() from grading.ts
 * with examType = 'bubble_omr'.
 *
 * Example:
 *   const studentAnswers = omrToFlatAnswerKey(measurements, meta);
 *   const gradeResult    = gradeAnswers(studentAnswers, answerKey, 'bubble_omr');
 */
export function omrToFlatAnswerKey(
  measurements: BubbleMeasurement[],
  meta:         Partial<OMRSheetMeta>,
  threshold?:   number,
): Record<string, string> {
  const classifications = classifyBubbles(measurements, threshold);
  const scanResult      = buildOMRScanResult(classifications, meta);
  return omrAnswersToFlatKey(scanResult.answers);
}

// ─── Stats summary ────────────────────────────────────────────────────────────

export function summariseClassifications(classifications: QuestionClassification[]): {
  answered: number;
  blank:    number;
  invalid:  number;
  total:    number;
} {
  let answered = 0, blank = 0, invalid = 0;
  for (const c of classifications) {
    if (c.selected === 'BLANK')   blank++;
    else if (c.selected === 'INVALID') invalid++;
    else answered++;
  }
  return { answered, blank, invalid, total: classifications.length };
}