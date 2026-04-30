import { useState, useEffect } from 'react';
import { api } from '../services/api';

export interface Analytics {
    averageScore: number;
    highestScore: number;
    lowestScore: number;
    totalScanned: number;
    passRate: number;
    easyQuestions: string[];
    hardQuestions: string[];
    scoreDistribution: {
        range: string;
        count: number;
    }[];
}

export const useAnalytics = (examId: string) => {
    const [analytics, setAnalytics] = useState<Analytics | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fetchAnalytics = async () => {
        setLoading(true);
        try {
            const response = await api.getAnalytics(examId);
            setAnalytics(response.data.analytics);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const exportToExcel = async () => {
        try {
            const response = await api.exportToExcel(examId);
            return response.data;
        } catch (err: any) {
            setError(err.message);
            throw err;
        }
    };

    const exportToPdf = async () => {
        try {
            const response = await api.exportToPdf(examId);
            return response.data;
        } catch (err: any) {
            setError(err.message);
            throw err;
        }
    };

    useEffect(() => {
        fetchAnalytics();
    }, [examId]);

    return { analytics, loading, error, fetchAnalytics, exportToExcel, exportToPdf };
};