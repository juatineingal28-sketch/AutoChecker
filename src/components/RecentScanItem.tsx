// components/RecentScanItem.tsx
import { useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Colors, Radius, Spacing } from "../theme";

interface RecentScanItemProps {
  quizTag: string;
  title: string;
  section: string;
  score: number;
  date: string;
  isLast?: boolean;
  onPress?: () => void;
}

function getScoreStyle(score: number) {
  if (score >= 80) return { color: Colors.success, bg: Colors.successLight };
  if (score >= 60) return { color: Colors.amber, bg: Colors.amberLight };
  return { color: Colors.danger, bg: Colors.dangerLight };
}

export default function RecentScanItem({
  quizTag,
  title,
  section,
  score,
  date,
  isLast,
  onPress,
}: RecentScanItemProps) {
  const opacity = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(opacity, { toValue: 0.6, duration: 80, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.timing(opacity, { toValue: 1, duration: 120, useNativeDriver: true }).start();
  };

  const scoreStyle = getScoreStyle(score);

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[styles.row, { opacity }]}>
        {/* Left tag */}
        <View style={styles.tagBox}>
          <Text style={styles.tagText}>{quizTag}</Text>
        </View>

        {/* Middle info */}
        <View style={styles.info}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <Text style={styles.section}>{section} · {date}</Text>
        </View>

        {/* Right score */}
        <View style={[styles.scoreBadge, { backgroundColor: scoreStyle.bg }]}>
          <Text style={[styles.scoreText, { color: scoreStyle.color }]}>{score}%</Text>
        </View>
      </Animated.View>
      {!isLast && <View style={styles.divider} />}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  tagBox: {
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: Radius.sm,
    minWidth: 36,
    alignItems: "center",
  },
  tagText: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.primary,
    letterSpacing: 0.3,
  },
  info: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  section: {
    fontSize: 11,
    fontWeight: "500",
    color: Colors.textMuted,
  },
  scoreBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  scoreText: {
    fontSize: 12,
    fontWeight: "700",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.divider,
    marginHorizontal: Spacing.lg,
  },
});