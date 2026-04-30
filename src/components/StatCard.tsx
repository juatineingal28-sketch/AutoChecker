// components/StatCard.tsx
import { Ionicons } from "@expo/vector-icons";
import React, { useRef } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Colors, Radius, Shadow, Spacing } from "../theme";
interface StatCardProps {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  iconBg: string;
  badge?: string;
  badgeColor?: string;
  badgeBg?: string;
  trend?: string;
  trendUp?: boolean;
  onPress?: () => void;
}

export default function StatCard({
  label,
  value,
  icon,
  iconColor,
  iconBg,
  badge,
  badgeColor,
  badgeBg,
  trend,
  trendUp,
  onPress,
}: StatCardProps) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 50 }).start();
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      style={styles.wrapper}
    >
      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
        <View style={styles.topRow}>
          <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
            <Ionicons name={icon} size={16} color={iconColor} />
          </View>
          {badge && (
            <View style={[styles.badge, { backgroundColor: badgeBg ?? Colors.primaryLight }]}>
              <Text style={[styles.badgeText, { color: badgeColor ?? Colors.primary }]}>{badge}</Text>
            </View>
          )}
          {trend && (
            <View style={[styles.badge, { backgroundColor: trendUp ? Colors.successLight : Colors.dangerLight }]}>
              <Ionicons
                name={trendUp ? "trending-up" : "trending-down"}
                size={11}
                color={trendUp ? Colors.success : Colors.danger}
              />
              <Text style={[styles.badgeText, { color: trendUp ? Colors.success : Colors.danger, marginLeft: 2 }]}>
                {trend}
              </Text>
            </View>
          )}
        </View>
        <Text style={styles.value}>{value}</Text>
        <Text style={styles.label}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    ...Shadow.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: Spacing.md,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: Radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  value: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.textPrimary,
    letterSpacing: -1,
    marginBottom: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.textSecondary,
  },
});