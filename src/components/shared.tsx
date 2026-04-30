import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';

// ─── Utilities ───

export const formatScore = (value: number): string => {
  if (value === null || value === undefined) return '0%';
  return `${Math.round(value * 100)}%`;
};

export const formatMarks = (score: number, total: number): string => {
  return `${score}/${total}`;
};

export const getGrade = (percent: number): string => {
  if (percent >= 90) return 'A';
  if (percent >= 75) return 'B';
  if (percent >= 60) return 'C';
  if (percent >= 50) return 'D';
  return 'F';
};

export const safeNumber = (value: any, fallback = 0): number => {
  const num = Number(value);
  return isNaN(num) ? fallback : num;
};

// ─── Export Button ───

export type ExportButtonProps = {
  label: string;
  onPress: () => void;
};

export function ExportButton({ label, onPress }: ExportButtonProps) {
  return (
    <TouchableOpacity style={styles.button} onPress={onPress}>
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Styles ───

const styles = StyleSheet.create({
  button: {
    marginTop: 20,
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontWeight: '700',
  },
});