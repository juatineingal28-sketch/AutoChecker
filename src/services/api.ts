/**
 * src/services/api.ts
 */

import axios from 'axios';

// ─── BASE URL ─────────────────────────────────────────────────────────────────
export const BASE_URL = 'https://autochecker-backend-production.up.railway.app';

// ─── Axios client ─────────────────────────────────────────────────────────────
//  ⚠️  No default Content-Type header — multipart uploads need their own boundary.
const client = axios.create({
  baseURL: BASE_URL,
  timeout: 20_000,
});

// ─── Types ────────────────────────────────────────────────────────────────────

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

export type QuestionType =
  | 'mc'
  | 'truefalse'
  | 'identification'
  | 'enumeration'
  | 'traceError'
  | 'shortAnswer';

export interface AnswerKeyItem {
  question: number;
  type:     QuestionType;
  answer:   string | string[];
}

export interface TypeSummary {
  mc?:             number;
  truefalse?:      number;
  identification?: number;
  enumeration?:    number;
  traceError?:     number;
  shortAnswer?:    number;
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
  type:          QuestionType;
  correctAnswer: string | string[];
  studentAnswer: string | null;
  isCorrect:     boolean;
}

export interface ScoreResult {
  success:    boolean;
  student:    { id: string; name: string };
  score:      number;
  total:      number;
  percentage: number;
  status:     'Passed' | 'Review' | 'Failed';
  details:    ScoreDetail[];
}

// ─── ACCEPTED FILE TYPES ──────────────────────────────────────────────────────

export const ACCEPTED_MIME_TYPES = [
  'application/json',
  'text/plain',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

export const ACCEPTED_EXTENSIONS = ['.json', '.txt', '.pdf', '.docx', '.doc'];

// ─── Section API ──────────────────────────────────────────────────────────────

/**
 * Fetch all sections from the backend (live, not hardcoded).
 */
export async function fetchSections(): Promise<Section[]> {
  const { data } = await client.get<{ success: boolean; sections: Section[] }>('/api/sections');
  return data.sections;
}

/**
 * Create a new section on the backend.
 */
export async function createSection(payload: CreateSectionPayload): Promise<Section> {
  const { data } = await client.post<{ success: boolean; section: Section }>(
    '/api/sections',
    payload,
  );
  return data.section;
}

/**
 * Permanently delete a section from the backend.
 *
 * WHY this must exist:
 *   Without a backend DELETE call, removing a section only clears it from
 *   React state (in-memory). The next fetchSections() — triggered on login
 *   or screen mount — re-fetches from the database, and the section reappears.
 *   Calling DELETE /api/sections/:id removes the record from the database so
 *   it can never be returned by a future fetchSections().
 *
 * @throws  Will throw if the server responds with a non-2xx status.
 *          The caller (handleDeleteSection) must catch this and rollback the UI.
 */
export async function deleteSection(sectionId: string): Promise<void> {
  await client.delete(`/api/sections/${sectionId}`);
}

// ─── Answer Key API ───────────────────────────────────────────────────────────

/**
 * Upload an answer key file (.json / .txt / .pdf / .docx) for a section.
 *
 * WHY fetch() and NOT axios:
 *   Axios on React Native strips the `boundary` from multipart Content-Type
 *   headers, causing Multer to fail with "No file uploaded."
 *   Native fetch() sets the correct multipart/form-data + boundary automatically.
 */
export async function uploadAnswerKey(
  sectionId: string,
  fileUri:   string,
  fileName:  string,
  mimeType:  string = 'application/octet-stream',
): Promise<AnswerKeyRecord> {
  const formData = new FormData();
  formData.append('file', {
    uri:  fileUri,
    name: fileName,
    type: mimeType,
  } as any);

  const response = await fetch(`${BASE_URL}/api/answer-key/${sectionId}`, {
    method: 'POST',
    body:   formData,
    // Do NOT set Content-Type — fetch sets it with the correct boundary.
  });

  const data = await response.json();

  if (!response.ok) {
    const err: any = new Error(data?.error ?? `Upload failed (${response.status})`);
    err.response = { data, status: response.status };
    throw err;
  }

  return data as AnswerKeyRecord;
}

/**
 * Fetch the stored answer key for a section.
 * Returns null if none has been uploaded yet (404).
 */
export async function fetchAnswerKey(sectionId: string): Promise<AnswerKeyRecord | null> {
  try {
    const { data } = await client.get<AnswerKeyRecord>(`/api/answer-key/${sectionId}`);
    return data;
  } catch (err: any) {
    if (err.response?.status === 404) return null;
    throw err;
  }
}

/**
 * Delete the answer key for a section.
 */
export async function deleteAnswerKey(sectionId: string): Promise<void> {
  await client.delete(`/api/answer-key/${sectionId}`);
}

/**
 * Score a student's answers against the section's stored answer key.
 */
export async function scoreStudent(
  sectionId: string,
  student: { id: string; name: string; answers: string[] },
): Promise<ScoreResult> {
  const { data } = await client.post<ScoreResult>(
    `/api/score/${sectionId}`,
    { student },
  );
  return data;
}

export default client;