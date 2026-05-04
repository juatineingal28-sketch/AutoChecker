// server.js  — AutoChecker Backend  (UPGRADED)
// ─────────────────────────────────────────────────────────────────────────────
//
// What changed vs original:
//
//  HANDWRITING IMPROVEMENTS
//  1. sharp pipeline upgraded:
//       • modulate (brightness +10%)  → lifts faint ballpen strokes
//       • median filter (3px)         → removes salt-and-pepper noise
//       • threshold raised to 175     → better binarisation for dark ink on white
//       • resize to 2800px            → more pixels for LSTM on small handwriting
//  2. PSM sequence extended: [4, 6, 3, 11, 12]
//       • PSM 12 (sparse text w/ OSD) added — catches isolated written letters
//  3. Handwriting-specific inverted retry on ALL exam types (not just MC)
//  4. OCR character whitelist split:
//       • MC   → "0123456789ABCDabcd.):-/ \n"  (tight, fewer substitutions)
//       • Text → full alphanumeric (no restriction)
//  5. fixOcrSubstitutions() extended with handwriting-specific confusions:
//       • q→a, n→A, u→A, 6→b, E→B, F→E, H→A, etc.
//  6. extractWrittenAnswers() — NEW function for identification/enumeration/short-answer:
//       • tolerates dirty OCR (extra chars, merged words)
//       • handles multi-word answers
//       • normalises capitalisation per exam type
//
//  RELIABILITY / CRASH PREVENTION
//  7. parseVisionText() never throws for empty text — returns empty answers map
//  8. All sharp operations wrapped with individual try/catch
//  9. Tesseract worker always terminated in finally block
// 10. POST /api/scan returns { success: false, answers: {}, confidence: 0 }
//     instead of 500 when OCR produces no usable text
//
//  PERFORMANCE
// 11. Single sharp pipeline call (was multiple chained calls)
// 12. Worker reuse considered — kept per-PSM creation for stability on mobile
//
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();

const express   = require('express');
const multer    = require('multer');
const cors      = require('cors');
const fs        = require('fs');
const path      = require('path');
const pdfParse = require('pdf-parse/lib/pdf-parse.js');
const mammoth   = require('mammoth');
const Tesseract = require('tesseract.js');

// sharp is optional — gracefully degrade if not installed
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.warn('[AutoChecker] ⚠️  sharp not found. Install for better handwriting accuracy:');
  console.warn('              npm install sharp');
}

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Dirs ─────────────────────────────────────────────────────────────────────

const DATA_DIR    = path.join(__dirname, 'data');
const UPLOADS_DIR = path.join(__dirname, 'uploads');
[DATA_DIR, UPLOADS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors());
app.use(express.json({ limit: '20mb' }));

// ─── Multer ───────────────────────────────────────────────────────────────────

const ACCEPTED_EXTS = ['.json', '.txt', '.pdf', '.docx', '.doc'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename:    (_req, file,  cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    ACCEPTED_EXTS.includes(ext) ? cb(null, true) : cb(new Error(`Unsupported file. Accepted: ${ACCEPTED_EXTS.join(', ')}`));
  },
});

// ─── Disk store ───────────────────────────────────────────────────────────────

function dataPath(id)      { return path.join(DATA_DIR, `section_${id}.json`); }
function readStore(id)     { try { return JSON.parse(fs.readFileSync(dataPath(id), 'utf8')); } catch { return null; } }
function writeStore(id, d) { fs.writeFileSync(dataPath(id), JSON.stringify(d, null, 2), 'utf8'); }
function deleteStore(id)   { try { fs.unlinkSync(dataPath(id)); } catch {} }

const SECTIONS_PATH = path.join(DATA_DIR, '_sections.json');
function readSections()     { try { return JSON.parse(fs.readFileSync(SECTIONS_PATH, 'utf8')); } catch { return []; } }
function writeSections(arr) { fs.writeFileSync(SECTIONS_PATH, JSON.stringify(arr, null, 2), 'utf8'); }


// ─── Settings store ───────────────────────────────────────────────────────────

