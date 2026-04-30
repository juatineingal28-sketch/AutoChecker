// screens/SplashScreen.tsx
// Shown on every cold launch. Stays visible until the progress bar
// physically reaches 100%, then fades out and calls onFinish().
// Auth is handled by AuthContext — SplashScreen does NOT decide the route.

import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

// import { LinearGradient } from 'expo-linear-gradient';

const { width, height } = Dimensions.get('window');

// ── Checkmark with sliding-mask reveal ───────────────────────────────────────
const CheckIcon = ({ draw }: { draw: Animated.Value }) => (
  <View style={{ width: 54, height: 54 }}>
    <Svg width={54} height={54} viewBox="0 0 54 54" fill="none">
      <Path
        d="M12 28L23 39L42 17"
        stroke="#2563EB"
        strokeWidth={5.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
    <Animated.View
      style={{
        position: 'absolute',
        top: 0, right: 0, bottom: 0,
        width: draw.interpolate({ inputRange: [0, 1], outputRange: [54, 0] }),
        backgroundColor: '#ffffff',
      }}
    />
  </View>
);

const AppIcon = ({ draw }: { draw: Animated.Value }) => (
  <View style={styles.iconBox}>
    <CheckIcon draw={draw} />
  </View>
);

// ── Progress stages ───────────────────────────────────────────────────────────
const PROGRESS_STAGES = [
  { label: 'Initializing…',      target: 0.20, duration: 1200 },
  { label: 'Loading user data…', target: 0.55, duration: 1800 },
  { label: 'Almost ready…',      target: 0.85, duration: 1400 },
  { label: 'Ready!',             target: 1.00, duration:  900 },
];

const READY_PAUSE_MS = 700;
const EXIT_FADE_MS   = 500;

interface Props {
  onFinish: () => void;
}

export default function SplashScreen({ onFinish }: Props) {

  const bgOpacity       = useRef(new Animated.Value(0)).current;
  const logoScale       = useRef(new Animated.Value(0.3)).current;
  const logoOpacity     = useRef(new Animated.Value(0)).current;
  const ringScale       = useRef(new Animated.Value(1)).current;
  const checkDraw       = useRef(new Animated.Value(0)).current;
  const titleY          = useRef(new Animated.Value(13)).current;
  const titleOpacity    = useRef(new Animated.Value(0)).current;
  const subtitleY       = useRef(new Animated.Value(13)).current;
  const subtitleOpacity = useRef(new Animated.Value(0)).current;
  const tagY            = useRef(new Animated.Value(10)).current;
  const tagOpacity      = useRef(new Animated.Value(0)).current;
  const progressWidth   = useRef(new Animated.Value(0)).current;
  const progressOpacity = useRef(new Animated.Value(0)).current;
  const labelOpacity    = useRef(new Animated.Value(0)).current;
  const exitOpacity     = useRef(new Animated.Value(1)).current;

  const [label, setLabel] = useState('Initializing…');
  const exitFiredRef = useRef(false);
  // ── FIX: guard against React Strict Mode double-invoke ───────────────────
  const hasRun       = useRef(false);

  const doExit = () => {
    if (exitFiredRef.current) return;
    exitFiredRef.current = true;
    Animated.timing(exitOpacity, {
      toValue: 0, duration: EXIT_FADE_MS,
      easing: Easing.in(Easing.quad), useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onFinish();
    });
  };

  useEffect(() => {
    // ── FIX: only run once even if Strict Mode mounts this twice ─────────────
    if (hasRun.current) return;
    hasRun.current = true;

    const timers: ReturnType<typeof setTimeout>[] = [];
    const after = (ms: number, fn: () => void) =>
      timers.push(setTimeout(fn, ms));

    const startPulse = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(ringScale, {
            toValue: 1.22, duration: 1100,
            easing: Easing.inOut(Easing.sin), useNativeDriver: true,
          }),
          Animated.timing(ringScale, {
            toValue: 1, duration: 1100,
            easing: Easing.inOut(Easing.sin), useNativeDriver: true,
          }),
        ])
      ).start();
    };

    const runProgress = () => {
      Animated.timing(progressOpacity, {
        toValue: 1, duration: 350, useNativeDriver: true,
      }).start();
      Animated.timing(labelOpacity, {
        toValue: 1, duration: 300, delay: 200, useNativeDriver: true,
      }).start();

      let elapsed = 0;
      PROGRESS_STAGES.forEach(({ label: l, duration }) => {
        timers.push(setTimeout(() => setLabel(l), elapsed));
        elapsed += duration;
      });

      const anims = PROGRESS_STAGES.map(({ target, duration }) =>
        Animated.timing(progressWidth, {
          toValue: target,
          duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        })
      );

      Animated.sequence(anims).start(({ finished }) => {
        if (finished) timers.push(setTimeout(doExit, READY_PAUSE_MS));
      });
    };

    // Background fades in immediately
    Animated.timing(bgOpacity, {
      toValue: 1, duration: 500,
      easing: Easing.out(Easing.quad), useNativeDriver: true,
    }).start();

    // Logo springs in
    after(450, () => {
      Animated.parallel([
        Animated.spring(logoScale, {
          toValue: 1, tension: 50, friction: 6, useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1, duration: 400, useNativeDriver: true,
        }),
      ]).start();
    });

    // Checkmark draws in
    after(1050, () => {
      Animated.timing(checkDraw, {
        toValue: 1, duration: 600,
        easing: Easing.out(Easing.quad), useNativeDriver: false,
      }).start();
    });

    // Pulse ring starts looping
    after(1100, startPulse);

    // Title slides up
    after(900, () => {
      Animated.parallel([
        Animated.timing(titleY, {
          toValue: 0, duration: 550,
          easing: Easing.out(Easing.quad), useNativeDriver: true,
        }),
        Animated.timing(titleOpacity, {
          toValue: 1, duration: 550, useNativeDriver: true,
        }),
      ]).start();
    });

    // Subtitle slides up
    after(1200, () => {
      Animated.parallel([
        Animated.timing(subtitleY, {
          toValue: 0, duration: 450,
          easing: Easing.out(Easing.quad), useNativeDriver: true,
        }),
        Animated.timing(subtitleOpacity, {
          toValue: 1, duration: 450, useNativeDriver: true,
        }),
      ]).start();
    });

    // Separator + tagline fade in
    after(1500, () => {
      Animated.parallel([
        Animated.timing(tagY, {
          toValue: 0, duration: 380,
          easing: Easing.out(Easing.quad), useNativeDriver: true,
        }),
        Animated.timing(tagOpacity, {
          toValue: 1, duration: 380, useNativeDriver: true,
        }),
      ]).start();
    });

    // Progress bar — exit is driven by its completion callback, not a timer
    after(1350, runProgress);

    return () => {
      timers.forEach(clearTimeout);
      // Stop all animations on unmount so nothing fires after cleanup
      bgOpacity.stopAnimation();
      logoScale.stopAnimation();
      logoOpacity.stopAnimation();
      ringScale.stopAnimation();
      checkDraw.stopAnimation();
      titleY.stopAnimation();
      titleOpacity.stopAnimation();
      subtitleY.stopAnimation();
      subtitleOpacity.stopAnimation();
      tagY.stopAnimation();
      tagOpacity.stopAnimation();
      progressWidth.stopAnimation();
      progressOpacity.stopAnimation();
      labelOpacity.stopAnimation();
      exitOpacity.stopAnimation();
    };
  }, []);

  const barWidth = progressWidth.interpolate({
    inputRange: [0, 1], outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View style={[styles.root, { opacity: exitOpacity }]}>
      <Animated.View style={[styles.bg, { opacity: bgOpacity }]}>

        <View style={styles.glowTop} />
        <View style={styles.glowBottom} />

        {/* Logo */}
        <Animated.View
          style={[styles.logoWrapper, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}
        >
          <Animated.View style={[styles.pulseRingOuter, { transform: [{ scale: ringScale }] }]} />
          <View style={styles.ringInner} />
          <AppIcon draw={checkDraw} />
        </Animated.View>

        {/* Text */}
        <View style={styles.textBlock}>
          <Animated.Text style={[styles.title, { opacity: titleOpacity, transform: [{ translateY: titleY }] }]}>
            AutoCheck
          </Animated.Text>
          <Animated.Text style={[styles.subtitle, { opacity: subtitleOpacity, transform: [{ translateY: subtitleY }] }]}>
            Scanner OCR
          </Animated.Text>
          <Animated.View style={[styles.separator, { opacity: tagOpacity }]} />
          <Animated.Text style={[styles.tag, { opacity: tagOpacity, transform: [{ translateY: tagY }] }]}>
            AutoChecker for Teachers
          </Animated.Text>
        </View>

        {/* Progress bar */}
        <Animated.View style={[styles.progressContainer, { opacity: progressOpacity }]}>
          <View style={styles.progressTrack}>
            <Animated.View style={[styles.progressFill, { width: barWidth }]} />
          </View>
          <Animated.Text style={[styles.progressLabel, { opacity: labelOpacity }]}>
            {label}
          </Animated.Text>
        </Animated.View>

        {/* Bottom branding */}
        <Animated.Text style={[styles.bottomTag, { opacity: tagOpacity }]}>
          Powered by OCR Technology
        </Animated.Text>

      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // Solid fallback — swap with LinearGradient for the exact prototype gradient:
  // colors={['#1d4ed8','#2563eb','#1e3a8a']} start={{x:0.15,y:0}} end={{x:0.85,y:1}}
  bg: {
    flex: 1,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },

  glowTop: {
    position: 'absolute',
    top: -(height * 0.07),
    alignSelf: 'center',
    width: width * 0.88, height: width * 0.88,
    borderRadius: width * 0.44,
    backgroundColor: 'rgba(147,197,253,0.13)',
    zIndex: 0,
  },
  glowBottom: {
    position: 'absolute',
    bottom: -(width * 0.24),
    alignSelf: 'center',
    width: width * 0.85, height: width * 0.85,
    borderRadius: width * 0.425,
    backgroundColor: 'rgba(30,64,175,0.52)',
    zIndex: 0,
  },

  logoWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 42,
    zIndex: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 28,
    elevation: 20,
  },
  pulseRingOuter: {
    position: 'absolute',
    width: 124, height: 124,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.17)',
  },
  ringInner: {
    position: 'absolute',
    width: 106, height: 106,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  iconBox: {
    width: 88, height: 88,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  textBlock: {
    alignItems: 'center',
    paddingHorizontal: 32,
    zIndex: 2,
  },
  title: {
    fontSize: 38,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -1.5,
    marginBottom: 5,
    fontFamily: Platform.select({
      ios: 'SF Pro Display', android: 'sans-serif-black', default: undefined,
    }),
    textShadowColor: 'rgba(0,0,0,0.14)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subtitle: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.72)',
    letterSpacing: 0.5,
    marginBottom: 17,
  },
  separator: {
    width: 32, height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.20)',
    marginBottom: 13,
  },
  tag: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.42)',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  progressContainer: {
    position: 'absolute',
    bottom: 66,
    left: 26, right: 26,
    zIndex: 2,
  },
  progressTrack: {
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 5,
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 2,
  },
  progressLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'right',
    letterSpacing: 0.3,
  },

  bottomTag: {
    position: 'absolute',
    bottom: 30,
    fontSize: 9,
    color: 'rgba(255,255,255,0.22)',
    letterSpacing: 0.4,
    zIndex: 2,
  },
});