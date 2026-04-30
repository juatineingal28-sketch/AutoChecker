// screens/ResultsTab.tsx
// Loads REAL scan results from storage.
// No hardcoded mock data.

import { useNavigation, useRoute } from '@react-navigation/native';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useAuth } from '../context/AuthContext';
import { formatResultForExport } from '../services/resultService';
import { deleteScanResult, getScanResults } from '../services/scanService';
import { Colors, Radius } from '../theme';
import type { ScanResult } from '../types/exam';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const R    = 28;
const CIRC = 2 * Math.PI * R;

function CircleChart({ score, total }: { score: number; total: number }) {
  if (total === 0) return null;
  const correctDash = (score / total) * CIRC;
  const wrongDash   = ((total - score) / total) * CIRC;
  return (
    <Svg width={90} height={90}>
      <Circle cx={35} cy={35} r={R} stroke={Colors.n200} strokeWidth={10} fill="none" />
      <Circle
        cx={35} cy={35} r={R}
        stroke={Colors.success}
        strokeWidth={10}
        fill="none"
        strokeDasharray={`${correctDash} ${CIRC}`}
        transform="rotate(-90 35 35)"
      />
      <Circle
        cx={35} cy={35} r={R}
        stroke={Colors.danger}
        strokeWidth={10}
        fill="none"
        strokeDasharray={`${wrongDash} ${CIRC}`}
        strokeDashoffset={-correctDash}
        transform="rotate(-90 35 35)"
      />
    </Svg>
  );
}

// ─── Route params ──────────────────────────────────────────────────────────────

interface RouteParams {
  /** Full result object passed directly from ScanTab — shown immediately. */
  result?:    ScanResult;
  /** ID of a saved record to look up from local storage. */
  resultId?:  string;
  sectionId?: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export default function ResultsTab() {
  const navigation = useNavigation<any>();
  const route      = useRoute();
  const params     = (route.params as RouteParams) ?? {};
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const [results, setResults]     = useState<ScanResult[]>([]);
  // ✅ FIX: Pre-populate `selected` with the live result if one was passed as
  // a navigation param. This means the UI renders immediately — no blank
  // screen while waiting for async storage to load.
  const [selected, setSelected]   = useState<ScanResult | null>(params.result ?? null);
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ── Load results ───────────────────────────────────────────

  const loadResults = useCallback(async (showRefresh = false) => {
    if (showRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await getScanResults(userId);
      setResults(data);

      if (params.result) {
        // ✅ FIX: A live result was passed directly from ScanTab — use it
        // immediately so the user sees data without waiting for storage I/O.
        // Also ensure it appears in the list (storage write may lag slightly).
        const alreadySaved = data.find((r) => r.id === params.result!.id);
        setSelected(alreadySaved ?? params.result!);
      } else if (params.resultId) {
        // Look up a previously saved result by id.
        const target = data.find((r) => r.id === params.resultId);
        if (target) setSelected(target);
      } else if (data.length > 0 && !selected) {
        setSelected(data[0]);
      }
    } catch (err: any) {
      Alert.alert('Load Error', err?.message ?? 'Could not load results.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [params.result, params.resultId, params.sectionId]);

  useEffect(() => { loadResults(); }, [loadResults]);

  // ── Delete result ──────────────────────────────────────────

  const handleDelete = useCallback((id: string) => {
    Alert.alert(
      'Delete Result',
      'This will permanently remove this scan result.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteScanResult(userId, id);
            if (selected?.id === id) setSelected(null);
            loadResults();
          },
        },
      ]
    );
  }, [selected, loadResults]);

  // ── Export ─────────────────────────────────────────────────

  const handleExport = useCallback(() => {
    if (!selected) return;
    const text = formatResultForExport(selected);
    // In production, use expo-sharing or expo-print here.
    Alert.alert('Export Preview', text.slice(0, 500) + (text.length > 500 ? '\n…' : ''));
  }, [selected]);

  // ── Render states ──────────────────────────────────────────

  // ✅ FIX: Don't show the loading spinner if we already have a live result
  // pre-populated from navigation params — the data is already there.
  if (loading && !selected) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading results…</Text>
      </View>
    );
  }