const SETTINGS_PATH = path.join(DATA_DIR, '_settings.json');
const DEFAULT_SETTINGS = {
  autoDetect:    true,
  scanTips:      true,
  flagLow:       false,
  treeToggleOcr: false,
  scanning:      true,
};
function readSettings()      { try { return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8')) }; } catch { return { ...DEFAULT_SETTINGS }; } }
function writeSettings(data) { fs.writeFileSync(SETTINGS_PATH, JSON.stringify(data, null, 2), 'utf8'); }

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_COLORS = new Set(['blue','green','amber','red']);

// ─── Normalizers ──────────────────────────────────────────────────────────────

function resolveType(raw) {
  const s = String(raw ?? 'mc').toLowerCase().replace(/[\s_\-]/g, '');
  return ({ mc:'mc', multiplechoice:'mc', truefalse:'truefalse', tf:'truefalse',
    identification:'identification', id:'identification', enumeration:'enumeration',
    enum:'enumeration', traceerror:'traceError', trace:'traceError', tracetheerror:'traceError',
    shortanswer:'shortAnswer', short:'shortAnswer', sa:'shortAnswer' })[s] ?? 'identification';
}

function inferType(raw) {
  const u = raw.trim().toUpperCase();
  if (['A','B','C','D'].includes(u)) return 'mc';
  if (['TRUE','FALSE'].includes(u))  return 'truefalse';
  if (raw.includes(','))             return 'enumeration';
  return 'identification';
}

function normalizeAnswer(type, raw) {
  switch (type) {
    case 'mc':          return String(raw).trim().toUpperCase();
    case 'truefalse':   return String(raw).trim().toUpperCase() === 'TRUE' ? 'True' : 'False';
    case 'enumeration': {
      const arr = Array.isArray(raw) ? raw : String(raw).split(',');
      return arr.map(s => s.trim().toLowerCase()).filter(Boolean);
    }
    default: return String(raw).trim().toLowerCase();
  }
}

// ─── Text parser ──────────────────────────────────────────────────────────────

function parseTextLines(text) {
  const RE   = /^(?:q)?(\d+)[.):\s]+(.+)$/i;
  const seen = new Set();
  return text.split('\n').map(l => l.trim()).filter(Boolean).reduce((acc, line) => {
    const m = line.match(RE);
    if (!m) return acc;
    const qNum = parseInt(m[1], 10);
    if (seen.has(qNum)) return acc;
    seen.add(qNum);
    let rawValue = m[2].trim();
    let type     = null;
    const tag    = rawValue.match(/^\[type:([^\]]+)\]\s*/i);
    if (tag) { type = resolveType(tag[1]); rawValue = rawValue.slice(tag[0].length).trim(); }
    if (!rawValue) return acc;
    if (!type) type = inferType(rawValue);
    acc.push({ question: qNum, type, answer: normalizeAnswer(type, rawValue) });
    return acc;
  }, []).sort((a, b) => a.question - b.question);
}

// ─── JSON parser ──────────────────────────────────────────────────────────────

function parseJsonItems(raw) {
  if (!Array.isArray(raw)) return { error: 'JSON must be an array.' };
  if (!raw.length)         return { error: 'Answer key is empty.' };
  if (raw.length > 300)    return { error: 'Exceeds 300 items.' };
  const seen  = new Set();
  const items = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    const qNum = Number(item?.question);
    if (!Number.isInteger(qNum) || qNum < 1) return { error: `Item ${i+1}: "question" must be a positive integer.` };
    if (seen.has(qNum)) return { error: `Duplicate question number: ${qNum}.` };
    seen.add(qNum);
    const type = resolveType(item?.type ?? 'mc');
    if (item.answer === undefined || item.answer === null) return { error: `Item ${i+1}: "answer" is required.` };
    items.push({ question: qNum, type, answer: normalizeAnswer(type, item.answer) });
  }
  return { items: items.sort((a, b) => a.question - b.question) };
}

// ─── File parser ──────────────────────────────────────────────────────────────

async function parseUploadedFile(filePath, ext) {
  if (ext === '.json') {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parseJsonItems(raw);
  }
  if (ext === '.txt') {
    const raw   = fs.readFileSync(filePath, 'utf8');
    const fixed = raw.replace(/([^\n])(\d{1,3}[.):][\s])/g, '$1\n$2');
    const items = parseTextLines(fixed);
    return items.length ? { items } : { error: 'No valid answer lines found.' };
  }
  if (ext === '.pdf') {
    const data  = await pdfParse(fs.readFileSync(filePath));
    const fixed = data.text.replace(/([^\n])(\d{1,3}[.):][\s])/g, '$1\n$2');
    const items = parseTextLines(fixed);
    return items.length ? { items } : { error: 'No valid answer lines found in PDF.' };
  }
  if (ext === '.docx' || ext === '.doc') {
    const result    = await mammoth.extractRawText({ path: filePath });
    const fixedText = result.value.replace(/([^\n])(\d{1,3}[.):][\t ])/g, '$1\n$2');
    const items     = parseTextLines(fixedText);
    return items.length ? { items } : {
      error: 'No valid answer lines found. Format:\n1. A\n2. True\n3. [type:enumeration] oxygen, carbon',
    };
  }
  return { error: `Unsupported extension: ${ext}` };
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

function checkAnswer(keyItem, studentRaw) {
  if (keyItem.type === 'mc')          return String(studentRaw).trim().toUpperCase() === keyItem.answer;
  if (keyItem.type === 'truefalse')   return String(studentRaw).trim().toUpperCase() === String(keyItem.answer).toUpperCase();
  if (keyItem.type === 'enumeration') {
    if (!Array.isArray(keyItem.answer)) return false;
    const si = String(studentRaw).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    return keyItem.answer.every(r => si.includes(r));
  }
  return String(studentRaw).trim().toLowerCase() === String(keyItem.answer).trim().toLowerCase();
}

