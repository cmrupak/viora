import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type {
  Conversation,
  ConversationMember,
  Message,
  MessageAttachment,
  MessageReaction,
  MessageReactionType,
  PageParams,
  Profile,
  UserPresence,
} from './types';

export type SendMessageInput = {
  conversationId: string;
  senderId: string;
  body?: string;
  replyToId?: string | null;
  storyId?: string | null;
  /** Minutes until message expires (disappearing). */
  expiresInMinutes?: number | null;
  attachments?: Array<{
    url: string;
    mediaType: 'image' | 'video' | 'audio' | 'file';
    fileName?: string | null;
  }>;
};

const ATTACHMENT_SELECT =
  'id, message_id, url, media_type, file_name, created_at, updated_at';

const MESSAGE_SELECT = `
  id, conversation_id, sender_id, body, reply_to_id, story_id, expires_at, deleted_at, created_at, updated_at,
  sender:profiles!messages_sender_id_fkey(${PROFILE_SELECT}),
  attachments:message_attachments(${ATTACHMENT_SELECT}),
  reply_to:messages!messages_reply_to_id_fkey(
    id, conversation_id, sender_id, body, deleted_at, created_at,
    sender:profiles!messages_sender_id_fkey(${PROFILE_SELECT})
  )
`;

const MESSAGE_SELECT_FALLBACK = `
  id, conversation_id, sender_id, body, deleted_at, created_at, updated_at,
  sender:profiles!messages_sender_id_fkey(${PROFILE_SELECT}),
  attachments:message_attachments(${ATTACHMENT_SELECT})
`;

const MEMBER_SELECT = `
  id, conversation_id, user_id, last_read_at, muted, pinned_at, nickname, created_at,
  profile:profiles!conversation_members_user_id_fkey(${PROFILE_SELECT})
`;

const MEMBER_SELECT_FALLBACK = `
  id, conversation_id, user_id, last_read_at, created_at,
  profile:profiles!conversation_members_user_id_fkey(${PROFILE_SELECT})
`;

function mapAttachment(row: Record<string, unknown>): MessageAttachment {
  const media = String(row.media_type ?? 'file');
  const mediaType: MessageAttachment['mediaType'] =
    media === 'image' || media === 'video' || media === 'audio' || media === 'file'
      ? media
      : 'file';
  return {
    id: String(row.id),
    messageId: String(row.message_id),
    url: String(row.url),
    mediaType,
    fileName: row.file_name == null ? null : String(row.file_name),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
  };
}

function mapReaction(row: Record<string, unknown>): MessageReaction {
  const raw = String(row.reaction ?? 'like');
  const reaction: MessageReactionType =
    raw === 'love' ||
    raw === 'haha' ||
    raw === 'wow' ||
    raw === 'sad' ||
    raw === 'angry' ||
    raw === 'like'
      ? raw
      : 'like';
  return {
    id: String(row.id),
    messageId: String(row.message_id),
    userId: String(row.user_id),
    reaction,
    createdAt: String(row.created_at ?? ''),
  };
}

function mapMessage(row: Record<string, unknown>, opts?: { myUserId?: string | null }): Message {
  const attachmentsRaw = row.attachments ?? row.message_attachments;
  const attachments = Array.isArray(attachmentsRaw)
    ? (attachmentsRaw as Record<string, unknown>[]).map(mapAttachment)
    : [];

  const replyRaw = row.reply_to;
  let replyTo: Message | null = null;
  if (replyRaw && typeof replyRaw === 'object' && !Array.isArray(replyRaw)) {
    replyTo = mapMessage(replyRaw as Record<string, unknown>);
  } else if (Array.isArray(replyRaw) && replyRaw[0]) {
    replyTo = mapMessage(replyRaw[0] as Record<string, unknown>);
  }

  const reactionsRaw = row.reactions ?? row.message_reactions;
  const reactions = Array.isArray(reactionsRaw)
    ? (reactionsRaw as Record<string, unknown>[]).map(mapReaction)
    : [];

  const myReaction =
    opts?.myUserId != null
      ? (reactions.find((r) => r.userId === opts.myUserId)?.reaction ?? null)
      : null;

  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderId: String(row.sender_id),
    body: row.deleted_at ? '' : String(row.body ?? ''),
    replyToId: row.reply_to_id == null ? null : String(row.reply_to_id),
    storyId: row.story_id == null ? null : String(row.story_id),
    expiresAt: row.expires_at == null ? null : String(row.expires_at),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    sender: mapProfileRow((row.sender as Record<string, unknown>) ?? null),
    attachments,
    replyTo,
    reactions,
    myReaction,
  };
}

