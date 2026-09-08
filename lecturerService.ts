import { supabase } from '../lib/supabase';

async function currentLecturerId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');
  const { data, error } = await supabase.from('lecturers').select('id').eq('user_id', user.id).single();
  if (error) throw error;
  return data.id as string;
}

export async function getMyLecturerProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');
  const { data, error } = await supabase.from('lecturers').select('*, profiles(*)').eq('user_id', user.id).single();
  if (error) throw error;
  return data;
}


export async function updateMyLecturerProfile(updates: { fullName?: string; department?: string; specialization?: string; maxStudents?: number }) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');
  if (updates.fullName !== undefined) {
    const { error } = await supabase.from('profiles').update({ full_name: updates.fullName.trim() }).eq('id', user.id);
    if (error) throw error;
  }
  const payload: Record<string, unknown> = {};
  if (updates.department !== undefined) payload.department = updates.department.trim();
  if (updates.specialization !== undefined) payload.specialization = updates.specialization.trim();
  if (updates.maxStudents !== undefined) payload.max_students = Math.max(1, updates.maxStudents);
  if (Object.keys(payload).length) {
    const { error } = await supabase.from('lecturers').update(payload).eq('user_id', user.id);
    if (error) throw error;
  }
  return getMyLecturerProfile();
}

export async function getAssignedStudents() {
  const lecturerId = await currentLecturerId();
  const { data, error } = await supabase.from('project_allocations').select(`*, students(*, profiles(*)), project_topics(*), project_progress(*)`).eq('lecturer_id', lecturerId).in('status', ['pending', 'active']).order('allocated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getMyTopics() {
  const lecturerId = await currentLecturerId();
  const { data, error } = await supabase.from('project_topics').select('*').eq('lecturer_id', lecturerId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getStudentSubmissions(studentId?: string) {
  const lecturerId = await currentLecturerId();
  let query = supabase.from('submissions').select('*, students(*, profiles(*)), feedback(*, lecturers(*, profiles(*)))').order('submitted_at', { ascending: false });
  if (studentId) query = query.eq('student_id', studentId);
  const { data, error } = await query;
  if (error) throw error;
  // RLS restricts lecturers to submissions belonging to their assigned students.
  return data;
}

export async function reviewSubmission(submissionId: string, status: 'approved' | 'rejected' | 'revision_required', comment: string) {
  const lecturerId = await currentLecturerId();
  const { data, error } = await supabase.rpc('review_submission', { p_submission_id: submissionId, p_lecturer_id: lecturerId, p_status: status, p_comment: comment });
  if (error) throw error;
  return data;
}
