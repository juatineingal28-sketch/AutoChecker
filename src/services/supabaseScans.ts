import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://aiphlvdwwunietnggjsw.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpcGhsdmR3d3VuaWV0bmdnanN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NTkzNTUsImV4cCI6MjA5MjQzNTM1NX0.bQpY7ZoZhFLz1_dl8yNTBAZvIFC0DDrQNsR8VjtAZtU";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});