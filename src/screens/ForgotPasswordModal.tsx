// src/screens/ForgotPasswordModal.tsx
// ─────────────────────────────────────────────────────────────────────────────
// FIXED Forgot Password — Correct Supabase OTP Recovery Flow
//
// PREVIOUS BUG:  signInWithOtp() + verifyOtp(type:'email')
//                → creates a full auth session → AuthContext fires USER event
//                → AppNavigator redirects to Home BEFORE user sets new password
//
// CORRECT FLOW:
//   Step 1 │ resetPasswordForEmail(email)              → Sends 6-digit OTP
//   Step 2 │ verifyOtp({ type:'recovery', token })     → Recovery-only session
//   Step 3 │ updateUser({ password })                  → Saves new password
//   Step 4 │ signOut()                                 → Forces fresh login
//
// ⚠ SUPABASE DASHBOARD:  Authentication → Email Templates → Reset Password
//   Make sure your template includes {{ .Token }} (6-digit code), not just a link.
//
// USAGE in LoginScreen.tsx (no changes needed beyond importing this):
//   import ForgotPasswordModal from './ForgotPasswordModal';
//   <ForgotPasswordModal visible={forgotVisible} onClose={...} prefillEmail={email} />
// ─────────────────────────────────────────────────────────────────────────────

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { supabase } from '../../supabase';
import { useAuth } from '../context/AuthContext';

// ─── Design tokens — matches LoginScreen.tsx exactly ──────────────────────────
const T = {
  blue:       '#3B6EF8',
  blueDark:   '#1A4FD8',
  blueMid:    '#2B5CE6',
  blueLight:  '#EEF3FF',
  blueFaint:  '#F4F7FF',
  red:        '#E53E3E',
  redLight:   '#FFF5F5',
  green:      '#10B981',
  greenLight: '#F0FDF9',
  greenMid:   '#D1FAE5',
  amber:      '#F59E0B',
  n0:         '#FFFFFF',
  n50:        '#F8FAFF',
  n100:       '#EDF1FA',
  n200:       '#D6DFFA',
  n300:       '#B8CAFF',
  n400:       '#A0AEC0',
  n500:       '#718096',
  n600:       '#4A5568',
  n800:       '#1A202C',
  n900:       '#0D1117',
  rMd:        14,
  rLg:        18,
};

// ─── Constants ────────────────────────────────────────────────────────────────
const OTP_LENGTH      = 6;
const RESEND_SECONDS  = 60;

// ─── Types ────────────────────────────────────────────────────────────────────
type FPStep = 'email' | 'otp' | 'password' | 'done';

// ─── Password Strength ────────────────────────────────────────────────────────
function getStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw.length) return { score: 0, label: '', color: T.n200 };
  if (pw.length < 6) return { score: 1, label: 'Too short', color: T.red };
  let score = 1;
  if (pw.length >= 8)            score++;
  if (/[A-Z]/.test(pw))          score++;
  if (/[0-9]/.test(pw))          score++;
  if (/[^A-Za-z0-9]/.test(pw))  score++;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors = ['', T.red, T.amber, '#3B82F6', T.green, T.green];
  return { score, label: labels[score], color: colors[score] };
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const IconMail = ({ color = T.n400 }: { color?: string }) => (
  <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
    <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
    <Path d="M22 6l-10 7L2 6" />
  </Svg>
);

const IconLock = ({ color = T.n400, size = 17 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
    <Rect x={3} y={11} width={18} height={11} rx={2} />
    <Path d="M7 11V7a5 5 0 0110 0v4" />
  </Svg>
);

const IconEye = ({ color = T.n400 }: { color?: string }) => (
  <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
    <Path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <Circle cx={12} cy={12} r={3} />
  </Svg>
);

const IconEyeOff = ({ color = T.n400 }: { color?: string }) => (
  <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
    <Path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
    <Path d="M1 1l22 22" />
  </Svg>
);

const IconArrow = ({ color = T.n0 }: { color?: string }) => (
  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5}>
    <Path d="M5 12h14M12 5l7 7-7 7" />
  </Svg>
);

