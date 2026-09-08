import { supabase } from '../lib/supabase';

export async function getSubmissionReviewHistory(submissionId: string) {
  const { data, error } = await supabase.from('submission_reviews').select('*, lecturers(*, profiles(*))').eq('submission_id', submissionId).order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}
