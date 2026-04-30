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

type FieldErrors = {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

// ─── Icons ────────────────────────────────────────────────────────────────────
const CheckIcon = ({ size = 20, color = T.blue }: { size?: number; color?: string }) => (
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

const BackArrow = () => (
  <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth={2.2}>
    <Path d="M15 18l-6-6 6-6" />
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

// ─── Reusable Field ───────────────────────────────────────────────────────────
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
};

const Field = ({
  label,
  value,
  onChangeText,
  placeholder,
  secure,
  keyboardType,
  errorKey,
  errors,
  setErrors,
  showStrength,
}: FieldProps) => {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);
  const hasError = !!errors[errorKey];
  const strength = showStrength ? getStrength(value) : null;

  return (
    <View style={fs.wrap}>
      <Text style={fs.label}>{label}</Text>
      <View style={[
        fs.inp,
        focused && !hasError && fs.inpActive,
        hasError && fs.inpError,
      ]}>
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
          <TouchableOpacity onPress={() => setShow(!show)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            {show ? <EyeOffIcon /> : <EyeIcon />}
          </TouchableOpacity>
        )}
      </View>

      {/* Strength bar for password */}
      {showStrength && value.length > 0 && strength && (
        <>
          <View style={fs.strRow}>
            {[1,2,3,4].map(i => (
              <View key={i} style={[fs.strSeg, { backgroundColor: i <= strength.score ? strength.color : T.n100 }]} />
            ))}
          </View>
          <Text style={[fs.strLabel, { color: strength.color }]}>
            {strength.label} — add numbers or symbols
          </Text>
        </>
      )}

      {hasError && (
        <Text style={fs.errText}>● {errors[errorKey]}</Text>
      )}
    </View>
  );
};

