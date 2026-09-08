import { supabase } from '../lib/supabase';

async function currentStudentId() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');
  const { data, error } = await supabase.from('students').select('id').eq('user_id', user.id).single();
  if (error) throw error;
  return data.id as string;
}

export async function getMyProgress() {
  const studentId = await currentStudentId();
  const { data, error } = await supabase.from('project_progress').select('*').eq('student_id', studentId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateMyProgress(input: { percentage: number; currentStage?: string; description?: string }) {
  const studentId = await currentStudentId();
  const { data, error } = await supabase.from('project_progress').upsert({
    student_id: studentId,
    percentage: Math.max(0, Math.min(100, input.percentage)),
    current_stage: input.currentStage ?? null,
    description: input.description ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'student_id' }).select().single();
  if (error) throw error;
  return data;
}
