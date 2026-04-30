// services/analyticsService.ts
// ─────────────────────────────────────────────────────────────────────────────
// FIX: All analytics computations now require userId, which is forwarded to
// getAllEnrichedResults(userId). This guarantees that every chart, stat, and
// alert is computed only from the calling teacher's own scan records.
//
// BEFORE (leaking):
//   const results = await getAllEnrichedResults();    // global — all teachers!
//
// AFTER (safe):
//   const results = await getAllEnrichedResults(userId); // this teacher only
//
// Usage in AnalyticsTab:
//   const { user } = useAuth();
//   const data = await computeAnalytics(user!.id);
//   const data = await computeAnalyticsFiltered(user!.id, activeFilter.examType);
// ─────────────────────────────────────────────────────────────────────────────

import { getAllEnrichedResults, type EnrichedScanResult } from './scanService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DistributionBar {
  label:        string;
  min:          number;
  max:          number;
  count:        number;
  barPercent:   number;
  sharePercent: number;
  color:        string;
}

export interface SectionBar {
  label:    string;
  value:    number;
  count:    number;
  passRate: number;
  color:    string;
}

export interface AttentionAlert {
  sectionName: string;
  diff:        number;
  avgScore:    number;
  passRate:    number;
}

export interface AnalyticsData {
  classAverage:       number;
  totalGraded:        number;
  passCount:          number;
  failCount:          number;
  passRate:           number;
  scoreDistribution:  DistributionBar[];
  sectionComparison:  SectionBar[];
  attentionAlerts:    AttentionAlert[];
  lowestSection:      SectionBar | null;
  topSection:         SectionBar | null;
  lastScannedAt:      string | null;
  isEmpty:            boolean;
}

// ─── Color helpers ────────────────────────────────────────────────────────────

const COLOR_PRIMARY     = '#2563EB';
const COLOR_AMBER       = '#D97706';
const COLOR_DANGER      = '#DC2626';
const COLOR_DARK_DANGER = '#9B1C1C';

function scoreColor(avg: number): string {
  if (avg >= 80) return COLOR_PRIMARY;
  if (avg >= 70) return COLOR_AMBER;
  return COLOR_DANGER;
}

function bucketColor(min: number): string {
  if (min >= 80) return COLOR_PRIMARY;
  if (min >= 70) return COLOR_AMBER;
  if (min >= 60) return COLOR_DANGER;
  return COLOR_DARK_DANGER;
}

// ─── Bucket definitions ───────────────────────────────────────────────────────

const BUCKETS = [
  { label: '90–100', min: 90, max: 100 },
  { label: '80–89',  min: 80, max:  89 },
  { label: '70–79',  min: 70, max:  79 },
  { label: '60–69',  min: 60, max:  69 },
  { label: 'Below 60', min: 0, max: 59 },
];

// ─── Internal helpers ─────────────────────────────────────────────────────────

function buildDistribution(results: EnrichedScanResult[], total: number): DistributionBar[] {
  const counts = BUCKETS.map(b => ({
    ...b,
    count: results.filter(r => r.percentage >= b.min && r.percentage <= b.max).length,
  }));
  const maxCount = Math.max(...counts.map(c => c.count), 1);
  return counts.map(c => ({
    label:        c.label,
    min:          c.min,
    max:          c.max,
    count:        c.count,
    barPercent:   Math.round((c.count / maxCount) * 100),
    sharePercent: total > 0 ? Math.round((c.count / total) * 100) : 0,
    color:        bucketColor(c.min),
  }));
}

function buildSectionComparison(results: EnrichedScanResult[]): SectionBar[] {
  if (results.length === 0) return [];
  const bySec: Record<string, EnrichedScanResult[]> = {};
  for (const r of results) {
    const key = r.section || 'Unknown';
    if (!bySec[key]) bySec[key] = [];
    bySec[key].push(r);
  }
  const rows: SectionBar[] = Object.entries(bySec).map(([label, items]) => {
    const avg      = items.reduce((s, r) => s + r.percentage, 0) / items.length;
    const passRate = Math.round(
      (items.filter(r => r.status === 'Pass').length / items.length) * 100,
    );
    return { label, value: Math.round(avg * 10) / 10, count: items.length, passRate, color: scoreColor(avg) };
  });
  return rows.sort((a, b) => b.value - a.value);
}

