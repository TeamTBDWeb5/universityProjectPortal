import { supabase } from '../lib/supabase';

export type UserRole = 'student' | 'lecturer' | 'admin';

export interface RegisterInput {
  fullName: string;
  email: string;
  password: string;
  role: 'student' | 'lecturer';
  identifier: string;
  department: string;
}

export async function registerUser(input: RegisterInput) {
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim().toLowerCase(),
    password: input.password,
    options: {
      data: {
        full_name: input.fullName.trim(),
        role: input.role,
        identifier: input.identifier.trim(),
        department: input.department,
      },
    },
  });

  if (error) throw error;
  return data;
}

export async function loginWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) throw error;
  return data;
}

export async function logoutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function getCurrentProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) throw error;
  return data;
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    { redirectTo: `${window.location.origin}/reset-password` },
  );
  if (error) throw error;
}

export function subscribeToAuthChanges(callback: Parameters<typeof supabase.auth.onAuthStateChange>[0]) {
  return supabase.auth.onAuthStateChange(callback);
}

export async function changePassword(password: string) {
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');
  const { data, error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  return data.user;
}

export async function updateMyEmail(email: string) {
  const { data, error } = await supabase.auth.updateUser({ email: email.trim() });
  if (error) throw error;
  return data.user;
}
