import { supabase } from '../lib/supabase';

export const PROJECT_DOCUMENT_BUCKET = 'project-documents';

export async function uploadProjectDocument(file: File, studentId: string) {
  const extension = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const path = `${studentId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(PROJECT_DOCUMENT_BUCKET).upload(path, file, { upsert: false, cacheControl: '3600' });
  if (error) throw error;
  return path;
}

export async function createDocumentDownloadUrl(path: string, expiresIn = 3600) {
  const { data, error } = await supabase.storage.from(PROJECT_DOCUMENT_BUCKET).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteProjectDocument(path: string) {
  const { error } = await supabase.storage.from(PROJECT_DOCUMENT_BUCKET).remove([path]);
  if (error) throw error;
}
