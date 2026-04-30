// screens/LoginScreen.tsx
// ─── Forgot Password uses OTP code (no deep links needed) ─────────────────────
// Flow: Enter email → get 8-digit OTP → enter OTP → enter new password → done

import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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

type FieldErrors = { email?: string; password?: string };

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

// ─── Logo Icon ────────────────────────────────────────────────────────────────
const CheckIcon = ({ size = 28, color = T.blue }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 30 30" fill="none">
    <Path d="M5 15.5L12 22L25 8" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
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

const MailIcon = () => (
  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={T.n400} strokeWidth={1.5}>
    <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <Path d="M22 6l-10 7L2 6" />
  </Svg>
);

// ─── BG Circles decoration ────────────────────────────────────────────────────
const BgDecor = ({ w = 300, h = 200 }: { w?: number; h?: number }) => (
  <Svg style={StyleSheet.absoluteFillObject} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid slice" fill="none">
    <Circle cx={w / 2} cy={-20} r={130} fill="rgba(255,255,255,0.07)" />
    <Circle cx={w / 2} cy={-20} r={90} fill="rgba(255,255,255,0.05)" />
    <Circle cx={w - 40} cy={h + 20} r={70} fill="rgba(255,255,255,0.04)" />
  </Svg>
);

// ─── Forgot Password Modal ────────────────────────────────────────────────────
type FPStep = 'email' | 'otp' | 'password' | 'done';

function ForgotPasswordModal({
  visible,
  onClose,
  prefillEmail,
}: {
  visible: boolean;
  onClose: () => void;
  prefillEmail: string;
}) {
  const [step, setStep]           = useState<FPStep>('email');
  const [fpEmail, setFpEmail]     = useState(prefillEmail);
  const [otp, setOtp]             = useState('');
  const [newPw, setNewPw]         = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showNew, setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const strength = getStrength(newPw);
  const match    = confirmPw.length > 0 && newPw === confirmPw;
  const mismatch = confirmPw.length > 0 && newPw !== confirmPw;

  useEffect(() => {
    if (visible) {
      setStep('email');
      setFpEmail(prefillEmail);
      setOtp('');
      setNewPw('');
      setConfirmPw('');
      setError('');
    }
  }, [visible, prefillEmail]);

  const handleSendOtp = async () => {
    if (!fpEmail.trim()) { setError('Please enter your email address.'); return; }
    if (!/\S+@\S+\.\S+/.test(fpEmail.trim())) { setError('Please enter a valid email address.'); return; }
    setLoading(true);
    setError('');
    try {
      const { error: err } = await supabase.auth.signInWithOtp({
        email: fpEmail.trim(),
        options: { shouldCreateUser: false },
      });
      if (err) { setError(err.message); return; }
      setStep('otp');
    } catch (e: any) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 8) { setError('Please enter the 8-digit code.'); return; }
    setLoading(true);
    setError('');
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email: fpEmail.trim(),
        token: otp.trim(),
        type: 'email',
      });
      if (err) { setError('Invalid or expired code. Please try again.'); return; }
      setStep('password');
    } catch (e: any) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!newPw) { setError('Please enter a new password.'); return; }
    if (newPw.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (newPw !== confirmPw) { setError('Passwords do not match.'); return; }
    setLoading(true);
    setError('');
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPw });
      if (err) { setError(err.message); return; }
      await supabase.auth.signOut();
      setStep('done');
    } catch (e: any) {
      setError(e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={ms.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={ms.sheet}>
          <View style={ms.handle} />

          {/* STEP 1: Email */}
          {step === 'email' && (
            <>
              {/* Lock icon header */}
              <View style={ms.iconWrap}>
                <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={T.n0} strokeWidth={2}>
                  <Path d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z" />
                  <Path d="M7 11V7a5 5 0 0110 0v4" />
                </Svg>
              </View>
              <Text style={ms.title}>Forgot password?</Text>
              <Text style={ms.desc}>
                Enter your email and we'll send a{'\n'}6-digit verification code.
              </Text>

              <Text style={ms.fieldLbl}>EMAIL ADDRESS</Text>
              <View style={[ms.inp, !!error && ms.inpError]}>
                <TextInput
                  style={ms.inpText}
                  placeholder="your@email.com"
                  placeholderTextColor={T.n400}
                  value={fpEmail}
                  onChangeText={(v) => { setFpEmail(v); setError(''); }}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <MailIcon />
              </View>
              {!!error && <Text style={ms.errText}>● {error}</Text>}

              <TouchableOpacity
                style={[ms.btn, loading && { opacity: 0.7 }]}
                onPress={handleSendOtp}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator color={T.n0} /> : <Text style={ms.btnText}>Send verification code</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={ms.cancelWrap}>
                <Text style={ms.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {/* STEP 2: OTP */}
          {step === 'otp' && (
            <>
              <Text style={ms.title}>Enter Code</Text>
              <Text style={ms.desc}>
                We sent a code to{'\n'}
                <Text style={{ fontWeight: '700', color: T.n800 }}>{fpEmail.trim()}</Text>
                {'\n'}Check your inbox and spam folder.
              </Text>

              <Text style={ms.fieldLbl}>6-DIGIT CODE</Text>
              <View style={[ms.inp, !!error && ms.inpError]}>
                <TextInput
                  style={[ms.inpText, { letterSpacing: 10, fontSize: 20, fontWeight: '700', textAlign: 'center' }]}
                  placeholder="00000000"
                  placeholderTextColor={T.n200}
                  value={otp}
                  onChangeText={(v) => { setOtp(v.replace(/[^0-9]/g, '')); setError(''); }}
                  keyboardType="number-pad"
                  maxLength={8}
                  autoCorrect={false}
                />
              </View>
              {!!error && <Text style={ms.errText}>● {error}</Text>}

              <TouchableOpacity style={[ms.btn, loading && { opacity: 0.7 }]} onPress={handleVerifyOtp} disabled={loading} activeOpacity={0.85}>
                {loading ? <ActivityIndicator color={T.n0} /> : <Text style={ms.btnText}>Verify Code</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setStep('email'); setError(''); setOtp(''); }} style={ms.cancelWrap}>
                <Text style={ms.cancelText}>← Back</Text>
              </TouchableOpacity>
            </>
          )}

          {/* STEP 3: New Password */}
          {step === 'password' && (
            <>
              <Text style={ms.title}>New Password</Text>
              <Text style={ms.desc}>Choose a strong password for your account.</Text>

              <Text style={ms.fieldLbl}>NEW PASSWORD</Text>
              <View style={[ms.inp, !!error && ms.inpError]}>
                <TextInput
                  style={ms.inpText}
                  placeholder="At least 6 characters"
                  placeholderTextColor={T.n400}
                  value={newPw}
                  onChangeText={(v) => { setNewPw(v); setError(''); }}
                  secureTextEntry={!showNew}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowNew(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  {showNew ? <EyeOffIcon /> : <EyeIcon />}
                </TouchableOpacity>
              </View>

              {newPw.length > 0 && (
                <>
                  <View style={ms.strRow}>
                    {[1,2,3,4].map(i => (
                      <View key={i} style={[ms.strSeg, { backgroundColor: i <= strength.score ? strength.color : T.n100 }]} />
                    ))}
                  </View>
                  <Text style={[ms.strLabel, { color: strength.color }]}>{strength.label} — add numbers or symbols</Text>
                </>
              )}

              <Text style={[ms.fieldLbl, { marginTop: 12 }]}>CONFIRM PASSWORD</Text>
              <View style={[ms.inp, mismatch && ms.inpError, match && ms.inpSuccess]}>
                <TextInput
                  style={ms.inpText}
                  placeholder="Re-enter password"
                  placeholderTextColor={T.n400}
                  value={confirmPw}
                  onChangeText={(v) => { setConfirmPw(v); setError(''); }}
                  secureTextEntry={!showConfirm}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TouchableOpacity onPress={() => setShowConfirm(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  {showConfirm ? <EyeOffIcon /> : <EyeIcon />}
                </TouchableOpacity>
                {match && <Text style={{ fontSize: 14, marginLeft: 6, color: T.green }}>✓</Text>}
              </View>
              {mismatch && <Text style={ms.errText}>● Passwords do not match</Text>}
              {!!error && <Text style={ms.errText}>⚠ {error}</Text>}

              <TouchableOpacity
                style={[ms.btn, (loading || strength.score < 1) && { opacity: 0.45 }]}
                onPress={handleUpdatePassword}
                disabled={loading || strength.score < 1}
                activeOpacity={0.85}
              >
                {loading ? <ActivityIndicator color={T.n0} /> : <Text style={ms.btnText}>Update Password</Text>}
              </TouchableOpacity>
            </>
          )}

          {/* STEP 4: Done */}
          {step === 'done' && (
            <View style={ms.successWrap}>
              <View style={ms.successIconWrap}>
                <Text style={{ fontSize: 30 }}>✅</Text>
              </View>
              <Text style={ms.successTitle}>Password Updated!</Text>
              <Text style={ms.successDesc}>
                Your password has been changed successfully.{'\n'}Sign in with your new password.
              </Text>
              <TouchableOpacity style={ms.btn} onPress={onClose} activeOpacity={0.85}>
                <Text style={ms.btnText}>Back to Sign In</Text>
              </TouchableOpacity>
            </View>
          )}
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const ms = StyleSheet.create({
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: T.n0, borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 44 },
  handle:         { width: 36, height: 4, borderRadius: 2, backgroundColor: T.n100, alignSelf: 'center', marginBottom: 22 },
  iconWrap:       { width: 48, height: 48, borderRadius: 14, backgroundColor: T.blue, alignItems: 'center', justifyContent: 'center', marginBottom: 16, shadowColor: T.blue, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  title:          { fontSize: 20, fontWeight: '800', color: T.n900, letterSpacing: -0.4, marginBottom: 6 },
  desc:           { fontSize: 12, color: T.n500, lineHeight: 20, marginBottom: 22 },
  fieldLbl:       { fontSize: 10, fontWeight: '600', color: T.blue, letterSpacing: 0.8, marginBottom: 6 },
  inp:            { height: 46, flexDirection: 'row', alignItems: 'center', backgroundColor: T.n50, borderWidth: 1.5, borderColor: T.n100, borderRadius: 12, paddingHorizontal: 13, marginBottom: 8, justifyContent: 'space-between' },
  inpError:       { borderColor: T.red, backgroundColor: T.redLight },
  inpSuccess:     { borderColor: T.green, backgroundColor: T.greenLight },
  inpText:        { flex: 1, fontSize: 13, color: T.n800 },
  errText:        { fontSize: 11, color: T.red, fontWeight: '500', marginBottom: 8 },
  strRow:         { flexDirection: 'row', gap: 3, marginTop: 4, marginBottom: 4 },
  strSeg:         { flex: 1, height: 3, borderRadius: 2 },
  strLabel:       { fontSize: 10, color: T.n400, marginBottom: 6 },
  btn:            { height: 50, backgroundColor: T.blue, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 16, shadowColor: T.blue, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  btnText:        { color: T.n0, fontSize: 14, fontWeight: '600' },
  cancelWrap:     { alignItems: 'center', marginTop: 14 },
  cancelText:     { fontSize: 12, color: T.n500, fontWeight: '600' },
  successWrap:    { alignItems: 'center', paddingVertical: 12 },
  successIconWrap:{ width: 72, height: 72, borderRadius: 36, backgroundColor: T.n50, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  successTitle:   { fontSize: 22, fontWeight: '800', color: T.n900, marginBottom: 8 },
  successDesc:    { fontSize: 13, color: T.n500, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
});

// ─── Main Login Screen ────────────────────────────────────────────────────────
export default function LoginScreen() {
  const navigation = useNavigation();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused,  setPassFocused]  = useState(false);
  const [errors,   setErrors]   = useState<FieldErrors>({});
  const [forgotVisible, setForgotVisible] = useState(false);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 520, delay: 80, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, delay: 80, useNativeDriver: true }),
    ]).start();
  }, []);

  const btnScale = useRef(new Animated.Value(1)).current;
  const onPressIn  = () => Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true, tension: 200, friction: 10 }).start();
  const onPressOut = () => Animated.spring(btnScale, { toValue: 1,    useNativeDriver: true, tension: 200, friction: 10 }).start();

  const validate = (): boolean => {
    const errs: FieldErrors = {};
    if (!email.trim()) { errs.email = 'Email is required.'; }
    else if (!/\S+@\S+\.\S+/.test(email.trim())) { errs.email = 'Enter a valid email address.'; }
    if (!password) { errs.password = 'Password is required.'; }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        if (error.message.toLowerCase().includes('invalid login credentials')) {
          setErrors({ email: ' ', password: 'Incorrect email or password.' });
        } else {
          Alert.alert('Login Failed', error.message);
        }
      }
    } catch (e: any) {
      Alert.alert('Login Failed', e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={s.root}>
          <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

              {/* ── Blue Header ──────────────────────────────────────────────── */}
              <View style={s.header}>
                <BgDecor w={400} h={220} />
                {/* Logo */}
                <View style={s.logoOuter}>
                  <View style={s.logoInner}>
                    <CheckIcon size={28} color={T.blue} />
                  </View>
                </View>
                <Text style={s.appTitle}>AutoCheck</Text>
                <Text style={s.appSub}>Smart OCR grading for teachers</Text>
              </View>

              {/* ── White Card ───────────────────────────────────────────────── */}
              <View style={s.card}>

                {/* Email */}
                <Text style={s.lbl}>EMAIL</Text>
                <View style={[s.inp, emailFocused && !errors.email && s.inpActive, !!errors.email && s.inpError]}>
                  <TextInput
                    style={s.inpText}
                    placeholder="msantos@school.edu.ph"
                    placeholderTextColor={T.n400}
                    value={email}
                    onChangeText={(v) => { setEmail(v); setErrors(e => ({ ...e, email: undefined })); }}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                  />
                  {email.length > 0 && !errors.email && (
                    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={T.green} strokeWidth={2.5}>
                      <Path d="M20 6L9 17l-5-5" />
                    </Svg>
                  )}
                </View>
                {!!errors.email && errors.email.trim() !== '' && (
                  <Text style={s.errText}>● {errors.email}</Text>
                )}

                {/* Password */}
                <Text style={s.lbl}>PASSWORD</Text>
                <View style={[s.inp, passFocused && !errors.password && s.inpActive, !!errors.password && s.inpError]}>
                  <TextInput
                    style={[s.inpText, { flex: 1 }]}
                    placeholder="••••••••"
                    placeholderTextColor={T.n400}
                    value={password}
                    onChangeText={(v) => { setPassword(v); setErrors(e => ({ ...e, password: undefined })); }}
                    secureTextEntry={!showPass}
                    autoCorrect={false}
                    onFocus={() => setPassFocused(true)}
                    onBlur={() => setPassFocused(false)}
                  />
                  <TouchableOpacity onPress={() => setShowPass(!showPass)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    {showPass ? <EyeOffIcon /> : <EyeIcon />}
                  </TouchableOpacity>
                </View>
                {!!errors.password && (
                  <Text style={s.errText}>● {errors.password}</Text>
                )}

                {/* Forgot */}
                <TouchableOpacity style={s.forgotWrap} onPress={() => setForgotVisible(true)}>
                  <Text style={s.forgotText}>Forgot password?</Text>
                </TouchableOpacity>

                {/* Sign In Button */}
                <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onPress={handleLogin} disabled={loading}>
                  <Animated.View style={[s.btn, { transform: [{ scale: btnScale }] }]}>
                    {loading ? <ActivityIndicator color={T.n0} /> : <Text style={s.btnText}>Sign in</Text>}
                  </Animated.View>
                </Pressable>

                {/* Sign Up */}
                <TouchableOpacity style={s.linkRow} onPress={() => navigation.navigate('Register' as never)}>
                  <Text style={s.linkText}>Don't have an account? <Text style={s.linkBold}>Sign up free</Text></Text>
                </TouchableOpacity>

              </View>
            </Animated.View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>

      <ForgotPasswordModal
        visible={forgotVisible}
        onClose={() => setForgotVisible(false)}
        prefillEmail={email}
      />
    </>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: T.blue },
  scroll:     { flexGrow: 1, justifyContent: 'flex-end' },

  // Header
  header:     { paddingTop: 52, paddingBottom: 32, alignItems: 'center', position: 'relative', overflow: 'hidden' },
  logoOuter:  { width: 72, height: 72, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  logoInner:  { width: 54, height: 54, borderRadius: 14, backgroundColor: T.n0, alignItems: 'center', justifyContent: 'center' },
  appTitle:   { fontSize: 22, fontWeight: '700', color: T.n0, marginBottom: 3 },
  appSub:     { fontSize: 11, color: 'rgba(255,255,255,0.55)' },

  // Card
  card:       { backgroundColor: T.n0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 22, paddingTop: 28, paddingBottom: 40 },
  lbl:        { fontSize: 10, fontWeight: '600', color: T.blue, letterSpacing: 0.8, marginBottom: 6 },
  inp:        { height: 46, flexDirection: 'row', alignItems: 'center', backgroundColor: T.n50, borderWidth: 1.5, borderColor: T.n100, borderRadius: 12, paddingHorizontal: 13, marginBottom: 13, justifyContent: 'space-between' },
  inpActive:  { borderColor: T.blue },
  inpError:   { borderColor: T.red, backgroundColor: T.redLight },
  inpText:    { flex: 1, fontSize: 13, color: T.n800 },
  errText:    { fontSize: 11, color: T.red, fontWeight: '500', marginTop: -8, marginBottom: 10 },
  forgotWrap: { alignItems: 'flex-end', marginTop: -4, marginBottom: 20 },
  forgotText: { fontSize: 12, color: T.blue, fontWeight: '600' },
  btn:        { height: 50, backgroundColor: T.blue, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 18, shadowColor: T.blue, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  btnText:    { color: T.n0, fontSize: 14, fontWeight: '600' },
  linkRow:    { alignItems: 'center' },
  linkText:   { fontSize: 12, color: T.n500 },
  linkBold:   { color: T.blue, fontWeight: '600' },
});