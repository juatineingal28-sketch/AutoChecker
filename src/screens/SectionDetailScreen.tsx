/**
 * screens/SectionDetailScreen.tsx
 *
 * CHANGES FROM PREVIOUS VERSION:
 *   REMOVED  — hardcoded MOCK_STUDENTS array
 *   ADDED    — loads real scan results via getScanResults() filtered by sectionId
 *   ADDED    — derives Student list directly from real ScanResult records
 *   KEPT     — fetchAnswerKey() for answer key display
 *   KEPT     — all scoring, filtering, search, and UI logic unchanged
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
import { useAuth } from '../context/AuthContext';
import { fetchAnswerKey, type AnswerKeyItem } from '../services/api';
import { getScanResults } from '../services/scanService';
import type { ScanResult } from '../types/exam';

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
 * A student entry built from a real ScanResult record.
 */
interface ScoredStudent {
  id:         string;
  name:       string;
  initials:   string;
  score:      number;
  total:      number;
  percentage: number;
  status:     'Passed' | 'Review' | 'Failed';
  resultId:   string;    // original ScanResult.id
  rawResult:  ScanResult; // full object — passed directly to ReviewScreen
}

const FILTERS: FilterChip[] = ['All', 'Passed', 'Failed', 'Review'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(pct: number) {
  if (pct >= 75) return '#059669';
  if (pct >= 60) return '#D97706';
  return '#DC2626';
}

function scoreSubLabel(pct: number): 'Passed' | 'Review' | 'Failed' {
  if (pct >= 75) return 'Passed';
  if (pct >= 60) return 'Review';
  return 'Failed';
}

function getInitials(name: string): string {
  const parts = name.trim().split(/[\s,]+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  // "Last, First" or "First Last" → first letters of first two parts
  return (parts[0][0] + parts[1][0]).toUpperCase();
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

/**
 * Convert a raw ScanResult into a ScoredStudent.
 * All scoring data (score, total, percentage, passed) already lives on ScanResult —
 * no re-scoring needed.
 */
function scanResultToScoredStudent(r: ScanResult): ScoredStudent {
  const name    = r.studentName?.trim() || 'Unknown Student';
  const pct     = r.percentage ?? 0;
  return {
    id:         r.id,
    name,
    initials:   getInitials(name),
    score:      r.score      ?? 0,
    total:      r.total      ?? 0,
    percentage: pct,
    status:     scoreSubLabel(pct),
    resultId:   r.id,
    rawResult:  r,
  };
}

// ─── Main Component ───────────────────────────────────────────────────────────

const SectionDetailScreen = () => {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const insets     = useSafeAreaInsets();
  const { user }   = useAuth();
  const userId     = user?.id ?? '';

  const section: Section = route.params?.section ?? {
    id:           '1',
    name:         'Section Rizal',
    studentCount: 0,
    subject:      'Science 10',
    average:      0,
  };

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterChip>('All');

  // Answer key
  const [answerKey,  setAnswerKey]  = useState<AnswerKeyItem[] | null>(null);

  // Real students from scan results
  const [students,  setStudents]  = useState<ScoredStudent[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  // ── Load real scan results for this section ─────────────────────────────────

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Load answer key and scan results in parallel
      const [keyRecord, allResults] = await Promise.all([
        fetchAnswerKey(section.id),
        getScanResults(userId),
      ]);

      // Set answer key (may be null if not uploaded yet)
      setAnswerKey(keyRecord?.key ?? null);

      // Filter scan results to only those belonging to this section.
      // Match by sectionId (UUID), section name, or the "section" string field
      // saved by saveEnrichedScanResult — whichever the scan stored.
      const sectionResults = allResults.filter((r: any) =>
        r.sectionId   === section.id   ||
        r.sectionId   === section.name ||
        r.section     === section.id   ||
        r.section     === section.name
      );

      // Convert to ScoredStudent — scoring already done by scan engine
      const scored = sectionResults.map(scanResultToScoredStudent);

      // De-duplicate by student name — keep the most recent scan per student
      const seen  = new Map<string, ScoredStudent>();
      for (const s of scored) {
        if (!seen.has(s.name)) seen.set(s.name, s);
      }

      setStudents(Array.from(seen.values()));
    } catch (err: any) {
      const msg = err?.message ?? 'Failed to load data. Check your connection.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [section.id, userId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filter students ─────────────────────────────────────────────────────────

  const filtered = students.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'All' || s.status === filter;
    return matchSearch && matchFilter;
  });

  // ── Derived averages ────────────────────────────────────────────────────────

  const realAverage = students.length > 0
    ? Math.round(students.reduce((sum, s) => sum + s.percentage, 0) / students.length)
    : section.average;

  // ── Render: loading ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.root, styles.centerContent]}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Loading students…</Text>
      </View>
    );
  }

  // ── Render: error ───────────────────────────────────────────────────────────

  if (error) {
    return (
      <View style={[styles.root, styles.centerContent]}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Sections</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.errorBox}>
          <Text style={styles.errorEmoji}>⚠️</Text>
          <Text style={styles.errorTitle}>Something went wrong</Text>
          <Text style={styles.errorBody}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadData}>
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
          {students.length} students · {section.subject}
        </Text>

        <View style={styles.statRow}>
          <View style={styles.statPill}>
            <Text style={styles.statPillNum}>{students.length}</Text>
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
          {students.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No scans yet for this section</Text>
              <TouchableOpacity
                onPress={() => navigation.navigate('Scan', { sectionId: section.id })}
                style={styles.scanNowBtn}
                activeOpacity={0.8}
              >
                <Text style={styles.scanNowText}>Scan Now →</Text>
              </TouchableOpacity>
            </View>
          ) : filtered.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No students match your filter</Text>
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
                  onPress={() =>
                    navigation.navigate('Review', {
                      result: student.rawResult,
                    })
                  }
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
                      {student.status.toLowerCase()}
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

  emptyWrap:   { paddingVertical: 24, alignItems: 'center', gap: 10 },
  emptyText:   { fontSize: 13, color: '#94A3B8' },
  scanNowBtn:  {
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 8,
  },
  scanNowText: { color: '#fff', fontWeight: '700', fontSize: 12 },
});