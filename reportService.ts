import { supabase } from '../lib/supabase';

export async function getProjectReport() {
  const { data, error } = await supabase.from('project_allocations').select('*, students(*, profiles(*)), project_topics(*), lecturers(*, profiles(*)), project_progress(*)').order('allocated_at', { ascending: false });
  if (error) throw error;
  return data;
}

export function exportRowsToCsv(rows: Record<string, unknown>[], filename = 'project-report.csv') {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [headers.map(escape).join(','), ...rows.map(row => headers.map(h => escape(row[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