function mapMember(row: Record<string, unknown>): ConversationMember {
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    userId: String(row.user_id),
    lastReadAt: row.last_read_at == null ? null : String(row.last_read_at),
    muted: Boolean(row.muted),
    pinnedAt: row.pinned_at == null ? null : String(row.pinned_at),
    nickname: row.nickname == null ? null : String(row.nickname),
    createdAt: String(row.created_at ?? ''),
    profile: mapProfileRow((row.profile as Record<string, unknown>) ?? null),
  };
}

function mapConversation(
  row: Record<string, unknown>,
  viewerId?: string | null,
): Conversation {
  const membersRaw = Array.isArray(row.members) ? (row.members as Record<string, unknown>[]) : [];
  const members = membersRaw.map(mapMember);
  const mine = viewerId ? members.find((m) => m.userId === viewerId) : undefined;
  return {
    id: String(row.id),
    isGroup: Boolean(row.is_group),
    title: row.title == null ? null : String(row.title),
    isRequest: Boolean(row.is_request),
    lastMessageAt: row.last_message_at == null ? null : String(row.last_message_at),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    members,
    muted: mine?.muted,
    pinnedAt: mine?.pinnedAt ?? null,
    nickname: mine?.nickname ?? null,
  };
}

async function shouldStartAsRequest(
  supabase: SupabaseClient,
  fromUserId: string,
  toUserId: string,
): Promise<boolean> {
  const [{ data: follow }, { data: friendship }] = await Promise.all([
    supabase
      .from('follows')
      .select('id')
      .eq('follower_id', toUserId)
      .eq('following_id', fromUserId)
      .maybeSingle(),
    supabase
      .from('friendships')
      .select('id')
      .eq('user_a', fromUserId < toUserId ? fromUserId : toUserId)
      .eq('user_b', fromUserId < toUserId ? toUserId : fromUserId)
      .maybeSingle(),
  ]);
  return !follow && !friendship;
}

