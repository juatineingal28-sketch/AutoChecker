// src/screens/WelcomeScreen.tsx
// ─── Welcome / Onboarding Screen ─────────────────────────────────────────────
// Logo matches SplashScreen: white rounded box + blue checkmark inside.

import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useRef } from 'react';
import {
    Animated,
    Dimensions,
    Easing,
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Svg, { Defs, Ellipse, Path, RadialGradient, Stop } from 'react-native-svg';

const { width, height } = Dimensions.get('window');

// ─── Design Tokens ────────────────────────────────────────────────────────────
const T = {
  blue:       '#2563EB',
  blueDark:   '#1D4ED8',
  blueMid:    '#3B82F6',
  blueLight:  '#EFF6FF',
  blueBorder: 'rgba(37,99,235,0.35)',
  n0:         '#FFFFFF',
  n800:       '#1A202C',
  n500:       '#6B7280',
};

// ─── Check Icon — blue stroke on white, matches splash screen ─────────────────
const CheckIcon = ({ size = 36 }: { size?: number }) => (
  <Svg width={size} height={size} viewBox="0 0 40 40" fill="none">
    <Path
      d="M7 21L17 31L33 11"
      stroke={T.blue}          // ← blue checkmark, not white
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

// ─── Background blobs ─────────────────────────────────────────────────────────
function BlueBlobs({ areaHeight }: { areaHeight: number }) {
  return (
    <Svg
      style={StyleSheet.absoluteFillObject}
      width={width}
      height={areaHeight}
      viewBox={`0 0 ${width} ${areaHeight}`}
    >
      <Defs>
        <RadialGradient id="b1" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#93C5FD" stopOpacity="0.22" />
          <Stop offset="100%" stopColor="#93C5FD" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id="b2" cx="50%" cy="50%" r="50%">
          <Stop offset="0%" stopColor="#1E40AF" stopOpacity="0.38" />
          <Stop offset="100%" stopColor="#1E40AF" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Ellipse cx={width * 0.85} cy={areaHeight * 0.15} rx={170} ry={150} fill="url(#b1)" />
      <Ellipse cx={width * 0.08} cy={areaHeight * 0.55} rx={130} ry={110} fill="url(#b2)" />
      <Ellipse cx={width * 0.6}  cy={areaHeight * 0.92} rx={150} ry={120} fill="url(#b1)" />
    </Svg>
  );
}

// ─── Pill Chip ────────────────────────────────────────────────────────────────
function Chip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={s.chip}>
      <Text style={s.chipIcon}>{icon}</Text>
      <Text style={s.chipLabel}>{label}</Text>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function WelcomeScreen() {
  const navigation = useNavigation<any>();

  const topAnim      = useRef(new Animated.Value(0)).current;
  const logoScale    = useRef(new Animated.Value(0.5)).current;
  const sheetAnim    = useRef(new Animated.Value(60)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;
  const logoPulse    = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(topAnim,   { toValue: 1, duration: 520, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.spring(logoScale, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(sheetAnim,    { toValue: 0, duration: 440, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(sheetOpacity, { toValue: 1, duration: 440, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
    ]).start();

    setTimeout(() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(logoPulse, { toValue: 1.06, duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(logoPulse, { toValue: 1,    duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ).start();
    }, 1000);
  }, []);

  const BLUE_HEIGHT = height * 0.52;

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={T.blue} />

      {/* ── TOP BLUE HALF ── */}
      <Animated.View style={[s.blueSection, { height: BLUE_HEIGHT, opacity: topAnim }]}>
        <BlueBlobs areaHeight={BLUE_HEIGHT} />

        {/* Logo — white box + blue check, matches splash */}
        <Animated.View style={[s.logoWrap, { transform: [{ scale: Animated.multiply(logoScale, logoPulse) }] }]}>
          {/* Outer subtle ring (like splash's outer ring) */}
          <View style={s.ringOuter} />
          {/* Inner subtle ring */}
          <View style={s.ringInner} />
          {/* White icon box */}
          <View style={s.logoBox}>
            <CheckIcon size={40} />
          </View>
        </Animated.View>

        {/* App name + tagline */}
        <Text style={s.appName}>AutoCheck</Text>
        <Text style={s.tagline}>Scanner OCR</Text>
        <View style={s.divider} />
        <Text style={s.tagSmall}>AUTOCHECKER FOR TEACHERS</Text>

        {/* Feature chips */}
        <View style={s.chips}>
          <Chip icon="📷" label="Scan Sheets" />
          <Chip icon="📊" label="Analytics" />
          <Chip icon="✅" label="Auto-Grade" />
        </View>
      </Animated.View>

      {/* ── BOTTOM WHITE SHEET ── */}
      <Animated.View
        style={[
          s.sheet,
          {
            opacity: sheetOpacity,
            transform: [{ translateY: sheetAnim }],
          },
        ]}
      >
        <ScrollView
          contentContainerStyle={s.sheetContent}
          bounces={false}
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.welcomeTitle}>Welcome Back 👋</Text>
          <Text style={s.welcomeSub}>Your smart OCR grading assistant is ready.</Text>

          <TouchableOpacity
            style={s.btnPrimary}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.84}
          >
            <Text style={s.btnPrimaryText}>Login</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.btnSecondary}
            onPress={() => navigation.navigate('Register')}
            activeOpacity={0.84}
          >
            <Text style={s.btnSecondaryText}>Create Account</Text>
          </TouchableOpacity>

          <Text style={s.footer}>Powered by OCR Technology 🏫</Text>
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.blue,
  },

  blueSection: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: Platform.OS === 'android' ? 20 : 10,
    paddingBottom: 24,
    gap: 8,
    overflow: 'hidden',
  },

  // ── Logo rings + white box ──
  logoWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    width: 130,
    height: 130,
  },
  ringOuter: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 34,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  ringInner: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: 30,
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.13)',
  },
  logoBox: {
    width: 92,
    height: 92,
    borderRadius: 22,
    backgroundColor: T.n0,           // ← solid white, exactly like splash
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(0,0,0,0.3)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 14,
  },

  appName: {
    fontSize: 38,
    fontWeight: '900',
    color: T.n0,
    letterSpacing: -1.4,
    textShadowColor: 'rgba(0,0,0,0.15)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  tagline: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: -2,
  },
  divider: {
    width: 36,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.30)',
    marginVertical: 2,
  },
  tagSmall: {
    fontSize: 9,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.50)',
    letterSpacing: 2.2,
    textTransform: 'uppercase',
  },

  chips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    flexWrap: 'wrap',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 50,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  chipIcon: { fontSize: 13 },
  chipLabel: {
    color: T.n0,
    fontSize: 12,
    fontWeight: '600',
  },

  // ── White bottom sheet ──
  sheet: {
    flex: 1,
    backgroundColor: T.n0,
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: -20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 10,
  },
  sheetContent: {
    paddingHorizontal: 28,
    paddingTop: 32,
    paddingBottom: Platform.OS === 'ios' ? 24 : 32,
    gap: 14,
  },

  welcomeTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: T.n800,
    letterSpacing: -0.8,
    marginBottom: 2,
  },
  welcomeSub: {
    fontSize: 14,
    color: T.n500,
    marginBottom: 6,
    lineHeight: 20,
  },

  btnPrimary: {
    width: '100%',
    height: 56,
    backgroundColor: T.blue,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.blue,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 8,
  },
  btnPrimaryText: {
    color: T.n0,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  btnSecondary: {
    width: '100%',
    height: 56,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: T.blueBorder,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.n0,
  },
  btnSecondaryText: {
    color: T.blue,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },

  footer: {
    fontSize: 12,
    color: T.n500,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
});