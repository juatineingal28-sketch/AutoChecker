import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// 🔥 READ ENV
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// 🔥 DEBUG (REMOVE LATER)
console.log("SUPABASE URL:", SUPABASE_URL);
console.log("SUPABASE KEY:", SUPABASE_ANON_KEY?.slice(0, 20));

// ❌ STOP IF BROKEN
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('[Supabase] Missing env variables');
}

// ✅ CREATE CLIENT
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});