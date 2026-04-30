import { useState, useEffect } from 'react';
import { api } from '../services/api';

export interface StudentResult {
  id: string;
  studentName: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  accuracy: number;
  status: 'pass' | 'fail' | 'review';
  scannedAt: string;
}

export const useResults = (examId: string) => {
  const [results, setResults] = useState<StudentResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchResults = async () => {
    setLoading(true);
    try {
      const response = await api.getStudentResults(examId);
      setResults(response.data.results);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateStudentScore = async (
    studentId: string,
    score: number
  ) => {
    try {
      const response = await api.updateStudentScore(
        examId,
        studentId,
        score
      );
      const updatedResults = results.map((r) =>
        r.id === studentId ? response.data.result : r
      );
      setResults(updatedResults);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  useEffect(() => {
    fetchResults();
  }, [examId]);

  return {
    results,
    loading,
    error,
    fetchResults,
    updateStudentScore,
  };
};