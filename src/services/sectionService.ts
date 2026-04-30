// services/sectionService.ts
// ─────────────────────────────────────────────────────────────────────────────
// FIX: All data reads now require userId, which is forwarded to
// getAllEnrichedResults(userId). This guarantees that section analytics are
// computed only from the calling teacher's own scan records.
//
// BEFORE (leaking):
//   const all = await getAllEnrichedResults();     // sees every teacher's data
//
// AFTER (safe):
//   const all = await getAllEnrichedResults(userId); // only this teacher's data
//
// Usage in SectionsScreen / HomeTab:
//   const { user } = useAuth();
//   const summary  = await getSectionSummary(user!.id);
// ─────────────────────────────────────────────────────────────────────────────

import { getAllEnrichedResults, type EnrichedScanResult } from './scanService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SectionStats {
  name:           string;
  studentCount:   number;
  averageScore:   number;
  passCount:      number;
  failCount:      number;
  reviewCount:    number;
  passRate:       number;
  topScore:       number;
  bottomScore:    number;
  distribution:   ScoreBucket[];
  results:        EnrichedScanResult[];
}

export interface ScoreBucket {
  label:    string;
  min:      number;
  max:      number;
  count:    number;
  percent:  number;
}

export interface SectionSummary {
  sections:        SectionStats[];
  topSection:      SectionStats | null;
  weakestSection:  SectionStats | null;
  classAverage:    number;
  totalStudents:   number;
}

// ─── Bucket definitions ───────────────────────────────────────────────────────

const BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: '90–100', min: 90,  max: 100 },
  { label: '80–89',  min: 80,  max: 89  },
  { label: '70–79',  min: 70,  max: 79  },
  { label: '60–69',  min: 60,  max: 69  },
  { label: 'Below 60', min: 0, max: 59  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildDistribution(results: EnrichedScanResult[]): ScoreBucket[] {
  return BUCKETS.map(b => {
    const count = results.filter(r => r.percentage >= b.min && r.percentage <= b.max).length;
    return {
      label:   b.label,
      min:     b.min,
      max:     b.max,
      count,
      percent: results.length > 0 ? Math.round((count / results.length) * 100) : 0,
    };
  });
}

function buildSectionStats(name: string, results: EnrichedScanResult[]): SectionStats {
  const percentages = results.map(r => r.percentage);
  const avg         = percentages.length
    ? percentages.reduce((s, p) => s + p, 0) / percentages.length
    : 0;
  const passCount   = results.filter(r => r.status === 'Pass').length;
  const failCount   = results.filter(r => r.status === 'Fail').length;
  const reviewCount = results.filter(r => r.status === 'Review').length;

  return {
    name,
    studentCount:  results.length,
    averageScore:  Math.round(avg * 10) / 10,
    passCount,
    failCount,
    reviewCount,
    passRate:      results.length ? Math.round((passCount / results.length) * 100) : 0,
    topScore:      percentages.length ? Math.max(...percentages) : 0,
    bottomScore:   percentages.length ? Math.min(...percentages) : 0,
    distribution:  buildDistribution(results),
    results,
  };
}

// ─── Main API ─────────────────────────────────────────────────────────────────

/**
 * Loads all scan records for this teacher and groups them by section.
 *
 * @param userId — the authenticated teacher's user ID (from useAuth)
 *
 * Usage:
 * ```ts
 * const { user } = useAuth();
 * const summary = await getSectionSummary(user!.id);
 * ```
 */
export async function getSectionSummary(userId: string): Promise<SectionSummary> {
  // ✅ FIX: pass userId — no longer reads global storage
  const all = await getAllEnrichedResults(userId);

  const bySec: Record<string, EnrichedScanResult[]> = {};
  for (const r of all) {
    const key = r.section || 'Unknown';
    if (!bySec[key]) bySec[key] = [];
    bySec[key].push(r);
  }

  const sections = Object.entries(bySec)
    .map(([name, results]) => buildSectionStats(name, results))
    .sort((a, b) => b.averageScore - a.averageScore);

  const classAverage =
    all.length > 0
      ? Math.round((all.reduce((s, r) => s + r.percentage, 0) / all.length) * 10) / 10
      : 0;

  return {
    sections,
    topSection:     sections.length > 0 ? sections[0]                   : null,
    weakestSection: sections.length > 1 ? sections[sections.length - 1] : null,
    classAverage,
    totalStudents:  all.length,
  };
}

/**
 * Returns stats for a single section by name for this teacher.
 *
 * @param userId — the authenticated teacher's user ID
 */
export async function getSingleSectionStats(
  userId:      string,
  sectionName: string,
): Promise<SectionStats | null> {
  // ✅ FIX: pass userId
  const all      = await getAllEnrichedResults(userId);
  const filtered = all.filter(r => r.section === sectionName);
  if (filtered.length === 0) return null;
  return buildSectionStats(sectionName, filtered);
}