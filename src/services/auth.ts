import { supabase } from './supabase';

export async function login(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.log('Login error:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true, user: data.user };
}