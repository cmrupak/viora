import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type { Notification, NotificationType, PageParams } from './types';

const NOTIFICATION_SELECT = `
  id, user_id, actor_id, type, post_id, comment_id, conversation_id, body, is_read, created_at,
  actor:profiles!notifications_actor_id_fkey(${PROFILE_SELECT})
`;

function mapNotification(row: Record<string, unknown>): Notification {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    actorId: row.actor_id == null ? null : String(row.actor_id),
    type: String(row.type) as NotificationType,
    postId: row.post_id == null ? null : String(row.post_id),
    commentId: row.comment_id == null ? null : String(row.comment_id),
    conversationId: row.conversation_id == null ? null : String(row.conversation_id),
    body: row.body == null ? null : String(row.body),
    isRead: Boolean(row.is_read),
    createdAt: String(row.created_at ?? ''),
    actor: mapProfileRow((row.actor as Record<string, unknown>) ?? null),
  };
}

export function createNotificationsService(supabase: SupabaseClient) {
  return {
    async list(userId: string, params: PageParams = {}): Promise<Notification[]> {
      const limit = Math.min(params.limit ?? 30, 50);
      let query = supabase
        .from('notifications')
        .select(NOTIFICATION_SELECT)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }

      const { data, error } = await query;
      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((row) => mapNotification(row as Record<string, unknown>));
    },

    async markRead(notificationId: string, userId: string): Promise<void> {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
        .eq('user_id', userId);
      if (error) throw new Error(toUserError(error));
    },

    async markAllRead(userId: string): Promise<void> {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);
      if (error) throw new Error(toUserError(error));
    },

    async unreadCount(userId: string): Promise<number> {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);
      if (error) throw new Error(toUserError(error));
      return count ?? 0;
    },
  };
}

export type NotificationsService = ReturnType<typeof createNotificationsService>;
