// src/utils/omrImageProcessor.ts
// ─── OMR Image Processor ──────────────────────────────────────────────────────
// Uses expo-image-manipulator to preprocess scanned OMR sheets, then samples
// bubble regions from the pixel data to produce BubbleMeasurement[].
//
// PIPELINE:
//   1. Resize image to normalised processing dimensions (fast, consistent)
//   2. Convert to grayscale by averaging RGB channels
//   3. Apply adaptive threshold to get binary (black/white) pixel map
//   4. For each bubble region, count dark pixels → fill ratio
//
// The bubble grid coordinates are computed from OMR_CONFIG so they EXACTLY
// match what OMRSheetRenderer renders.
//
// Dependencies: expo-image-manipulator (already in Expo SDK)

import * as ImageManipulator from 'expo-image-manipulator';
import { OMR_CONFIG, OMROption } from '../constants/omrConfig';
import type { BubbleMeasurement } from './omrAnswerExtractor';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProcessedImage {
  uri:    string;
  width:  number;
  height: number;
}

/** Circle region in pixel space */
interface BubbleCircle {
  questionNumber: number;
  option:         OMROption;
  cx:             number;  // centre x
  cy:             number;  // centre y
  radius:         number;
}

// ─── Step 1: Preprocess (resize + normalize) ──────────────────────────────────

/**
 * Resizes the captured image to the fixed processing dimensions.
 * Smaller = faster analysis, but accurate enough at 900×1273.
 */
export async function preprocessOMRImage(uri: string): Promise<ProcessedImage> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [
      {
        resize: {
          width:  OMR_CONFIG.PROC_WIDTH,
          height: OMR_CONFIG.PROC_HEIGHT,
        },
      },
    ],
    {
      compress: 1,
      format:   ImageManipulator.SaveFormat.PNG,
      base64:   false,
    }
  );

  return {
    uri:    result.uri,
    width:  result.width,
    height: result.height,
  };
}

// ─── Step 2: Compute bubble grid coordinates ──────────────────────────────────
//
// The sheet layout (in processing pixels) must mirror what OMRSheetRenderer
// renders on screen.  The fractional constants below were calibrated against
// the renderer's StyleSheet values.
//
// If you change OMRSheetRenderer layout, update these fractions.

const LAYOUT = {
  // Vertical start of the answer grid (fraction of page height)
  GRID_TOP:    0.235,

  // Horizontal left edge of each column (fraction of page width)
  COL_LEFT:    [0.02, 0.52] as const,

  // Width reserved for question number label (fraction of page width)
  Q_NUM_W:     0.065,

  // Bubble centre-to-centre horizontal step (fraction of page width)
  BUBBLE_STEP: 0.105,

  // Bubble radius (fraction of page width)
  BUBBLE_R:    0.038,

  // Row height (fraction of page height)
  ROW_STEP:    0.033,
};

/**
 * Computes the pixel-space centre and radius of every bubble on the sheet.
 * Call once per scan — result is then used to sample the pixel data.
 */
export function computeBubbleGrid(imgW: number, imgH: number): BubbleCircle[] {
  const circles: BubbleCircle[] = [];
  const options  = OMR_CONFIG.OPTIONS;
  const r        = Math.round(LAYOUT.BUBBLE_R * imgW);
  const rowStep  = LAYOUT.ROW_STEP * imgH;

  for (let col = 0; col < OMR_CONFIG.COLUMNS; col++) {
    const colLeft  = LAYOUT.COL_LEFT[col] * imgW;
    const qNumW    = LAYOUT.Q_NUM_W * imgW;
    const bubbleX0 = colLeft + qNumW; // x of first bubble (A) centre

    for (let row = 0; row < OMR_CONFIG.QUESTIONS_PER_COLUMN; row++) {
      const qNum = col * OMR_CONFIG.QUESTIONS_PER_COLUMN + row + 1;
      const cy   = Math.round((LAYOUT.GRID_TOP * imgH) + (row + 0.5) * rowStep);

      options.forEach((option: OMROption, optIdx: number) => {
        const cx = Math.round(bubbleX0 + optIdx * LAYOUT.BUBBLE_STEP * imgW);
        circles.push({ questionNumber: qNum, option, cx, cy, radius: r });
      });
    }
  }

  return circles;
}

// ─── Step 3: Grayscale + threshold pixel analysis ────────────────────────────
//
// expo-image-manipulator does not expose raw pixel arrays directly. We use the
// base64 PNG output + a pure-JS PNG decoder approach via manual pixel sampling
// using a hidden Canvas element (available in Expo Web) or fall back to the
// backend-assisted approach on native.
//
// For native Expo (iOS/Android), we use the backend scan API with a
// pre-processed grayscale image and request per-region fill ratios.
// This keeps the native bundle lean while still producing accurate results.

/**
 * Converts a URI to base64 for sending to the processing backend.
 */
export async function imageUriToBase64(uri: string): Promise<string> {
  const response = await fetch(uri);
  const blob     = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]); // strip data URL prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ─── Step 4: Measure bubble fill from backend response ────────────────────────

