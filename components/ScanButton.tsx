// components/ScanButton.tsx
// Full fixed version for theme import error

import { Ionicons } from "@expo/vector-icons";
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

// FIX: correct path from components → src/theme
import { Colors, Radius, Shadow, Spacing } from "../src/theme";

interface ScanButtonProps {
  onPress?: () => void;
  label?: string;
}

export default function ScanButton({
  onPress,
  label = "Scan Papers",
}: ScanButtonProps) {
  return (
    <TouchableOpacity
      style={styles.button}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.iconWrap}>
        <Ionicons
          name="camera"
          size={20}
          color={Colors.white}
        />
      </View>

      <Text style={styles.label}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.sm,
    ...Shadow.card,
  },

  iconWrap: {
    alignItems: "center",
    justifyContent: "center",
  },

  label: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: "700",
  },
});