  // ✅ FIX: Only show empty state if storage is empty AND no live result.
  if (results.length === 0 && !selected) {
    return (
      <View style={styles.root}>
        <View style={styles.topbar}>
          <Text style={styles.title}>Results</Text>
        </View>
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyTitle}>No results yet</Text>
          <Text style={styles.emptyText}>
            Scan an answer sheet to see results here.
          </Text>
          <TouchableOpacity
            style={styles.scanNowBtn}
            onPress={() => navigation.navigate('Scan')}
            activeOpacity={0.8}
          >
            <Text style={styles.scanNowText}>Scan Now →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const score   = selected?.score ?? 0;
  const total   = selected?.total ?? 0;
  const percent = selected?.percentage ?? 0;
  const passed  = selected?.passed ?? false;
  const wrong   = total - score;

  const breakdown = selected
    ? Object.keys(selected.answerKey)
        .sort((a, b) => parseInt(a) - parseInt(b))
        .map((q) => {
          const student = selected.studentAnswers[q] ?? '';
          const correct = selected.answerKey[q] ?? '';
          const ok =
            student.trim().toUpperCase() === correct.trim().toUpperCase() &&
            student.trim() !== '';
          return { q, a: student || '—', ok };
        })
    : [];

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={styles.topbar}>
        <Text style={styles.title}>Results</Text>
        {results.length > 1 && (
          <Text style={styles.countBadge}>{results.length} scans</Text>
        )}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadResults(true)} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── Recent scans list (when multiple) ── */}
        {results.length > 1 && (
          <>
            <Text style={styles.sectionHeading}>Recent scans</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.recentRow}>
              {results.map((r) => (
                <TouchableOpacity
                  key={r.id}
                  style={[
                    styles.recentChip,
                    selected?.id === r.id && styles.recentChipActive,
                  ]}
                  onPress={() => setSelected(r)}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.recentChipName,
                      selected?.id === r.id && styles.recentChipNameActive,
                    ]}
                    numberOfLines={1}
                  >
                    {r.studentName}
                  </Text>
                  <Text
                    style={[
                      styles.recentChipScore,
                      { color: r.passed ? Colors.success : Colors.danger },
                    ]}
                  >
                    {r.percentage}%
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </>
        )}

        {/* ── Hero score ── */}
        {selected && (
          <>
            <View style={[styles.hero, { backgroundColor: passed ? Colors.primaryDark : '#7F1D1D' }]}>
              <Text style={styles.heroName} numberOfLines={1}>{selected.studentName}</Text>
              <Text style={styles.heroScore}>{score}</Text>
              <Text style={styles.heroSub}>out of {total} · {percent}%</Text>
              <View style={[styles.heroBadge, { backgroundColor: passed ? Colors.success : Colors.danger }]}>
                <Text style={styles.heroBadgeText}>{passed ? '✓ PASSED' : '✗ FAILED'}</Text>
              </View>
            </View>

            {/* ── Answer breakdown ── */}
            <Text style={styles.sectionHeading}>Answer breakdown</Text>

            <View style={styles.card}>
              <CircleChart score={score} total={total} />
              <View style={{ marginLeft: 16, gap: 6 }}>
                <Text style={[styles.statLine, { color: Colors.success }]}>✓ Correct: {score}</Text>
                <Text style={[styles.statLine, { color: Colors.danger }]}>✗ Wrong: {wrong}</Text>
                <Text style={[styles.statLine, { color: Colors.textSecondary }]}>
                  Exam: {selected.examType.replace(/_/g, ' ')}
                </Text>
                {selected.ocrConfidence < 0.8 && (
                  <Text style={[styles.statLine, { color: Colors.amber }]}>
                    ⚠ OCR {Math.round(selected.ocrConfidence * 100)}%
                  </Text>
                )}
              </View>
            </View>

            {/* ── All answers grid ── */}
            <Text style={styles.sectionHeading}>All answers</Text>

            <View style={styles.grid}>
              {breakdown.map(({ q, a, ok }) => (
                <View key={q} style={[styles.box, ok ? styles.ok : styles.wrong]}>
                  <Text style={styles.boxQ}>Q{q}</Text>
                  <Text style={[styles.boxA, { color: ok ? Colors.success : Colors.danger }]} numberOfLines={1}>
                    {a}
                  </Text>
                </View>
              ))}
            </View>

            {/* ── Actions ── */}
            <TouchableOpacity style={styles.exportBtn} onPress={handleExport} activeOpacity={0.85}>
              <Text style={styles.exportText}>Export Result</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => handleDelete(selected.id)}
              activeOpacity={0.85}
            >
              <Text style={styles.deleteText}>Delete This Result</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },

  topbar: {
    padding: 16,
    paddingBottom: 12,
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: 18, fontWeight: '700', color: Colors.textPrimary },
  countBadge: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.textSecondary,
    backgroundColor: Colors.n100,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },

  loadingText: { fontSize: 13, color: Colors.textSecondary },
  emptyIcon:  { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  emptyText:  { fontSize: 13, color: Colors.textSecondary, textAlign: 'center' },
  scanNowBtn: {
    marginTop: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: Radius.md,
  },
  scanNowText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  content: { padding: 16, gap: 12 },

  sectionHeading: {
    fontWeight: '700',
    fontSize: 12,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 4,
  },

  recentRow: { marginBottom: 4 },
  recentChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
    alignItems: 'center',
  },
  recentChipActive: {
    backgroundColor: Colors.primaryLight ?? '#EFF6FF',
    borderColor: Colors.primary,
  },
  recentChipName: { fontSize: 12, fontWeight: '600', color: Colors.textPrimary, maxWidth: 100 },
  recentChipNameActive: { color: Colors.primary },
  recentChipScore: { fontSize: 10, fontWeight: '700', marginTop: 2 },

  hero: {
    padding: 20,
    borderRadius: Radius.lg,
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  heroName:  { fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: '600', marginBottom: 2 },
  heroScore: { fontSize: 48, color: '#fff', fontWeight: '800', lineHeight: 52 },
  heroSub:   { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  heroBadge: {
    borderRadius: Radius.full,
    paddingHorizontal: 16,
    paddingVertical: 5,
    marginTop: 8,
  },
  heroBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff', letterSpacing: 1 },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statLine: { fontSize: 13, fontWeight: '600' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  box: {
    width: 52,
    padding: 7,
    borderRadius: Radius.sm,
    alignItems: 'center',
    gap: 2,
    borderWidth: 1,
  },
  ok:    { backgroundColor: Colors.successLight, borderColor: '#A7F3D0' },
  wrong: { backgroundColor: Colors.dangerLight,  borderColor: '#FECACA' },
  boxQ:  { fontSize: 8, fontWeight: '700', color: Colors.textMuted },
  boxA:  { fontSize: 13, fontWeight: '700' },

  exportBtn: {
    marginTop: 8,
    padding: 13,
    backgroundColor: Colors.primary,
    borderRadius: Radius.md,
    alignItems: 'center',
  },
  exportText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  deleteBtn: {
    padding: 13,
    backgroundColor: Colors.dangerLight,
    borderRadius: Radius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteText: { color: Colors.danger, fontWeight: '600', fontSize: 13 },
});