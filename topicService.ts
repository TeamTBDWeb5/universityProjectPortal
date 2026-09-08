import { supabase } from '../lib/supabase';

export async function getAvailableTopics(department?: string) {
  let query = supabase.from('project_topics').select('*, lecturers(*, profiles(full_name))').in('status', ['available', 'approved']).order('created_at', { ascending: false });
  if (department) query = query.eq('department', department);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function createProjectTopic(input: { title: string; description: string; department: string; researchArea?: string; maxStudents?: number; status?: 'draft' | 'pending' | 'available' }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');
  const { data: lecturer, error: lecturerError } = await supabase.from('lecturers').select('id').eq('user_id', user.id).single();
  if (lecturerError) throw lecturerError;
  const { data, error } = await supabase.from('project_topics').insert({ lecturer_id: lecturer.id, title: input.title.trim(), description: input.description.trim(), department: input.department.trim(), research_area: input.researchArea?.trim() || null, max_students: input.maxStudents ?? 1, status: input.status ?? 'pending', academic_session_id: (await supabase.rpc('get_active_academic_session')).data }).select().single();
  if (error) throw error;
  return data;
}

export async function selectProjectTopic(topicId: string) {
  const { data, error } = await supabase.rpc('request_project_topic', { p_topic_id: topicId });
  if (error) throw error;
  return data;
}

export async function updateProjectTopic(topicId: string, updates: Record<string, unknown>) {
  const { data, error } = await supabase.from('project_topics').update(updates).eq('id', topicId).select().single();
  if (error) throw error;
  return data;
}

export async function approveTopic(topicId: string, lecturerId?: string) {
  if (lecturerId) {
    const { data, error } = await supabase.rpc('approve_topic_and_assign_lecturer', { p_topic_id: topicId, p_lecturer_id: lecturerId });
    if (error) throw error;
    return data;
  }
  return updateProjectTopic(topicId, { status: 'approved' });
}

export async function rejectTopic(topicId: string, reason?: string) {
  const { data, error } = await supabase.rpc('reject_topic', { p_topic_id: topicId, p_reason: reason ?? null });
  if (error) throw error;
  return data;
}

export async function proposeProjectTopic(input: { title: string; description: string; department: string; researchArea?: string }) {
  const { data, error } = await supabase.rpc('propose_project_topic', { p_title: input.title.trim(), p_description: input.description.trim(), p_department: input.department.trim(), p_research_area: input.researchArea?.trim() || null });
  if (error) throw error;
  return data;
}
