// services/profileService.ts

import { supabase } from '../../supabase';

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: string;
  school?: string;
  subject?: string;
  bio?: string;
}

/** Fetch the full profile for a given user id from the teachers table */
export async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('teachers')
    .select('id, name, email, role, school, subject, bio')
    .eq('id', userId)
    .single();

  if (error || !data) return null;
  return data as Profile;
}

/** Update editable profile fields (name, school, subject, bio) */
export async function updateProfile(
  userId: string,
  updates: Partial<Pick<Profile, 'name' | 'school' | 'subject' | 'bio'>>,
): Promise<Profile> {
  const { data, error } = await supabase
    .from('teachers')
    .update(updates)
    .eq('id', userId)
    .select('id, name, email, role, school, subject, bio')
    .single();

  if (error || !data) throw new Error(error?.message ?? 'Failed to update profile.');
  return data as Profile;
}

/** Change password via Supabase Auth */
export async function changePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}