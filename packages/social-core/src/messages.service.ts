import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type { Conversation, ConversationMember, Message, PageParams, Profile } from './types';

const MESSAGE_SELECT = `
  id, conversation_id, sender_id, body, deleted_at, created_at, updated_at,
  sender:profiles!messages_sender_id_fkey(${PROFILE_SELECT})
`;

function mapMessage(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderId: String(row.sender_id),
    body: row.deleted_at ? '' : String(row.body ?? ''),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    sender: mapProfileRow((row.sender as Record<string, unknown>) ?? null),
  };
}

function mapMember(row: Record<string, unknown>): ConversationMember {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    userId: String(row.user_id),
    lastReadAt: row.last_read_at == null ? null : String(row.last_read_at),
    createdAt: String(row.created_at ?? ''),
    profile: mapProfileRow((row.profile as Record<string, unknown>) ?? null),
  };
}

export function createMessagesService(supabase: SupabaseClient) {
  return {
    async listConversations(userId: string): Promise<Conversation[]> {
      const { data: memberships, error: memError } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', userId);

      if (memError) throw new Error(toUserError(memError));
      const ids = (memberships ?? []).map((m) => String((m as { conversation_id: string }).conversation_id));
      if (ids.length === 0) return [];

      const { data, error } = await supabase
        .from('conversations')
        .select(
          `
          id, is_group, title, last_message_at, created_at, updated_at,
          members:conversation_members(
            id, conversation_id, user_id, last_read_at, created_at,
            profile:profiles!conversation_members_user_id_fkey(${PROFILE_SELECT})
          )
        `,
        )
        .in('id', ids)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (error) throw new Error(toUserError(error));

      return (data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        const membersRaw = Array.isArray(r.members) ? (r.members as Record<string, unknown>[]) : [];
        return {
          id: String(r.id),
          isGroup: Boolean(r.is_group),
          title: r.title == null ? null : String(r.title),
          lastMessageAt: r.last_message_at == null ? null : String(r.last_message_at),
          createdAt: String(r.created_at ?? ''),
          updatedAt: r.updated_at == null ? undefined : String(r.updated_at),
          members: membersRaw.map(mapMember),
        };
      });
    },

    async getOrCreateDM(currentUserId: string, otherUserId: string): Promise<Conversation> {
      if (currentUserId === otherUserId) {
        throw new Error('Cannot message yourself.');
      }

      const { data: conversationId, error } = await supabase.rpc('get_or_create_dm', {
        other_user_id: otherUserId,
      });

      if (error) throw new Error(toUserError(error));
      const id = String(conversationId);

      const { data, error: fetchError } = await supabase
        .from('conversations')
        .select(
          `
          id, is_group, title, last_message_at, created_at, updated_at,
          members:conversation_members(
            id, conversation_id, user_id, last_read_at, created_at,
            profile:profiles!conversation_members_user_id_fkey(${PROFILE_SELECT})
          )
        `,
        )
        .eq('id', id)
        .single();

      if (fetchError) throw new Error(toUserError(fetchError));

      const r = data as Record<string, unknown>;
      const membersRaw = Array.isArray(r.members) ? (r.members as Record<string, unknown>[]) : [];
      return {
        id: String(r.id),
        isGroup: Boolean(r.is_group),
        title: r.title == null ? null : String(r.title),
        lastMessageAt: r.last_message_at == null ? null : String(r.last_message_at),
        createdAt: String(r.created_at ?? ''),
        updatedAt: r.updated_at == null ? undefined : String(r.updated_at),
        members: membersRaw.map(mapMember),
      };
    },

    async listMessages(
      conversationId: string,
      params: PageParams = {},
    ): Promise<Message[]> {
      const limit = Math.min(params.limit ?? 40, 100);
      let query = supabase
        .from('messages')
        .select(MESSAGE_SELECT)
        .eq('conversation_id', conversationId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }

      const { data, error } = await query;
      if (error) throw new Error(toUserError(error));

      return (data ?? [])
        .map((row) => mapMessage(row as Record<string, unknown>))
        .reverse();
    },

    async send(conversationId: string, senderId: string, body: string): Promise<Message> {
      const text = body.trim();
      if (!text) throw new Error('Message cannot be empty.');

      const { data, error } = await supabase
        .from('messages')
        .insert({
          conversation_id: conversationId,
          sender_id: senderId,
          body: text,
        })
        .select(MESSAGE_SELECT)
        .single();

      if (error) throw new Error(toUserError(error));
      return mapMessage(data as Record<string, unknown>);
    },

    async otherParticipant(
      conversation: Conversation,
      currentUserId: string,
    ): Promise<Profile | null> {
      const other = conversation.members?.find((m) => m.userId !== currentUserId);
      return other?.profile ?? null;
    },
  };
}

export type MessagesService = ReturnType<typeof createMessagesService>;
