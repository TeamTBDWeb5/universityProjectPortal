import { supabase } from '../lib/supabase';

export async function getAcademicSessions() {
  const { data, error } = await supabase.from('academic_sessions').select('*').order('start_date', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getActiveAcademicSession() {
  const { data, error } = await supabase.from('academic_sessions').select('*').eq('is_active', true).order('start_date', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createAcademicSession(input: { name: string; startDate: string; endDate: string; isActive?: boolean }) {
  if (input.isActive) await supabase.from('academic_sessions').update({ is_active: false }).eq('is_active', true);
  const { data, error } = await supabase.from('academic_sessions').insert({ name: input.name.trim(), start_date: input.startDate, end_date: input.endDate, is_active: input.isActive ?? false }).select().single();
  if (error) throw error;
  return data;
}

export async function setActiveAcademicSession(sessionId: string) {
  const { error: resetError } = await supabase.from('academic_sessions').update({ is_active: false }).eq('is_active', true);
  if (resetError) throw resetError;
  const { data, error } = await supabase.from('academic_sessions').update({ is_active: true }).eq('id', sessionId).select().single();
  if (error) throw error;
  return data;
}
