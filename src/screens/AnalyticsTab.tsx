// screens/AnalyticsTab.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Analytics Tab — 100% live data from analyticsService.
//
// Data flow:  ScanTab → AsyncStorage → analyticsService → this screen
//
// ALL values (class average, paper count, score distribution, section
// comparison, attention alerts) are computed from real scan records.
// There are ZERO hardcoded sample numbers in this file.
// ─────────────────────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  computeAnalyticsFiltered,
  type AnalyticsData,
  type AttentionAlert,
  type DistributionBar,
  type SectionBar,
} from '../services/analyticsService';

import {
  exportResultsAsCSV,
  generatePDFReportText
} from '../services/resultService';

import { getAllEnrichedResults } from '../services/scanService';

import { useAuth } from '../context/AuthContext';
import { Colors, Radius, Shadow, Spacing } from '../theme';

// ─── Palette (neutral scale mirrors AnalyticsTab original) ───────────────────

const C = {
  n50:  '#F9FAFB',
  n100: '#F3F4F6',
  n200: '#E5E7EB',
  n400: '#9CA3AF',
  n500: '#6B7280',
  n700: '#374151',
  n800: '#1F2937',
  n900: '#111827',
};

// ─── Filter definitions ───────────────────────────────────────────────────────
//
// 'All' → no examType filter.  All other labels map to an examType string.
// Add more as your app supports them.

const QUIZ_FILTERS: Array<{ label: string; examType?: string }> = [
  { label: 'All' },
  { label: 'Bubble OMR', examType: 'bubble_mc'      },
  { label: 'Text MC',    examType: 'text_mc'        },
  { label: 'ID',         examType: 'identification' },
  { label: 'Enum',       examType: 'enumeration'    },
  { label: 'Error',      examType: 'trace_error'    },
  { label: 'T/F',        examType: 'true_false'     },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function AnalyticsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={card.wrap}>
      <Text style={card.title}>{title}</Text>
      {children}
    </View>
  );
}

const card = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: C.n100,
    ...Shadow.card,
  },
  title: { fontSize: 13, fontWeight: '700', color: C.n800, marginBottom: 12 },
});

// ── Animated bar chart row ───────────────────────────────────────────────────

function BarRow({
  label,
  barPercent,
  displayValue,
  color,
  labelWidth = 52,
  delay = 0,
}: {
  label:        string;
  barPercent:   number;
  displayValue: string;
  color:        string;
  labelWidth?:  number;
  delay?:       number;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(anim, {
      toValue:         barPercent,
      duration:        500,
      delay,
      useNativeDriver: false,
    }).start();
  }, [barPercent]);

  const width = anim.interpolate({
    inputRange:  [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={bar.row}>
      <Text style={[bar.label, { width: labelWidth }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={bar.track}>
        <Animated.View style={[bar.fill, { width, backgroundColor: color }]} />
      </View>
      <Text style={[bar.val, { color }]}>{displayValue}</Text>
    </View>
  );
}

const bar = StyleSheet.create({
  row:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { fontSize: 10, color: C.n500 },
  track: { flex: 1, height: 7, backgroundColor: C.n100, borderRadius: Radius.full, overflow: 'hidden' },
  fill:  { height: '100%', borderRadius: Radius.full },
  val:   { fontSize: 10, fontWeight: '600', minWidth: 28, textAlign: 'right' },
});

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <View style={sc.card}>
      <Text style={sc.num}>{value}</Text>
      <Text style={sc.lbl}>{label}</Text>
      {sub ? <Text style={sc.sub}>{sub}</Text> : null}
    </View>
  );
}

const sc = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: C.n50,
    borderRadius: Radius.md,
    padding: 12,
    borderWidth: 1,
    borderColor: C.n100,
  },
  num: { fontSize: 26, fontWeight: '800', color: C.n900 },
  lbl: { fontSize: 10, color: C.n500 },
  sub: { fontSize: 9,  color: C.n400, marginTop: 1 },
});

// ── Alert card ───────────────────────────────────────────────────────────────