function buildAlerts(sections: SectionBar[], classAverage: number, threshold = 10): AttentionAlert[] {
  return sections
    .filter(s => classAverage - s.value >= threshold)
    .map(s => ({
      sectionName: s.label,
      diff:        Math.round((classAverage - s.value) * 10) / 10,
      avgScore:    s.value,
      passRate:    s.passRate,
    }))
    .sort((a, b) => b.diff - a.diff);
}

function computeFromDataset(results: EnrichedScanResult[]): AnalyticsData {
  if (results.length === 0) {
    return {
      classAverage:      0,
      totalGraded:       0,
      passCount:         0,
      failCount:         0,
      passRate:          0,
      scoreDistribution: BUCKETS.map(b => ({
        label: b.label, min: b.min, max: b.max,
        count: 0, barPercent: 0, sharePercent: 0,
        color: bucketColor(b.min),
      })),
      sectionComparison: [],
      attentionAlerts:   [],
      lowestSection:     null,
      topSection:        null,
      lastScannedAt:     null,
      isEmpty:           true,
    };
  }

  const total       = results.length;
  const passCount   = results.filter(r => r.status === 'Pass').length;
  const failCount   = results.filter(r => r.status === 'Fail').length;
  const avgRaw      = results.reduce((s, r) => s + r.percentage, 0) / total;
  const classAvg    = Math.round(avgRaw * 10) / 10;
  const distribution  = buildDistribution(results, total);
  const sectionBars   = buildSectionComparison(results);
  const alerts        = buildAlerts(sectionBars, classAvg);
  const sorted        = [...results].sort(
    (a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime(),
  );

  return {
    classAverage:      classAvg,
    totalGraded:       total,
    passCount,
    failCount,
    passRate:          Math.round((passCount / total) * 100),
    scoreDistribution: distribution,
    sectionComparison: sectionBars,
    attentionAlerts:   alerts,
    lowestSection:     sectionBars.length > 1 ? sectionBars[sectionBars.length - 1] : null,
    topSection:        sectionBars.length > 0 ? sectionBars[0]                      : null,
    lastScannedAt:     sorted[0]?.scannedAt ?? null,
    isEmpty:           false,
  };
}

// ─── Main exports ─────────────────────────────────────────────────────────────

/**
 * Computes the full analytics payload from THIS TEACHER's scan records only.
 *
 * @param userId — the authenticated teacher's user ID (from useAuth)
 *
 * Usage:
 * ```ts
 * const { user } = useAuth();
 * const data = await computeAnalytics(user!.id);
 * ```
 */
export async function computeAnalytics(userId: string): Promise<AnalyticsData> {
  // ✅ FIX: pass userId — no longer reads global storage
  const results = await getAllEnrichedResults(userId);
  return computeFromDataset(results);
}

/**
 * Computes analytics for a specific exam type, scoped to this teacher.
 *
 * @param userId         — the authenticated teacher's user ID
 * @param examTypeFilter — exact examType string, e.g. "bubble_mc", or undefined for all
 */
export async function computeAnalyticsFiltered(
  userId:          string,
  examTypeFilter?: string,
): Promise<AnalyticsData> {
  // ✅ FIX: pass userId — no longer reads global storage
  const all      = await getAllEnrichedResults(userId);
  const filtered = examTypeFilter
    ? all.filter(r => r.examType === examTypeFilter)
    : all;

  // If the filter yields nothing, fall back to all-time data for this teacher.
  if (filtered.length === 0 && examTypeFilter) {
    return computeFromDataset(all);
  }

  return computeFromDataset(filtered);
}