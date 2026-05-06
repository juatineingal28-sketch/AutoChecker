// src/utils/omrPDFRenderer.ts
// ─── OMR PDF Renderer ─────────────────────────────────────────────────────────
// Generates a print-ready A4 HTML string from OMRSheetMeta, then uses
// expo-print to render it as a PDF.
//
// Dependencies: expo-print, expo-sharing
//   npx expo install expo-print expo-sharing

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { OMR_CONFIG, OMROption, OMRSheetMeta } from '../constants/omrConfig';
import { buildQRPayload } from './omrSheetGenerator';

// ─── HTML generator ───────────────────────────────────────────────────────────

export function generateOMRHtml(meta: OMRSheetMeta): string {
  const totalQ = meta.totalQuestions ?? OMR_CONFIG.TOTAL_QUESTIONS;
  const half   = Math.ceil(totalQ / 2);
  const col1   = Array.from({ length: half }, (_, i) => i + 1);
  const col2   = Array.from({ length: totalQ - half }, (_, i) => i + half + 1);

  const qrPayload = buildQRPayload(meta);

  function renderColumn(questions: number[]): string {
    return questions.map(qNum => `
      <div class="q-row">
        <span class="q-num">${String(qNum).padStart(2, '0')}.</span>
        ${OMR_CONFIG.OPTIONS.map((opt: OMROption) => `
          <div class="bubble" data-q="${qNum}" data-opt="${opt}"></div>
        `).join('')}
      </div>
    `).join('');
  }

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=794"/>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Courier New', Courier, monospace;
    background: #fff;
    color: #000;
    width: 794px;
    min-height: 1123px;
    padding: 24px;
    position: relative;
  }

  .corner { position: absolute; width: 20px; height: 20px; background: #000; }
  .c-tl { top: 12px;  left: 12px;  }
  .c-tr { top: 12px;  right: 12px; }
  .c-bl { bottom: 12px; left: 12px;  }
  .c-br { bottom: 12px; right: 12px; }

  .page-border {
    border: 2px solid #000;
    position: absolute;
    inset: 8px;
    pointer-events: none;
  }

  .header {
    display: flex; flex-direction: column; gap: 6px;
    margin-top: 20px; margin-bottom: 8px;
    padding-bottom: 8px; border-bottom: 2px solid #000;
  }
  .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
  .app-name   { font-size: 22px; font-weight: 900; letter-spacing: 2px; color: #000; }
  .sheet-label{ font-size: 9px; font-weight: 700; letter-spacing: 3px; color: #333; margin-top: 2px; }

  .qr-box {
    width: 62px; height: 62px; border: 2px solid #000;
    display: flex; align-items: center; justify-content: center;
    font-size: 8px; color: #999; font-weight: 700; font-family: monospace;
  }

  .divider   { height: 1px; background: #ccc; margin: 4px 0; }
  .field-row { display: flex; gap: 12px; margin-bottom: 5px; }
  .field     { flex: 2; }
  .field-sm  { flex: 1.2; }
  .field-xs  { flex: 0.9; }
  .field-label {
    font-size: 7px; font-weight: 700; letter-spacing: 1px;
    color: #444; margin-bottom: 2px; text-transform: uppercase;
  }
  .field-line {
    border-bottom: 1px solid #000; min-height: 18px;
    padding-bottom: 2px; font-size: 10px; font-weight: 600;
  }
  .title-row { display: flex; justify-content: space-between; align-items: center; margin-top: 5px; }
  .test-title{ font-size: 11px; font-weight: 700; }
  .exam-id   { font-size: 7px; color: #999; }

  .instructions {
    background: #F3F4F6; border: 0.5px solid #ccc; border-radius: 3px;
    padding: 6px 10px; font-size: 7.5px; text-align: center;
    line-height: 1.5; margin-bottom: 10px; color: #333;
  }

  .grid-columns { display: flex; gap: 0; }
  .grid-col     { flex: 1; }
  .col-divider  { width: 1px; background: #ccc; margin: 0 8px; }

  .col-header-row {
    display: flex; align-items: center;
    border-bottom: 0.5px solid #999;
    margin-bottom: 3px; padding-bottom: 2px;
    font-size: 7px; font-weight: 700;
  }
  .col-header-no  { width: 26px; color: #444; }
  .col-header-opt { width: 22px; text-align: center; color: #111; }

  .q-row  { display: flex; align-items: center; height: 22px; }
  .q-num  { font-size: 7.5px; font-weight: 700; width: 26px; color: #111; flex-shrink: 0; }
  .bubble {
    width: 14px; height: 14px; border-radius: 50%;
    border: 1.5px solid #111; background: #fff;
    margin: 0 3px; flex-shrink: 0;
  }

  .footer {
    display: flex; justify-content: space-between;
    margin-top: 10px; padding-top: 6px;
    border-top: 1px solid #ccc; font-size: 6.5px; color: #999;
  }
</style>
</head>
<body>

  <div class="corner c-tl"></div>
  <div class="corner c-tr"></div>
  <div class="corner c-bl"></div>
  <div class="corner c-br"></div>
  <div class="page-border"></div>

  <div class="header">
    <div class="header-top">
      <div>
        <div class="app-name">AutoChecker</div>
        <div class="sheet-label">Bubble Answer Sheet</div>
      </div>
      <div class="qr-box"><!-- QR: ${qrPayload.substring(0, 12)}… -->QR</div>
    </div>

    <div class="divider"></div>

    <div class="field-row">
      <div class="field">
        <div class="field-label">Name:</div>
        <div class="field-line">${meta.studentName ?? ''}</div>
      </div>
      <div class="field field-sm">
        <div class="field-label">Student ID:</div>
        <div class="field-line">${meta.studentId ?? ''}</div>
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <div class="field-label">Subject:</div>
        <div class="field-line">${meta.subject ?? ''}</div>
      </div>
      <div class="field field-sm">
        <div class="field-label">Section:</div>
        <div class="field-line">${meta.section}</div>
      </div>
      <div class="field field-xs">
        <div class="field-label">Date:</div>
        <div class="field-line">${meta.date}</div>
      </div>
    </div>

    <div class="title-row">
      <div class="test-title">${meta.testTitle}</div>
      <div class="exam-id">${meta.examId ? `ID: ${meta.examId}` : ''}</div>
    </div>
  </div>

  <div class="instructions">
    DIRECTIONS: Use a BLACK ballpen. Shade only ONE circle per item COMPLETELY.
    Erase cleanly for corrections. Do NOT bend or fold this sheet.
  </div>

  <div class="grid-columns">
    <div class="grid-col">
      <div class="col-header-row">
        <span class="col-header-no">No.</span>
        ${OMR_CONFIG.OPTIONS.map((o: OMROption) => `<span class="col-header-opt">${o}</span>`).join('')}
      </div>
      ${renderColumn(col1)}
    </div>

    <div class="col-divider"></div>

    <div class="grid-col">
      <div class="col-header-row">
        <span class="col-header-no">No.</span>
        ${OMR_CONFIG.OPTIONS.map((o: OMROption) => `<span class="col-header-opt">${o}</span>`).join('')}
      </div>
      ${renderColumn(col2)}
    </div>
  </div>

  <div class="footer">
    <span>AutoChecker © ${new Date().getFullYear()}</span>
    <span>Total Items: ${totalQ} · Exam ID: ${meta.examId ?? '—'}</span>
  </div>

</body>
</html>`;
}

// ─── Print ────────────────────────────────────────────────────────────────────

export async function printOMRSheet(meta: OMRSheetMeta): Promise<void> {
  const html = generateOMRHtml(meta);
  await Print.printAsync({ html });
}

export async function shareOMRSheet(meta: OMRSheetMeta): Promise<void> {
  const html     = generateOMRHtml(meta);
  const { uri }  = await Print.printToFileAsync({ html, base64: false });
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) {
    await Sharing.shareAsync(uri, {
      mimeType:    'application/pdf',
      dialogTitle: `OMR Sheet — ${meta.testTitle}`,
      UTI:         'com.adobe.pdf',
    });
  }
}