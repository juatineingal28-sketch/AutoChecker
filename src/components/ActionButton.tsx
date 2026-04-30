// components/ActionButton.tsx
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Colors, Radius, Spacing } from "../theme";

export default function ActionButton({
  label,
  icon,
  iconColor,
  iconBg,
  onPress,
  variant, // "default" | "scan"
}: any) {

  // ── Scan variant — matches the Sections "Scan Papers" button style
  if (variant === 'scan') {
    return (
      <TouchableOpacity style={styles.scanCard} onPress={onPress} activeOpacity={0.8}>
        <View style={styles.scanIconBox}>
          <Ionicons name={icon} size={18} color="#fff" />
        </View>
        <Text style={styles.scanLabel}>{label}</Text>
      </TouchableOpacity>
    );
  }

  // ── Default card style (all other action buttons)
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <Text style={styles.label}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  // ── Default card
  card: {
    flex: 1,
    backgroundColor: Colors.card,
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    alignItems: "center",
  },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textPrimary,
  },

  // ── Scan variant — solid blue row button matching SectionsScreen style
  scanCard: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
  },
  scanIconBox: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  scanLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#fff",
  },
});