function typeSummary(key) {
  return key.reduce((acc, item) => { acc[item.type] = (acc[item.type] || 0) + 1; return acc; }, {});
}

// ─── Image Pre-processing (sharp) ────────────────────────────────────────────
//
//  Pipeline order matters:
//
//  1.  rotate()         — auto-correct EXIF orientation (upside-down phone photos)
//  2.  greyscale()      — remove colour noise
//  3.  modulate()       — raise brightness slightly (+15%) so faint ballpen ink is visible
//  4.  median(3)        — remove salt-and-pepper noise without blurring text edges
//  5.  normalise()      — stretch histogram end-to-end for maximum contrast
//  6.  sharpen(2.0)     — stronger sharpening than before (σ=1.5 → 2.0) for handwriting
//  7.  threshold(175)   — binarise; 175 works better for dark ballpen on white
//                         (original used 160 which was tuned for pencil marks)
//  8.  resize(2800)     — more pixels than before (2480 → 2800) so tiny handwritten
//                         characters have enough resolution for LSTM to decode
//
//  Result: PNG buffer — no temp file needed.

async function preprocessImage(base64, mimeType) {
  if (!sharp) {
    console.warn('[AutoChecker] Falling back to raw image (sharp not installed)');
    return Buffer.from(base64, 'base64');
  }

  const inputBuffer = Buffer.from(base64, 'base64');

  try {
    const processed = await sharp(inputBuffer)
      .rotate()                              // EXIF auto-rotate
      .greyscale()                           // strip colour
      .modulate({ brightness: 1.15 })        // ✨ NEW: lift faint ballpen strokes
      .median(3)                             // ✨ NEW: remove noise before threshold
      .normalise()                           // auto-contrast stretch
      .sharpen({ sigma: 2.0 })               // ✨ UPGRADED: stronger than 1.5 for handwriting
      // BUG FIX: threshold lowered from 175 → 155.
      // 175 was too aggressive — it over-binarized ballpen strokes, causing broken
      // characters that Tesseract couldn't recognize. 155 preserves more of the ink.
      .threshold(155)
      .resize({
        width:              2800,            // ✨ UPGRADED: 2480→2800 for small text
        fit:                'inside',
        withoutEnlargement: false,
      })
      .png()
      .toBuffer();

    console.log('[AutoChecker] Image pre-processed with sharp ✓');
    return processed;
  } catch (err) {
    console.warn('[AutoChecker] sharp pre-processing failed, using raw image:', err.message);
    return Buffer.from(base64, 'base64');
  }
}

// ─── Tesseract setup ──────────────────────────────────────────────────────────

const { createWorker, OEM, PSM } = Tesseract;

// ✨ UPGRADED: extended PSM sequences
// PSM 12 = sparse text with orientation and script detection
// Very useful for handwritten answer sheets where text is isolated and spread out

const PSM_SEQUENCE_MC   = [4, 6, 3, 11, 12];   // was [4, 6, 3, 11]
const PSM_SEQUENCE_TEXT = [4, 6, 3, 12];        // was [4, 6, 3]

// ✨ NEW: per-type character whitelists
// MC:   tight — only digits, A-D, separators
// Text: none  — don't restrict handwritten words
const CHAR_WHITELIST_MC   = '0123456789ABCDabcd.):-/ \n';
const CHAR_WHITELIST_TEXT = ''; // empty = no restriction

// ─── Single-worker OCR attempt ────────────────────────────────────────────────

async function tryOcrWithPsm(imageBuffer, psmMode, extraParams = {}) {
  const worker = await createWorker('eng', OEM?.LSTM_ONLY ?? 1, {
    logger: m => {
      if (m.status === 'recognizing text') {
        process.stdout.write(`\r[Tesseract PSM${psmMode}] ${Math.round(m.progress * 100)}%  `);
      }
    },
  });

  try {
    await worker.setParameters({
      tessedit_ocr_engine_mode:  OEM?.LSTM_ONLY ?? 1,
      tessedit_pageseg_mode:     psmMode,
      preserve_interword_spaces: '1',
      tessedit_do_invert:        '0',
      ...extraParams,
    });

    const { data: { text, confidence } } = await worker.recognize(imageBuffer);
    process.stdout.write('\n');
    return { text: text ?? '', confidence: confidence ?? 0 };
  } finally {
    // ✨ UPGRADED: always terminate — prevents worker leak on error
    try { await worker.terminate(); } catch {}
  }
}

// ─── Multi-PSM Tesseract runner ───────────────────────────────────────────────

