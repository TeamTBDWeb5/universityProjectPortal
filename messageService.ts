import { supabase } from '../lib/supabase';

export async function sendMessage(receiverId: string, message: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');
  const { data, error } = await supabase.from('messages').insert({ sender_id: user.id, receiver_id: receiverId, message: message.trim() }).select().single();
  if (error) throw error;
  return data;
}

export async function getConversation(otherUserId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');
  const { data, error } = await supabase.from('messages').select('*').or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`).order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function markConversationRead(otherUserId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');
  const { error } = await supabase.from('messages').update({ is_read: true }).eq('sender_id', otherUserId).eq('receiver_id', user.id);
  if (error) throw error;
}

export function subscribeToMessages(callback: (payload: any) => void) {
  return supabase.channel('messages-realtime').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, callback).subscribe();
}
