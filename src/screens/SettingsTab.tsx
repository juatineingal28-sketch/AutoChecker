// screens/SettingsScreen.tsx
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
  DEFAULT_SETTINGS,
  UserSettings,
  getUserSettings,
  resetUserSettings,
  updateUserSettings,
} from '../services/settingsService';
import { Colors, Radius, Spacing } from '../theme';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Props {
  onLogout?: () => void;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SettingGroup({ children }: { children: React.ReactNode }) {
  return <View style={grp.wrap}>{children}</View>;
}
const grp = StyleSheet.create({
  wrap: {
    backgroundColor: Colors.n50,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.n100,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
});

function SectionLabel({ label }: { label: string }) {
  return <Text style={slabel.text}>{label}</Text>;
}
const slabel = StyleSheet.create({
  text: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.n400,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 16,
  },
});

interface NavItemProps {
  iconName: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  label: string;
  labelColor?: string;
  chevronColor?: string;
  onPress: () => void;
  isLast?: boolean;
  disabled?: boolean;
}
function NavItem({
  iconName,
  iconBg,
  iconColor,
  label,
  labelColor,
  chevronColor,
  onPress,
  isLast,
  disabled,
}: NavItemProps) {
  return (
    <>
      <TouchableOpacity
        style={[ni.row, disabled && ni.disabled]}
        onPress={onPress}
        activeOpacity={0.75}
        disabled={disabled}
      >
        <View style={[ni.iconWrap, { backgroundColor: iconBg }]}>
          <Ionicons name={iconName} size={14} color={iconColor} />
        </View>
        <Text style={[ni.label, labelColor ? { color: labelColor } : undefined]}>
          {label}
        </Text>
        <Ionicons
          name="chevron-forward"
          size={14}
          color={chevronColor ?? Colors.n300}
        />
      </TouchableOpacity>
      {!isLast && <View style={ni.divider} />}
    </>
  );
}
const ni = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, gap: 12 },
  iconWrap: { width: 26, height: 26, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:    { flex: 1, fontSize: 12, fontWeight: '600', color: Colors.n800 },
  divider:  { height: 1, backgroundColor: Colors.n200 },
  disabled: { opacity: 0.45 },
});

