// screens/EditProfileScreen.tsx
// ─── Edit Profile ─────────────────────────────────────────────────────────────

import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import {
    changePassword,
    getProfile,
    updateProfile,
    type Profile,
} from '../services/profileService';
import { Colors, Radius, Spacing } from '../theme';

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return <Text style={sl.text}>{label}</Text>;
}
const sl = StyleSheet.create({
  text: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.n400,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
    marginTop: 20,
  },
});

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  iconName: keyof typeof Ionicons.glyphMap;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  editable?: boolean;
  multiline?: boolean;
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  iconName,
  secureTextEntry,
  autoCapitalize = 'sentences',
  editable = true,
  multiline = false,
}: FieldProps) {
  return (
    <View style={f.wrap}>
      <View style={f.iconWrap}>
        <Ionicons name={iconName} size={14} color={Colors.n400} />
      </View>
      <View style={f.inner}>
        <Text style={f.label}>{label}</Text>
        <TextInput
          style={[f.input, multiline && f.inputMulti, !editable && f.inputDisabled]}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.n300}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          editable={editable}
          multiline={multiline}
          numberOfLines={multiline ? 3 : 1}
        />
      </View>
    </View>
  );
}
const f = StyleSheet.create({
  wrap:         { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 2 },
  iconWrap:     { width: 26, height: 26, borderRadius: Radius.sm, backgroundColor: Colors.n100, alignItems: 'center', justifyContent: 'center', marginTop: 24, flexShrink: 0 },
  inner:        { flex: 1 },
  label:        { fontSize: 10, fontWeight: '700', color: Colors.n400, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 },
  input:        { backgroundColor: Colors.n50, borderRadius: Radius.sm, borderWidth: 1, borderColor: Colors.n200, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, fontWeight: '500', color: Colors.n800 },
  inputMulti:   { height: 80, textAlignVertical: 'top' },
  inputDisabled:{ backgroundColor: Colors.n100, color: Colors.n400 },
});

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 72 }: { name: string; size?: number }) {
  const initials = name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  return (
    <View style={[av.wrap, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[av.text, { fontSize: size * 0.3 }]}>{initials}</Text>
    </View>
  );
}
const av = StyleSheet.create({
  wrap: { backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  text: { color: '#fff', fontWeight: '800' },
});

// ─── Component ────────────────────────────────────────────────────────────────

export default function EditProfileScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();

  const [profile, setProfile]   = useState<Profile | null>(null);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);

  // Editable fields
  const [name, setName]         = useState('');
  const [school, setSchool]     = useState('');
  const [subject, setSubject]   = useState('');
  const [bio, setBio]           = useState('');

  // Password change
  const [showPwSection, setShowPwSection] = useState(false);
  const [currentPw, setCurrentPw]         = useState('');
  const [newPw, setNewPw]                 = useState('');
  const [confirmPw, setConfirmPw]         = useState('');

  const dirty = useRef(false);

  // ── Load profile ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const data = await getProfile(user.id);
        if (data) {
          setProfile(data);
          setName(data.name ?? '');
          setSchool(data.school ?? '');
          setSubject(data.subject ?? '');
          setBio(data.bio ?? '');
        }
      } catch (err) {
        Alert.alert('Error', 'Could not load profile.');
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  // ── Save profile ────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!user?.id) return;
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter your name.');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateProfile(user.id, {
        name:    name.trim(),
        school:  school.trim(),
        subject: subject.trim(),
        bio:     bio.trim(),
      });
      setProfile(updated);
      Alert.alert('✅ Saved', 'Your profile has been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert('Save failed', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // ── Change password ─────────────────────────────────────────────────────────

  const handleChangePassword = async () => {
    if (!newPw || !confirmPw) {
      Alert.alert('Missing fields', 'Please fill in all password fields.');
      return;
    }
    if (newPw.length < 6) {
      Alert.alert('Too short', 'Password must be at least 6 characters.');
      return;
    }
    if (newPw !== confirmPw) {
      Alert.alert('Mismatch', 'New passwords do not match.');
      return;
    }

    setSaving(true);
    try {
      await changePassword(newPw);
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
      setShowPwSection(false);
      Alert.alert('✅ Password changed', 'Your password has been updated.');
    } catch (err) {
      Alert.alert('Failed', err instanceof Error ? err.message : 'Could not change password.');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  const uiDisabled = loading || saving;

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Top bar */}
      <View style={s.topbar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn} disabled={uiDisabled}>
          <Ionicons name="chevron-back" size={18} color={Colors.n700} />
        </TouchableOpacity>
        <Text style={s.topbarTitle}>Edit Profile</Text>
        <TouchableOpacity
          onPress={handleSave}
          disabled={uiDisabled}
          style={[s.saveBtn, uiDisabled && s.saveBtnDisabled]}
        >
          {saving
            ? <ActivityIndicator size="small" color={Colors.white} />
            : <Text style={s.saveBtnLabel}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={s.loadingText}>Loading profile…</Text>
        </View>
      ) : (
        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Avatar */}
          <View style={s.avatarSection}>
            <Avatar name={name || user?.name || 'U'} size={80} />
            <View style={s.avatarMeta}>
              <Text style={s.avatarName}>{name || 'Your Name'}</Text>
              <Text style={s.avatarEmail}>{user?.email}</Text>
              <View style={s.rolePill}>
                <Text style={s.rolePillText}>{profile?.role ?? 'Teacher'}</Text>
              </View>
            </View>
          </View>

          {/* Personal info */}
          <SectionLabel label="Personal Info" />
          <View style={s.card}>
            <Field
              label="Full Name"
              iconName="person-outline"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Juan dela Cruz"
              autoCapitalize="words"
            />
            <Field
              label="Email"
              iconName="mail-outline"
              value={user?.email ?? ''}
              onChangeText={() => {}}
              editable={false}
              autoCapitalize="none"
            />
          </View>

          {/* School info */}
          <SectionLabel label="School Info" />
          <View style={s.card}>
            <Field
              label="School / Institution"
              iconName="school-outline"
              value={school}
              onChangeText={setSchool}
              placeholder="e.g. Rizal High School"
              autoCapitalize="words"
            />
            <Field
              label="Subject"
              iconName="book-outline"
              value={subject}
              onChangeText={setSubject}
              placeholder="e.g. Mathematics, Science"
              autoCapitalize="words"
            />
            <Field
              label="Bio"
              iconName="create-outline"
              value={bio}
              onChangeText={setBio}
              placeholder="A short bio about yourself…"
              multiline
            />
          </View>

          {/* Password */}
          <SectionLabel label="Security" />
          <View style={s.card}>
            <TouchableOpacity
              style={s.pwToggle}
              onPress={() => setShowPwSection(v => !v)}
              activeOpacity={0.75}
            >
              <View style={s.pwToggleLeft}>
                <View style={s.pwIcon}>
                  <Ionicons name="lock-closed-outline" size={14} color={Colors.primary} />
                </View>
                <Text style={s.pwToggleLabel}>Change Password</Text>
              </View>
              <Ionicons
                name={showPwSection ? 'chevron-up' : 'chevron-down'}
                size={14}
                color={Colors.n400}
              />
            </TouchableOpacity>

            {showPwSection && (
              <View style={s.pwFields}>
                <Field
                  label="New Password"
                  iconName="key-outline"
                  value={newPw}
                  onChangeText={setNewPw}
                  placeholder="At least 6 characters"
                  secureTextEntry
                  autoCapitalize="none"
                />
                <Field
                  label="Confirm New Password"
                  iconName="key-outline"
                  value={confirmPw}
                  onChangeText={setConfirmPw}
                  placeholder="Repeat new password"
                  secureTextEntry
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={[s.pwSaveBtn, uiDisabled && s.saveBtnDisabled]}
                  onPress={handleChangePassword}
                  disabled={uiDisabled}
                >
                  <Text style={s.pwSaveBtnText}>Update Password</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: Colors.background },

  // Top bar
  topbar:       { height: 48, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: Colors.n100, backgroundColor: Colors.white },
  backBtn:      { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  topbarTitle:  { fontSize: 15, fontWeight: '700', color: Colors.n900, letterSpacing: -0.3 },
  saveBtn:      { backgroundColor: Colors.primary, paddingHorizontal: 14, paddingVertical: 6, borderRadius: Radius.sm, minWidth: 52, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnLabel: { fontSize: 12, fontWeight: '700', color: Colors.white },

  // Loading
  loadingWrap:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText:  { fontSize: 13, color: Colors.n400, fontWeight: '500' },

  // Scroll
  scroll:       { flex: 1 },
  content:      { paddingHorizontal: Spacing.lg, paddingTop: 16 },

  // Avatar section
  avatarSection: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: Colors.primaryLight, borderRadius: Radius.md, padding: 16, borderWidth: 1, borderColor: '#BFDBFE' },
  avatarMeta:   { flex: 1 },
  avatarName:   { fontSize: 15, fontWeight: '800', color: Colors.n900, marginBottom: 2 },
  avatarEmail:  { fontSize: 11, color: Colors.n500, marginBottom: 6 },
  rolePill:     { alignSelf: 'flex-start', backgroundColor: Colors.primary, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 },
  rolePillText: { fontSize: 9, fontWeight: '700', color: Colors.white, textTransform: 'uppercase', letterSpacing: 0.8 },

  // Card
  card:         { backgroundColor: Colors.n50, borderRadius: Radius.md, borderWidth: 1, borderColor: Colors.n100, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },

  // Password section
  pwToggle:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12 },
  pwToggleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pwIcon:       { width: 26, height: 26, borderRadius: Radius.sm, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  pwToggleLabel:{ fontSize: 12, fontWeight: '600', color: Colors.n800 },
  pwFields:     { borderTopWidth: 1, borderTopColor: Colors.n200, paddingTop: 8, gap: 4 },
  pwSaveBtn:    { backgroundColor: Colors.primary, borderRadius: Radius.sm, paddingVertical: 11, alignItems: 'center', marginTop: 8 },
  pwSaveBtnText:{ fontSize: 13, fontWeight: '700', color: Colors.white },
});