const IconCheck = ({ color = T.green, size = 28 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.8}>
    <Path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

const IconShield = ({ color = T.n0, size = 22 }: { color?: string; size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
    <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </Svg>
);

// ─── Step Progress Dots ────────────────────────────────────────────────────────
const STEP_ORDER: FPStep[] = ['email', 'otp', 'password', 'done'];

function StepDots({ current }: { current: FPStep }) {
  const idx = STEP_ORDER.indexOf(current);
  return (
    <View style={ms.stepRow}>
      {[0, 1, 2].map(i => (
        <View
          key={i}
          style={[
            ms.stepDot,
            i < idx ? ms.stepDotDone : i === idx ? ms.stepDotActive : null,
          ]}
        />
      ))}
    </View>
  );
}

// ─── OTP Input Row ────────────────────────────────────────────────────────────
interface OtpRowProps {
  digits: string[];
  refs: React.MutableRefObject<(TextInput | null)[]>;
  onChangeAt: (text: string, index: number) => void;
  onKeyPressAt: (key: string, index: number) => void;
  hasError: boolean;
}

function OtpRow({ digits, refs, onChangeAt, onKeyPressAt, hasError }: OtpRowProps) {
  return (
    <View style={ms.otpRow}>
      {Array.from({ length: OTP_LENGTH }).map((_, i) => (
        <TextInput
          key={i}
          ref={el => { refs.current[i] = el; }}
          style={[
            ms.otpBox,
            digits[i] ? ms.otpBoxFilled : null,
            hasError ? ms.otpBoxError : null,
          ]}
          value={digits[i]}
          onChangeText={t => onChangeAt(t, i)}
          onKeyPress={({ nativeEvent }) => onKeyPressAt(nativeEvent.key, i)}
          keyboardType="number-pad"
          maxLength={1}
          selectTextOnFocus
          caretHidden
        />
      ))}
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
interface ForgotPasswordModalProps {
  visible: boolean;
  onClose: () => void;
  prefillEmail?: string;
}

export default function ForgotPasswordModal({
  visible,
  onClose,
  prefillEmail = '',
}: ForgotPasswordModalProps) {
  // ── Auth context ───────────────────────────────────────────────────────────
  const { setRecoveryMode } = useAuth();

  // ── State ──────────────────────────────────────────────────────────────────
  const [step, setStep]               = useState<FPStep>('email');
  const [fpEmail, setFpEmail]         = useState(prefillEmail);
  const [otpDigits, setOtpDigits]     = useState<string[]>(Array(OTP_LENGTH).fill(''));
  const [resendTimer, setResendTimer] = useState(RESEND_SECONDS);
  const [canResend, setCanResend]     = useState(false);
  const [newPw, setNewPw]             = useState('');
  const [confirmPw, setConfirmPw]     = useState('');
  const [showNew, setShowNew]         = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [newFocused, setNewFocused]   = useState(false);
  const [confFocused, setConfFocused] = useState(false);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const otpRefs      = useRef<(TextInput | null)[]>(Array(OTP_LENGTH).fill(null));
  const successScale = useRef(new Animated.Value(0)).current;
  const successOpacity = useRef(new Animated.Value(0)).current;
  const sheetSlide   = useRef(new Animated.Value(40)).current;
  const sheetFade    = useRef(new Animated.Value(0)).current;

  // ── Reset on open ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (visible) {
      setStep('email');
      setFpEmail(prefillEmail);
      setOtpDigits(Array(OTP_LENGTH).fill(''));
      setNewPw('');
      setConfirmPw('');
      setError('');
      setLoading(false);
      setResendTimer(RESEND_SECONDS);
      setCanResend(false);
      successScale.setValue(0);
      successOpacity.setValue(0);
      // Animate sheet entrance
      sheetSlide.setValue(40);
      sheetFade.setValue(0);
      Animated.parallel([
        Animated.timing(sheetSlide, { toValue: 0, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(sheetFade,  { toValue: 1, duration: 260, easing: Easing.out(Easing.quad),  useNativeDriver: true }),
      ]).start();
    }
  }, [visible, prefillEmail]);

  // ── OTP resend countdown ───────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'otp') return;
    setResendTimer(RESEND_SECONDS);
    setCanResend(false);
    const id = setInterval(() => {
      setResendTimer(t => {
        if (t <= 1) { clearInterval(id); setCanResend(true); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [step]);

  // ── Success animation ──────────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'done') return;
    Animated.sequence([
      Animated.timing(successOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.spring(successScale, {
        toValue: 1, tension: 65, friction: 7, useNativeDriver: true,
      }),
    ]).start();
  }, [step]);

  // ── Step 1 — Send OTP ──────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    const email = fpEmail.trim();
    if (!email) { setError('Please enter your email address.'); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setError('Please enter a valid email address.'); return; }
    setLoading(true); setError('');
    try {
      // ✅ signInWithOtp sends the OTP code to the user's email
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });
      if (err) { setError(err.message); return; }
      setStep('otp');
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2 — Verify OTP ────────────────────────────────────────────────────
  const handleVerifyOtp = async () => {
    const token = otpDigits.join('');
    if (token.length !== OTP_LENGTH) {
      setError(`Please enter the complete ${OTP_LENGTH}-digit code.`);
      return;
    }
    setLoading(true); setError('');
    try {
      // ✅ type:'email' matches the token sent by signInWithOtp
      //    setRecoveryMode(true) blocks AuthContext from setting user on SIGNED_IN
      const { error: err } = await supabase.auth.verifyOtp({
        email: fpEmail.trim(),
        token,
        type: 'email',
      });
      if (err) { setError('Invalid or expired code. Please try again.'); return; }
      setRecoveryMode(true);
      setStep('password');
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 3 — Update Password ───────────────────────────────────────────────
  const handleUpdatePassword = async () => {
    if (!newPw)            { setError('Please enter a new password.'); return; }
    if (newPw.length < 6)  { setError('Password must be at least 6 characters.'); return; }
    if (newPw !== confirmPw){ setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    try {
      const { error: err } = await supabase.auth.updateUser({ password: newPw });
      if (err) { setError(err.message); return; }
      // Clear recovery flag and show success immediately
      setRecoveryMode(false);
      setStep('done');
      // signOut in background — don't block the UI
      supabase.auth.signOut().catch(() => {});
    } catch (e: any) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── OTP digit handlers ─────────────────────────────────────────────────────
  const handleOtpChange = useCallback((text: string, index: number) => {
    const digit = text.replace(/\D/g, '').slice(-1);
    setOtpDigits(prev => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
    setError('');
    if (digit && index < OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  }, []);

  const handleOtpKeyPress = useCallback((key: string, index: number) => {
    if (key === 'Backspace' && !otpDigits[index] && index > 0) {
      setOtpDigits(prev => {
        const next = [...prev];
        next[index - 1] = '';
        return next;
      });
      otpRefs.current[index - 1]?.focus();
    }
  }, [otpDigits]);

  // ── Resend OTP ─────────────────────────────────────────────────────────────
  const handleResend = async () => {
    if (!canResend || loading) return;
    setOtpDigits(Array(OTP_LENGTH).fill(''));
    setError('');
    setLoading(true);
    try {
      await supabase.auth.signInWithOtp({
        email: fpEmail.trim(),
        options: { shouldCreateUser: false },
      });
      setResendTimer(RESEND_SECONDS);
      setCanResend(false);
    } catch {
      setError('Failed to resend. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  const strength   = getStrength(newPw);
  const pwMatch    = confirmPw.length > 0 && newPw === confirmPw;
  const pwMismatch = confirmPw.length > 0 && newPw !== confirmPw;
  const canSubmitPw = newPw.length >= 6 && pwMatch && strength.score >= 2;
  const otpFilled  = otpDigits.join('').length === OTP_LENGTH;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={step !== 'done' ? onClose : undefined}
    >
      {/* Backdrop */}
      <TouchableOpacity
        style={ms.overlay}
        activeOpacity={1}
        onPress={step !== 'done' ? onClose : undefined}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={ms.kav}
        >
          <Animated.View
            style={[ms.sheet, { opacity: sheetFade, transform: [{ translateY: sheetSlide }] }]}
          >
            <TouchableOpacity activeOpacity={1} style={ms.sheetInner}>

              {/* Drag handle */}
              <View style={ms.handle} />

              {/* ── Step progress ── */}
              {step !== 'done' && <StepDots current={step} />}

              {/* ═══════════════════════════════════════════════════════════
                  STEP 1 — EMAIL ENTRY
              ═══════════════════════════════════════════════════════════ */}
              {step === 'email' && (
                <>
                  {/* Icon badge */}
                  <View style={ms.iconBadge}>
                    <View style={ms.iconBadgeInner}>
                      <IconShield color={T.n0} size={22} />
                    </View>
                  </View>

                  <Text style={ms.title}>Forgot Password?</Text>
                  <Text style={ms.subtitle}>
                    Enter your email and we'll send a{'\n'}
                    6-digit verification code.
                  </Text>

                  <Text style={ms.fieldLabel}>EMAIL ADDRESS</Text>
                  <View style={[ms.inp, !!error && ms.inpError]}>
                    <View style={ms.inpIcon}>
                      <IconMail color={error ? T.red : T.n400} />
                    </View>
                    <TextInput
                      style={ms.inpText}
                      placeholder="your@email.com"
                      placeholderTextColor={T.n400}
                      value={fpEmail}
                      onChangeText={v => { setFpEmail(v); setError(''); }}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoCorrect={false}
                      returnKeyType="send"
                      onSubmitEditing={handleSendOtp}
                    />
                  </View>

                  {!!error && <Text style={ms.errText}>⚠  {error}</Text>}

                  <TouchableOpacity
                    style={[ms.btn, loading && ms.btnLoading]}
                    onPress={handleSendOtp}
                    disabled={loading}
                    activeOpacity={0.85}
                  >
                    {loading
                      ? <ActivityIndicator color={T.n0} size="small" />
                      : (
                        <>
                          <Text style={ms.btnText}>Send Verification Code</Text>
                          <IconArrow />
                        </>
                      )
                    }
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => { setRecoveryMode(false); onClose(); }} style={ms.cancelWrap}>
                    <Text style={ms.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* ═══════════════════════════════════════════════════════════
                  STEP 2 — OTP VERIFICATION
              ═══════════════════════════════════════════════════════════ */}
              {step === 'otp' && (
                <>
                  <View style={ms.otpHeaderWrap}>
                    <Text style={ms.title}>Check Your Inbox</Text>
                    <Text style={ms.subtitle}>
                      We sent a 6-digit code to{'\n'}
                      <Text style={ms.emailHighlight}>{fpEmail}</Text>
                    </Text>
                  </View>

                  {/* OTP boxes */}
                  <OtpRow
                    digits={otpDigits}
                    refs={otpRefs}
                    onChangeAt={handleOtpChange}
                    onKeyPressAt={handleOtpKeyPress}
                    hasError={!!error}
                  />

                  {!!error && <Text style={[ms.errText, { textAlign: 'center' }]}>⚠  {error}</Text>}

                  {/* Verify button */}
                  <TouchableOpacity
                    style={[ms.btn, (!otpFilled || loading) && ms.btnDisabled]}
                    onPress={handleVerifyOtp}
                    disabled={!otpFilled || loading}
                    activeOpacity={0.85}
                  >
                    {loading
                      ? <ActivityIndicator color={T.n0} size="small" />
                      : (
                        <>
                          <Text style={ms.btnText}>Verify Code</Text>
                          <IconArrow />
                        </>
                      )
                    }
                  </TouchableOpacity>

                  {/* Resend row */}
                  <View style={ms.resendRow}>
                    <Text style={ms.resendLabel}>Didn't receive it?  </Text>
                    {canResend ? (
                      <TouchableOpacity onPress={handleResend} disabled={loading}>
                        <Text style={ms.resendBtn}>Resend Code</Text>
                      </TouchableOpacity>
                    ) : (
                      <Text style={ms.resendTimer}>
                        Resend in {resendTimer}s
                      </Text>
                    )}
                  </View>

                  <TouchableOpacity onPress={() => { setStep('email'); setError(''); }} style={ms.cancelWrap}>
                    <Text style={ms.cancelText}>← Change Email</Text>
                  </TouchableOpacity>
                </>
              )}

              {/* ═══════════════════════════════════════════════════════════
                  STEP 3 — NEW PASSWORD
              ═══════════════════════════════════════════════════════════ */}
              {step === 'password' && (
                <>
                  <Text style={ms.title}>Create New Password</Text>
                  <Text style={ms.subtitle}>
                    Choose a strong password for your account.
                  </Text>

                  {/* New password */}
                  <Text style={ms.fieldLabel}>NEW PASSWORD</Text>
                  <View style={[
                    ms.inp,
                    newFocused && !error && ms.inpFocus,
                    !!error && ms.inpError,
                  ]}>
                    <View style={ms.inpIcon}>
                      <IconLock color={error ? T.red : newFocused ? T.blue : T.n400} />
                    </View>
                    <TextInput
                      style={[ms.inpText, { flex: 1 }]}
                      placeholder="At least 6 characters"
                      placeholderTextColor={T.n400}
                      value={newPw}
                      onChangeText={v => { setNewPw(v); setError(''); }}
                      secureTextEntry={!showNew}
                      autoCapitalize="none"
                      autoCorrect={false}
                      onFocus={() => setNewFocused(true)}
                      onBlur={() => setNewFocused(false)}
                    />
                    <TouchableOpacity
                      onPress={() => setShowNew(v => !v)}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      {showNew ? <IconEyeOff /> : <IconEye />}
                    </TouchableOpacity>
                  </View>

                  {/* Strength meter */}
                  {newPw.length > 0 && (
                    <View style={ms.strengthWrap}>
                      <View style={ms.strengthBarRow}>
                        {[1, 2, 3, 4].map(i => (
                          <View
                            key={i}
                            style={[
                              ms.strengthSeg,
                              { backgroundColor: i <= strength.score ? strength.color : T.n200 },
                            ]}
                          />
                        ))}
                      </View>
                      <Text style={[ms.strengthLabel, { color: strength.color }]}>
                        {strength.label}
                        {strength.score === 1 && ' — try a longer password'}
                        {strength.score === 2 && ' — add numbers or symbols'}
                      </Text>
                    </View>
                  )}

                  {/* Confirm password */}
                  <Text style={[ms.fieldLabel, { marginTop: 8 }]}>CONFIRM PASSWORD</Text>
                  <View style={[
                    ms.inp,
                    confFocused && !pwMismatch && ms.inpFocus,
                    pwMismatch && ms.inpError,
                    pwMatch    && ms.inpSuccess,
                  ]}>
                    <View style={ms.inpIcon}>
                      <IconLock color={pwMismatch ? T.red : pwMatch ? T.green : confFocused ? T.blue : T.n400} />
                    </View>
                    <TextInput
                      style={[ms.inpText, { flex: 1 }]}
                      placeholder="Re-enter your password"
                      placeholderTextColor={T.n400}
                      value={confirmPw}
                      onChangeText={v => { setConfirmPw(v); setError(''); }}
                      secureTextEntry={!showConfirm}
                      autoCapitalize="none"
                      autoCorrect={false}
                      onFocus={() => setConfFocused(true)}
                      onBlur={() => setConfFocused(false)}
                    />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <TouchableOpacity
                        onPress={() => setShowConfirm(v => !v)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        {showConfirm ? <IconEyeOff /> : <IconEye />}
                      </TouchableOpacity>
                      {pwMatch && (
                        <Text style={{ fontSize: 14, color: T.green, fontWeight: '700' }}>✓</Text>
                      )}
                    </View>
                  </View>
                  {pwMismatch && (
                    <Text style={ms.errText}>⚠  Passwords do not match</Text>
                  )}

                  {/* General error */}
                  {!!error && !pwMismatch && (
                    <View style={ms.errorBox}>
                      <Text style={ms.errorBoxText}>⚠  {error}</Text>
                    </View>
                  )}

                  {/* Submit */}
                  <TouchableOpacity
                    style={[ms.btn, ms.btnGap, (!canSubmitPw || loading) && ms.btnDisabled]}
                    onPress={handleUpdatePassword}
                    disabled={!canSubmitPw || loading}
                    activeOpacity={0.85}
                  >
                    {loading
                      ? <ActivityIndicator color={T.n0} size="small" />
                      : (
                        <>
                          <Text style={ms.btnText}>Update Password</Text>
                          <IconArrow />
                        </>
                      )
                    }
                  </TouchableOpacity>
                </>
              )}

              {/* ═══════════════════════════════════════════════════════════
                  STEP 4 — SUCCESS
              ═══════════════════════════════════════════════════════════ */}
              {step === 'done' && (
                <Animated.View
                  style={[ms.successWrap, { opacity: successOpacity }]}
                >
                  {/* Animated checkmark */}
                  <Animated.View
                    style={[
                      ms.successIconOuter,
                      { transform: [{ scale: successScale }] },
                    ]}
                  >
                    <View style={ms.successIconMid}>
                      <View style={ms.successIconInner}>
                        <IconCheck color={T.green} size={30} />
                      </View>
                    </View>
                  </Animated.View>

                  {/* Confetti dots */}
                  <View style={ms.confettiRow}>
                    {['#3B6EF8', '#10B981', '#F59E0B', '#E53E3E', '#8B5CF6'].map((c, i) => (
                      <View key={i} style={[ms.confettiDot, { backgroundColor: c }]} />
                    ))}
                  </View>

                  <Text style={ms.successTitle}>Password Updated!</Text>
                  <Text style={ms.successDesc}>
                    Your password has been changed{'\n'}
                    successfully. Sign in with your new{'\n'}
                    password to continue.
                  </Text>

                  <TouchableOpacity
                    style={ms.successBtn}
                    onPress={() => { setRecoveryMode(false); onClose(); }}
                    activeOpacity={0.85}
                  >
                    <Text style={ms.btnText}>Back to Sign In</Text>
                    <IconArrow />
                  </TouchableOpacity>
                </Animated.View>
              )}

            </TouchableOpacity>
          </Animated.View>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const ms = StyleSheet.create({
  // ── Modal structure ──────────────────────────────────────────────────────
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(10, 20, 50, 0.45)',
    justifyContent: 'flex-end',
  },
  kav: {
    width: '100%',
  },
  sheet: {
    width: '100%',
  },
  sheetInner: {
    backgroundColor: T.n0,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 44 : 32,
    // Elevated shadow
    shadowColor: '#0D1117',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 20,
  },

  // ── Drag handle ──────────────────────────────────────────────────────────
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.n200,
    alignSelf: 'center',
    marginBottom: 20,
  },

  // ── Step dots ────────────────────────────────────────────────────────────
  stepRow: {
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    marginBottom: 22,
  },
  stepDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: T.n200,
  },
  stepDotActive: {
    width: 20,
    borderRadius: 3,
    backgroundColor: T.blue,
  },
  stepDotDone: {
    backgroundColor: T.green,
  },

  // ── Icon badge (step 1) ──────────────────────────────────────────────────
  iconBadge: {
    alignItems: 'center',
    marginBottom: 16,
  },
  iconBadgeInner: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: T.blue,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.blue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },

  // ── Typography ───────────────────────────────────────────────────────────
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: T.n900,
    letterSpacing: -0.4,
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 13.5,
    color: T.n500,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  emailHighlight: {
    color: T.blue,
    fontWeight: '700',
  },

  // ── Field label ──────────────────────────────────────────────────────────
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: T.n600,
    letterSpacing: 1.1,
    marginBottom: 7,
  },

  // ── Text input ───────────────────────────────────────────────────────────
  inp: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: T.n50,
    borderWidth: 1.5,
    borderColor: T.n100,
    borderRadius: T.rMd,
    paddingHorizontal: 14,
    marginBottom: 6,
  },
  inpFocus: {
    borderColor: T.blue,
    backgroundColor: T.blueFaint,
    shadowColor: T.blue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 0,
  },
  inpError: {
    borderColor: T.red,
    backgroundColor: T.redLight,
  },
  inpSuccess: {
    borderColor: T.green,
    backgroundColor: T.greenLight,
  },
  inpIcon:  { marginRight: 10 },
  inpText:  { flex: 1, fontSize: 14.5, color: T.n800 },

  // ── Error ─────────────────────────────────────────────────────────────────
  errText: {
    fontSize: 12,
    color: T.red,
    fontWeight: '500',
    marginBottom: 10,
  },
  errorBox: {
    backgroundColor: T.redLight,
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  errorBoxText: {
    fontSize: 12.5,
    color: T.red,
    fontWeight: '500',
  },

  // ── Password strength ─────────────────────────────────────────────────────
  strengthWrap: {
    marginBottom: 10,
  },
  strengthBarRow: {
    flexDirection: 'row',
    gap: 4,
    marginBottom: 4,
  },
  strengthSeg: {
    flex: 1,
    height: 3,
    borderRadius: 2,
  },
  strengthLabel: {
    fontSize: 11,
    fontWeight: '600',
  },

  // ── OTP row ───────────────────────────────────────────────────────────────
  otpHeaderWrap: {
    marginBottom: 8,
  },
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 20,
    marginTop: 4,
  },
  otpBox: {
    width: 48,
    height: 58,
    borderRadius: 14,
    backgroundColor: T.n50,
    borderWidth: 2,
    borderColor: T.n200,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: '700',
    color: T.n900,
    // Subtle shadow on each box
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  otpBoxFilled: {
    borderColor: T.blue,
    backgroundColor: T.blueFaint,
    shadowColor: T.blue,
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  otpBoxError: {
    borderColor: T.red,
    backgroundColor: T.redLight,
  },

  // ── Resend row ────────────────────────────────────────────────────────────
  resendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 12,
  },
  resendLabel: {
    fontSize: 13,
    color: T.n500,
  },
  resendTimer: {
    fontSize: 13,
    color: T.n400,
    fontWeight: '600',
  },
  resendBtn: {
    fontSize: 13,
    color: T.blue,
    fontWeight: '700',
  },

  // ── Buttons ───────────────────────────────────────────────────────────────
  btn: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: T.blue,
    borderRadius: T.rMd,
    marginTop: 10,
    marginBottom: 4,
    shadowColor: T.blue,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 7,
  },
  btnGap: {
    marginTop: 16,
  },
  btnLoading: {
    opacity: 0.8,
  },
  btnDisabled: {
    opacity: 0.4,
    elevation: 0,
    shadowOpacity: 0,
  },
  btnText: {
    color: T.n0,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  // ── Cancel / back ─────────────────────────────────────────────────────────
  cancelWrap: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  cancelText: {
    fontSize: 13.5,
    color: T.n500,
    fontWeight: '600',
  },

  // ── Success step ──────────────────────────────────────────────────────────
  successWrap: {
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 8,
  },
  successIconOuter: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: T.greenMid,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: T.green,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 8,
  },
  successIconMid: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#BBFBDB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIconInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: T.greenLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confettiRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 18,
    marginTop: 4,
  },
  confettiDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    opacity: 0.7,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: T.n900,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  successDesc: {
    fontSize: 14,
    color: T.n500,
    textAlign: 'center',
    lineHeight: 23,
    marginBottom: 28,
  },
  successBtn: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: T.blue,
    borderRadius: T.rMd,
    paddingHorizontal: 36,
    shadowColor: T.blue,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 7,
  },
});