import { Dimensions, StyleSheet } from "react-native";

export const { width } = Dimensions.get("window");

export const colors = {
  primary: "#065F46",
  primaryLight: "#D1FAE5",
  primaryBg: "#F0FDF4",
  white: "#FFFFFF",
  bg: "#F9FAFB",
  text: "#111827",
  textMuted: "#6B7280",
  textLight: "#9CA3AF",
  border: "#E5E7EB",
  warning: "#D97706",
  warningBg: "#FEF3C7",
  danger: "#EF4444",
  dangerBg: "#FEE2E2",
  info: "#3B82F6",
  infoBg: "#DBEAFE",
  success: "#10B981",
  successBg: "#DCFCE7",
};

export const shared = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollView: {
    flex: 1,
    paddingBottom: 80,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 12,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 12,
  },
});

export const mockData = {
  totalExams: 8,
  totalScanned: 120,
  averageScore: 17.5,
  highestScore: 20,
  lowestScore: 10,
  recentScans: [
    { id: 1, student: "Student #1", score: 18, total: 20 },
    { id: 2, student: "Student #2", score: 15, total: 20 },
    { id: 3, student: "Student #3", score: 20, total: 20 },
    { id: 4, student: "Student #4", score: 12, total: 20 },
  ],
  easyQuestions: ["Q1", "Q2", "Q3", "Q4"],
  hardQuestions: ["Q5", "Q7", "Q12"],
  currentExam: {
    title: "Math Final Exam",
    totalQuestions: 15,
    answerKeyStatus: true,
  },
};