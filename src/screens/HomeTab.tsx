// HomeTab.tsx — Redesigned Dashboard Home Screen
// ✅ useFocusEffect — data refreshes every time tab is focused
// ✅ "See All" navigates to Results
// ✅ Notification bell opens an alerts panel
// ✅ "Generate OMR Sheet" quick action added
// ✅ Layout updated to match new design reference

import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import ActionButton from '../components/ActionButton';
import RecentScanItem from "../components/RecentScanItem";
import StatCard from "../components/StatCard";
import { useAuth } from '../context/AuthContext';
import { computeAnalytics } from '../services/analyticsService';
import { getAllEnrichedResults, type EnrichedScanResult as ScanResult } from '../services/scanService';
import { getSectionSummary } from '../services/sectionService';
import { Colors, Radius, Shadow, Spacing } from "../theme";
import { ANSWER_KEY_TEMPLATES, EXAM_TYPE_OPTIONS, type ExamTypeMeta } from "../types/exam";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Alert {
  id: number;
  type: "warning" | "info";
  message: string;
  icon: keyof typeof Ionicons.glyphMap;
}

interface HomeTabProps {
  alerts: Alert[];
  onDismissAlert: (id: number) => void;
  onNavigateToScan?: () => void;
  onNavigateToResults?: () => void;
  onNavigateToAnalytics?: () => void;
  onNavigateToSettings?: () => void;
}

interface OverviewStats {
  totalSections:  number;
  classAverage:   number;
  totalStudents:  number;
  quizzesGraded:  number;
}

