// App.tsx
import 'react-native-gesture-handler';
import 'react-native-get-random-values';
import 'react-native-url-polyfill/auto';

import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { AuthProvider } from './src/context/AuthContext';
import AppNavigator from './src/navigation/AppNavigator';
import SplashScreen from './src/screens/SplashScreen';
import { supabase } from './supabase';

export default function App() {
  // ── Splash lives here — completely outside AuthProvider so auth state
  // changes can never cause it to re-render or remount mid-animation.
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    Linking.getInitialURL().then(url => {
      if (url) handleDeepLink(url);
    });

    const sub = Linking.addEventListener('url', ({ url }) => {
      handleDeepLink(url);
    });

    return () => sub.remove();
  }, []);

  const handleDeepLink = async (url: string) => {
    if (!url) return;
    console.log('[DeepLink] Received:', url);

    if (url.includes('type=recovery') || url.includes('access_token')) {
      const { error } = await supabase.auth.exchangeCodeForSession(url);
      if (error) {
        console.error('[DeepLink] Session exchange error:', error.message);
      }
    }
  };

  if (showSplash) {
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  return (
    <AuthProvider>
      <AppNavigator />
    </AuthProvider>
  );
}