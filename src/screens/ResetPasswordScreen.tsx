// screens/ResetPasswordScreen.tsx
// ─── Reset Password ───────────────────────────────────────────────────────────
// User lands here after clicking the Supabase reset link in their email.
// App.tsx catches the deep link → exchangeCodeForSession() → PASSWORD_RECOVERY event
// AuthContext sets isPasswordRecovery = true → AppNavigator shows this screen.
// We call supabase.auth.updateUser({ password }) to save the new password,
// which fires USER_UPDATED → AuthContext resets isPasswordRecovery = false.

import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { supabase } from '../../supabase';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  blue:       '#2D6BF4',
  blueDark:   '#1D55D4',
  blueLight:  '#EFF6FF',
  red:        '#DC2626',
  redLight:   '#FEF2F2',
  green:      '#1D9E75',
  greenLight: '#F0FDF4',
  n0:         '#FFFFFF',
  n50:        '#F2F6FF',
  n100:       '#E0EAFF',
  n200:       '#C8DCFF',
  n400:       '#A8BFDF',
  n500:       '#8A9BB8',
  n600:       '#475569',
  n800:       '#1a1a2e',
  n900:       '#0F172A',
  rMd:        12,
  rLg:        16,
};

// ─── Icons ────────────────────────────────────────────────────────────────────
const LockIcon = () => (
  <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={T.n0} strokeWidth={2}>
    <Path d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z" />
    <Path d="M7 11V7a5 5 0 0110 0v4" />
  </Svg>
);

const EyeIcon = () => (
  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={T.n400} strokeWidth={1.5}>
    <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <Circle cx={12} cy={12} r={3} />
  </Svg>
);

const EyeOffIcon = () => (
  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={T.n400} strokeWidth={1.5}>
    <Path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
    <Path d="M1 1l22 22" />
  </Svg>
);

