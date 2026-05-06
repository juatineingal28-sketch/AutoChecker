/**
 * src/services/uploadService.ts
 *
 * PURPOSE:
 * Centralized service for:
 *  - File validation
 *  - Uploading answer key files
 *  - Uploading JSON answer keys
 *  - Preparing file metadata for UI
 */

import {
  AnswerKeyItem,
  uploadAnswerKey,
  uploadAnswerKeyJson,
} from './api';

// ─── TYPES ────────────────────────────────────────────────────────────────────

export interface UploadedFile {
  name: string;
  uri: string;
  mimeType?: string;
  size?: number;
  uploadedAt: Date;
}

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'xls', 'xlsx'];
const MAX_FILE_SIZE_MB = 10;

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function getFileExt(name: string): string {
  return (name.split('.').pop() ?? '').toLowerCase();
}

export function validateFile(name: string, size?: number): string | null {
  const ext = getFileExt(name);

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `File type "${ext.toUpperCase()}" is not supported.`;
  }

  if (size && size > MAX_FILE_SIZE_MB * 1024 * 1024) {
    return `File too large. Max allowed is ${MAX_FILE_SIZE_MB}MB.`;
  }

  return null;
}

// ─── MAIN UPLOAD SERVICE ─────────────────────────────────────────────────────

/**
 * Upload raw file (PDF/Image/Excel) to backend
 */
export async function uploadFileToServer(
  sectionId: string,
  file: UploadedFile
) {
  const ext = getFileExt(file.name);

  let mimeType = file.mimeType;

  if (!mimeType) {
    switch (ext) {
      case 'pdf':
        mimeType = 'application/pdf';
        break;
      case 'jpg':
      case 'jpeg':
        mimeType = 'image/jpeg';
        break;
      case 'png':
        mimeType = 'image/png';
        break;
      case 'xls':
        mimeType = 'application/vnd.ms-excel';
        break;
      case 'xlsx':
        mimeType =
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      default:
        mimeType = 'application/octet-stream';
    }
  }

  return uploadAnswerKey(sectionId, file.uri, file.name, mimeType);
}

// ─── JSON ANSWER KEY UPLOAD ──────────────────────────────────────────────────

/**
 * Upload structured answer key (from parsed OCR or manual input)
 */
export async function uploadParsedAnswerKey(
  sectionId: string,
  items: AnswerKeyItem[]
) {
  return uploadAnswerKeyJson(sectionId, items);
}

// ─── FILE META (UI SUPPORT) ──────────────────────────────────────────────────

export function formatFileSize(bytes?: number): string {
  if (!bytes) return '—';

  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function getFileExtension(name: string): string {
  return getFileExt(name);
}

// ─── HIGH LEVEL WRAPPER (OPTIONAL USE) ───────────────────────────────────────

/**
 * One-call helper:
 * - validates file
 * - uploads file
 * - returns backend response
 */
export async function handleUploadFlow(
  sectionId: string,
  file: UploadedFile
) {
  const error = validateFile(file.name, file.size);
  if (error) throw new Error(error);

  return uploadFileToServer(sectionId, file);
}