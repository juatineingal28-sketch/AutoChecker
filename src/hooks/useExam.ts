import { useEffect, useState } from 'react';
import apiService from '../services/api';

export interface Exam {
  id: string;
  title: string;
  totalQuestions: number;
  passingScore: number;
  totalScanned: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  createdAt: string;
}

export const useExams = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchExams = async () => {
    setLoading(true);
    try {
      const response = await apiService.getExams();
      setExams(response.data.exams);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createExam = async (examData: {
    title: string;
    totalQuestions: number;
    passingScore: number;
  }) => {
    try {
      const response = await apiService.createExam(examData);
      setExams([...exams, response.data.exam]);
      return response.data.exam;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const deleteExam = async (examId: string) => {
    try {
      await apiService.deleteExam(examId);
      setExams(exams.filter((exam) => exam.id !== examId));
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  useEffect(() => {
    fetchExams();
  }, []);

  return {
    exams,
    loading,
    error,
    fetchExams,
    createExam,
    deleteExam,
  };
};