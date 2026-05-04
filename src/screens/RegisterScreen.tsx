import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
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
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { supabase } from '../../supabase';

// ─── Design tokens — kept in sync with LoginScreen ───────────────────────────
const T = {
  blue:        '#3B6EF8',
  blueDark:    '#1A4FD8',
  blueMid:     '#2B5CE6',
  blueLight:   '#EEF3FF',
  red:         '#E53E3E',
  redLight:    '#FFF5F5',
  green:       '#10B981',
  greenLight:  '#F0FDF9',
  amber:       '#F59E0B',
  n0:          '#FFFFFF',
  n50:         '#F8FAFF',
  n100:        '#EDF1FA',
  n200:        '#D6DFFA',
  n300:        '#B8CAFF',
  n400:        '#A0AEC0',
  n500:        '#718096',
  n600:        '#4A5568',
  n800:        '#1A202C',
  n900:        '#0D1117',
  rMd:         14,
  rLg:         18,
};

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

// ─── Icons ────────────────────────────────────────────────────────────────────
const UserIcon = ({ color = T.n400 }: { color?: string }) => (
  <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8}>
    <Path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
    <Circle cx={12} cy={7} r={4} />
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
    <Rect x={3} y={11} width={18} height={11} rx={2} />
    <Path d="M7 11V7a5 5 0 0110 0v4" />
  </Svg>
);

const CheckSmall = ({ color = '#fff' }: { color?: string }) => (
  <Svg width={9} height={9} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3}>
    <Path d="M20 6L9 17l-5-5" />
  </Svg>
);

