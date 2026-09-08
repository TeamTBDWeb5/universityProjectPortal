import { supabase } from '../lib/supabase';

async function currentStudentId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');
  const { data, error } = await supabase.from('students').select('id').eq('user_id', user.id).single();
  if (error) throw error;
  return data.id as string;
}

export async function getMyStudentProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');
  const { data, error } = await supabase.from('students').select('*, profiles(*)').eq('user_id', user.id).single();
  if (error) throw error;
  return data;
}

export async function updateMyStudentProfile(updates: { fullName?: string; department?: string; level?: string }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');
  if (updates.fullName !== undefined) {
    const { error } = await supabase.from('profiles').update({ full_name: updates.fullName.trim() }).eq('id', user.id);
    if (error) throw error;
  }
  const payload: Record<string, string> = {};
  if (updates.department !== undefined) payload.department = updates.department.trim();
  if (updates.level !== undefined) payload.level = updates.level.trim();
  if (Object.keys(payload).length) {
    const { error } = await supabase.from('students').update(payload).eq('user_id', user.id);
    if (error) throw error;
  }
  return getMyStudentProfile();
}

export async function getMyProject() {
  const studentId = await currentStudentId();
  const { data, error } = await supabase.from('project_allocations').select(`*, project_topics(*), lecturers(*, profiles(*))`).eq('student_id', studentId).in('status', ['pending', 'active']).order('allocated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getMySubmissions() {
  const studentId = await currentStudentId();
  const { data, error } = await supabase.from('submissions').select('*, feedback(*, lecturers(*, profiles(*))), submission_reviews(*)').eq('student_id', studentId).order('submitted_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function createSubmission(input: { title: string; chapter?: string; description?: string; filePath?: string }) {
  const { data, error } = await supabase.rpc('create_submission', { p_title: input.title.trim(), p_chapter: input.chapter?.trim() || null, p_description: input.description?.trim() || null, p_file_path: input.filePath ?? null });
  if (error) throw error;
  return data;
}
