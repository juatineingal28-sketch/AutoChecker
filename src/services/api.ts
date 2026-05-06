/**
 * src/services/api.ts
 *
 * CHANGES FROM PREVIOUS VERSION:
 *  ✅ Removed legacy QuestionType ('mc' | 'truefalse' | 'traceError' | 'shortAnswer')
 *  ✅ All answer key types now use ExamType from exam.ts
 *  ✅ TypeSummary aligned to the 4 supported ExamTypes only
 *  ✅ Translation layer (toBackendExamType) maps ExamType → legacy backend strings
 *     so the Railway backend is NOT broken during transition.
 *     When the backend is updated to accept the new strings, delete
 *     toBackendExamType() and use ExamType directly.
 */

import axios from 'axios';
import * as FileSystem from 'expo-file-system';
import type { ExamType } from '../types/exam';

// ─── BASE URL ─────────────────────────────────────────────────────────────────
export const BASE_URL =
  'https://autochecker-backend-production.up.railway.app';

// ─── Axios Client ─────────────────────────────────────────────────────────────
const client = axios.create({
  baseURL: BASE_URL,
  timeout: 120000,
});

// ─── BACKEND TRANSLATION LAYER ────────────────────────────────────────────────
//
// The Railway backend still expects the OLD type strings.
// This mapping isolates that concern to one place.
// Frontend code always uses ExamType — never the backend strings directly.
//
// DELETE THIS when the backend is updated to accept ExamType strings.

const EXAM_TYPE_TO_BACKEND: Record<ExamType, string> = {
  bubble_omr:      'omr',   // ✅ was 'mc', now correctly sends 'omr'
  multiple_choice: 'mc',
  identification:  'identification',
  enumeration:     'enumeration',
  true_or_false:   'truefalse',
};

/** Call this only when building payloads sent to the backend API. */
export function toBackendExamType(type: ExamType): string {
  return EXAM_TYPE_TO_BACKEND[type] ?? type;
}

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type SectionColor = 'blue' | 'green' | 'amber' | 'red';

export interface Section {
  id:           string;
  name:         string;
  abbr:         string;
  subject:      string;
  studentCount: number;
  color:        SectionColor;
  average:      number;
  quizCount:    number;
  createdAt?:   string;
  hasAnswerKey?: boolean;
  fileName?:    string | null;
  fileType?:    string | null;
  uploadedAt?:  string | null;
  total?:       number;
  typeSummary?: TypeSummary;
}

export interface CreateSectionPayload {
  name:          string;
  abbr?:         string;
  subject?:      string;
  studentCount?: number;
  color?:        SectionColor;
}

/**
 * AnswerKeyItem — one question in the answer key.
 * Uses ExamType (not the old QuestionType).
 * answer is string for MCQ/Identification, string[] for Enumeration.
 */
export interface AnswerKeyItem {
  question: number;
  type:     ExamType;
  answer:   string | string[];
}

/**
 * TypeSummary — counts of items per exam type in an answer key.
 * Only the 4 supported types. No legacy types.
 */
export interface TypeSummary {
  bubble_omr?:      number;
  multiple_choice?: number;
  identification?:  number;
  enumeration?:     number;
  true_or_false?:   number;
}

export interface AnswerKeyRecord {
  success:     boolean;
  sectionId:   string;
  fileName:    string;
  fileType:    string;
  uploadedAt:  string;
  total:       number;
  typeSummary: TypeSummary;
  key:         AnswerKeyItem[];
}

export interface ScoreDetail {
  question:      number;
  type:          ExamType;
  correctAnswer: string | string[];
  studentAnswer: string | null;
  isCorrect:     boolean;
}

export interface ScoreResult {
  success:    boolean;
  student: {
    id:   string;
    name: string;
  };
  score:      number;
  total:      number;
  percentage: number;
  status:     'Passed' | 'Review' | 'Failed';
  details:    ScoreDetail[];
}

// ─── FILE TYPES ───────────────────────────────────────────────────────────────

export const ACCEPTED_MIME_TYPES = [
  'application/json',
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

export const ACCEPTED_EXTENSIONS = ['.json', '.txt', '.pdf', '.docx', '.doc'];

// ─── SECTION API ──────────────────────────────────────────────────────────────

export async function fetchSections(): Promise<Section[]> {
  const { data } = await client.get<{ success: boolean; sections: Section[] }>(
    '/api/sections'
  );
  return data.sections;
}

export async function createSection(payload: CreateSectionPayload): Promise<Section> {
  const { data } = await client.post<{ success: boolean; section: Section }>(
    '/api/sections',
    payload
  );
  return data.section;
}

export async function deleteSection(sectionId: string): Promise<void> {
  await client.delete(`/api/sections/${sectionId}`);
}

// ─── ANSWER KEY API ───────────────────────────────────────────────────────────

export async function uploadAnswerKey(
  sectionId: string,
  fileUri:   string,
  fileName:  string,
  mimeType:  string = 'application/octet-stream'
): Promise<AnswerKeyRecord> {
  const formData = new FormData();
  formData.append('file', { uri: fileUri, name: fileName, type: mimeType } as any);

  const response = await fetch(`${BASE_URL}/api/answer-key/${sectionId}`, {
    method: 'POST',
    body:   formData,
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || 'Upload failed');
  return data as AnswerKeyRecord;
}

/**
 * Uploads an answer key as a JSON file via multipart form.
 *
 * Translates ExamType → backend strings via toBackendExamType() before
 * serialising, so the backend receives the values it currently expects.
 * Remove the translation step once the backend is updated.
 */
export async function uploadAnswerKeyJson(
  sectionId: string,
  items:     AnswerKeyItem[]
): Promise<AnswerKeyRecord> {
  // Translate exam types for the backend
  const backendItems = items.map(item => ({
    ...item,
    type: toBackendExamType(item.type),
  }));

  const json    = JSON.stringify(backendItems, null, 2);
  const tempUri = `${FileSystem.cacheDirectory}answer_key_${Date.now()}.json`;

  await FileSystem.writeAsStringAsync(tempUri, json, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  const formData = new FormData();
  formData.append('file', {
    uri:  tempUri,
    name: 'answer_key.json',
    type: 'application/json',
  } as any);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}/api/answer-key/${sectionId}`, {
      method: 'POST',
      body:   formData,
    });
  } finally {
    FileSystem.deleteAsync(tempUri, { idempotent: true });
  }

  const text = await response.text();

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    console.error('[uploadAnswerKeyJson] Non-JSON response:', text.slice(0, 300));
    throw new Error(`Server returned invalid response (status ${response.status})`);
  }

  if (!response.ok) throw new Error(data?.error || `Upload failed (${response.status})`);
  return data as AnswerKeyRecord;
}

export async function fetchAnswerKey(sectionId: string): Promise<AnswerKeyRecord | null> {
  try {
    const { data } = await client.get<AnswerKeyRecord>(`/api/answer-key/${sectionId}`);
    return data;
  } catch (err: any) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

export async function deleteAnswerKey(sectionId: string): Promise<void> {
  await client.delete(`/api/answer-key/${sectionId}`);
}

// ─── SCORE API ────────────────────────────────────────────────────────────────

export async function scoreStudent(
  sectionId: string,
  student: {
    id:      string;
    name:    string;
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