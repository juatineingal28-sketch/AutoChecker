// screens/LoginScreen.tsx
// ─── Forgot Password uses OTP code (no deep links needed) ─────────────────────
// Flow: Enter email → get 6-digit OTP → enter OTP → enter new password → done

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
import { useAuth } from '../context/AuthContext';

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  blue:        '#3B6EF8',
  blueDark:    '#1A4FD8',
  blueMid:     '#2B5CE6',
  blueLight:   '#EEF3FF',
  red:         '#E53E3E',
  redLight:    '#FFF5F5',
  green:       '#10B981',
  greenLight:  '#F0FDF9',
  n0:          '#FFFFFF',
  n50:         '#F8FAFF',
  n100:        '#EDF1FA',
  n200:        '#D6DFFA',
  n400:        '#A0AEC0',
  n500:        '#718096',
  n600:        '#4A5568',
  n800:        '#1A202C',
  n900:        '#0D1117',
  rMd:         14,
  rLg:         18,
  rXl:         24,
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

// ─── Icons ─────────────────────────────────────────────────────────────────────
// Logo icon — blue checkmark on white box, matches SplashScreen
const CheckIcon = ({ size = 32, color = T.blue }: { size?: number; color?: string }) => (
  <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <Path d="M7 21L17 31L33 11" stroke={color} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const EyeIcon = ({ color = T.n400 }: { color?: string }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
    <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <Circle cx={12} cy={12} r={3} />
  </Svg>
);

const EyeOffIcon = ({ color = T.n400 }: { color?: string }) => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
    <Path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
    <Path d="M1 1l22 22" />
  </Svg>
);

const MailIcon = ({ color = T.n400 }: { color?: string }) => (
  <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
    <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <Path d="M22 6l-10 7L2 6" />
  </Svg>
);