interface DisplayScan {
  id:       string;
  quizTag:  string;
  title:    string;
  section:  string;
  score:    number;
  date:     string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatScanDate(isoString: string): string {
  const now      = new Date();
  const date     = new Date(isoString);
  const diffMs   = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function countThisMonth(results: ScanResult[]): number {
  const now = new Date();
  return results.filter((r) => {
    const d = new Date(r.scannedAt);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
}

function toDisplayScans(results: ScanResult[]): DisplayScan[] {
  const sorted = [...results].sort(
    (a, b) => new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime()
  );

  return sorted.slice(0, 4).map((r, index) => {
    const rawType = r.examType ?? "Quiz";
    const title =
      rawType === "bubble_omr"       ? "Multiple Choice Exam"
      : rawType === "identification" ? "Identification Test"
      : rawType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

    const tagMap: Record<string, string> = {
      bubble_omr:     "MC",
      identification: "ID",
      enumeration:    "EN",
      short_answer:   "SA",
      trace_error:    "TE",
      text_mc:        "MC",
    };
    const quizTag = tagMap[rawType] ?? rawType.slice(0, 2).toUpperCase();

    return {
      id:      r.id ?? String(index),
      quizTag,
      title,
      section: (r as any).section ?? (r as any).sectionId ?? "Unknown Section",
      score:   Math.round(r.percentage),
      date:    formatScanDate(r.scannedAt),
    };
  });
}

// ─── Notification Panel ───────────────────────────────────────────────────────

function NotificationPanel({
  visible,
  alerts,
  onDismiss,
  onClose,
}: {
  visible: boolean;
  alerts: Alert[];
  onDismiss: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity style={notifStyles.overlay} activeOpacity={1} onPress={onClose}>
        <View style={notifStyles.panel}>
          <View style={notifStyles.panelHeader}>
            <Text style={notifStyles.panelTitle}>Notifications</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={20} color={Colors.textPrimary} />
            </TouchableOpacity>
          </View>

          {alerts.length === 0 ? (
            <View style={notifStyles.empty}>
              <Ionicons name="notifications-off-outline" size={32} color={Colors.textMuted} />
              <Text style={notifStyles.emptyText}>No notifications</Text>
            </View>
          ) : (
            alerts.map((alert) => (
              <View
                key={alert.id}
                style={[
                  notifStyles.item,
                  { backgroundColor: alert.type === "warning" ? Colors.amberLight : Colors.primaryLight },
                ]}
              >
                <Ionicons
                  name={alert.icon}
                  size={16}
                  color={alert.type === "warning" ? Colors.amber : Colors.primary}
                  style={{ marginRight: 10 }}
                />
                <Text
                  style={[
                    notifStyles.itemText,
                    { color: alert.type === "warning" ? Colors.amber : Colors.primary },
                  ]}
                >
                  {alert.message}
                </Text>
                <TouchableOpacity
                  onPress={() => onDismiss(alert.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons
                    name="close-circle"
                    size={16}
                    color={alert.type === "warning" ? Colors.amber : Colors.primary}
                  />
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const notifStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: 90,
    paddingRight: Spacing.lg,
  },
  panel: {
    width: 300,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    ...Shadow.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  panelTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  empty: {
    alignItems: "center",
    paddingVertical: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: "500",
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    padding: Spacing.md,
    borderRadius: Radius.md,
    marginBottom: Spacing.sm,
  },
  itemText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
  },
});

// ─── Exam Format Chip (horizontal scroll) ─────────────────────────────────────

const FORMAT_ACCENT: Record<string, { icon: string; bg: string; fg: string }> = {
  bubble_omr:      { icon: Colors.primary,  bg: Colors.primaryLight,  fg: Colors.primary },
  multiple_choice: { icon: Colors.success,  bg: Colors.successLight,  fg: Colors.success },
  identification:  { icon: Colors.purple,   bg: Colors.purpleLight,   fg: Colors.purple },
  enumeration:     { icon: Colors.amber,    bg: Colors.amberLight,    fg: Colors.amber },
  true_or_false:   { icon: Colors.danger,   bg: Colors.dangerLight,   fg: Colors.danger },
};

function ExamFormatChip({
  meta,
  onPress,
}: {
  meta: ExamTypeMeta;
  onPress: (meta: ExamTypeMeta) => void;
}) {
  const accent    = FORMAT_ACCENT[meta.value] ?? FORMAT_ACCENT.bubble_omr;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn  = () =>
    Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true, speed: 60 }).start();
  const handlePressOut = () =>
    Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, speed: 60 }).start();

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <TouchableOpacity
        style={[chipStyles.chip, { borderLeftColor: accent.fg }]}
        activeOpacity={1}
        onPress={() => onPress(meta)}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        <View style={[chipStyles.iconBubble, { backgroundColor: accent.bg }]}>
          <Ionicons name={meta.icon as any} size={16} color={accent.fg} />
        </View>
        <View style={chipStyles.body}>
          <Text style={chipStyles.label} numberOfLines={1}>{meta.label}</Text>
          <Text style={chipStyles.desc} numberOfLines={1}>{meta.description}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection:     'row',
    alignItems:        'center',
    backgroundColor:   Colors.card,
    borderRadius:      Radius.lg,
    paddingVertical:   10,
    paddingHorizontal: 12,
    borderWidth:       0.5,
    borderColor:       Colors.border,
    borderLeftWidth:   2.5,
    gap:               8,
    width:             152,
    ...Shadow.card,
  },
  iconBubble: {
    width:          30,
    height:         30,
    borderRadius:   8,
    alignItems:     'center',
    justifyContent: 'center',
    flexShrink:     0,
  },
  body: {
    flex:     1,
    minWidth: 0,
  },
  label: {
    fontSize:   12,
    fontWeight: '600',
    color:      Colors.textPrimary,
  },
  desc: {
    fontSize:  10,
    color:     Colors.textSecondary,
    marginTop: 1,
  },
});

// ─── Exam Format Detail Modal ─────────────────────────────────────────────────

const ANSWER_FORMAT_EXAMPLES: Record<string, { example: string; note: string }> = {
  bubble_omr:      { example: '1.A, 2.C, 3.B, 4.D, 5.A',                        note: 'Number + dot + letter (A–D) per question' },
  multiple_choice: { example: '1.A, 2.C, 3.B, 4.D, 5.A',                        note: 'Number + dot + letter (A–D) per question' },
  identification:  { example: '1.Science, 2.Jose Rizal, 3.Lungs',                note: 'Case-insensitive, punctuation ignored' },
  enumeration:     { example: '1.Solid, 2.Liquid, 3.Gas;Gaseous, 4.Red, 5.Blue', note: 'Number every blank continuously — semicolons for accepted synonyms' },
  true_or_false:   { example: '1.True, 2.False, 3.True, 4.True, 5.False',        note: 'True/False or T/F accepted' },
};

function ExamFormatModal({
  meta,
  visible,
  onClose,
}: {
  meta: ExamTypeMeta | null;
  visible: boolean;
  onClose: () => void;
}) {
  const slideAnim = useRef(new Animated.Value(300)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, speed: 18, bounciness: 5, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 300, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!meta) return null;

  const accent   = FORMAT_ACCENT[meta.value] ?? FORMAT_ACCENT.bubble_omr;
  const example  = ANSWER_FORMAT_EXAMPLES[meta.value];
  const template = ANSWER_KEY_TEMPLATES[meta.value as keyof typeof ANSWER_KEY_TEMPLATES];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[modalStyles.overlay, { opacity: fadeAnim }]}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

        <Animated.View style={[modalStyles.sheet, { transform: [{ translateY: slideAnim }] }]}>
          {/* Handle bar */}
          <View style={modalStyles.handle} />

          {/* Header */}
          <View style={modalStyles.header}>
            <View style={[modalStyles.headerIcon, { backgroundColor: accent.bg }]}>
              <Ionicons name={meta.icon as any} size={24} color={accent.fg} />
            </View>
            <View style={modalStyles.headerText}>
              <Text style={modalStyles.headerLabel}>{meta.label}</Text>
              <Text style={modalStyles.headerSub}>Exam Format</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Divider */}
          <View style={modalStyles.divider} />

          {/* Description */}
          <View style={modalStyles.row}>
            <Ionicons name="information-circle-outline" size={15} color={Colors.textMuted} style={modalStyles.rowIcon} />
            <Text style={modalStyles.rowText}>{meta.description}</Text>
          </View>

          {/* Answer format */}
          <View style={modalStyles.row}>
            <Ionicons name="document-outline" size={15} color={Colors.textMuted} style={modalStyles.rowIcon} />
            <Text style={modalStyles.rowText}>{template?.answerFormat ?? '—'}</Text>
          </View>

          {/* Input hint */}
          {template?.inputHint && (
            <View style={modalStyles.row}>
              <Ionicons name="create-outline" size={15} color={Colors.textMuted} style={modalStyles.rowIcon} />
              <Text style={modalStyles.rowText}>{template.inputHint}</Text>
            </View>
          )}

          {/* Example block */}
          {example && (
            <View style={[modalStyles.exampleBox, { borderColor: accent.fg + '40', backgroundColor: accent.bg }]}>
              <Text style={[modalStyles.exampleLabel, { color: accent.fg }]}>EXAMPLE FORMAT</Text>
              <Text style={[modalStyles.exampleValue, { color: accent.fg }]}>{example.example}</Text>
              <Text style={modalStyles.exampleNote}>{example.note}</Text>
            </View>
          )}

          {/* Valid answers pill row (MCQ / T/F) */}
          {template?.validAnswers && (
            <View style={modalStyles.pillsRow}>
              <Text style={modalStyles.pillsLabel}>Valid answers:</Text>
              {template.validAnswers.map((v) => (
                <View key={v} style={[modalStyles.pill, { backgroundColor: accent.bg }]}>
                  <Text style={[modalStyles.pillText, { color: accent.fg }]}>{v}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={{ height: 24 }} />
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  overlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent:  'flex-end',
  },
  sheet: {
    backgroundColor:      Colors.card,
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    paddingHorizontal:    Spacing.lg,
    paddingTop:           12,
    ...Shadow.fab,
    borderWidth:       1,
    borderColor:       Colors.border,
    borderBottomWidth: 0,
  },
  handle: {
    width:           40,
    height:          4,
    borderRadius:    2,
    backgroundColor: Colors.border,
    alignSelf:       'center',
    marginBottom:    16,
  },
  header: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           Spacing.md,
    marginBottom:  Spacing.md,
  },
  headerIcon: {
    width:          48,
    height:         48,
    borderRadius:   Radius.lg,
    alignItems:     'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  headerLabel: {
    fontSize:   17,
    fontWeight: '800',
    color:      Colors.textPrimary,
  },
  headerSub: {
    fontSize:   12,
    color:      Colors.textMuted,
    fontWeight: '500',
    marginTop:  2,
  },
  closeBtn: {
    width:           32,
    height:          32,
    borderRadius:    16,
    backgroundColor: Colors.background,
    alignItems:      'center',
    justifyContent:  'center',
    borderWidth:     1,
    borderColor:     Colors.border,
  },
  divider: {
    height:          1,
    backgroundColor: Colors.border,
    marginBottom:    Spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems:    'flex-start',
    gap:           8,
    marginBottom:  Spacing.md,
  },
  rowIcon: {
    marginTop:  1,
    flexShrink: 0,
  },
  rowText: {
    flex:       1,
    fontSize:   13,
    color:      Colors.textSecondary,
    lineHeight: 19,
  },
  exampleBox: {
    borderRadius: Radius.lg,
    borderWidth:  1,
    padding:      Spacing.md,
    marginBottom: Spacing.md,
    gap:          4,
  },
  exampleLabel: {
    fontSize:      10,
    fontWeight:    '700',
    letterSpacing: 0.8,
    marginBottom:  2,
  },
  exampleValue: {
    fontSize:   14,
    fontWeight: '700',
    fontFamily: 'monospace' as any,
  },
  exampleNote: {
    fontSize:  11,
    color:     Colors.textMuted,
    marginTop: 2,
  },
  pillsRow: {
    flexDirection: 'row',
    alignItems:    'center',
    flexWrap:      'wrap',
    gap:           6,
    marginBottom:  Spacing.sm,
  },
  pillsLabel: {
    fontSize:   12,
    color:      Colors.textMuted,
    fontWeight: '600',
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:      99,
  },
  pillText: {
    fontSize:   12,
    fontWeight: '700',
  },
});

// ─── Exam Formats Section (horizontal scroll chips) ───────────────────────────

function ExamFormatsSection() {
  const [selectedMeta, setSelectedMeta] = useState<ExamTypeMeta | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const handleCardPress  = (meta: ExamTypeMeta) => { setSelectedMeta(meta); setModalVisible(true); };
  const handleCloseModal = () => setModalVisible(false);

  return (
    <View>
      <ExamFormatModal meta={selectedMeta} visible={modalVisible} onClose={handleCloseModal} />

      {/* Section header row */}
      <View style={examStyles.sectionHeaderRow}>
        <Text style={styles.sectionLabel}>EXAM FORMATS</Text>
        <Text style={styles.seeAll}>Tap to preview ›</Text>
      </View>

      <Text style={examStyles.hint}>Swipe to see all formats</Text>

      {/* Horizontal scroll chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={examStyles.chipScroll}
      >
        {EXAM_TYPE_OPTIONS.map((meta) => (
          <ExamFormatChip key={meta.value} meta={meta} onPress={handleCardPress} />
        ))}
      </ScrollView>
    </View>
  );
}

const examStyles = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    marginTop:      Spacing.xl,
    marginBottom:   4,
  },
  hint: {
    fontSize:     10,
    color:        Colors.textMuted,
    marginBottom: 8,
  },
  chipScroll: {
    gap:            8,
    paddingBottom:  4,
    paddingRight:   Spacing.lg,
  },
});

// ─── Section Label ────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomeTab({
  alerts,
  onDismissAlert,
  onNavigateToScan,
  onNavigateToResults,
  onNavigateToAnalytics,
  onNavigateToSettings,
}: HomeTabProps) {

  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const displayName =
    (user as any)?.user_metadata?.full_name?.trim()
    || (user as any)?.name?.trim()
    || user?.email?.split('@')[0]
    || 'Teacher';
  const initials = displayName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const [overview,     setOverview]     = useState<OverviewStats | null>(null);
  const [recentScans,  setRecentScans]  = useState<DisplayScan[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [notifVisible, setNotifVisible] = useState(false);

  // ── Load Real Data ────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const userId = user?.id ?? '';

      const [analytics, sections, allResults] = await Promise.all([
        computeAnalytics(userId),
        getSectionSummary(userId),
        getAllEnrichedResults(userId),
      ]);

      setOverview({
        totalSections: sections.sections.length,
        classAverage:  analytics.classAverage,
        totalStudents: sections.totalStudents,
        quizzesGraded: countThisMonth(allResults),
      });

      setRecentScans(toDisplayScans(allResults));
    } catch (err) {
      console.error("[HomeTab] Failed to load data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Animations — run once on mount ───────────────────────────────────────
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  const fabScale  = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 380, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, speed: 14, bounciness: 4, useNativeDriver: true }),
      Animated.spring(fabScale,  { toValue: 1, speed: 10, bounciness: 12, delay: 400, useNativeDriver: true }),
    ]).start();
  }, []);

  // ✅ Refresh data every time Home tab is focused
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // FAB hover
  const fabHover     = useRef(new Animated.Value(1)).current;
  const handleFabIn  = () => Animated.spring(fabHover, { toValue: 1.1, useNativeDriver: true, speed: 60 }).start();
  const handleFabOut = () => Animated.spring(fabHover, { toValue: 1,   useNativeDriver: true, speed: 60 }).start();

  const val = (v: number | undefined, suffix = ""): string => {
    if (loading || v === undefined) return "—";
    return `${v}${suffix}`;
  };

  return (
    <View style={styles.root}>
      <NotificationPanel
        visible={notifVisible}
        alerts={alerts}
        onDismiss={onDismissAlert}
        onClose={() => setNotifVisible(false)}
      />

      <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >

          {/* ── HEADER ──────────────────────────────────────────────────── */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.greeting}>Good morning 👋</Text>
              <Text style={styles.teacherName}>{displayName}</Text>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={styles.notifBtn}
                activeOpacity={0.75}
                onPress={() => setNotifVisible(true)}
              >
                <Ionicons name="notifications-outline" size={20} color={Colors.textPrimary} />
                {alerts.length > 0 && <View style={styles.notifDot} />}
              </TouchableOpacity>
              <TouchableOpacity style={styles.avatar} onPress={() => navigation.navigate('EditProfile')} activeOpacity={0.8}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── OVERVIEW STATS ──────────────────────────────────────────── */}
          <SectionLabel label="OVERVIEW" />

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading overview…</Text>
            </View>
          ) : (
            <View style={styles.statsGrid}>
              <View style={styles.statsRow}>
                <StatCard
                  label="Total Sections"
                  value={val(overview?.totalSections)}
                  icon="layers"
                  iconColor={Colors.primary}
                  iconBg={Colors.primaryLight}
                  badge="All Sections"
                  badgeColor={Colors.primary}
                  badgeBg={Colors.primaryMid}
                />
                <View style={styles.gridGap} />
                <StatCard
                  label="Class Average"
                  value={overview ? `${overview.classAverage}%` : "—"}
                  icon="trending-up"
                  iconColor={Colors.success}
                  iconBg={Colors.successLight}
                />
              </View>
              <View style={styles.statsRowGap} />
              <View style={styles.statsRow}>
                <StatCard
                  label="Total Students"
                  value={val(overview?.totalStudents)}
                  icon="people"
                  iconColor={Colors.purple}
                  iconBg={Colors.purpleLight}
                />
                <View style={styles.gridGap} />
                <StatCard
                  label="Quizzes Graded"
                  value={val(overview?.quizzesGraded)}
                  icon="checkmark-circle"
                  iconColor={Colors.amber}
                  iconBg={Colors.amberLight}
                  badge="This month"
                  badgeColor={Colors.amber}
                  badgeBg="#FEF3C7"
                />
              </View>
            </View>
          )}

          {/* ── QUICK ACTIONS ───────────────────────────────────────────── */}
          <SectionLabel label="QUICK ACTIONS" />

          {/* OMR Hero Button */}
          <TouchableOpacity
            style={styles.omrHero}
            onPress={() => navigation.navigate('GenerateSheet')}
            activeOpacity={0.8}
          >
            <View style={styles.omrIconWrap}>
              <Ionicons name="document-text-outline" size={22} color={Colors.primary} />
            </View>
            <View style={styles.omrBody}>
              <Text style={styles.omrLabel}>FEATURED</Text>
              <Text style={styles.omrTitle}>Generate OMR Answer Sheet</Text>
              <Text style={styles.omrSub}>Print or share a bubble sheet PDF</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
          </TouchableOpacity>

          {/* 2x2 Action Grid */}
          <View style={styles.actionsGrid}>
            <View style={styles.statsRow}>
              {/* Scan Papers — primary filled */}
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnPrimary]}
                onPress={onNavigateToScan}
                activeOpacity={0.8}
              >
                <View style={[styles.actionIcon, styles.actionIconPrimary]}>
                  <Ionicons name="camera-outline" size={16} color={Colors.white} />
                </View>
                <Text style={[styles.actionLabel, styles.actionLabelPrimary]}>Scan Papers</Text>
              </TouchableOpacity>
              <View style={styles.gridGap} />
              <ActionButton
                label="View Sections"
                icon="layers"
                iconColor={Colors.success}
                iconBg={Colors.successLight}
                onPress={onNavigateToResults}
              />
            </View>
            <View style={styles.statsRowGap} />
            <View style={styles.statsRow}>
              <ActionButton
                label="Analytics"
                icon="analytics"
                iconColor={Colors.amber}
                iconBg={Colors.amberLight}
                onPress={onNavigateToAnalytics}
              />
              <View style={styles.gridGap} />
              <ActionButton
                label="Export Report"
                icon="download"
                iconColor={Colors.danger}
                iconBg={Colors.dangerLight}
                onPress={onNavigateToSettings}
              />
            </View>
          </View>

          {/* ── EXAM FORMATS ────────────────────────────────────────────── */}
          <ExamFormatsSection />

          {/* ── RECENT SCANS ────────────────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <SectionLabel label="RECENT SCANS" />
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onNavigateToResults}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              style={styles.seeAllBtn}
            >
              <Text style={styles.seeAll}>See all</Text>
              <Ionicons name="chevron-forward" size={13} color={Colors.primary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="small" color={Colors.primary} />
              <Text style={styles.loadingText}>Loading scans…</Text>
            </View>
          ) : recentScans.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="scan-outline" size={32} color={Colors.textMuted} />
              <Text style={styles.emptyTitle}>No scans yet</Text>
              <Text style={styles.emptyText}>
                Tap "Scan Papers" to grade your first quiz.
              </Text>
            </View>
          ) : (
            <View style={styles.recentCard}>
              {recentScans.map((item, index) => (
                <RecentScanItem
                  key={item.id}
                  quizTag={item.quizTag}
                  title={item.title}
                  section={item.section}
                  score={item.score}
                  date={item.date}
                  isLast={index === recentScans.length - 1}
                  onPress={onNavigateToResults}
                />
              ))}
            </View>
          )}

          <View style={{ height: 80 }} />

        </ScrollView>
      </Animated.View>

      {/* ── FAB ─────────────────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.fabWrap,
          { transform: [{ scale: Animated.multiply(fabScale, fabHover) }] },
        ]}
      >
        <TouchableOpacity
          style={styles.fab}
          activeOpacity={1}
          onPress={onNavigateToScan}
          onPressIn={handleFabIn}
          onPressOut={handleFabOut}
        >
          <Ionicons name="scan-outline" size={22} color={Colors.white} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:          { flex: 1, backgroundColor: Colors.background },
  scroll:        { flex: 1 },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop:        Spacing.xl,
    paddingBottom:     Spacing.xxxl,
  },

  // Header
  header: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
    marginBottom:   Spacing.lg,
  },
  headerLeft:  { flex: 1 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: Spacing.sm },
  greeting: {
    fontSize:     12,
    color:        Colors.textSecondary,
    marginBottom: 2,
  },
  teacherName: {
    fontSize:      20,
    fontWeight:    "500",
    color:         Colors.textPrimary,
    letterSpacing: -0.4,
  },
  notifBtn: {
    width:           36,
    height:          36,
    borderRadius:    Radius.full,
    backgroundColor: Colors.card,
    alignItems:      "center",
    justifyContent:  "center",
    borderWidth:     0.5,
    borderColor:     Colors.border,
    position:        "relative",
  },
  notifDot: {
    position:        "absolute",
    top:             8,
    right:           8,
    width:           7,
    height:          7,
    borderRadius:    4,
    backgroundColor: Colors.danger,
    borderWidth:     1.5,
    borderColor:     Colors.card,
  },
  avatar: {
    width:           36,
    height:          36,
    borderRadius:    Radius.full,
    backgroundColor: Colors.primary,
    alignItems:      "center",
    justifyContent:  "center",
  },
  avatarInitials: {
    fontSize:      12,
    fontWeight:    "500",
    color:         Colors.white,
    letterSpacing: 0.3,
  },

  // Section labels
  sectionLabel: {
    fontSize:      10,
    fontWeight:    "500",
    color:         Colors.textMuted,
    letterSpacing: 0.7,
    textTransform: "uppercase",
    marginBottom:  8,
    marginTop:     18,
  },
  sectionHeader: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "space-between",
  },
  seeAllBtn: {
    flexDirection:   "row",
    alignItems:      "center",
    gap:             2,
    marginBottom:    Spacing.sm,
    paddingVertical: 4,
  },
  seeAll: {
    fontSize:   11,
    fontWeight: "500",
    color:      Colors.primary,
  },

  // Stats grid
  statsGrid:   {},
  statsRow: {
    flexDirection: "row",
    gap:           Spacing.md,
  },
  gridGap:     { width:  Spacing.md },
  statsRowGap: { height: Spacing.md },

  // OMR Hero button
  omrHero: {
    backgroundColor:   Colors.card,
    borderWidth:       0.5,
    borderColor:       Colors.border,
    borderRadius:      Radius.lg,
    padding:           14,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               12,
    marginBottom:      8,
    ...Shadow.card,
  },
  omrIconWrap: {
    width:           44,
    height:          44,
    borderRadius:    12,
    backgroundColor: Colors.primaryLight,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  omrBody: {
    flex:     1,
    minWidth: 0,
  },
  omrLabel: {
    fontSize:      10,
    color:         Colors.primary,
    fontWeight:    '500',
    letterSpacing: 0.5,
    marginBottom:  2,
  },
  omrTitle: {
    fontSize:   14,
    fontWeight: '500',
    color:      Colors.textPrimary,
    marginBottom: 1,
  },
  omrSub: {
    fontSize: 11,
    color:    Colors.textSecondary,
  },

  // 2x2 Actions grid
  actionsGrid: {},
  actionBtn: {
    flex:              1,
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    backgroundColor:   Colors.card,
    borderWidth:       0.5,
    borderColor:       Colors.border,
    borderRadius:      Radius.lg,
    paddingVertical:   12,
    paddingHorizontal: 12,
    ...Shadow.card,
  },
  actionBtnPrimary: {
    backgroundColor: Colors.primary,
    borderColor:     Colors.primary,
  },
  actionIcon: {
    width:           32,
    height:          32,
    borderRadius:    8,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  actionIconPrimary: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  actionLabel: {
    fontSize:   12,
    fontWeight: '500',
    color:      Colors.textPrimary,
    flex:       1,
  },
  actionLabelPrimary: {
    color: Colors.white,
  },

  // Recent scans card
  recentCard: {
    backgroundColor: Colors.card,
    borderRadius:    Radius.lg,
    ...Shadow.card,
    borderWidth: 0.5,
    borderColor: Colors.border,
    overflow:    "hidden",
  },

  // Loading state
  loadingBox: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            10,
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.card,
    borderRadius:    Radius.lg,
    borderWidth:     0.5,
    borderColor:     Colors.border,
  },
  loadingText: {
    fontSize:   13,
    color:      Colors.textMuted,
    fontWeight: "500",
  },

  // Empty state
  emptyCard: {
    alignItems:      "center",
    justifyContent:  "center",
    paddingVertical: Spacing.xxxl,
    backgroundColor: Colors.card,
    borderRadius:    Radius.lg,
    borderWidth:     0.5,
    borderColor:     Colors.border,
    gap:             Spacing.sm,
  },
  emptyTitle: {
    fontSize:   14,
    fontWeight: "700",
    color:      Colors.textPrimary,
    marginTop:  Spacing.sm,
  },
  emptyText: {
    fontSize:          12,
    color:             Colors.textMuted,
    textAlign:         "center",
    paddingHorizontal: Spacing.xl,
  },

  // FAB
  fabWrap: {
    position: "absolute",
    bottom:   Spacing.xl,
    right:    Spacing.xl,
  },
  fab: {
    width:           48,
    height:          48,
    borderRadius:    24,
    backgroundColor: Colors.primary,
    alignItems:      "center",
    justifyContent:  "center",
    ...Shadow.fab,
  },
});