// Logo icon — blue checkmark on white box, matches SplashScreen
const CheckIcon = ({ color = T.blue }: { color?: string }) => (
  <Svg width={32} height={32} viewBox="0 0 40 40" fill="none">
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

// ─── Password strength ────────────────────────────────────────────────────────
function getStrength(pw: string): { score: number; label: string; color: string } {
  if (pw.length === 0) return { score: 0, label: '', color: T.n100 };
  if (pw.length < 6)   return { score: 1, label: 'Too short', color: T.red };
  let score = 1;
  if (pw.length >= 8)            score++;
  if (/[A-Z]/.test(pw))          score++;
  if (/[0-9]/.test(pw))          score++;
  if (/[^A-Za-z0-9]/.test(pw))  score++;
  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  const colors = ['', T.red, T.amber, '#3B82F6', T.green, T.green];
  return { score, label: labels[score], color: colors[score] };
}

// ─── Field component ──────────────────────────────────────────────────────────
type FieldProps = {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  secure?: boolean;
  keyboardType?: 'default' | 'email-address';
  errorKey: keyof FieldErrors;
  errors: FieldErrors;
  setErrors: React.Dispatch<React.SetStateAction<FieldErrors>>;
  showStrength?: boolean;
  inpIcon: React.ReactNode;
};

const Field = ({
  label, value, onChangeText, placeholder, secure, keyboardType,
  errorKey, errors, setErrors, showStrength, inpIcon,
}: FieldProps) => {
  const [show, setShow]       = useState(false);
  const [focused, setFocused] = useState(false);
  const hasError = !!errors[errorKey];
  const strength = showStrength ? getStrength(value) : null;

  return (
    <View style={fs.wrap}>
      <Text style={fs.label}>{label}</Text>
      <View style={[
        fs.inp,
        focused && !hasError && fs.inpFocus,
        hasError && fs.inpError,
      ]}>
        <View style={fs.inpIcon}>{inpIcon}</View>
        <TextInput
          style={fs.inpText}
          placeholder={placeholder}
          placeholderTextColor={T.n400}
          value={value}
          onChangeText={(v) => {
            onChangeText(v);
            setErrors(e => ({ ...e, [errorKey]: undefined }));
          }}
          secureTextEntry={secure && !show}
          keyboardType={keyboardType || 'default'}
          autoCapitalize={keyboardType === 'email-address' ? 'none' : 'words'}
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {secure && (
          <TouchableOpacity onPress={() => setShow(!show)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </TouchableOpacity>
        )}
      </View>

      {showStrength && value.length > 0 && strength && (
        <>
          <View style={fs.strRow}>
            {[1,2,3,4].map(i => (
              <View key={i} style={[fs.strSeg, { backgroundColor: i <= strength.score ? strength.color : T.n100 }]} />
            ))}
          </View>
          <Text style={[fs.strLabel, { color: strength.color }]}>{strength.label}</Text>
        </>
      )}

      {hasError && (
        <Text style={fs.errText}>⚠ {errors[errorKey]}</Text>
      )}
    </View>
  );
};

const fs = StyleSheet.create({
  wrap:     { marginBottom: 16 },
  label:    { fontSize: 10, fontWeight: '700', color: T.n600, letterSpacing: 1.0, textTransform: 'uppercase', marginBottom: 6 },
  inp:      { height: 52, flexDirection: 'row', alignItems: 'center', backgroundColor: T.n50, borderWidth: 1.5, borderColor: T.n100, borderRadius: T.rMd, paddingHorizontal: 14 },
  inpFocus: { borderColor: T.blue, backgroundColor: '#F4F7FF' },
  inpError: { borderColor: T.red, backgroundColor: T.redLight },
  inpIcon:  { marginRight: 10 },
  inpText:  { flex: 1, fontSize: 14, color: T.n800 },
  strRow:   { flexDirection: 'row', gap: 4, marginTop: 6, marginBottom: 4 },
  strSeg:   { flex: 1, height: 3.5, borderRadius: 2 },
  strLabel: { fontSize: 11, fontWeight: '600', marginBottom: 2 },
  errText:  { fontSize: 12, color: T.red, fontWeight: '500', marginTop: 6 },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function RegisterScreen({ navigation }: any) {
  const [name,            setName]            = useState('');
  const [email,           setEmail]           = useState('');
  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreed,          setAgreed]          = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [errors,          setErrors]          = useState<FieldErrors>({});

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(28)).current;
  const btnScale  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 520, delay: 60, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, delay: 60, useNativeDriver: true }),
    ]).start();
  }, []);

  const onPressIn  = () => Animated.spring(btnScale, { toValue: 0.97, useNativeDriver: true, tension: 200, friction: 10 }).start();
  const onPressOut = () => Animated.spring(btnScale, { toValue: 1,    useNativeDriver: true, tension: 200, friction: 10 }).start();

  const validate = () => {
    const errs: FieldErrors = {};
    if (!name.trim())          errs.name = 'Full name is required.';
    if (!email.trim())         errs.email = 'Email is required.';
    else if (!/\S+@\S+\.\S+/.test(email)) errs.email = 'Enter a valid email.';
    if (!password)             errs.password = 'Password is required.';
    else if (password.length < 6) errs.password = 'Minimum 6 characters.';
    if (confirmPassword !== password) errs.confirmPassword = 'Passwords do not match.';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleRegister = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim() } },
      });

      if (error) {
        const msg = error.message.toLowerCase();
        if (msg.includes('already registered') || msg.includes('already been registered') || msg.includes('user already exists')) {
          setErrors(e => ({ ...e, email: 'This email is already registered. Please sign in.' }));
        } else if (msg.includes('invalid email')) {
          setErrors(e => ({ ...e, email: 'Enter a valid email address.' }));
        } else if (msg.includes('password')) {
          setErrors(e => ({ ...e, password: 'Password must be at least 6 characters.' }));
        } else {
          Alert.alert('Registration Failed', error.message);
        }
        return;
      }

      if (data.session) {
        // signed in automatically
      } else {
        Alert.alert(
          'Check Your Email',
          'We sent a confirmation link to ' + email.trim() + '. Please verify your email to continue.',
          [{ text: 'OK', onPress: () => navigation.goBack() }],
        );
      }
    } catch (e: any) {
      Alert.alert('Registration Failed', e.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView style={s.root}>
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[s.screenWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

            {/* ── Unified Header — matches LoginScreen ─────────────────────── */}
            <View style={s.header}>

              {/* Back button */}
              <TouchableOpacity
                style={s.backBtn}
                onPress={() => navigation.goBack()}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth={2.5}>
                  <Path d="M15 18l-6-6 6-6" />
                </Svg>
                <Text style={s.backText}>Back to sign in</Text>
              </TouchableOpacity>

              {/* Logo — white box + blue check, consistent with SplashScreen */}
              <View style={s.logoWrap}>
                <View style={s.logoRingOuter} />
                <View style={s.logoRingInner} />
                <View style={s.logoBox}>
                  <CheckIcon color={T.blue} />
                </View>
              </View>
              <Text style={s.appTitle}>AutoCheck</Text>
              <Text style={s.appSub}>Create your teacher account</Text>
            </View>

            {/* ── Form Card — overlaps header, matches LoginScreen ──────────── */}
            <View style={s.card}>

              <Text style={s.cardHeading}>Get started</Text>
              <Text style={s.cardSub}>Fill in your details below</Text>

              <Field
                label="Full Name"
                inpIcon={<UserIcon />}
                value={name}
                onChangeText={setName}
                placeholder="e.g. Maria Santos"
                errorKey="name"
                errors={errors}
                setErrors={setErrors}
              />
              <Field
                label="Email Address"
                inpIcon={<MailIcon />}
                value={email}
                onChangeText={setEmail}
                placeholder="teacher@school.edu.ph"
                keyboardType="email-address"
                errorKey="email"
                errors={errors}
                setErrors={setErrors}
              />
              <Field
                label="Password"
                inpIcon={<LockIcon />}
                value={password}
                onChangeText={setPassword}
                placeholder="Min. 6 characters"
                secure
                showStrength
                errorKey="password"
                errors={errors}
                setErrors={setErrors}
              />
              <Field
                label="Confirm Password"
                inpIcon={<LockIcon />}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter password"
                secure
                errorKey="confirmPassword"
                errors={errors}
                setErrors={setErrors}
              />

              {/* Terms checkbox */}
              <View style={s.chkRow}>
                <TouchableOpacity
                  style={[s.chk, agreed && s.chkChecked]}
                  onPress={() => setAgreed(!agreed)}
                  activeOpacity={0.7}
                >
                  {agreed && <CheckSmall />}
                </TouchableOpacity>
                <Text style={s.chkLbl}>
                  I agree to the <Text style={s.chkLink}>Terms of Service</Text> and <Text style={s.chkLink}>Privacy Policy</Text>
                </Text>
              </View>

              {/* Submit — same height/radius/shadow as LoginScreen Sign In btn */}
              <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onPress={handleRegister} disabled={loading}>
                <Animated.View style={[s.btn, loading && s.btnDisabled, { transform: [{ scale: btnScale }] }]}>
                  {loading
                    ? <ActivityIndicator color={T.n0} />
                    : <Text style={s.btnText}>Create Account</Text>
                  }
                </Animated.View>
              </Pressable>

              {/* Sign in link */}
              <TouchableOpacity style={s.linkRow} onPress={() => navigation.goBack()}>
                <Text style={s.linkText}>
                  Already have an account?{'  '}
                  <Text style={s.linkBold}>Sign in</Text>
                </Text>
              </TouchableOpacity>

            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  // ── Root & Layout — mirrors LoginScreen ──
  root:       { flex: 1, backgroundColor: T.n50 },
  scroll:     { flexGrow: 1 },
  screenWrap: { flex: 1, minHeight: '100%' },

  // ── Unified Header — same bg, padding rhythm as LoginScreen ──
  header: {
    backgroundColor: T.blue,
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 24,
    alignItems: 'center',
  },

  // Back button — sits at top-left within header
  backBtn: {
    position: 'absolute',
    top: 48,
    left: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backText: { fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: '500' },

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

  // ── Card — overlaps header, same radius/shadow as LoginScreen ──
  card: {
    backgroundColor: T.n0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -20,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 48,
    flex: 1,
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

  // ── Terms checkbox ──
  chkRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 24 },
  chk:        { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: T.n200, backgroundColor: T.n50, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  chkChecked: { backgroundColor: T.blue, borderColor: T.blue },
  chkLbl:     { fontSize: 12, color: T.n500, lineHeight: 20, flex: 1 },
  chkLink:    { color: T.blue, fontWeight: '600' },

  // ── Button — exact match to LoginScreen ──
  btn: {
    height: 52,
    backgroundColor: T.blue,
    borderRadius: T.rMd,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: T.blue,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 5,
  },
  btnDisabled: { opacity: 0.45, elevation: 0 },
  btnText:     { color: T.n0, fontSize: 15, fontWeight: '700', letterSpacing: 0.2 },

  // ── Sign in link ──
  linkRow:  { alignItems: 'center' },
  linkText: { fontSize: 13, color: T.n500 },
  linkBold: { color: T.blue, fontWeight: '700' },
});