function AlertCard({ alert }: { alert: AttentionAlert }) {
  return (
    <View style={al.card}>
      <View style={al.row}>
        <Ionicons name="warning-outline" size={14} color={Colors.amber} />
        <Text style={al.title}>Needs attention · {alert.sectionName}</Text>
      </View>
      <Text style={al.body}>
        Section {alert.sectionName} is {alert.diff} pts below class average
        {alert.passRate < 50 ? ` — only ${alert.passRate}% passing.` : '.'}
      </Text>
    </View>
  );
}

const al = StyleSheet.create({
  card: {
    backgroundColor: '#FFFBEB',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  row:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  title: { fontSize: 12, fontWeight: '700', color: Colors.amber },
  body:  { fontSize: 11, color: C.n700 },
});

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onScan }: { onScan: () => void }) {
  return (
    <View style={em.wrap}>
      <Text style={em.icon}>📊</Text>
      <Text style={em.title}>No data yet</Text>
      <Text style={em.body}>
        Scan student answer sheets to see class analytics, score distribution,
        and section comparisons here.
      </Text>
      <TouchableOpacity style={em.btn} onPress={onScan} activeOpacity={0.8}>
        <Ionicons name="scan-outline" size={16} color="#fff" />
        <Text style={em.btnText}>Scan First Paper</Text>
      </TouchableOpacity>
    </View>
  );
}

const em = StyleSheet.create({
  wrap:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 },
  icon:    { fontSize: 48 },
  title:   { fontSize: 18, fontWeight: '700', color: C.n900 },
  body:    { fontSize: 13, color: C.n500, textAlign: 'center', lineHeight: 20 },
  btn:     {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    backgroundColor: Colors.primary,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: Radius.full,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});

// ─── Main component ───────────────────────────────────────────────────────────