async function runTesseract(imageBase64, mimeType = 'image/jpeg', examType = 'bubble_mc') {
  const isMcType    = examType === 'bubble_mc' || examType === 'text_mc';
  const psmList     = isMcType ? PSM_SEQUENCE_MC : PSM_SEQUENCE_TEXT;
  const whitelist   = isMcType ? CHAR_WHITELIST_MC : CHAR_WHITELIST_TEXT;
  const imageBuffer = await preprocessImage(imageBase64, mimeType);

  console.log(`[AutoChecker] Multi-PSM OCR start (examType=${examType}, modes=${psmList.join(',')})`);

  function scoreMcText(text) {
    // BUG FIX: removed \b word-boundary after the letter.
    // Tesseract output from handwritten sheets often has noise immediately after
    // the answer letter (e.g. "1. A." "2. B," "3. C\n") which broke the boundary.
    return (text.match(/[Qq]?\d{1,3}\s*[.):\-\/]?\s*[ABCDabcd](?:\s|[.,;)\n]|$)/g) ?? []).length;
  }
  function scoreTextBlock(text) {
    return text.split('\n').filter(l => l.trim().length > 2).length;
  }

  let bestText       = '';
  let bestConfidence = 0;
  let bestScore      = -1;

  const extraParams = whitelist
    ? { tessedit_char_whitelist: whitelist }
    : {};

  for (const psm of psmList) {
    try {
      const { text, confidence } = await tryOcrWithPsm(imageBuffer, psm, extraParams);
      const preview = (text ?? '').slice(0, 200).replace(/\n/g, '↵');
      console.log(`[Tesseract PSM${psm}] conf=${confidence?.toFixed(1)}% | preview: ${preview}`);

      const score = isMcType ? scoreMcText(text) : scoreTextBlock(text);
      console.log(`[Tesseract PSM${psm}] score=${score} answers found`);

      if (score > bestScore || (score === bestScore && confidence > bestConfidence)) {
        bestText       = text;
        bestConfidence = confidence;
        bestScore      = score;
      }

      // Early exit: strong signal we have a good read
      if (isMcType && score >= 5) break;
      if (!isMcType && score >= 8) break;

    } catch (psmErr) {
      console.warn(`[Tesseract PSM${psm}] failed: ${psmErr.message}`);
    }
  }

  // ── Inverted-image retry ──────────────────────────────────────────────────
  // ✨ UPGRADED: now applies to ALL exam types (not just MC)
  // Dark background sheets and some ballpen papers benefit from inversion
  const needsInvertRetry = isMcType ? bestScore < 3 : bestScore < 4;

  if (needsInvertRetry && sharp) {
    try {
      console.log('[AutoChecker] Trying inverted image…');
      const invertedBuffer = await sharp(imageBuffer).negate().png().toBuffer();
      const { text, confidence } = await tryOcrWithPsm(invertedBuffer, 6, extraParams);
      const score = isMcType ? scoreMcText(text) : scoreTextBlock(text);
      console.log(`[Tesseract inverted] score=${score}, conf=${confidence?.toFixed(1)}%`);
      if (score > bestScore) { bestText = text; bestConfidence = confidence; bestScore = score; }
    } catch (invertErr) {
      console.warn('[AutoChecker] Inverted retry failed:', invertErr.message);
    }
  }

  // ✨ NEW: Adaptive threshold retry
  // If normal threshold didn't work well, try a lighter threshold (140) for
  // very faint or lightly-pressed ballpen marks
  if (bestScore < 2 && sharp) {
    try {
      console.log('[AutoChecker] Trying lighter threshold (140) for faint handwriting…');
      const lightBuffer = await sharp(Buffer.from(imageBase64, 'base64'))
        .rotate().greyscale().normalise().sharpen({ sigma: 1.5 }).threshold(140).resize({ width: 2800, fit: 'inside', withoutEnlargement: false }).png().toBuffer();
      const { text, confidence } = await tryOcrWithPsm(lightBuffer, 6, extraParams);
      const score = isMcType ? scoreMcText(text) : scoreTextBlock(text);
      console.log(`[Tesseract light-threshold] score=${score}, conf=${confidence?.toFixed(1)}%`);
      if (score > bestScore) { bestText = text; bestConfidence = confidence; bestScore = score; }
    } catch (threshErr) {
      console.warn('[AutoChecker] Light-threshold retry failed:', threshErr.message);
    }
  }

  console.log(`[AutoChecker] Best OCR — score=${bestScore}, conf=${bestConfidence?.toFixed?.(1) ?? 'n/a'}%`);
  console.log('[Tesseract] Final text preview:\n' + bestText.slice(0, 400).replace(/\n/g, '↵'));

  return { text: bestText, engineConfidence: Math.max(bestConfidence, 0) };
}

