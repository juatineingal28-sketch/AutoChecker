// HomeTab.tsx — Redesigned Dashboard Home Screen
// ✅ useFocusEffect — data refreshes every time tab is focused
// ✅ "See All" navigates to Results
// ✅ Notification bell opens an alerts panel

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
      rawType === "bubble_mc"        ? "Multiple Choice Exam"
      : rawType === "identification" ? "Identification Test"
      : rawType.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase());

    // Use examType initials as tag instead of positional Q1..Q4
    const tagMap: Record<string, string> = {
      bubble_mc:      "MC",
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

  const [overview, setOverview]             = useState<OverviewStats | null>(null);
  const [recentScans, setRecentScans]       = useState<DisplayScan[]>([]);
  const [loading, setLoading]               = useState(true);
  const [notifVisible, setNotifVisible]     = useState(false);

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
        totalSections:  sections.sections.length,
        classAverage:   analytics.classAverage,
        totalStudents:  sections.totalStudents,
        quizzesGraded:  countThisMonth(allResults),
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
  const fabHover  = useRef(new Animated.Value(1)).current;
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
              {/* ✅ Bell is now tappable — opens NotificationPanel */}
              <TouchableOpacity
                style={styles.notifBtn}
                activeOpacity={0.75}
                onPress={() => setNotifVisible(true)}
              >
                <Ionicons name="notifications-outline" size={22} color={Colors.textPrimary} />
                {alerts.length > 0 && <View style={styles.notifDot} />}
              </TouchableOpacity>
              <TouchableOpacity style={styles.avatar} onPress={() => navigation.navigate('EditProfile')} activeOpacity={0.8}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── STATS GRID ──────────────────────────────────────────────── */}
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
          <View style={styles.actionsGrid}>
            <View style={styles.statsRow}>
              <TouchableOpacity
                style={styles.scanBtn}
                onPress={onNavigateToScan}
                activeOpacity={0.8}
              >
                <Ionicons name="camera-outline" size={14} color="#fff" />
                <Text style={styles.scanBtnText}>Scan Papers</Text>
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

          {/* ── RECENT SCANS ────────────────────────────────────────────── */}
          <View style={styles.sectionHeader}>
            <SectionLabel label="RECENT SCANS" />
            {/* ✅ "See All" is now a proper TouchableOpacity with bigger hit area */}
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

// ─── Section Label ────────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return <Text style={styles.sectionLabel}>{label}</Text>;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxxl,
  },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.lg,
  },
  headerLeft: {
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  greeting: {
    fontSize: 13,
    fontWeight: "500",
    color: Colors.textSecondary,
    marginBottom: 2,
  },
  teacherName: {
    fontSize: 22,
    fontWeight: "800",
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  notifBtn: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.card,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border,
    position: "relative",
  },
  notifDot: {
    position: "absolute",
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
    borderWidth: 1.5,
    borderColor: Colors.card,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: Radius.full,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitials: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.white,
    letterSpacing: 0.5,
  },

  // Section label
  sectionLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textMuted,
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xl,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  seeAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    marginBottom: Spacing.sm,
    paddingVertical: 4,
  },
  seeAll: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.primary,
  },

  // Grids
  statsGrid: {},
  actionsGrid: {},
  statsRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  gridGap: {
    width: Spacing.md,
  },
  statsRowGap: {
    height: Spacing.md,
  },

  // Recent scans card
  recentCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    ...Shadow.card,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },

  // Loading state
  loadingBox: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: Spacing.xl,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: "500",
  },

  // Empty state
  emptyCard: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.xxxl,
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginTop: Spacing.sm,
  },
  emptyText: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: "center",
    paddingHorizontal: Spacing.xl,
  },

  // FAB
  fabWrap: {
    position: "absolute",
    bottom: Spacing.xl,
    right: Spacing.xl,
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
    ...Shadow.fab,
  },

  // Scan Papers button
  scanBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: Radius.sm,
    backgroundColor: Colors.primary,
  },
  scanBtnText: {
    fontSize: 11,
    fontWeight: "600",
    color: "#fff",
  },
});