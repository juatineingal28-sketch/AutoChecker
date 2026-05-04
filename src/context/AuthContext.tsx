// src/context/AuthContext.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabase';
import { migrateLegacyScanData } from '../services/scanService';

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
  setRecoveryMode: (val: boolean) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser]                       = useState<User | null>(null);
  const [loading, setLoading]                 = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);

  // ── Use a ref to track recovery state inside the auth listener.
  // useState is async — the closure inside onAuthStateChange would read
  // a stale false value even after setIsPasswordRecovery(true) was called.
  // The ref is always current.
  const recoveryRef = useRef(false);

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
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {

        // ── PASSWORD_RECOVERY ────────────────────────────────────────────────
        // Fired when the user opens the app via a magic link reset email.
        if (event === 'PASSWORD_RECOVERY') {
          recoveryRef.current = true;
          setIsPasswordRecovery(true);
          setLoading(false);
          return; // Do NOT set user — stay on login screen
        }

        // ── SIGNED_IN ────────────────────────────────────────────────────────
        // Fired by verifyOtp({ type: 'recovery' }) from ForgotPasswordModal.
        // PASSWORD_RECOVERY always fires before SIGNED_IN in the recovery flow,
        // so recoveryRef.current will already be true here — block the redirect.
        if (event === 'SIGNED_IN' && recoveryRef.current) {
          setLoading(false);
          return; // Still in recovery — do NOT set user
        }

        // ── USER_UPDATED ─────────────────────────────────────────────────────
        // Fired after updateUser({ password }) completes.
        // Recovery is done — clear the flag. signOut() follows immediately
        // in the modal so user will be set to null on the SIGNED_OUT event.
        if (event === 'USER_UPDATED') {
          recoveryRef.current = false;
          setIsPasswordRecovery(false);
        }

        // ── Normal session handling ──────────────────────────────────────────
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
    recoveryRef.current = false;
    setIsPasswordRecovery(false);
  };

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
        setRecoveryMode: (val: boolean) => {
          recoveryRef.current = val;
          setIsPasswordRecovery(val);
        },
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