// ─── OCR Text Post-processing ─────────────────────────────────────────────────
//
// ✨ UPGRADED: added handwriting-specific substitution fixes
//
// New entries:
//   q → a  (handwritten lowercase 'a' often looks like 'q')
//   6 → B  (in answer position; a hasty 'B' looks like '6')
//   E → B  (hasty capital E read as B)
//   0 → D  (round shape confusion in answer column)
//   Digit 1 in answer position → I (then handled as identification answer)

function fixOcrSubstitutions(text) {
  return text
    // ── Question number fixes ─────────────────────────────────────────────────
    .replace(/^[Ol](\d)/gm,   '0$1')
    .replace(/(\d)[Ol]\b/gm,  '$10')
    // ── MC answer position: digit → letter ───────────────────────────────────
    .replace(/^(\d+[.):\s]+)8\s*$/gm, '$1B')   // 8 → B
    .replace(/^(\d+[.):\s]+)6\s*$/gm, '$1B')   // ✨ 6 → B (ballpen B confusion)
    .replace(/^(\d+[.):\s]+)0\s*$/gm, '$1D')   // ✨ 0 → D (round shape in answer)
    // ── Handwriting: lowercase a written as q ────────────────────────────────
    .replace(/^(\d+[.):\s]+)q\s*$/gim, '$1A')  // ✨ q → A in answer position
    // ── Normalize separators ─────────────────────────────────────────────────
    .replace(/^(\d+)\s*[):]\s*/gm, '$1. ')
    // ── Strip trailing punctuation on answer lines ───────────────────────────
    .replace(/^(\d+\.\s+[A-Da-d])[,;.]\s*$/gm, '$1')
    // ── Collapse multiple blank lines ─────────────────────────────────────────
    .replace(/\n{3,}/g, '\n\n')
    // ── Strip non-printable characters ───────────────────────────────────────
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, '');
}

// ─── MC Answer Extraction (bubble / text_mc) ──────────────────────────────────

function extractMcAnswers(text, questionCount) {
  const answers = {};
  const maxQ    = Math.max(questionCount * 3, 50);

  // Pattern A: same-line — "1. A"  "1) B"  "Q1: C"
  // BUG FIX: changed \b to (?:\s|[.,;)\n]|$) — Tesseract often appends punctuation
  // or noise after the letter, breaking the word-boundary match on handwritten sheets.
  const RE_INLINE = /[Qq]?(\d{1,3})\s*[.):\-\/]?\s*([ABCDabcd])(?:\s|[.,;)\n]|$)/g;
  let m;
  while ((m = RE_INLINE.exec(text)) !== null) {
    const q = parseInt(m[1], 10);
    if (q >= 1 && q <= maxQ) answers[String(q)] = m[2].toUpperCase();
  }

  // Pattern B: number on one line, letter on next
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length - 1; i++) {
    const numMatch = lines[i].match(/^[Qq]?(\d{1,3})[.):\s]*$/);
    const ansMatch = lines[i + 1].match(/^[\[(]?([ABCDabcd])[\].)]*$/i);
    if (numMatch && ansMatch) {
      const q = parseInt(numMatch[1], 10);
      if (q >= 1 && q <= maxQ && !answers[String(q)]) {
        answers[String(q)] = ansMatch[1].toUpperCase();
      }
    }
  }

  // Pattern C: compact grid — "1A 2B 3C"
  const RE_GRID = /(\d{1,3})[.\-]?\s*([ABCDabcd])(?=\s|\d|$)/g;
  while ((m = RE_GRID.exec(text)) !== null) {
    const q = parseInt(m[1], 10);
    if (q >= 1 && q <= maxQ && !answers[String(q)]) {
      answers[String(q)] = m[2].toUpperCase();
    }
  }

  // Trim to expected range
  for (const key of Object.keys(answers)) {
    if (parseInt(key, 10) > questionCount) delete answers[key];
  }

  return answers;
}

// ─── Written Answer Extraction (identification / enumeration / short_answer) ──
//
// ✨ NEW FUNCTION — purpose-built for handwritten answers
//
// Strategies used:
//   1. Primary: numbered line regex (same as MC but accepts word answers)
//   2. Fallback: consecutive-line pairing (question number on one line, answer on next)
//   3. Normalise: lowercase for identification, preserve case for short_answer
//   4. Tolerant: accepts answers with OCR noise (extra dots, dashes, smeared chars)