// ─── Password strength ────────────────────────────────────────────────────────
function getStrength(pw: string): { score: number; label: string; color: string } {
  if (pw.length === 0) return { score: 0, label: '', color: T.n100 };
  if (pw.length < 6)   return { score: 1, label: 'Too short', color: T.red };
  let score = 1;
  if (pw.length >= 8)           score++;
  if (/[A-Z]/.test(pw))         score++;
  if (/[0-9]/.test(pw))         score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors = ['', T.red, '#F59E0B', '#3B82F6', T.green, T.green];
  return { score, label: labels[score], color: colors[score] };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ResetPasswordScreen() {
  const navigation = useNavigation<any>();

  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showNew, setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [done, setDone]           = useState(false);

  const strength = getStrength(newPw);
  const match    = confirmPw.length > 0 && newPw === confirmPw;
  const mismatch = confirmPw.length > 0 && newPw !== confirmPw;

  const handleReset = async () => {
    setError('');
    if (!newPw) { setError('Please enter a new password.'); return; }
    if (newPw.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (newPw !== confirmPw) { setError('Passwords do not match.'); return; }

    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPw });
      if (err) { setError(err.message); return; }
      await supabase.auth.signOut();
      setDone(true);
    } catch (e: any) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  // ── Success screen ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <SafeAreaView style={s.root}>
        {/* Blue bg top half */}
        <View style={s.successBg}>
          <Svg style={StyleSheet.absoluteFillObject} viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" fill="none">
            <Circle cx={200} cy={-10} r={130} fill="rgba(255,255,255,0.07)" />
            <Circle cx={30} cy={280} r={80} fill="rgba(255,255,255,0.04)" />
          </Svg>
        </View>
        <View style={s.successCard}>
          <View style={s.successIconWrap}>
            <Svg width={56} height={56} viewBox="0 0 56 56" fill="none">
              <Circle cx={28} cy={28} r={28} fill="#DCFCE7" />
              <Path d="M18 28l7 7 13-13" stroke={T.green} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <Text style={s.successTitle}>Password Updated!</Text>
          <Text style={s.successDesc}>
            Your password has been changed successfully.{'\n'}You can now sign in with your new password.
          </Text>
          <TouchableOpacity style={s.btn} onPress={() => navigation.replace('Login')} activeOpacity={0.85}>
            <Text style={s.btnText}>Back to Sign In →</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={s.root}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          {/* ── Blue Header ──────────────────────────────────────────────────── */}
          <View style={s.header}>
            <Svg style={StyleSheet.absoluteFillObject} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" fill="none">
              <Circle cx={200} cy={-10} r={130} fill="rgba(255,255,255,0.07)" />
              <Circle cx={200} cy={-10} r={90} fill="rgba(255,255,255,0.05)" />
              <Circle cx={30} cy={190} r={80} fill="rgba(255,255,255,0.04)" />
            </Svg>

            {/* Icon */}
            <View style={s.iconWrap}>
              <LockIcon />
            </View>
            <Text style={s.headerTitle}>Forgot password?</Text>
            <Text style={s.headerSub}>
              Enter your email and we'll send{'\n'}a 6-digit code
            </Text>
          </View>

          {/* ── White Card ───────────────────────────────────────────────────── */}
          <View style={s.card}>

            {/* New password */}
            <Text style={s.lbl}>NEW PASSWORD</Text>
            <View style={[s.inp, !!error && !mismatch && s.inpError]}>
              <TextInput
                style={s.inpText}
                placeholder="At least 6 characters"
                placeholderTextColor={T.n400}
                value={newPw}
                onChangeText={v => { setNewPw(v); setError(''); }}
                secureTextEntry={!showNew}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowNew(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                {showNew ? <EyeOffIcon /> : <EyeIcon />}
              </TouchableOpacity>
            </View>

            {/* Strength bar */}
            {newPw.length > 0 && (
              <>
                <View style={s.strRow}>
                  {[1,2,3,4].map(i => (
                    <View key={i} style={[s.strSeg, { backgroundColor: i <= strength.score ? strength.color : T.n100 }]} />
                  ))}
                </View>
                <Text style={[s.strLabel, { color: strength.color }]}>
                  {strength.label} — add numbers or symbols
                </Text>
              </>
            )}

            {/* Confirm password */}
            <Text style={[s.lbl, { marginTop: 14 }]}>CONFIRM PASSWORD</Text>
            <View style={[s.inp, mismatch && s.inpError, match && s.inpSuccess]}>
              <TextInput
                style={s.inpText}
                placeholder="Re-enter password"
                placeholderTextColor={T.n400}
                value={confirmPw}
                onChangeText={v => { setConfirmPw(v); setError(''); }}
                secureTextEntry={!showConfirm}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowConfirm(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
              </TouchableOpacity>
              {match && <Text style={{ fontSize: 14, marginLeft: 6, color: T.green }}>✓</Text>}
            </View>
            {mismatch && <Text style={s.errText}>● Passwords do not match</Text>}

            {/* General error */}
            {!!error && (
              <View style={s.errorBox}>
                <Text style={s.errorBoxText}>⚠ {error}</Text>
              </View>
            )}

            {/* Submit */}
            <TouchableOpacity
              style={[s.btn, (loading || strength.score < 1) && s.btnDisabled]}
              onPress={handleReset}
              disabled={loading || strength.score < 1}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color={T.n0} />
                : <Text style={s.btnText}>Update Password</Text>
              }
            </TouchableOpacity>

            {/* Back to login */}
            <TouchableOpacity style={s.backWrap} onPress={() => navigation.replace('Login')}>
              <Text style={s.backText}>← Back to Sign In</Text>
            </TouchableOpacity>

          </View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: T.blue },
  scroll:       { flexGrow: 1, justifyContent: 'flex-end' },

  // Header
  header:       { paddingTop: 44, paddingBottom: 30, alignItems: 'center', position: 'relative', overflow: 'hidden' },
  iconWrap:     { width: 72, height: 72, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  headerTitle:  { fontSize: 19, fontWeight: '700', color: T.n0, marginBottom: 8 },
  headerSub:    { fontSize: 11, color: 'rgba(255,255,255,0.55)', textAlign: 'center', lineHeight: 18, paddingHorizontal: 28 },

  // Card
  card:         { backgroundColor: T.n0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 22, paddingTop: 28, paddingBottom: 40 },
  lbl:          { fontSize: 10, fontWeight: '600', color: T.blue, letterSpacing: 0.8, marginBottom: 6 },
  inp:          { height: 46, flexDirection: 'row', alignItems: 'center', backgroundColor: T.n50, borderWidth: 1.5, borderColor: T.n100, borderRadius: 12, paddingHorizontal: 13, marginBottom: 8, justifyContent: 'space-between' },
  inpError:     { borderColor: T.red, backgroundColor: T.redLight },
  inpSuccess:   { borderColor: T.green, backgroundColor: T.greenLight },
  inpText:      { flex: 1, fontSize: 13, color: T.n800 },
  strRow:       { flexDirection: 'row', gap: 3, marginTop: 4, marginBottom: 4 },
  strSeg:       { flex: 1, height: 3, borderRadius: 2 },
  strLabel:     { fontSize: 10, marginBottom: 4 },
  errText:      { fontSize: 11, color: T.red, fontWeight: '500', marginBottom: 8 },
  errorBox:     { backgroundColor: T.redLight, borderRadius: T.rMd, padding: 12, marginBottom: 14, borderWidth: 1, borderColor: '#FECACA' },
  errorBoxText: { fontSize: 12, color: T.red, fontWeight: '500' },
  btn:          { height: 50, backgroundColor: T.blue, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 8, shadowColor: T.blue, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  btnDisabled:  { opacity: 0.45, elevation: 0 },
  btnText:      { color: T.n0, fontSize: 14, fontWeight: '600' },
  backWrap:     { alignItems: 'center', marginTop: 16 },
  backText:     { fontSize: 12, color: T.blue, fontWeight: '600' },

  // Success
  successBg:    { position: 'absolute', top: 0, left: 0, right: 0, height: '45%', backgroundColor: T.blue, overflow: 'hidden' },
  successCard:  { flex: 1, backgroundColor: T.n0, marginTop: '38%', borderTopLeftRadius: 24, borderTopRightRadius: 24, alignItems: 'center', paddingHorizontal: 32, paddingTop: 0, gap: 14 },
  successIconWrap: { marginTop: -28 },
  successTitle: { fontSize: 22, fontWeight: '800', color: T.n900, letterSpacing: -0.5 },
  successDesc:  { fontSize: 13, color: T.n500, textAlign: 'center', lineHeight: 20 },
});