export function createMessagesService(supabase: SupabaseClient) {
  async function fetchConversation(id: string, viewerId?: string | null): Promise<Conversation> {
    let { data, error } = await supabase
      .from('conversations')
      .select(
        `
        id, is_group, title, is_request, last_message_at, created_at, updated_at,
        members:conversation_members(${MEMBER_SELECT})
      `,
      )
      .eq('id', id)
      .single();

    if (error && /is_request|muted|pinned_at|nickname/i.test(error.message ?? '')) {
      const fallback = await supabase
        .from('conversations')
        .select(
          `
          id, is_group, title, last_message_at, created_at, updated_at,
          members:conversation_members(${MEMBER_SELECT_FALLBACK})
        `,
        )
        .eq('id', id)
        .single();
      data = fallback.data as typeof data;
      error = fallback.error;
    }
    if (error) throw new Error(toUserError(error));
    return mapConversation(data as Record<string, unknown>, viewerId);
  }

  return {
    async listConversations(
      userId: string,
      opts: { requestsOnly?: boolean } = {},
    ): Promise<Conversation[]> {
      void supabase.rpc('purge_expired_messages').then(
        () => undefined,
        () => undefined,
      );

      const { data: memberships, error: memError } = await supabase
        .from('conversation_members')
        .select('conversation_id, muted, pinned_at')
        .eq('user_id', userId);

      if (memError) throw new Error(toUserError(memError));
      const ids = (memberships ?? []).map((m) =>
        String((m as { conversation_id: string }).conversation_id),
      );
      if (ids.length === 0) return [];

      let query = supabase
        .from('conversations')
        .select(
          `
          id, is_group, title, is_request, last_message_at, created_at, updated_at,
          members:conversation_members(${MEMBER_SELECT})
        `,
        )
        .in('id', ids)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (opts.requestsOnly) {
        query = query.eq('is_request', true);
      } else {
        query = query.or('is_request.eq.false,is_request.is.null');
      }

      let { data, error } = await query;
      if (error && /is_request|muted|pinned_at|nickname/i.test(error.message ?? '')) {
        const fallback = await supabase
          .from('conversations')
          .select(
            `
            id, is_group, title, last_message_at, created_at, updated_at,
            members:conversation_members(${MEMBER_SELECT_FALLBACK})
          `,
          )
          .in('id', ids)
          .order('last_message_at', { ascending: false, nullsFirst: false });
        data = fallback.data as typeof data;
        error = fallback.error;
      }
      if (error) throw new Error(toUserError(error));

      const list = (data ?? []).map((row) =>
        mapConversation(row as Record<string, unknown>, userId),
      );

      // Pin muted-aware sort: pinned first, then last_message_at
      return list.sort((a, b) => {
        const ap = a.pinnedAt ? 1 : 0;
        const bp = b.pinnedAt ? 1 : 0;
        if (ap !== bp) return bp - ap;
        return (b.lastMessageAt ?? '').localeCompare(a.lastMessageAt ?? '');
      });
    },

    async listMessageRequests(userId: string): Promise<Conversation[]> {
      return this.listConversations(userId, { requestsOnly: true });
    },

    async acceptRequest(conversationId: string, userId: string): Promise<Conversation> {
      const { error } = await supabase
        .from('conversations')
        .update({ is_request: false })
        .eq('id', conversationId);
      if (error) throw new Error(toUserError(error));
      return fetchConversation(conversationId, userId);
    },

    async declineRequest(conversationId: string, userId: string): Promise<void> {
      const { error } = await supabase
        .from('conversation_members')
        .delete()
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);
      if (error) throw new Error(toUserError(error));
    },

    async getOrCreateDM(currentUserId: string, otherUserId: string): Promise<Conversation> {
      if (currentUserId === otherUserId) {
        throw new Error('Cannot message yourself.');
      }

      const { data: blocked } = await supabase
        .from('blocked_users')
        .select('id')
        .or(
          `and(blocker_id.eq.${currentUserId},blocked_id.eq.${otherUserId}),and(blocker_id.eq.${otherUserId},blocked_id.eq.${currentUserId})`,
        )
        .maybeSingle();
      if (blocked) {
        throw new Error('You cannot message this user.');
      }

      const { data: conversationId, error } = await supabase.rpc('get_or_create_dm', {
        other_user_id: otherUserId,
      });

      if (error) throw new Error(toUserError(error));
      const id = String(conversationId);

      const asRequest = await shouldStartAsRequest(supabase, currentUserId, otherUserId);
      if (asRequest) {
        await supabase
          .from('conversations')
          .update({ is_request: true })
          .eq('id', id)
          .eq('is_request', false)
          .is('last_message_at', null);
      }

      return fetchConversation(id, currentUserId);
    },

    async createGroup(
      creatorId: string,
      title: string,
      memberIds: string[],
    ): Promise<Conversation> {
      const { data: conversationId, error } = await supabase.rpc('create_group_conversation', {
        p_title: title.trim(),
        p_member_ids: memberIds.filter((id) => id !== creatorId),
      });
      if (error) throw new Error(toUserError(error));
      return fetchConversation(String(conversationId), creatorId);
    },

    async listMessages(
      conversationId: string,
      params: PageParams & { currentUserId?: string | null } = {},
    ): Promise<Message[]> {
      void supabase.rpc('purge_expired_messages').then(
        () => undefined,
        () => undefined,
      );

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

      let { data, error } = await query;
      if (error && /reply_to|expires_at/i.test(error.message ?? '')) {
        const fallback = await supabase
          .from('messages')
          .select(MESSAGE_SELECT_FALLBACK)
          .eq('conversation_id', conversationId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(limit);
        data = fallback.data as typeof data;
        error = fallback.error;
      }
      if (error) throw new Error(toUserError(error));

      let messages = (data ?? [])
        .map((row) => mapMessage(row as Record<string, unknown>, { myUserId: params.currentUserId }))
        .reverse();

      // Attach reactions
      if (messages.length > 0) {
        const ids = messages.map((m) => m.id);
        const { data: reactionRows } = await supabase
          .from('message_reactions')
          .select('id, message_id, user_id, reaction, created_at')
          .in('message_id', ids);
        if (reactionRows) {
          const byMessage = new Map<string, MessageReaction[]>();
          for (const row of reactionRows) {
            const mapped = mapReaction(row as Record<string, unknown>);
            const list = byMessage.get(mapped.messageId) ?? [];
            list.push(mapped);
            byMessage.set(mapped.messageId, list);
          }
          messages = messages.map((m) => {
            const reactions = byMessage.get(m.id) ?? [];
            return {
              ...m,
              reactions,
              myReaction: params.currentUserId
                ? (reactions.find((r) => r.userId === params.currentUserId)?.reaction ?? null)
                : null,
            };
          });
        }
      }

      return messages;
    },

    async send(conversationId: string, senderId: string, body: string): Promise<Message> {
      return this.sendMessage({ conversationId, senderId, body });
    },

    async sendMessage(input: SendMessageInput): Promise<Message> {
      const text = (input.body ?? '').trim();
      const hasMedia = Boolean(input.attachments && input.attachments.length > 0);
      if (!text && !hasMedia) {
        throw new Error('Write a message or add an attachment.');
      }

      let expiresAt: string | null = null;
      if (input.expiresInMinutes && input.expiresInMinutes > 0) {
        expiresAt = new Date(Date.now() + input.expiresInMinutes * 60_000).toISOString();
      }

      const payload: Record<string, unknown> = {
        conversation_id: input.conversationId,
        sender_id: input.senderId,
        body: text || '',
        reply_to_id: input.replyToId ?? null,
        story_id: input.storyId ?? null,
        expires_at: expiresAt,
      };

      let { data, error } = await supabase
        .from('messages')
        .insert(payload)
        .select(MESSAGE_SELECT)
        .single();

      if (error && /reply_to|expires_at|story_id/i.test(error.message ?? '')) {
        const fallbackBody =
          input.storyId && text
            ? `↩️ Story reply: ${text}`
            : text || (hasMedia ? ' ' : '');
        const fallback = await supabase
          .from('messages')
          .insert({
            conversation_id: input.conversationId,
            sender_id: input.senderId,
            body: fallbackBody,
          })
          .select(MESSAGE_SELECT_FALLBACK)
          .single();
        data = fallback.data as typeof data;
        error = fallback.error;
      }
      if (error) throw new Error(toUserError(error));

      const message = mapMessage(data as Record<string, unknown>, { myUserId: input.senderId });

      if (input.attachments && input.attachments.length > 0) {
        const rows = input.attachments.map((a) => ({
          message_id: message.id,
          url: a.url,
          media_type: a.mediaType,
          file_name: a.fileName ?? null,
        }));
        const { data: attached, error: attError } = await supabase
          .from('message_attachments')
          .insert(rows)
          .select(ATTACHMENT_SELECT);
        if (attError) throw new Error(toUserError(attError));
        message.attachments = (attached ?? []).map((r) =>
          mapAttachment(r as Record<string, unknown>),
        );
      }

      // If this was a request conversation and recipient is messaging back, accept
      await supabase
        .from('conversations')
        .update({ is_request: false })
        .eq('id', input.conversationId)
        .eq('is_request', true);

      return message;
    },

    async markRead(conversationId: string, userId: string): Promise<void> {
      const { error } = await supabase
        .from('conversation_members')
        .update({ last_read_at: new Date().toISOString() })
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);
      if (error) throw new Error(toUserError(error));
    },

    async setMemberPrefs(
      conversationId: string,
      userId: string,
      prefs: { muted?: boolean; pinned?: boolean; nickname?: string | null },
    ): Promise<void> {
      const patch: Record<string, unknown> = {};
      if (prefs.muted !== undefined) patch.muted = prefs.muted;
      if (prefs.pinned !== undefined) {
        patch.pinned_at = prefs.pinned ? new Date().toISOString() : null;
      }
      if (prefs.nickname !== undefined) {
        patch.nickname = prefs.nickname?.trim() || null;
      }
      const { error } = await supabase
        .from('conversation_members')
        .update(patch)
        .eq('conversation_id', conversationId)
        .eq('user_id', userId);
      if (error) throw new Error(toUserError(error));
    },

    async setReaction(
      messageId: string,
      userId: string,
      reaction: MessageReactionType | null,
    ): Promise<void> {
      if (reaction == null) {
        const { error } = await supabase
          .from('message_reactions')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', userId);
        if (error) throw new Error(toUserError(error));
        return;
      }
      const { error } = await supabase.from('message_reactions').upsert(
        { message_id: messageId, user_id: userId, reaction },
        { onConflict: 'message_id,user_id' },
      );
      if (error) throw new Error(toUserError(error));
    },

    async softDeleteMessage(messageId: string, senderId: string): Promise<void> {
      const { error } = await supabase
        .from('messages')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', messageId)
        .eq('sender_id', senderId);
      if (error) throw new Error(toUserError(error));
    },

    async searchMessages(
      userId: string,
      query: string,
      limit = 30,
    ): Promise<Array<{ message: Message; conversationId: string }>> {
      const q = query.trim();
      if (q.length < 2) return [];

      const { data: memberships, error: memError } = await supabase
        .from('conversation_members')
        .select('conversation_id')
        .eq('user_id', userId);
      if (memError) throw new Error(toUserError(memError));
      const ids = (memberships ?? []).map((m) =>
        String((m as { conversation_id: string }).conversation_id),
      );
      if (ids.length === 0) return [];

      const { data, error } = await supabase
        .from('messages')
        .select(MESSAGE_SELECT_FALLBACK)
        .in('conversation_id', ids)
        .is('deleted_at', null)
        .ilike('body', `%${q}%`)
        .order('created_at', { ascending: false })
        .limit(Math.min(limit, 50));
      if (error) throw new Error(toUserError(error));

      return (data ?? []).map((row) => {
        const message = mapMessage(row as Record<string, unknown>, { myUserId: userId });
        return { message, conversationId: message.conversationId };
      });
    },

    async heartbeat(userId: string, online = true): Promise<void> {
      const { error } = await supabase.from('user_presence').upsert(
        {
          user_id: userId,
          is_online: online,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );
      if (error && !/user_presence/i.test(error.message ?? '')) {
        throw new Error(toUserError(error));
      }
    },

    async getPresence(userIds: string[]): Promise<UserPresence[]> {
      if (userIds.length === 0) return [];
      const { data, error } = await supabase
        .from('user_presence')
        .select('user_id, last_seen_at, is_online')
        .in('user_id', userIds);
      if (error) {
        if (/user_presence/i.test(error.message ?? '')) return [];
        throw new Error(toUserError(error));
      }
      return (data ?? []).map((r) => ({
        userId: String((r as { user_id: string }).user_id),
        lastSeenAt: String((r as { last_seen_at: string }).last_seen_at ?? ''),
        isOnline: Boolean((r as { is_online: boolean }).is_online),
      }));
    },

    async otherParticipant(
      conversation: Conversation,
      currentUserId: string,
    ): Promise<Profile | null> {
      if (conversation.isGroup) return null;
      const other = conversation.members?.find((m) => m.userId !== currentUserId);
      return other?.profile ?? null;
    },

    /** Realtime typing helpers use broadcast channels — no DB. */
    typingChannelName(conversationId: string): string {
      return `typing:${conversationId}`;
    },
  };
}

export type MessagesService = ReturnType<typeof createMessagesService>;
