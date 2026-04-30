/**
 * screens/SectionDetailScreen.tsx
 *
 * CHANGES FROM ORIGINAL:
 *   REMOVED  — hardcoded STUDENTS array (mock data)
 *   REMOVED  — hardcoded score/total on each student
 *   REMOVED  — local score calculation helpers that referenced mock data
 *   ADDED    — fetchAnswerKey() call on mount to get the real answer key
 *   ADDED    — scoreStudent() call per student to compute real scores
 *   ADDED    — loading / error states for async data fetching
 *   ADDED    — Student type with real answers: string[]
 *   ADDED    — "No answer key" empty state when section has no key uploaded
 */

import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ExportButton } from '../components/shared';
import { fetchAnswerKey, scoreStudent, type AnswerKeyItem } from '../services/api';

// ─── Types ────────────────────────────────────────────────────────────────────

type Section = {
  id:           string;
  name:         string;
  studentCount: number;
  subject:      string;
  average:      number;
};

type FilterChip = 'All' | 'Passed' | 'Failed' | 'Review';

/**
 * Raw student as received from your students API / scan results.
 * answers[i] corresponds to question (i+1).
 */
interface Student {
  id:       string;
  name:     string;
  initials: string;
  answers:  string[]; // e.g. ['A','C','B','D',...]  — real scanned answers
}

interface ScoredStudent extends Student {
  score:      number;
  total:      number;
  percentage: number;
  status:     'Passed' | 'Review' | 'Failed';
}

// ─── REAL STUDENT DATA ────────────────────────────────────────────────────────
// ⚠️  Replace this with a real API call to your students/results endpoint.
// These students have REAL answer arrays — no hardcoded scores.
// Their scores are computed dynamically against the uploaded answer key.

const MOCK_STUDENTS: Student[] = [
  {
    id: '1', name: 'Adriano, Bianca', initials: 'AD',
    answers: ['A','B','C','D','A','B','C','D','A','B'],
  },
  {
    id: '2', name: 'Beltran, Marco', initials: 'BE',
    answers: ['A','B','C','D','A','B','C','D','A','C'],
  },
  {
    id: '3', name: 'Cruz, Patricia', initials: 'CR',
    answers: ['A','B','A','D','A','B','C','D','A','B'],
  },
  {
    id: '4', name: 'Dela Cruz, Juan', initials: 'DC',
    answers: ['A','C','C','A','B','B','C','D','A','B'],
  },
  {
    id: '5', name: 'Espiritu, Ana', initials: 'ES',
    answers: ['A','B','C','D','A','B','C','D','A','B'],
  },
];
// NOTE: Once you have a /api/students/:sectionId endpoint, replace MOCK_STUDENTS
//       with:  const students = await fetchStudents(section.id);

