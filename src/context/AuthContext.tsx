// src/context/AuthContext.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../../supabase';
import { migrateLegacyScanData } from '../services/scanService';

// ── SplashScreen import removed — splash now lives in App.tsx only ──────────

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isPasswordRecovery: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  // ── showSplash state removed ─────────────────────────────────────────────

  const fetchProfile = async (id: string, email: string): Promise<User> => {
    try {
      const { data, error } = await supabase
        .from('teachers')
        .select('name, role')
        .eq('id', id)
        .single();

      if (error || !data) {
        return { id, name: '', email, role: 'teacher' };
      }

      return {
        id,
        name: data.name ?? '',
        email,
        role: data.role ?? 'teacher',
      };
    } catch {
      return { id, name: '', email, role: 'teacher' };
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        const profile = await fetchProfile(
          session.user.id,
          session.user.email || ''
        );
        await migrateLegacyScanData(session.user.id);
        setUser(profile);
      } else {
        setUser(null);
      }
      setLoading(false);
      // ── setTimeout/setShowSplash removed ────────────────────────────────
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
          setIsPasswordRecovery(true);
          setLoading(false);
          return;
        }

        if (event === 'USER_UPDATED') {
          setIsPasswordRecovery(false);
        }

        if (session?.user) {
          const profile = await fetchProfile(
            session.user.id,
            session.user.email || ''
          );
          await migrateLegacyScanData(session.user.id);
          setUser(profile);
        } else {
          setUser(null);
        }

        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw new Error('Invalid email or password.');
  };

  const register = async (name: string, email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);

    if (data.user) {
      await supabase.from('teachers').insert({
        id: data.user.id,
        name,
        email,
        role: 'teacher',
      });
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem('scan_results');
    } catch {}
    await supabase.auth.signOut();
    setUser(null);
    setIsPasswordRecovery(false);
  };

  // ── if (showSplash) return <SplashScreen /> removed ──────────────────────

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
        isPasswordRecovery,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};