const LockIcon = ({ color = T.n400 }: { color?: string }) => (
  <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
    <Path d="M19 11H5a2 2 0 00-2 2v7a2 2 0 002 2h14a2 2 0 002-2v-7a2 2 0 00-2-2z" />
    <Path d="M7 11V7a5 5 0 0110 0v4" />
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
  const { setRecoveryMode } = useAuth();
  const [step, setStep]               = useState<FPStep>('email');
  const [fpEmail, setFpEmail]         = useState(prefillEmail);
  const [otp, setOtp]                 = useState('');
  const [newPw, setNewPw]             = useState('');
  const [confirmPw, setConfirmPw]     = useState('');
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

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
    setLoading(true); setError('');
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
    if (otp.length !== 6) { setError('Please enter the 6-digit code.'); return; }
    setLoading(true); setError('');
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email: fpEmail.trim(), token: otp.trim(), type: 'email',
      });
      if (err) { setError('Invalid or expired code. Please try again.'); return; }
      setRecoveryMode(true);
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
    setLoading(true); setError('');
    try {
      // Check session is still alive before attempting update
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Your session has expired. Please request a new code.');
        setRecoveryMode(false);
        setStep('email');
        return;
      }

      const { error: err } = await supabase.auth.updateUser({ password: newPw });
      if (err) { setError(err.message); return; }

      // Show success immediately — don't wait for signOut
      setRecoveryMode(false);
      setStep('done');

      // signOut in background after UI already moved on
      supabase.auth.signOut().catch(() => {});
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={ms.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={ms.sheet}>
          <View style={ms.handle} />

          {step === 'email' && (
            <>
              <View style={ms.iconWrap}>
                <LockIcon color={T.n0} />
              </View>
              <Text style={ms.title}>Forgot password?</Text>
              <Text style={ms.desc}>Enter your email and we'll send a{'\n'}verification code to reset it.</Text>
              <Text style={ms.fieldLbl}>EMAIL ADDRESS</Text>
              <View style={[ms.inp, !!error && ms.inpError]}>
                <View style={ms.inpIcon}><MailIcon color={!!error ? T.red : T.n400} /></View>
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
              </View>
              {!!error && <Text style={ms.errText}>⚠ {error}</Text>}
              <TouchableOpacity style={[ms.btn, loading && { opacity: 0.7 }]} onPress={handleSendOtp} disabled={loading} activeOpacity={0.85}>
                {loading ? <ActivityIndicator color={T.n0} /> : <Text style={ms.btnText}>Send verification code</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={ms.cancelWrap}>
                <Text style={ms.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'otp' && (
            <>
              <Text style={ms.title}>Check your inbox</Text>
              <Text style={ms.desc}>
                We sent a code to{'\n'}
                <Text style={{ fontWeight: '700', color: T.n800 }}>{fpEmail.trim()}</Text>
              </Text>
              <Text style={ms.fieldLbl}>VERIFICATION CODE</Text>
              <View style={[ms.inp, !!error && ms.inpError]}>
                <TextInput
                  style={[ms.inpText, { letterSpacing: 12, fontSize: 22, fontWeight: '700', textAlign: 'center' }]}
                  placeholder="· · · · · ·"
                  placeholderTextColor={T.n200}
                  value={otp}
                  onChangeText={(v) => { setOtp(v.replace(/[^0-9]/g, '')); setError(''); }}
                  keyboardType="number-pad"
                  maxLength={6}
                  autoCorrect={false}
                />
              </View>
              {!!error && <Text style={ms.errText}>⚠ {error}</Text>}
              <TouchableOpacity style={[ms.btn, loading && { opacity: 0.7 }]} onPress={handleVerifyOtp} disabled={loading} activeOpacity={0.85}>
                {loading ? <ActivityIndicator color={T.n0} /> : <Text style={ms.btnText}>Verify Code</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setStep('email'); setError(''); setOtp(''); }} style={ms.cancelWrap}>
                <Text style={ms.cancelText}>← Back</Text>
              </TouchableOpacity>
            </>
          )}

          {step === 'password' && (
            <>
              <Text style={ms.title}>New Password</Text>
              <Text style={ms.desc}>Choose a strong password for your account.</Text>
              <Text style={ms.fieldLbl}>NEW PASSWORD</Text>
              <View style={[ms.inp, !!error && ms.inpError]}>
                <View style={ms.inpIcon}><LockIcon color={T.n400} /></View>
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
                  <Text style={[ms.strLabel, { color: strength.color }]}>{strength.label}</Text>
                </>
              )}
              <Text style={[ms.fieldLbl, { marginTop: 12 }]}>CONFIRM PASSWORD</Text>
              <View style={[ms.inp, mismatch && ms.inpError, match && ms.inpSuccess]}>
                <View style={ms.inpIcon}><LockIcon color={match ? T.green : mismatch ? T.red : T.n400} /></View>
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
                {match && <Text style={{ fontSize: 15, marginLeft: 6, color: T.green }}>✓</Text>}
              </View>
              {mismatch && <Text style={ms.errText}>⚠ Passwords do not match</Text>}
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

          {step === 'done' && (
            <View style={ms.successWrap}>
              <View style={ms.successIconWrap}>
                <Text style={{ fontSize: 34 }}>✅</Text>
              </View>
              <Text style={ms.successTitle}>Password Updated!</Text>
              <Text style={ms.successDesc}>
                Your password has been changed successfully.{'\n'}Sign in with your new password.
              </Text>
              <TouchableOpacity style={ms.btn} onPress={() => { setRecoveryMode(false); onClose(); }} activeOpacity={0.85}>
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
  overlay:        { flex: 1, backgroundColor: 'rgba(10,20,50,0.5)', justifyContent: 'flex-end' },
  sheet:          { backgroundColor: T.n0, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 48 },
  handle:         { width: 40, height: 4, borderRadius: 2, backgroundColor: T.n100, alignSelf: 'center', marginBottom: 24 },
  iconWrap:       { width: 52, height: 52, borderRadius: 16, backgroundColor: T.blue, alignItems: 'center', justifyContent: 'center', marginBottom: 18, shadowColor: T.blue, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12, elevation: 8 },
  title:          { fontSize: 22, fontWeight: '800', color: T.n900, letterSpacing: -0.5, marginBottom: 6 },
  desc:           { fontSize: 13, color: T.n500, lineHeight: 21, marginBottom: 24 },
  fieldLbl:       { fontSize: 10, fontWeight: '700', color: T.blue, letterSpacing: 1, marginBottom: 7 },
  inp:            { height: 52, flexDirection: 'row', alignItems: 'center', backgroundColor: T.n50, borderWidth: 1.5, borderColor: T.n100, borderRadius: T.rMd, paddingHorizontal: 14, marginBottom: 10 },
  inpIcon:        { marginRight: 10 },
  inpError:       { borderColor: T.red, backgroundColor: T.redLight },
  inpSuccess:     { borderColor: T.green, backgroundColor: T.greenLight },
  inpText:        { flex: 1, fontSize: 14, color: T.n800 },
  errText:        { fontSize: 12, color: T.red, fontWeight: '500', marginBottom: 10 },
  strRow:         { flexDirection: 'row', gap: 4, marginTop: 6, marginBottom: 4 },
  strSeg:         { flex: 1, height: 3.5, borderRadius: 2 },
  strLabel:       { fontSize: 11, color: T.n400, marginBottom: 6, fontWeight: '600' },
  btn:            { height: 54, backgroundColor: T.blue, borderRadius: T.rLg, alignItems: 'center', justifyContent: 'center', marginTop: 16, shadowColor: T.blue, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 14, elevation: 8 },
  btnText:        { color: T.n0, fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },
  cancelWrap:     { alignItems: 'center', marginTop: 16 },
  cancelText:     { fontSize: 13, color: T.n500, fontWeight: '600' },
  successWrap:    { alignItems: 'center', paddingVertical: 12 },
  successIconWrap:{ width: 80, height: 80, borderRadius: 40, backgroundColor: T.greenLight, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  successTitle:   { fontSize: 24, fontWeight: '800', color: T.n900, marginBottom: 10 },
  successDesc:    { fontSize: 14, color: T.n500, textAlign: 'center', lineHeight: 22, marginBottom: 28 },
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
  const slideAnim = useRef(new Animated.Value(36)).current;
  const logoScale = useRef(new Animated.Value(0.75)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, delay: 60, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 55, friction: 9, delay: 60, useNativeDriver: true }),
      Animated.spring(logoScale, { toValue: 1, tension: 70, friction: 8, delay: 120, useNativeDriver: true }),
    ]).start();
  }, []);

  const btnScale = useRef(new Animated.Value(1)).current;
  const onPressIn  = () => Animated.spring(btnScale, { toValue: 0.96, useNativeDriver: true, tension: 220, friction: 10 }).start();
  const onPressOut = () => Animated.spring(btnScale, { toValue: 1,    useNativeDriver: true, tension: 220, friction: 10 }).start();

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
          <ScrollView
            contentContainerStyle={s.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View style={[s.screenWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

              {/* ── Unified Header ─────────────────────────────────────────── */}
              <View style={s.header}>
                {/* Logo — white box + blue check, consistent with SplashScreen */}
                <Animated.View style={[s.logoWrap, { transform: [{ scale: logoScale }] }]}>
                  <View style={s.logoRingOuter} />
                  <View style={s.logoRingInner} />
                  <View style={s.logoBox}>
                    <CheckIcon size={32} color={T.blue} />
                  </View>
                </Animated.View>
                <Text style={s.appTitle}>AutoCheck</Text>
                <Text style={s.appSub}>Smart OCR grading for teachers</Text>
              </View>

              {/* ── Form Card (overlaps header) ───────────────────────────── */}
              <View style={s.card}>

                <Text style={s.cardHeading}>Welcome back</Text>
                <Text style={s.cardSub}>Sign in to continue grading smarter</Text>

                {/* Email */}
                <Text style={s.lbl}>EMAIL</Text>
                <View style={[s.inp, emailFocused && !errors.email && s.inpActive, !!errors.email && s.inpError]}>
                  <View style={s.inpIcon}>
                    <MailIcon color={!!errors.email ? T.red : emailFocused ? T.blue : T.n400} />
                  </View>
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
                </View>
                {!!errors.email && errors.email.trim() !== '' && (
                  <Text style={s.errText}>⚠ {errors.email}</Text>
                )}

                {/* Password */}
                <Text style={s.lbl}>PASSWORD</Text>
                <View style={[s.inp, passFocused && !errors.password && s.inpActive, !!errors.password && s.inpError]}>
                  <View style={s.inpIcon}>
                    <LockIcon color={!!errors.password ? T.red : passFocused ? T.blue : T.n400} />
                  </View>
                  <TextInput
                    style={[s.inpText, { flex: 1 }]}
                    placeholder="Enter your password"
                    placeholderTextColor={T.n400}
                    value={password}
                    onChangeText={(v) => { setPassword(v); setErrors(e => ({ ...e, password: undefined })); }}
                    secureTextEntry={!showPass}
                    autoCorrect={false}
                    onFocus={() => setPassFocused(true)}
                    onBlur={() => setPassFocused(false)}
                  />
                  <TouchableOpacity onPress={() => setShowPass(!showPass)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    {showPass ? <EyeOffIcon /> : <EyeIcon />}
                  </TouchableOpacity>
                </View>
                {!!errors.password && (
                  <Text style={s.errText}>⚠ {errors.password}</Text>
                )}

                {/* Forgot */}
                <TouchableOpacity style={s.forgotWrap} onPress={() => setForgotVisible(true)}>
                  <Text style={s.forgotText}>Forgot password?</Text>
                </TouchableOpacity>

                {/* Sign In Button */}
                <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onPress={handleLogin} disabled={loading}>
                  <Animated.View style={[s.btn, { transform: [{ scale: btnScale }] }]}>
                    {loading
                      ? <ActivityIndicator color={T.n0} />
                      : <Text style={s.btnText}>Sign In</Text>
                    }
                  </Animated.View>
                </Pressable>

                {/* Divider */}
                <View style={s.dividerRow}>
                  <View style={s.dividerLine} />
                  <Text style={s.dividerText}>New here?</Text>
                  <View style={s.dividerLine} />
                </View>

                {/* Sign Up (outlined) */}
                <TouchableOpacity style={s.signUpBtn} onPress={() => navigation.navigate('Register' as never)}>
                  <Text style={s.signUpText}>Create a free account</Text>
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
  // ── Root & Layout ──
  root:       { flex: 1, backgroundColor: T.n50 },
  scroll:     { flexGrow: 1 },
  screenWrap: { flex: 1, minHeight: '100%' },

  // ── Unified Header ──
  header: {
    backgroundColor: T.blue,
    paddingTop: 48,
    paddingBottom: 48,
    alignItems: 'center',
    paddingHorizontal: 24,
  },

  // Logo — matches SplashScreen: white box + blue check + two outer rings
  logoWrap: {
    width: 100,
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoRingOuter: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  logoRingInner: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 24,
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.13)',
  },
  logoBox: {
    width: 70,
    height: 70,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(0,0,0,0.25)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 10,
  },
  logoInner: { width: 0, height: 0 },

  appTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: T.n0,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  appSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 0.1,
  },

  // ── Card (overlaps header) ──
  card: {
    backgroundColor: T.n0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -20,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 48,
    flex: 1,
    // Subtle shadow instead of heavy elevation
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 5,
  },
  cardHeading: {
    fontSize: 22,
    fontWeight: '700',
    color: T.n900,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  cardSub: {
    fontSize: 13,
    color: T.n400,
    marginBottom: 28,
  },

  // ── Field Labels ──
  lbl: {
    fontSize: 10,
    fontWeight: '700',
    color: T.n600,
    letterSpacing: 1.0,
    marginBottom: 6,
  },

  // ── Inputs ──
  inp: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.n50,
    borderWidth: 1.5,
    borderColor: T.n100,
    borderRadius: T.rMd,
    paddingHorizontal: 14,
    marginBottom: 16,
  },
  inpIcon:   { marginRight: 10 },
  inpActive: { borderColor: T.blue, backgroundColor: '#F4F7FF' },
  inpError:  { borderColor: T.red,  backgroundColor: T.redLight },
  inpText:   { flex: 1, fontSize: 14, color: T.n800 },
  errText:   { fontSize: 12, color: T.red, fontWeight: '500', marginTop: -10, marginBottom: 14 },

  // ── Forgot ──
  forgotWrap: { alignItems: 'flex-end', marginTop: -8, marginBottom: 24 },
  forgotText: { fontSize: 13, color: T.blue, fontWeight: '600' },

  // ── Sign In Button ──
  btn: {
    height: 52,
    backgroundColor: T.blue,
    borderRadius: T.rMd,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    // Softer shadow
    shadowColor: T.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 5,
  },
  btnText: { color: T.n0, fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },

  // ── Divider ──
  dividerRow:  { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dividerLine: { flex: 1, height: 1, backgroundColor: T.n100 },
  dividerText: { fontSize: 12, color: T.n400, marginHorizontal: 12, fontWeight: '500' },

  // ── Create Account (outlined secondary) ──
  signUpBtn: {
    height: 50,
    borderRadius: T.rMd,
    borderWidth: 1.5,
    borderColor: T.n200,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  signUpText: { fontSize: 14, color: T.n600, fontWeight: '600' },
});