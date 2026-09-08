import { supabase } from '../lib/supabase';

export async function getAuditLogs(limit = 100) {
  const { data, error } = await supabase.from('audit_logs').select('*, profiles(full_name,email)').order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}