interface ToggleItemProps {
  iconName: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  label: string;
  value: boolean;
  onToggle: () => void;
  isLast?: boolean;
  disabled?: boolean;
}
function ToggleItem({
  iconName,
  iconBg,
  iconColor,
  label,
  value,
  onToggle,
  isLast,
  disabled,
}: ToggleItemProps) {
  return (
    <>
      <View style={[ti.row, disabled && ti.disabled]}>
        <View style={[ti.iconWrap, { backgroundColor: iconBg }]}>
          <Ionicons name={iconName} size={14} color={iconColor} />
        </View>
        <Text style={ti.label}>{label}</Text>
        <Switch
          value={value}
          onValueChange={onToggle}
          disabled={disabled}
          trackColor={{ false: Colors.n200, true: Colors.primary }}
          thumbColor={Colors.white}
          ios_backgroundColor={Colors.n200}
          style={{ transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }] }}
        />
      </View>
      {!isLast && <View style={ti.divider} />}
    </>
  );
}
const ti = StyleSheet.create({
  row:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 12 },
  iconWrap: { width: 26, height: 26, borderRadius: Radius.sm, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  label:    { flex: 1, fontSize: 12, fontWeight: '600', color: Colors.n800 },
  divider:  { height: 1, backgroundColor: Colors.n200 },
  disabled: { opacity: 0.45 },
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function SettingsScreen({ onLogout }: Props) {
  const { user } = useAuth();
  const navigation = useNavigation<any>();
  const displayName = user?.name?.trim() || user?.email?.split('@')[0] || 'User';
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);

  // Keep a ref to the last known good state for rollbacks
  const committed = useRef<UserSettings>(DEFAULT_SETTINGS);

  // ── Fetch on mount ────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getUserSettings();
        if (!cancelled) {
          setSettings(data);
          committed.current = data;
        }
      } catch (err) {
        console.error('[SettingsScreen] Failed to load settings:', err);
        Alert.alert('Error', 'Could not load settings. Using defaults.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Universal toggle handler (optimistic + rollback) ──────────────────────

  const handleToggle = useCallback(
    async (key: keyof UserSettings, value: boolean) => {
      if (saving) return;

      // 1. Optimistic UI update
      const prev = settings;
      const next = { ...prev, [key]: value };
      setSettings(next);

      // 2. Send only the changed field
      setSaving(true);
      try {
        const confirmed = await updateUserSettings({ [key]: value });
        setSettings(confirmed);
        committed.current = confirmed;
      } catch (err) {
        console.error('[SettingsScreen] Toggle update failed:', err);
        // 3. Rollback on failure
        setSettings(prev);
        Alert.alert('Update failed', 'Could not save the change. Please try again.');
      } finally {
        setSaving(false);
      }
    },
    [settings, saving],
  );

  // ── Save full settings ────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (saving || loading) return;
    setSaving(true);
    try {
      const confirmed = await updateUserSettings(settings);
      setSettings(confirmed);
      committed.current = confirmed;
      Alert.alert('Saved', 'Your settings have been saved.');
    } catch (err) {
      console.error('[SettingsScreen] Save failed:', err);
      Alert.alert('Save failed', 'Could not save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [settings, saving, loading]);

  // ── Reset to defaults ─────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    Alert.alert(
      'Reset settings',
      'Restore all settings to their defaults?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            setSaving(true);
            try {
              const defaults = await resetUserSettings();
              setSettings(defaults);
              committed.current = defaults;
              Alert.alert('Reset', 'Settings restored to defaults.');
            } catch (err) {
              console.error('[SettingsScreen] Reset failed:', err);
              Alert.alert('Reset failed', 'Could not reset settings. Please try again.');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  }, []);

  // ── Other button handlers ─────────────────────────────────────────────────

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel' },
      { text: 'Sign out', style: 'destructive', onPress: onLogout },
    ]);
  };

  const handleExportData = useCallback(async () => {
    try {
      const resp = await fetch('/api/export', { method: 'GET' });
      if (!resp.ok) throw new Error(await resp.text());
      Alert.alert('Export started', 'Your data export has been initiated.');
    } catch (err) {
      console.error('[SettingsScreen] Export failed:', err);
      Alert.alert('Export failed', 'Could not start the export. Please try again.');
    }
  }, []);

  const handleExportPDF = useCallback(async () => {
    try {
      const resp = await fetch('/api/export/pdf', { method: 'POST' });
      if (!resp.ok) throw new Error(await resp.text());
      Alert.alert('PDF ready', 'Your PDF report has been generated.');
    } catch (err) {
      console.error('[SettingsScreen] PDF export failed:', err);
      Alert.alert('Export failed', 'Could not generate the PDF. Please try again.');
    }
  }, []);

  const handleManageAnswerKeys = useCallback(async () => {
    // Navigate to answer-key management screen; replace with real navigation
    Alert.alert('Answer Keys', 'Opening answer key manager…');
  }, []);

  const handleAddAnswerKey = useCallback(async () => {
    // Navigate to add-answer-key screen; replace with real navigation
    Alert.alert('New Answer Key', 'Opening new answer key form…');
  }, []);

  const handleClearData = useCallback(() => {
    Alert.alert('Clear all data', 'This cannot be undone.', [
      { text: 'Cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          try {
            const resp = await fetch('/api/data', { method: 'DELETE' });
            if (!resp.ok) throw new Error(await resp.text());
            Alert.alert('Done', 'All data has been cleared.');
          } catch (err) {
            console.error('[SettingsScreen] Clear data failed:', err);
            Alert.alert('Error', 'Could not clear data. Please try again.');
          }
        },
      },
    ]);
  }, []);

  // ── Derived flags ─────────────────────────────────────────────────────────

  const uiDisabled = loading || saving;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={styles.topbar}>
        <Text style={styles.topbarTitle}>Settings</Text>
        <View style={styles.topbarActions}>
          {saving && (
            <ActivityIndicator
              size="small"
              color={Colors.primary}
              style={{ marginRight: 8 }}
            />
          )}
          <TouchableOpacity
            onPress={handleReset}
            disabled={uiDisabled}
            style={[styles.topbarBtn, uiDisabled && styles.topbarBtnDisabled]}
          >
            <Text style={styles.topbarBtnLabel}>Reset</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            disabled={uiDisabled}
            style={[
              styles.topbarBtn,
              styles.topbarBtnPrimary,
              uiDisabled && styles.topbarBtnDisabled,
            ]}
          >
            <Text style={[styles.topbarBtnLabel, { color: Colors.white }]}>
              Save
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading settings…</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* Profile card */}
          <TouchableOpacity
            style={styles.profileCard}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('EditProfile')}
            disabled={uiDisabled}
          >
            <View style={styles.profileAvatar}>
              <Text style={styles.profileAvatarText}>{initials}</Text>
            </View>
            <View>
              <Text style={styles.profileName}>{displayName}</Text>
              <Text style={styles.profileSub}>Edit profile →</Text>
            </View>
          </TouchableOpacity>

          {/* Export */}
          <SectionLabel label="Export" />
          <SettingGroup>
            <NavItem
              iconName="download-outline"
              iconBg={Colors.successLight}
              iconColor={Colors.success}
              label="Export all data"
              onPress={handleExportData}
              disabled={uiDisabled}
            />
            <NavItem
              iconName="document-outline"
              iconBg={Colors.primaryLight}
              iconColor={Colors.primary}
              label="Export as PDF report"
              onPress={handleExportPDF}
              disabled={uiDisabled}
              isLast
            />
          </SettingGroup>

          {/* Answer keys */}
          <SectionLabel label="Answer Keys" />
          <SettingGroup>
            <NavItem
              iconName="key-outline"
              iconBg={Colors.amberLight}
              iconColor={Colors.amber}
              label="Manage answer keys"
              onPress={handleManageAnswerKeys}
              disabled={uiDisabled}
            />
            <NavItem
              iconName="add"
              iconBg={Colors.purpleLight}
              iconColor={Colors.purple}
              label="Add new answer key"
              onPress={handleAddAnswerKey}
              disabled={uiDisabled}
              isLast
            />
          </SettingGroup>

          {/* OCR & Scanning */}
          <SectionLabel label="OCR & Scanning" />
          <SettingGroup>
            <ToggleItem
              iconName="scan-outline"
              iconBg={Colors.primaryLight}
              iconColor={Colors.primary}
              label="Auto-detect student name"
              value={settings.autoDetect}
              onToggle={() => handleToggle('autoDetect', !settings.autoDetect)}
              disabled={uiDisabled}
            />
            <ToggleItem
              iconName="information-circle-outline"
              iconBg={Colors.primaryLight}
              iconColor={Colors.primary}
              label="Show scanning tips"
              value={settings.scanTips}
              onToggle={() => handleToggle('scanTips', !settings.scanTips)}
              disabled={uiDisabled}
            />
            <ToggleItem
              iconName="warning-outline"
              iconBg={Colors.amberLight}
              iconColor={Colors.amber}
              label="Flag low confidence"
              value={settings.flagLow}
              onToggle={() => handleToggle('flagLow', !settings.flagLow)}
              disabled={uiDisabled}
            />
            <ToggleItem
              iconName="git-branch-outline"
              iconBg={Colors.purpleLight}
              iconColor={Colors.purple}
              label="Tree-based OCR processing"
              value={settings.treeToggleOcr}
              onToggle={() => handleToggle('treeToggleOcr', !settings.treeToggleOcr)}
              disabled={uiDisabled}
            />
            <ToggleItem
              iconName="videocam-outline"
              iconBg={Colors.primaryLight}
              iconColor={Colors.primary}
              label={settings.scanning ? 'Disable scanning' : 'Enable scanning'}
              value={settings.scanning}
              onToggle={() => handleToggle('scanning', !settings.scanning)}
              disabled={uiDisabled}
              isLast
            />
          </SettingGroup>

          {/* Account */}
          <SectionLabel label="Account" />
          <SettingGroup>
            <NavItem
              iconName="log-out-outline"
              iconBg={Colors.n100}
              iconColor={Colors.n500}
              label="Sign out"
              onPress={handleLogout}
              disabled={uiDisabled}
            />
            <NavItem
              iconName="trash-outline"
              iconBg={Colors.dangerLight}
              iconColor={Colors.danger}
              label="Clear all data"
              labelColor={Colors.danger}
              chevronColor={Colors.danger}
              onPress={handleClearData}
              disabled={uiDisabled}
              isLast
            />
          </SettingGroup>

          <Text style={styles.footer}>
            GradeWise v2.1.0 · Made with ♥ for Filipino teachers
          </Text>

          <View style={{ height: 80 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  // Top bar
  topbar: {
    height: 48,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: Colors.n100,
    backgroundColor: Colors.white,
  },
  topbarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.n900,
    letterSpacing: -0.4,
  },
  topbarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topbarBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.n200,
    backgroundColor: Colors.white,
  },
  topbarBtnPrimary: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  topbarBtnDisabled: {
    opacity: 0.45,
  },
  topbarBtnLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.n700,
  },

  // Loading
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    color: Colors.n400,
    fontWeight: '500',
  },

  // Scroll
  scroll: { flex: 1 },
  content: { paddingHorizontal: Spacing.lg, paddingTop: 8 },

  // Profile card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    paddingHorizontal: 14,
    backgroundColor: Colors.primaryLight,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: '#BFDBFE',
    marginTop: 8,
  },
  profileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  profileAvatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
  profileName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.n900,
  },
  profileSub: {
    fontSize: 10,
    color: Colors.primary,
    fontWeight: '500',
    marginTop: 2,
  },

  footer: {
    textAlign: 'center',
    fontSize: 10,
    color: Colors.n400,
    paddingVertical: 20,
  },
});