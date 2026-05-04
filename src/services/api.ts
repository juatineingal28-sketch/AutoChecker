/**
 * src/services/api.ts
 * FULL FIXED VERSION
 *
 * FIXED:
 * ❌ Buffer error removed
 * ✅ Works in React Native / Expo / TypeScript
 * ✅ uploadAnswerKeyJson now uses Blob instead of Buffer
 */

import axios from 'axios';

// ─── BASE URL ─────────────────────────────────────────────────────────────────
export const BASE_URL =
  'https://autochecker-backend-production.up.railway.app';

// ─── Axios Client ─────────────────────────────────────────────────────────────
const client = axios.create({
  baseURL: BASE_URL,
  timeout: 20000,
});

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type SectionColor = 'blue' | 'green' | 'amber' | 'red';

export interface Section {
  id: string;
  name: string;
  abbr: string;
  subject: string;
  studentCount: number;
  color: SectionColor;
  average: number;
  quizCount: number;
  createdAt?: string;
  hasAnswerKey?: boolean;
  fileName?: string | null;
  fileType?: string | null;
  uploadedAt?: string | null;
  total?: number;
  typeSummary?: TypeSummary;
}

export interface CreateSectionPayload {
  name: string;
  abbr?: string;
  subject?: string;
  studentCount?: number;
  color?: SectionColor;
}

export type QuestionType =
  | 'mc'
  | 'truefalse'
  | 'identification'
  | 'enumeration'
  | 'traceError'
  | 'shortAnswer';

export interface AnswerKeyItem {
  question: number;
  type: QuestionType;
  answer: string | string[];
}

export interface TypeSummary {
  mc?: number;
  truefalse?: number;
  identification?: number;
  enumeration?: number;
  traceError?: number;
  shortAnswer?: number;
}

export interface AnswerKeyRecord {
  success: boolean;
  sectionId: string;
  fileName: string;
  fileType: string;
  uploadedAt: string;
  total: number;
  typeSummary: TypeSummary;
  key: AnswerKeyItem[];
}

export interface ScoreDetail {
  question: number;
  type: QuestionType;
  correctAnswer: string | string[];
  studentAnswer: string | null;
  isCorrect: boolean;
}

export interface ScoreResult {
  success: boolean;
  student: {
    id: string;
    name: string;
  };
  score: number;
  total: number;
  percentage: number;
  status: 'Passed' | 'Review' | 'Failed';
  details: ScoreDetail[];
}

// ─── FILE TYPES ───────────────────────────────────────────────────────────────

export const ACCEPTED_MIME_TYPES = [
  'application/json',
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

export const ACCEPTED_EXTENSIONS = [
  '.json',
  '.txt',
  '.pdf',
  '.docx',
  '.doc',
];

// ─── SECTION API ──────────────────────────────────────────────────────────────

export async function fetchSections(): Promise<Section[]> {
  const { data } = await client.get<{
    success: boolean;
    sections: Section[];
  }>('/api/sections');

  return data.sections;
}

export async function createSection(
  payload: CreateSectionPayload
): Promise<Section> {
  const { data } = await client.post<{
    success: boolean;
    section: Section;
  }>('/api/sections', payload);

  return data.section;
}

export async function deleteSection(sectionId: string): Promise<void> {
  await client.delete(`/api/sections/${sectionId}`);
}

// ─── ANSWER KEY API ───────────────────────────────────────────────────────────

export async function uploadAnswerKey(
  sectionId: string,
  fileUri: string,
  fileName: string,
  mimeType: string = 'application/octet-stream'
): Promise<AnswerKeyRecord> {
  const formData = new FormData();

  formData.append(
    'file',
    {
      uri: fileUri,
      name: fileName,
      type: mimeType,
    } as any
  );

  const response = await fetch(
    `${BASE_URL}/api/answer-key/${sectionId}`,
    {
      method: 'POST',
      body: formData,
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || 'Upload failed');
  }

  return data as AnswerKeyRecord;
}

/**
 * FIXED VERSION — React Native / Expo safe
 *
 * Why no Blob:
 *   RN's Blob type (globals.d.ts) requires `lastModified` in BlobOptions
 *   and FormData.append only accepts 2 arguments, so the web overload
 *   `append(name, blob, filename)` does not exist in RN typings.
 *
 * Solution:
 *   Use a `data:` URI with the {uri, name, type} object that RN's own
 *   FormData implementation natively understands. The fetch polyfill
 *   reads the data URI directly — no filesystem access needed.
 */
export async function uploadAnswerKeyJson(
  sectionId: string,
  items: AnswerKeyItem[]
): Promise<AnswerKeyRecord> {
  const json = JSON.stringify(items, null, 2);

  const formData = new FormData();

  // RN FormData accepts the {uri, name, type} shape as the second argument.
  // Use a data URI built with encodeURIComponent — no btoa, no Buffer needed.
  const dataUri = `data:application/json,${encodeURIComponent(json)}`;

  formData.append('file', {
    uri:  dataUri,
    name: 'answer_key.json',
    type: 'application/json',
  } as any);

  const response = await fetch(
    `${BASE_URL}/api/answer-key/${sectionId}`,
    {
      method: 'POST',
      body:   formData,
      // Do NOT set Content-Type manually — RN fetch sets it automatically
      // with the correct multipart boundary when body is FormData.
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error || 'Upload failed');
  }

  return data as AnswerKeyRecord;
}

export async function fetchAnswerKey(
  sectionId: string
): Promise<AnswerKeyRecord | null> {
  try {
    const { data } = await client.get<AnswerKeyRecord>(
      `/api/answer-key/${sectionId}`
    );

    return data;
  } catch (err: any) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

export async function deleteAnswerKey(
  sectionId: string
): Promise<void> {
  await client.delete(`/api/answer-key/${sectionId}`);
}

// ─── SCORE API ────────────────────────────────────────────────────────────────

export async function scoreStudent(
  sectionId: string,
  student: {
    id: string;
    name: string;
    answers: string[];
  }
): Promise<ScoreResult> {
  const { data } = await client.post<ScoreResult>(
    `/api/score/${sectionId}`,
    { student }
  );

  return data;
}

export default client;