const fs = StyleSheet.create({
  wrap:     { marginBottom: 14 },
  label:    { fontSize: 10, fontWeight: '600', color: T.blue, letterSpacing: 0.8, marginBottom: 6 },
  inp:      { height: 46, flexDirection: 'row', alignItems: 'center', backgroundColor: T.n50, borderWidth: 1.5, borderColor: T.n100, borderRadius: 12, paddingHorizontal: 13, justifyContent: 'space-between' },
  inpActive:{ borderColor: T.blue },
  inpError: { borderColor: T.red, backgroundColor: T.redLight },
  inpText:  { flex: 1, fontSize: 13, color: T.n800 },
  strRow:   { flexDirection: 'row', gap: 3, marginTop: 5, marginBottom: 3 },
  strSeg:   { flex: 1, height: 3, borderRadius: 2 },
  strLabel: { fontSize: 10, marginBottom: 4 },
  errText:  { fontSize: 11, color: T.red, fontWeight: '500', marginTop: 5 },
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

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 520, delay: 60, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 60, friction: 10, delay: 60, useNativeDriver: true }),
    ]).start();
  }, []);

  const btnScale = useRef(new Animated.Value(1)).current;
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
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

            {/* ── Blue Header ────────────────────────────────────────────────── */}
            <View style={s.header}>
              {/* BG decoration */}
              <Svg style={StyleSheet.absoluteFillObject} viewBox="0 0 400 180" preserveAspectRatio="xMidYMid slice" fill="none">
                <Circle cx={200} cy={-10} r={120} fill="rgba(255,255,255,0.07)" />
                <Circle cx={360} cy={160} r={70} fill="rgba(255,255,255,0.04)" />
              </Svg>

              {/* Back button */}
              <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <BackArrow />
                <Text style={s.backText}>Back to sign in</Text>
              </TouchableOpacity>

              {/* Logo + title row */}
              <View style={s.titleRow}>
                <View style={s.logoOuter}>
                  <View style={s.logoInner}>
                    <CheckIcon size={20} color={T.blue} />
                  </View>
                </View>
                <View>
                  <Text style={s.appTitle}>Create account</Text>
                  <Text style={s.appSub}>Register as a teacher</Text>
                </View>
              </View>
            </View>

            {/* ── White Card ─────────────────────────────────────────────────── */}
            <View style={s.card}>

              <Field label="FULL NAME"       value={name}            onChangeText={setName}            placeholder="e.g. Maria Santos"         errorKey="name"            errors={errors} setErrors={setErrors} />
              <Field label="EMAIL ADDRESS"   value={email}           onChangeText={setEmail}           placeholder="teacher@school.edu.ph"      errorKey="email"           errors={errors} setErrors={setErrors} keyboardType="email-address" />
              <Field label="PASSWORD"        value={password}        onChangeText={setPassword}        placeholder="Min. 6 characters"          errorKey="password"        errors={errors} setErrors={setErrors} secure showStrength />
              <Field label="CONFIRM PASSWORD" value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Re-enter password"          errorKey="confirmPassword" errors={errors} setErrors={setErrors} secure />

              {/* Terms checkbox */}
              <View style={s.chkRow}>
                <TouchableOpacity style={[s.chk, agreed && s.chkChecked]} onPress={() => setAgreed(!agreed)} activeOpacity={0.7}>
                  {agreed && (
                    <Svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke={T.n0} strokeWidth={3}>
                      <Path d="M20 6L9 17l-5-5" />
                    </Svg>
                  )}
                </TouchableOpacity>
                <Text style={s.chkLbl}>
                  I agree to the <Text style={s.chkLink}>Terms of Service</Text> and <Text style={s.chkLink}>Privacy Policy</Text>
                </Text>
              </View>

              {/* Submit */}
              <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onPress={handleRegister} disabled={loading}>
                <Animated.View style={[s.btn, loading && s.btnDisabled, { transform: [{ scale: btnScale }] }]}>
                  {loading
                    ? <ActivityIndicator color={T.n0} />
                    : <Text style={s.btnText}>Create account</Text>
                  }
                </Animated.View>
              </Pressable>

              {/* Sign in link */}
              <TouchableOpacity style={s.linkRow} onPress={() => navigation.goBack()}>
                <Text style={s.linkText}>Already have an account? <Text style={s.linkBold}>Sign in</Text></Text>
              </TouchableOpacity>

            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: T.blue },
  scroll:     { flexGrow: 1, justifyContent: 'flex-end' },

  // Header
  header:     { paddingTop: 20, paddingBottom: 26, paddingHorizontal: 22, position: 'relative', overflow: 'hidden' },
  backBtn:    { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 18 },
  backText:   { fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: '500' },
  titleRow:   { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoOuter:  { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  logoInner:  { width: 38, height: 38, borderRadius: 11, backgroundColor: T.n0, alignItems: 'center', justifyContent: 'center' },
  appTitle:   { fontSize: 19, fontWeight: '700', color: T.n0, marginBottom: 2 },
  appSub:     { fontSize: 11, color: 'rgba(255,255,255,0.55)' },

  // Card
  card:       { backgroundColor: T.n0, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 22, paddingTop: 26, paddingBottom: 40 },
  chkRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 20 },
  chk:        { width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: T.n200, backgroundColor: T.n50, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
  chkChecked: { backgroundColor: T.blue, borderColor: T.blue },
  chkLbl:     { fontSize: 11, color: T.n500, lineHeight: 18, flex: 1 },
  chkLink:    { color: T.blue, fontWeight: '600' },
  btn:        { height: 50, backgroundColor: T.blue, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginBottom: 18, shadowColor: T.blue, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 12, elevation: 6 },
  btnDisabled:{ opacity: 0.6, elevation: 0 },
  btnText:    { color: T.n0, fontSize: 14, fontWeight: '600' },
  linkRow:    { alignItems: 'center' },
  linkText:   { fontSize: 12, color: T.n500 },
  linkBold:   { color: T.blue, fontWeight: '600' },
});