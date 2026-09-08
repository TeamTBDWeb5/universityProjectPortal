import { supabase } from '../lib/supabase';

export async function getSubmissionFeedback(submissionId: string) {
  const { data, error } = await supabase.from('feedback').select('*, lecturers(*, profiles(*))').eq('submission_id', submissionId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
