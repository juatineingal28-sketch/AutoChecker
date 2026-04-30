import { useState } from 'react';
import apiService from '../services/api';

export interface ScanResult {
  studentName: string;
  score: number;
  totalQuestions: number;
  correctAnswers: number;
  incorrectAnswers: number;
  accuracy: number;
}

export const useScanning = (examId: string) => {
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const uploadAnswerKey = async (formData: FormData) => {
    try {
      const response = await apiService.uploadAnswerKey(examId, formData);
      return response.data;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const startScan = async () => {
    setScanning(true);
    try {
      const response = await apiService.startScan(examId);
      return response.data.scanId;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setScanning(false);
    }
  };

  const uploadScanImage = async (
    scanId: string,
    formData: FormData
  ) => {
    try {
      await apiService.uploadScanImage(examId, scanId, formData);
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const processScan = async (scanId: string) => {
    setScanning(true);
    try {
      const response = await apiService.processScan(examId, scanId);
      setResult(response.data.result);
      return response.data.result;
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setScanning(false);
    }
  };

  return {
    scanning,
    result,
    error,
    uploadAnswerKey,
    startScan,
    uploadScanImage,
    processScan,
  };
};