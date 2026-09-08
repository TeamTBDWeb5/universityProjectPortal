import { supabase } from '../lib/supabase';

export async function getAllStudents() {
  const { data, error } = await supabase.from('students').select('*, profiles(*)').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getAllLecturers() {
  const { data, error } = await supabase.from('lecturers').select('*, profiles(*)').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getPendingTopics() {
  const { data, error } = await supabase.from('project_topics').select('*, lecturers(*, profiles(*))').eq('status', 'pending').order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getAdminStats() {
  const [students, lecturers, topics, allocations, submissions] = await Promise.all([
    supabase.from('students').select('id', { count: 'exact', head: true }),
    supabase.from('lecturers').select('id', { count: 'exact', head: true }),
    supabase.from('project_topics').select('id', { count: 'exact', head: true }),
    supabase.from('project_allocations').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('submissions').select('id', { count: 'exact', head: true }),
  ]);
  for (const result of [students, lecturers, topics, allocations, submissions]) if (result.error) throw result.error;
  return { students: students.count ?? 0, lecturers: lecturers.count ?? 0, topics: topics.count ?? 0, activeAllocations: allocations.count ?? 0, submissions: submissions.count ?? 0 };
}


export async function getAllSubmissions() {
  const { data, error } = await supabase.from('submissions').select('*, students(*, profiles(*)), feedback(*, lecturers(*, profiles(*))), submission_reviews(*)').order('submitted_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getAllNotifications(limit = 100) {
  const { data, error } = await supabase.from('notifications').select('*, profiles(full_name,email)').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