export default function AnalyticsTab() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const userId = user?.id ?? '';

  const [activeFilter, setActiveFilter] = useState(QUIZ_FILTERS[0]);
  const [data,         setData]         = useState<AnalyticsData | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);

  // ── Load analytics ─────────────────────────────────────────────────────────

  const loadAnalytics = useCallback(
    async (showRefresh = false) => {
      if (showRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const result = await computeAnalyticsFiltered(userId, activeFilter.examType);
        setData(result);
      } catch (err: any) {
        Alert.alert('Analytics Error', err?.message ?? 'Could not load analytics.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeFilter],
  );

  // Re-load whenever this tab comes into focus (e.g. returning from ScanTab).
  useFocusEffect(
    useCallback(() => {
      loadAnalytics();
    }, [loadAnalytics]),
  );

  // ── Export handlers ────────────────────────────────────────────────────────

  const handleExportCSV = useCallback(async () => {
    try {
      // Fetch all results then narrow to the active exam-type filter
      const allResults = await getAllEnrichedResults(userId);
      const results = activeFilter.examType
        ? allResults.filter((r: any) => r.examType === activeFilter.examType)
        : allResults;

      if (results.length === 0) {
        Alert.alert(
          'Nothing to export',
          activeFilter.examType
            ? `No "${activeFilter.label}" results found. Try a different filter or scan some papers first.`
            : 'Scan some papers first.',
        );
        return;
      }

      const csv = exportResultsAsCSV(results);
      const filename = `results_${activeFilter.examType ?? 'all'}_${Date.now()}.csv`;

      // ── Write & share (expo-file-system + expo-sharing) ──────────────────
      // Uncomment when those packages are installed:
      //
      // import * as FileSystem from 'expo-file-system';
      // import * as Sharing from 'expo-sharing';
      //
      // const path = FileSystem.cacheDirectory + filename;
      // await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
      // if (await Sharing.isAvailableAsync()) {
      //   await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: 'Export CSV' });
      // } else {
      //   Alert.alert('Sharing unavailable', 'CSV saved to cache:\n' + path);
      // }

      // ── Preview fallback (remove once expo-sharing is wired up) ──────────
      Alert.alert(
        `CSV Export · ${results.length} row${results.length !== 1 ? 's' : ''} (${activeFilter.label})`,
        csv.split('\n').slice(0, 7).join('\n') +
          (results.length > 6 ? `\n…and ${results.length - 6} more rows` : ''),
      );
    } catch (err: any) {
      Alert.alert('Export Error', err?.message ?? 'Could not export CSV.');
    }
  }, [activeFilter]);

  const handleExportPDF = useCallback(async () => {
    try {
      const results = await getAllEnrichedResults(userId);
      if (results.length === 0) {
        Alert.alert('Nothing to export', 'Scan some papers first.');
        return;
      }
      const report = generatePDFReportText(results);
      // In production, use expo-print:
      //   await Print.printAsync({ html: `<pre>${report}</pre>` });
      Alert.alert('PDF Report Preview', report.slice(0, 600) + '…');
    } catch (err: any) {
      Alert.alert('Export Error', err?.message ?? 'Could not generate PDF report.');
    }
  }, []);

  // ── Loading spinner ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Computing analytics…</Text>
      </View>
    );
  }

  // ── Empty state ────────────────────────────────────────────────────────────

  if (!data || data.isEmpty) {
    return (
      <View style={styles.root}>
        {/* Top bar */}
        <View style={styles.topbar}>
          <Text style={styles.topbarTitle}>Analytics</Text>
        </View>
        <EmptyState onScan={() => navigation.navigate('Scan')} />
        {/* FAB still available */}
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={0.8}
          onPress={() => navigation.navigate('Scan')}
        >
          <Ionicons name="scan-outline" size={22} color="#fff" />
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────

  const lastScan = data.lastScannedAt
    ? new Date(data.lastScannedAt).toLocaleDateString(undefined, {
        month: 'short',
        day:   'numeric',
        hour:  '2-digit',
        minute:'2-digit',
      })
    : null;

  return (
    <View style={styles.root}>

      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <View style={styles.topbar}>
        <View>
          <Text style={styles.topbarTitle}>Analytics</Text>
          {lastScan && (
            <Text style={styles.topbarSub}>Updated {lastScan}</Text>
          )}
        </View>

        {/* Exam-type filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {QUIZ_FILTERS.map(f => (
            <TouchableOpacity
              key={f.label}
              style={[
                styles.filterChip,
                activeFilter.label === f.label && styles.filterChipActive,
              ]}
              onPress={() => setActiveFilter(f)}
            >
              <Text
                style={[
                  styles.filterChipText,
                  activeFilter.label === f.label && styles.filterChipTextActive,
                ]}
              >
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => loadAnalytics(true)} />
        }
      >

        {/* ── Summary stats ─────────────────────────────────────────────── */}
        <View style={styles.statRow}>
          <StatCard
            value={`${data.classAverage}%`}
            label="Class Average"
            sub={`${data.passRate}% pass rate`}
          />
          <StatCard
            value={String(data.totalGraded)}
            label="Graded Papers"
            sub={`${data.passCount} passed · ${data.failCount} failed`}
          />
        </View>

        {/* ── Score distribution ────────────────────────────────────────── */}
        <AnalyticsCard title="Score Distribution">
          {data.scoreDistribution.map((d: DistributionBar, i: number) => (
            <View key={d.label} style={{ marginBottom: i < data.scoreDistribution.length - 1 ? 8 : 0 }}>
              <BarRow
                label={d.label}
                barPercent={d.barPercent}
                displayValue={String(d.count)}
                color={d.color}
                delay={i * 60}
              />
            </View>
          ))}
          {/* Footer: total */}
          <Text style={styles.chartFooter}>
            {data.totalGraded} papers graded
          </Text>
        </AnalyticsCard>

        {/* ── Section comparison ────────────────────────────────────────── */}
        {data.sectionComparison.length > 0 && (
          <AnalyticsCard title="Section Comparison">
            {data.sectionComparison.map((s: SectionBar, i: number) => (
              <View
                key={s.label}
                style={{ marginBottom: i < data.sectionComparison.length - 1 ? 8 : 0 }}
              >
                <BarRow
                  label={s.label}
                  barPercent={s.value}
                  displayValue={`${s.value}%`}
                  color={s.color}
                  labelWidth={66}
                  delay={i * 60}
                />
              </View>
            ))}
            {data.topSection && (
              <View style={styles.topSectionBadge}>
                <Ionicons name="trophy-outline" size={12} color={Colors.primary} />
                <Text style={styles.topSectionText}>
                  Top: {data.topSection.label} ({data.topSection.value}%)
                </Text>
              </View>
            )}
          </AnalyticsCard>
        )}

        {/* ── Attention alerts ──────────────────────────────────────────── */}
        {data.attentionAlerts.map((alert: AttentionAlert) => (
          <AlertCard key={alert.sectionName} alert={alert} />
        ))}

        {/* ── No-alert success message ──────────────────────────────────── */}
        {data.attentionAlerts.length === 0 && data.sectionComparison.length > 1 && (
          <View style={styles.allGoodCard}>
            <Ionicons name="checkmark-circle-outline" size={16} color={Colors.success} />
            <Text style={styles.allGoodText}>
              All sections are performing within 10 pts of class average.
            </Text>
          </View>
        )}

        {/* ── Export row ────────────────────────────────────────────────── */}
        <View style={styles.exportRow}>
          <TouchableOpacity style={styles.exportBtn} onPress={handleExportCSV} activeOpacity={0.85}>
            <Ionicons name="download-outline" size={15} color="#fff" />
            <Text style={styles.exportBtnText}>Export CSV</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportBtn, { backgroundColor: Colors.amber }]}
            onPress={handleExportPDF}
            activeOpacity={0.85}
          >
            <Ionicons name="document-outline" size={15} color="#fff" />
            <Text style={styles.exportBtnText}>PDF Report</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom padding for FAB clearance */}
        <View style={{ height: 88 }} />

      </ScrollView>

      {/* ── FAB ─────────────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.fab}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('Scan')}
      >
        <Ionicons name="scan-outline" size={22} color="#fff" />
      </TouchableOpacity>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },

  loadingText: { fontSize: 13, color: C.n500, marginTop: 8 },

  // Top bar
  topbar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: C.n100,
    backgroundColor: Colors.white,
    gap: 8,
  },
  topbarTitle: { fontSize: 16, fontWeight: '700', color: C.n900 },
  topbarSub:   { fontSize: 10, color: C.n400, marginTop: 1 },

  // Filter chips
  filterRow: { flexDirection: 'row', gap: 6, paddingVertical: 2 },
  filterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1,
    borderColor: C.n200,
    backgroundColor: Colors.white,
  },
  filterChipActive:     { backgroundColor: Colors.primary, borderColor: Colors.primary },
  filterChipText:       { fontSize: 10, fontWeight: '600', color: C.n500 },
  filterChipTextActive: { color: '#fff' },

  // Scroll content
  content: { padding: Spacing.lg, gap: 12 },

  // Stat row
  statRow: { flexDirection: 'row', gap: 10 },

  // Chart footer
  chartFooter: {
    marginTop: 10,
    fontSize: 10,
    color: C.n400,
    textAlign: 'right',
  },

  // Top section badge (inside section comparison card)
  topSectionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
    padding: 8,
    backgroundColor: Colors.primaryLight ?? '#EFF6FF',
    borderRadius: Radius.sm,
  },
  topSectionText: { fontSize: 11, fontWeight: '600', color: Colors.primary },

  // All-good card
  allGoodCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderRadius: Radius.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  allGoodText: { flex: 1, fontSize: 12, color: '#065F46', fontWeight: '500' },

  // Export row
  exportRow: { flexDirection: 'row', gap: 8 },
  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
  },
  exportBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },

  // FAB
  fab: {
    position: 'absolute',
    bottom: Spacing.xl,
    right: Spacing.xl,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.fab,
  },
});