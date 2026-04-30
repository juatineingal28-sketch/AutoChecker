import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Colors, Radius, Spacing } from '../theme';

// ─── HELPERS ────────────────────────────────────────────────
export const scoreColor = (score: number) => {
  if (score >= 90) return Colors.success;
  if (score >= 75) return Colors.primary;
  if (score >= 50) return Colors.amber;
  return Colors.danger;
};

// ─── SECTION HEADING ────────────────────────────────────────
export function SectionHeading({ label }: { label: string }) {
  return <Text style={sh.label}>{label}</Text>;
}
const sh = StyleSheet.create({
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },
});

// ─── SEARCH BAR ─────────────────────────────────────────────
interface SearchBarProps {
  placeholder: string;
  value?: string;
  onChangeText?: (t: string) => void;
  style?: ViewStyle;
}
export function SearchBar({ placeholder, value, onChangeText, style }: SearchBarProps) {
  return (
    <View style={[sb.wrap, style]}>
      <Ionicons name="search" size={14} color={Colors.textMuted} />
      <TextInput
        style={sb.input}
        placeholder={placeholder}
        placeholderTextColor={Colors.textMuted}
        value={value}
        onChangeText={onChangeText}
      />
    </View>
  );
}
const sb = StyleSheet.create({
  wrap: {
    height: 36,
    backgroundColor: Colors.n50,
    borderRadius: Radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.n200,
  },
  input: {
    flex: 1,
    fontSize: 12,
    color: Colors.textPrimary,
  },
});

// ─── CHIP ──────────────────────────────────────────────────
export function Chip({ label, active, onPress }: any) {
  return (
    <TouchableOpacity
      style={[chip.base, active && chip.active]}
      onPress={onPress}
    >
      <Text style={[chip.text, active && chip.activeText]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}
const chip = StyleSheet.create({
  base: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    borderColor: Colors.n200,
    backgroundColor: Colors.white,
  },
  active: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  text: {
    fontSize: 10,
    fontWeight: '600',
    color: Colors.n500,
  },
  activeText: {
    color: Colors.white,
  },
});

// ─── BADGE ─────────────────────────────────────────────────
type BadgeVariant = 'green' | 'blue' | 'amber' | 'red';

interface BadgeProps {
  label: string;
  variant: BadgeVariant;
}

export function Badge({ label, variant }: BadgeProps) {
  const map: Record<BadgeVariant, { bg: string; color: string }> = {
    green: { bg: Colors.successLight, color: Colors.success },
    blue:  { bg: Colors.primaryLight, color: Colors.primary },
    amber: { bg: Colors.amberLight,   color: Colors.amber },
    red:   { bg: Colors.dangerLight,  color: Colors.danger },
  };
  const s = map[variant];

  return (
    <View style={[badge.wrap, { backgroundColor: s.bg }]}>
      <Text style={[badge.text, { color: s.color }]}>{label}</Text>
    </View>
  );
}
const badge = StyleSheet.create({
  wrap: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  text: {
    fontSize: 9,
    fontWeight: '600',
  },
});

// ─── PROGRESS BAR ──────────────────────────────────────────
export function ProgressBar({
  progress,
  color,
}: {
  progress: number;
  color?: string;
}) {
  return (
    <View style={pb.track}>
      <View
        style={[
          pb.fill,
          {
            width: `${progress * 100}%`,
            backgroundColor: color ?? Colors.primary,
          },
        ]}
      />
    </View>
  );
}
const pb = StyleSheet.create({
  track: {
    height: 4,
    backgroundColor: Colors.n200,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
  },
});

// ─── ICON BUTTON ───────────────────────────────────────────
interface IconBtnProps {
  name: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  size?: number;
  color?: string;
}
export function IconButton({
  name,
  onPress,
  size = 18,
  color = Colors.n600,
}: IconBtnProps) {
  return (
    <TouchableOpacity style={ib.wrap} onPress={onPress}>
      <Ionicons name={name} size={size} color={color} />
    </TouchableOpacity>
  );
}
const ib = StyleSheet.create({
  wrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.n100,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ─── AVATAR ────────────────────────────────────────────────
interface AvatarProps {
  initials: string;
  size?: number;
  variant?: 'blue' | 'green' | 'amber' | 'red' | 'purple';
}
export function Avatar({
  initials,
  size = 32,
  variant = 'blue',
}: AvatarProps) {
  const map = {
    blue:   Colors.primary,
    green:  Colors.success,
    amber:  Colors.amber,
    red:    Colors.danger,
    purple: Colors.purple,
  };

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: map[variant] + '20',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: map[variant],
          fontWeight: '700',
          fontSize: size * 0.35,
        }}
      >
        {initials}
      </Text>
    </View>
  );
}