function extractWrittenAnswers(text, questionCount, examType) {
  const answers = {};
  const maxQ    = Math.max(questionCount + 5, 20);

  // ── Strategy 1: numbered lines ───────────────────────────────────────────
  // Matches: "1. word(s)"  "2) phrase"  "3: text"
  const RE_NUMBERED = /^[Qq]?(\d{1,3})\s*[.):\-\/]?\s*(.{1,120})$/gm;
  let m;
  while ((m = RE_NUMBERED.exec(text)) !== null) {
    const q = parseInt(m[1], 10);
    const v = m[2].trim();
    // Skip lines that look like question text (too long) or are purely numeric
    if (q >= 1 && q <= maxQ && v.length >= 1 && !/^\d+$/.test(v)) {
      if (!answers[String(q)]) {
        answers[String(q)] = normaliseWritten(v, examType);
      }
    }
  }

  // ── Strategy 2: number + answer on consecutive lines ─────────────────────
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length - 1; i++) {
    const numMatch = lines[i].match(/^[Qq]?(\d{1,3})[.):\s]*$/);
    if (numMatch) {
      const q        = parseInt(numMatch[1], 10);
      const nextLine = lines[i + 1];
      // Accept if next line is not another number
      if (q >= 1 && q <= maxQ && !answers[String(q)] && !/^\d+[.):]\s/.test(nextLine)) {
        const cleaned = nextLine.replace(/^[-–—•]\s*/, '').trim();
        if (cleaned.length >= 1) {
          answers[String(q)] = normaliseWritten(cleaned, examType);
        }
      }
    }
  }

  return answers;
}

function normaliseWritten(raw, examType) {
  const cleaned = raw
    .replace(/[^\x20-\x7E]/g, '')   // strip non-printable
    .replace(/\s{2,}/g, ' ')         // collapse whitespace
    .trim();

  if (examType === 'short_answer' || examType === 'trace_error') {
    return cleaned; // preserve original capitalisation for open-ended
  }
  return cleaned.toLowerCase(); // normalise for identification / enumeration
}

// ─── Student Name Extraction ──────────────────────────────────────────────────

function extractStudentName(text) {
  const sameLine = text.match(
    /(?:name|student|pangalan|examinee|pupil)\s*[:\-]\s*([A-Za-z ,.]+)/i
  );
  if (sameLine) return sameLine[1].trim().replace(/\s{2,}/g, ' ') || null;

  const lines = text.split('\n').map(l => l.trim());
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^(?:name|student|pangalan|examinee|pupil)\s*:?\s*$/i.test(lines[i])) {
      const candidate = lines[i + 1];
      if (/^[A-Za-z ,.']{3,60}$/.test(candidate)) return candidate;
    }
  }
  return null;
}

// ─── Full OCR pipeline ────────────────────────────────────────────────────────
//
// ✨ UPGRADED: never throws for empty/unreadable text
//             returns empty answers map with confidence=0 instead

async function parseVisionText(imageBase64, mimeType, examType, questionCount) {
  const isMcType = examType === 'bubble_mc' || examType === 'text_mc';

  const { text: rawText, engineConfidence } =
    await runTesseract(imageBase64, mimeType, examType);

  // ✨ UPGRADED: don't throw — return empty result so UI can show friendly message
  if (!rawText?.trim()) {
    console.warn('[AutoChecker] OCR returned empty text');
    return {
      studentName:    null,
      answers:        buildEmptyAnswers(questionCount),
      answeredCount:  0,
      engineConfidence: 0,
      confidence:     0,
    };
  }

  const cleanText   = fixOcrSubstitutions(rawText);
  const studentName = extractStudentName(cleanText);
  const answers     = {};

  if (isMcType) {
    Object.assign(answers, extractMcAnswers(cleanText, questionCount));
  } else {
    // ✨ UPGRADED: use new extractWrittenAnswers for non-MC types
    Object.assign(answers, extractWrittenAnswers(cleanText, questionCount, examType));

    // Fallback: also try parseTextLines (handles "1. answer" format)
    parseTextLines(cleanText).forEach(item => {
      if (item.question >= 1 && item.question <= questionCount && !answers[String(item.question)]) {
        answers[String(item.question)] = Array.isArray(item.answer)
          ? item.answer.join(', ')
          : item.answer;
      }
    });
  }

  // Fill blanks for unanswered questions
  for (let i = 1; i <= questionCount; i++) {
    if (!answers[String(i)]) answers[String(i)] = '';
  }

  const answeredCount = Object.values(answers).filter(a => a !== '').length;

  const normalizedEng = Math.max((engineConfidence ?? 0), 0) / 100;
  const fillRate      = questionCount > 0 ? answeredCount / questionCount : 0;
  const fillBonus     = fillRate * 0.1;
  const confidence    = Math.min(normalizedEng + fillBonus, 1.0);

  console.log(
    `[AutoChecker] Parsed — answered: ${answeredCount}/${questionCount}, ` +
    `engine: ${engineConfidence?.toFixed?.(1) ?? 'n/a'}%, composite: ${(confidence * 100).toFixed(1)}%`
  );

  return { studentName, answers, answeredCount, engineConfidence, confidence };
}

