import { supabase } from '../lib/supabase';

export async function allocateSupervisor(studentId: string, topicId: string, lecturerId: string) {
  const { data, error } = await supabase.rpc('allocate_project', { p_student_id: studentId, p_topic_id: topicId, p_lecturer_id: lecturerId });
  if (error) throw error;
  return data;
}

export async function getAllocations() {
  const { data, error } = await supabase.from('project_allocations').select('*, students(*, profiles(*)), project_topics(*), lecturers(*, profiles(*))').order('allocated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function cancelAllocation(allocationId: string) {
  const { data, error } = await supabase.rpc('cancel_allocation', { p_allocation_id: allocationId });
  if (error) throw error;
  return data;
}