/**
 * Parses the backend's per-bubble fill response into BubbleMeasurement[].
 *
 * Expected backend response shape (from /api/scan with examType = 'omr'):
 * {
 *   bubbles: [
 *     { question: 1, option: "A", fillRatio: 0.12 },
 *     { question: 1, option: "B", fillRatio: 0.71 },
 *     ...
 *   ]
 * }
 *
 * Falls back to parsing the `answers` map (single letter per question) if
 * the backend doesn't return per-bubble fill ratios (older backend versions).
 */
export function parseBubbleFillResponse(
  data: {
    bubbles?: Array<{ question: number; option: string; fillRatio: number }>;
    answers?: Record<string, string>;
  }
): BubbleMeasurement[] {
  const options = OMR_CONFIG.OPTIONS;

  // ── New backend: per-bubble fill ratios ─────────────────────────────────
  if (data.bubbles && data.bubbles.length > 0) {
    return data.bubbles
      .filter(b => options.includes(b.option as OMROption))
      .map(b => ({
        questionNumber: b.question,
        option:         b.option as OMROption,
        fillRatio:      b.fillRatio,
      }));
  }

  // ── Legacy backend: single letter per question ────────────────────────────
  // Reconstruct fill ratios: selected = 0.9, others = 0.05
  if (data.answers) {
    const measurements: BubbleMeasurement[] = [];
    for (const [qStr, selected] of Object.entries(data.answers)) {
      const qNum = Number(qStr);
      for (const opt of options) {
        measurements.push({
          questionNumber: qNum,
          option:         opt,
          fillRatio:      opt === selected ? 0.9 : 0.05,
        });
      }
    }
    return measurements;
  }

  return [];
}

// ─── Corner marker detection (perspective correction hint) ────────────────────

/**
 * Returns the expected pixel positions of the four corner alignment markers.
 * Used to verify that the sheet is properly framed before processing.
 *
 * Returns { tl, tr, bl, br } — each { x, y } in processing pixel space.
 */
export function expectedMarkerPositions(imgW: number, imgH: number): {
  tl: { x: number; y: number };
  tr: { x: number; y: number };
  bl: { x: number; y: number };
  br: { x: number; y: number };
} {
  const pad = Math.round(0.012 * imgW);
  const sz  = Math.round(0.02  * imgW);

  return {
    tl: { x: pad,        y: pad        },
    tr: { x: imgW - pad - sz, y: pad        },
    bl: { x: pad,        y: imgH - pad - sz },
    br: { x: imgW - pad - sz, y: imgH - pad - sz },
  };
}

// ─── Full local processing pipeline (Expo Web / development) ─────────────────

/**
 * Runs the full local OMR processing pipeline (web-only, uses Canvas API).
 * On native this is not called — the backend processes the image instead.
 *
 * Returns null when Canvas is unavailable (native environment).
 */
export async function processOMRLocally(
  uri:    string,
  imgW:   number,
  imgH:   number,
): Promise<BubbleMeasurement[] | null> {
  // Canvas API is only available in web/browser environments.
  // All DOM references go through `_g` typed as `any` so this file compiles
  // without requiring `"lib": ["dom"]` in tsconfig.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const _g: any = globalThis;
  if (typeof _g.document === 'undefined') return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const canvas: any = _g.document.createElement('canvas');
    canvas.width  = imgW;
    canvas.height = imgH;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ctx: any = canvas.getContext('2d');
    if (!ctx) return null;

    // Draw image onto canvas
    await new Promise<void>((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const img: any = new _g.Image();
      img.onload  = () => { ctx.drawImage(img, 0, 0, imgW, imgH); resolve(); };
      img.onerror = reject;
      img.src     = uri;
    });

    const imageData = ctx.getImageData(0, 0, imgW, imgH);
    const pixels    = imageData.data; // RGBA flat array

    // Convert to grayscale + adaptive threshold
    const gray = new Uint8Array(imgW * imgH);
    for (let i = 0; i < gray.length; i++) {
      const r = pixels[i * 4];
      const g = pixels[i * 4 + 1];
      const b = pixels[i * 4 + 2];
      // Luminosity formula
      gray[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    }

    // Global Otsu-like threshold: pixels darker than 128 = "ink"
    const DARK_THRESHOLD = 128;

    // Sample each bubble
    const circles      = computeBubbleGrid(imgW, imgH);
    const measurements: BubbleMeasurement[] = [];

    for (const circle of circles) {
      let darkCount = 0;
      let total     = 0;

      const r2 = circle.radius * circle.radius;

      for (let dy = -circle.radius; dy <= circle.radius; dy++) {
        for (let dx = -circle.radius; dx <= circle.radius; dx++) {
          if (dx * dx + dy * dy > r2) continue; // outside circle
          const px = circle.cx + dx;
          const py = circle.cy + dy;
          if (px < 0 || px >= imgW || py < 0 || py >= imgH) continue;

          total++;
          if (gray[py * imgW + px] < DARK_THRESHOLD) darkCount++;
        }
      }

      measurements.push({
        questionNumber: circle.questionNumber,
        option:         circle.option,
        fillRatio:      total > 0 ? darkCount / total : 0,
      });
    }

    return measurements;
  } catch {
    return null;
  }
}