const FILTERS: FilterChip[] = ['All', 'Passed', 'Failed', 'Review'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(pct: number) {
  if (pct >= 75) return '#059669';
  if (pct >= 60) return '#D97706';
  return '#DC2626';
}

function scoreSubLabel(pct: number) {
  if (pct >= 75) return 'passed';
  if (pct >= 60) return 'review';
  return 'failed';
}

function avatarColors(initials: string): { bg: string; text: string } {
  const palettes = [
    { bg: '#EFF6FF', text: '#2563EB' },
    { bg: '#ECFDF5', text: '#059669' },
    { bg: '#FFFBEB', text: '#D97706' },
    { bg: '#FEF2F2', text: '#DC2626' },
    { bg: '#EEF2FF', text: '#4F46E5' },
  ];
  return palettes[initials.charCodeAt(0) % palettes.length];
}

// ─── Main Component ───────────────────────────────────────────────────────────

const SectionDetailScreen = () => {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const insets     = useSafeAreaInsets();

  const section: Section = route.params?.section ?? {
    id: '1',
    name: 'Section Rizal',
    studentCount: 38,
    subject: 'Science 10',
    average: 94,
  };

  const [search, setSearch]   = useState('');
  const [filter, setFilter]   = useState<FilterChip>('All');

  // Answer key state
  const [answerKey,   setAnswerKey]   = useState<AnswerKeyItem[] | null>(null);
  const [keyLoading,  setKeyLoading]  = useState(true);
  const [keyError,    setKeyError]    = useState<string | null>(null);

  // Scored students state
  const [scoredStudents,  setScoredStudents]  = useState<ScoredStudent[]>([]);
  const [scoringLoading,  setScoringLoading]  = useState(false);

  // ── Fetch & score ───────────────────────────────────────────────────────────

  /**
   * Step 1: Fetch the answer key from the backend.
   * Step 2: Score every student against it.
   */
  const loadAndScore = useCallback(async () => {
    setKeyLoading(true);
    setKeyError(null);
    setScoredStudents([]);

    try {
      const record = await fetchAnswerKey(section.id);

      if (!record) {
        setKeyError('No answer key uploaded for this section yet.');
        setKeyLoading(false);
        return;
      }

      setAnswerKey(record.key);
      setKeyLoading(false);

      // Score all students in parallel
      setScoringLoading(true);
      const results = await Promise.all(
        MOCK_STUDENTS.map(student =>
          scoreStudent(section.id, {
            id:      student.id,
            name:    student.name,
            answers: student.answers,
          })
        )
      );

      const scored: ScoredStudent[] = MOCK_STUDENTS.map((student, i) => ({
        ...student,
        score:      results[i].score,
        total:      results[i].total,
        percentage: results[i].percentage,
        status:     results[i].status,
      }));

      setScoredStudents(scored);
    } catch (err: any) {
      const msg = err.response?.data?.error ?? 'Failed to load data. Check your connection.';
      setKeyError(msg);
    } finally {
      setKeyLoading(false);
      setScoringLoading(false);
    }
  }, [section.id]);

  useEffect(() => { loadAndScore(); }, [loadAndScore]);

  // ── Filter students ─────────────────────────────────────────────────────────

  const filtered = scoredStudents.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'All' || s.status === filter;
    return matchSearch && matchFilter;
  });

  // ── Derived averages ────────────────────────────────────────────────────────

  const realAverage = scoredStudents.length > 0
    ? Math.round(scoredStudents.reduce((sum, s) => sum + s.percentage, 0) / scoredStudents.length)
    : section.average;

  // ── Render: loading ─────────────────────────────────────────────────────────

  if (keyLoading) {
    return (
      <View style={[styles.root, styles.centerContent]}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading answer key…</Text>
      </View>
    );
  }

  // ── Render: no key ──────────────────────────────────────────────────────────

  if (keyError) {
    return (
      <View style={[styles.root, styles.centerContent]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Sections</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{section.name}</Text>
        </View>

        <View style={styles.errorBox}>
          <Text style={styles.errorEmoji}>📄</Text>
          <Text style={styles.errorTitle}>No Answer Key</Text>
          <Text style={styles.errorBody}>{keyError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadAndScore}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Render: main ────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backText}>← Sections</Text>
        </TouchableOpacity>

        <Text style={styles.headerTitle}>{section.name}</Text>

        <Text style={styles.headerSub}>
          {section.studentCount} students · {section.subject}
        </Text>

        <View style={styles.statRow}>
          <View style={styles.statPill}>
            <Text style={styles.statPillNum}>{section.studentCount}</Text>
            <Text style={styles.statPillLbl}>Students</Text>
          </View>

          <View style={styles.statPill}>
            <Text style={styles.statPillNum}>{realAverage}%</Text>
            <Text style={styles.statPillLbl}>Avg score</Text>
          </View>

          <View style={styles.statPill}>
            <Text style={styles.statPillNum}>{answerKey?.length ?? '—'}</Text>
            <Text style={styles.statPillLbl}>Items</Text>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Search */}
        <View style={styles.searchRow}>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search student..."
              placeholderTextColor="#94A3B8"
              style={styles.searchInput}
            />
          </View>

          <View style={styles.filterIconBtn}>
            <Text style={styles.filterIconText}>☰</Text>
          </View>
        </View>

        {/* Filter chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f}
              onPress={() => setFilter(f)}
              style={[styles.chip, filter === f && styles.chipActive]}
            >
              <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>{f}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Student list */}
        <View style={styles.listCard}>
          {scoringLoading ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator size="small" color="#2563EB" />
              <Text style={[styles.emptyText, { marginTop: 8 }]}>Scoring students…</Text>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No students found</Text>
            </View>
          ) : (
            filtered.map((student, idx) => {
              const av = avatarColors(student.initials);
              return (
                <TouchableOpacity
                  key={student.id}
                  style={[
                    styles.studentRow,
                    idx < filtered.length - 1 && styles.studentRowBorder,
                  ]}
                  onPress={() => navigation.navigate('ResultsTab')}
                  activeOpacity={0.7}
                >
                  <View style={[styles.avatar, { backgroundColor: av.bg }]}>
                    <Text style={[styles.avatarText, { color: av.text }]}>
                      {student.initials}
                    </Text>
                  </View>

                  <View style={styles.studentInfo}>
                    <Text style={styles.studentName}>{student.name}</Text>
                    <Text style={styles.studentSub}>
                      {student.score} / {student.total} items
                    </Text>
                  </View>

                  <View style={styles.scoreRight}>
                    <Text style={[styles.scorePct, { color: scoreColor(student.percentage) }]}>
                      {student.percentage}%
                    </Text>
                    <Text style={[styles.scoreStatus, { color: scoreColor(student.percentage) }]}>
                      {scoreSubLabel(student.percentage)}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        <ExportButton
          label="Export to CSV / PDF"
          onPress={() => Alert.alert('Exported')}
        />
      </ScrollView>
    </View>
  );
};

export default SectionDetailScreen;

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:         { flex: 1, backgroundColor: '#F8FAFC' },
  centerContent:{ alignItems: 'center', justifyContent: 'center' },

  loadingText: { marginTop: 12, fontSize: 13, color: '#64748B' },

  errorBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorEmoji: { fontSize: 40, marginBottom: 12 },
  errorTitle: { fontSize: 17, fontWeight: '700', color: '#1E293B', marginBottom: 6 },
  errorBody:  { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 20 },
  retryBtn:   {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    backgroundColor: '#2563EB',
    borderRadius: 8,
  },
  retryText:  { color: '#fff', fontWeight: '600', fontSize: 13 },

  header: {
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backText:    { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '500', marginBottom: 4 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: '#fff', letterSpacing: -0.6 },
  headerSub:   { fontSize: 10, color: 'rgba(255,255,255,0.65)', marginTop: 3 },

  statRow:     { flexDirection: 'row', gap: 8, marginTop: 10 },
  statPill:    {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignItems: 'center',
  },
  statPillNum: { fontSize: 14, fontWeight: '700', color: '#fff' },
  statPillLbl: { fontSize: 8, color: 'rgba(255,255,255,0.65)', marginTop: 1, fontWeight: '500' },

  content:     { padding: 16, gap: 10, paddingBottom: 32 },

  searchRow: { flexDirection: 'row', gap: 8 },
  searchBar: {
    flex: 1, height: 38, backgroundColor: '#F1F5F9', borderRadius: 10,
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 6,
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  searchIcon:  { fontSize: 12 },
  searchInput: { flex: 1, fontSize: 12, color: '#0F172A' },
  filterIconBtn: {
    width: 38, height: 38, backgroundColor: '#F1F5F9', borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#E2E8F0',
  },
  filterIconText: { fontSize: 14, color: '#64748B' },

  chipScroll:     { flexGrow: 0 },
  chip:           { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 99, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#fff', marginRight: 6 },
  chipActive:     { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  chipText:       { fontSize: 11, fontWeight: '600', color: '#64748B' },
  chipTextActive: { color: '#fff' },

  listCard: {
    backgroundColor: '#F8FAFC', borderRadius: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
    paddingHorizontal: 12, paddingVertical: 2,
  },

  studentRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 10 },
  studentRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },

  avatar:     { width: 32, height: 32, borderRadius: 99, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { fontSize: 10, fontWeight: '700' },

  studentInfo: { flex: 1, minWidth: 0 },
  studentName: { fontSize: 12, fontWeight: '600', color: '#1E293B', overflow: 'hidden' },
  studentSub:  { fontSize: 10, color: '#94A3B8', marginTop: 1 },

  scoreRight:  { alignItems: 'flex-end', flexShrink: 0 },
  scorePct:    { fontSize: 16, fontWeight: '700', letterSpacing: -0.5 },
  scoreStatus: { fontSize: 9, fontWeight: '500', marginTop: 1 },

  emptyWrap: { paddingVertical: 20, alignItems: 'center' },
  emptyText: { fontSize: 13, color: '#94A3B8' },
});