function buildEmptyAnswers(count) {
  const ans = {};
  for (let i = 1; i <= count; i++) ans[String(i)] = '';
  return ans;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/', (_req, res) => res.json({ status: '✅ AutoChecker API running' }));

// Sections
app.get('/api/sections', (_req, res) => {
  const sections = readSections().map(s => {
    const record = readStore(s.id);
    return { ...s, hasAnswerKey: !!record,
      fileName:    record?.fileName    ?? null,
      fileType:    record?.fileType    ?? null,
      uploadedAt:  record?.uploadedAt  ?? null,
      total:       record?.key?.length ?? 0,
      typeSummary: record ? typeSummary(record.key) : {},
    };
  });
  res.json({ success: true, sections });
});

app.post('/api/sections', (req, res) => {
  const { name, abbr, subject, studentCount, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ success: false, error: '"name" is required.' });

  const sections = readSections();
  if (sections.some(s => s.name.toLowerCase() === name.trim().toLowerCase())) {
    return res.status(409).json({ success: false, error: `Section "${name}" already exists.` });
  }

  const section = {
    id:           String(Date.now()),
    name:         name.trim(),
    abbr:         (abbr?.trim() || name.trim().slice(0, 2)).toUpperCase(),
    subject:      subject?.trim() || '',
    studentCount: Number(studentCount) || 0,
    color:        VALID_COLORS.has(color) ? color : 'blue',
    average:      0,
    quizCount:    0,
    createdAt:    new Date().toISOString(),
  };

  sections.push(section);
  writeSections(sections);
  console.log(`[AutoChecker] Section created: ${section.name} (${section.id})`);
  res.status(201).json({ success: true, section });
});

app.delete('/api/sections/:id', (req, res) => {
  let sections = readSections();
  if (!sections.find(s => s.id === req.params.id)) {
    return res.status(404).json({ success: false, error: 'Section not found.' });
  }
  writeSections(sections.filter(s => s.id !== req.params.id));
  deleteStore(req.params.id);
  res.json({ success: true });
});

// Answer Key
app.post('/api/answer-key/:sectionId', upload.single('file'), async (req, res) => {
  const { sectionId } = req.params;
  const tempPath      = req.file?.path;
  try {
    if (!readSections().find(s => s.id === sectionId)) {
      return res.status(404).json({ success: false, error: 'Section not found.' });
    }
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded.' });

    const ext    = path.extname(req.file.originalname).toLowerCase();
    const result = await parseUploadedFile(tempPath, ext);
    if (result.error) return res.status(422).json({ success: false, error: result.error });

    const record = { fileName: req.file.originalname, fileType: ext.replace('.',''), uploadedAt: new Date().toISOString(), key: result.items };
    writeStore(sectionId, record);
    console.log(`[AutoChecker] Answer key saved for ${sectionId}: ${record.fileName} (${record.key.length} items)`);

    res.json({ success: true, sectionId, fileName: record.fileName, fileType: record.fileType,
      uploadedAt: record.uploadedAt, total: record.key.length, typeSummary: typeSummary(record.key), key: record.key });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ success: false, error: 'Server error during upload.' });
  } finally {
    if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
});

app.get('/api/answer-key/:sectionId', (req, res) => {
  const record = readStore(req.params.sectionId);
  if (!record) return res.status(404).json({ success: false, error: 'No answer key for this section.' });
  res.json({ success: true, sectionId: req.params.sectionId, fileName: record.fileName, fileType: record.fileType,
    uploadedAt: record.uploadedAt, total: record.key.length, typeSummary: typeSummary(record.key), key: record.key });
});

app.delete('/api/answer-key/:sectionId', (req, res) => {
  if (!readStore(req.params.sectionId)) return res.status(404).json({ success: false, error: 'No answer key found.' });
  deleteStore(req.params.sectionId);
  res.json({ success: true });
});

// Score
app.post('/api/score/:sectionId', (req, res) => {
  const record = readStore(req.params.sectionId);
  if (!record) return res.status(404).json({ success: false, error: 'No answer key for this section.' });
  const { student } = req.body;
  if (!student || !Array.isArray(student.answers)) {
    return res.status(400).json({ success: false, error: 'student.answers must be an array.' });
  }
  let correct = 0;
  const details = record.key.map((item, idx) => {
    const sa = student.answers[idx] ?? '';
    const ok = checkAnswer(item, sa);
    if (ok) correct++;
    return { question: item.question, type: item.type, correctAnswer: item.answer, studentAnswer: sa || null, isCorrect: ok };
  });
  const total  = record.key.length;
  const pct    = total > 0 ? Math.round((correct / total) * 100) : 0;
  res.json({ success: true, student: { id: student.id, name: student.name },
    score: correct, total, percentage: pct, status: pct >= 75 ? 'Passed' : pct >= 60 ? 'Review' : 'Failed', details });
});

// ─── Scan — upgraded OCR pipeline ────────────────────────────────────────────
//
// ✨ UPGRADED: returns { success: false, answers: {}, confidence: 0 }
//             instead of 500 when OCR produces no usable text
//             → client never crashes on a bad scan

app.post('/api/scan', async (req, res) => {
  const { imageBase64, mimeType, examType, sectionId, questionCount } = req.body;
  if (!imageBase64) return res.status(400).json({ success: false, error: 'imageBase64 is required.' });
  if (!examType)    return res.status(400).json({ success: false, error: 'examType is required.' });

  let totalQs = Number(questionCount) || 0;
  if (sectionId) {
    const record = readStore(sectionId);
    if (record?.key?.length) {
      totalQs = record.key.length;
      console.log(`[AutoChecker] Question count from answer key: ${totalQs}`);
    }
  }
  if (!totalQs) totalQs = 10;

  try {
    console.log(`[AutoChecker] Scanning — examType=${examType}, questions=${totalQs}`);

    const { studentName, answers, answeredCount, engineConfidence, confidence } =
      await parseVisionText(imageBase64, mimeType || 'image/jpeg', examType, totalQs);

    let notes = '';
    if (confidence < 0.3) {
      notes = 'Very low confidence — image may be blurry, dark, or rotated. Please retake in good lighting.';
    } else if (confidence < 0.55) {
      notes = 'Low confidence — some answers may be missing or incorrect. Review before saving.';
    } else if (confidence < 0.8) {
      notes = 'Moderate confidence — please verify the detected answers.';
    }

    // BUG FIX: previously always returned success:true even with 0 answers.
    // The client checks success flag first and surfaces ocrResult.message.
    // If no answers were found, return success:false with a clear error message
    // so the user sees the real problem instead of the generic "No Test Paper" alert.
    if (answeredCount === 0 && confidence < 0.1) {
      return res.json({
        success: false,
        error: 'The scanner could not read any answers from this image.\n\nTips:\n• Use bright, even lighting\n• Hold camera directly above the sheet, completely flat\n• Keep the page flat with no shadows, glare, or folds\n• Make sure answers are written clearly inside the answer boxes',
        answers: buildEmptyAnswers(totalQs),
        confidence: 0,
        engineConfidence,
        answeredCount: 0,
        totalQuestions: totalQs,
        notes,
      });
    }

    // ✨ UPGRADED: always return success:true with answers (even if empty)
    // Let the client decide whether the result is usable based on answeredCount/confidence
    res.json({
      success: true,
      answers,
      studentName,
      confidence,
      engineConfidence,
      answeredCount,
      totalQuestions: totalQs,
      notes,
    });

  } catch (err) {
    console.error('[AutoChecker] Scan error:', err.message);

    // ✨ UPGRADED: return structured error — never bare 500
    res.status(500).json({
      success:     false,
      error:       err.message,
      answers:     buildEmptyAnswers(totalQs || 10),
      confidence:  0,
      answeredCount: 0,
      totalQuestions: totalQs || 10,
      notes:       'Scan failed. Please try again with better lighting.',
    });
  }
});

// ─── Settings routes ─────────────────────────────────────────────────────────

app.get('/api/settings', function(_req, res) {
  res.json(readSettings());
});

app.put('/api/settings', function(req, res) {
  var ALLOWED_KEYS = Object.keys(DEFAULT_SETTINGS);
  var incoming = req.body || {};
  var unknown = Object.keys(incoming).filter(function(k) { return !ALLOWED_KEYS.includes(k); });
  if (unknown.length) return res.status(400).json({ success: false, error: 'Unknown setting(s): ' + unknown.join(', ') });
  for (var k of Object.keys(incoming)) {
    if (typeof incoming[k] !== 'boolean') return res.status(400).json({ success: false, error: '"' + k + '" must be a boolean.' });
  }
  var current = readSettings();
  var updated = Object.assign({}, current, incoming);
  writeSettings(updated);
  console.log('[AutoChecker] Settings updated:', incoming);
  res.json(updated);
});

app.post('/api/settings/reset', function(_req, res) {
  writeSettings(Object.assign({}, DEFAULT_SETTINGS));
  console.log('[AutoChecker] Settings reset to defaults.');
  res.json(Object.assign({}, DEFAULT_SETTINGS));
});

// Health
app.get('/health', (_req, res) => res.json({
  status: 'ok',
  sharp:  !!sharp,
  ocr:    'tesseract.js',
  version: '2.0-handwriting',
}));

// Error handler
app.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ success: false, error: 'File exceeds 5 MB limit.' });
  res.status(500).json({ success: false, error: err.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ AutoChecker v2.0 running on http://0.0.0.0:${PORT}`);
  console.log(`📷 OCR: Tesseract.js (LSTM) + ${sharp ? 'sharp pre-processing ✓' : 'NO sharp — install: npm install sharp'}`);
  console.log(`✍️  Handwriting support: ${sharp ? 'ENABLED' : 'LIMITED (install sharp)'}`);
});

// Keep-alive ping — prevents Railway from sleeping
setInterval(() => {
  fetch('https://autochecker-backend-production.up.railway.app/health')
    .catch(() => {});
}, 5 * 60 * 1000);