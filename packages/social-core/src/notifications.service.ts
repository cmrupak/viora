import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type {
  Notification,
  NotificationPrefs,
  NotificationType,
  PageParams,
  Profile,
} from './types';

const NOTIFICATION_SELECT = `
  id, user_id, actor_id, type, post_id, comment_id, conversation_id, body, is_read, group_key, created_at,
  actor:profiles!notifications_actor_id_fkey(${PROFILE_SELECT})
`;

const NOTIFICATION_SELECT_FALLBACK = `
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
    groupKey: row.group_key == null ? null : String(row.group_key),
    createdAt: String(row.created_at ?? ''),
    actor: mapProfileRow((row.actor as Record<string, unknown>) ?? null),
  };
}

function mapPrefs(row: Record<string, unknown>): NotificationPrefs {
  return {
    userId: String(row.user_id),
    likes: Boolean(row.likes ?? true),
    comments: Boolean(row.comments ?? true),
    follows: Boolean(row.follows ?? true),
    messages: Boolean(row.messages ?? true),
    mentions: Boolean(row.mentions ?? true),
    shares: Boolean(row.shares ?? true),
    birthdays: Boolean(row.birthdays ?? true),
    memories: Boolean(row.memories ?? true),
    pushEnabled: Boolean(row.push_enabled ?? true),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
  };
}

function defaultPrefs(userId: string): NotificationPrefs {
  return {
    userId,
    likes: true,
    comments: true,
    follows: true,
    messages: true,
    mentions: true,
    shares: true,
    birthdays: true,
    memories: true,
    pushEnabled: true,
  };
}

function prefAllows(prefs: NotificationPrefs, type: NotificationType): boolean {
  switch (type) {
    case 'like':
      return prefs.likes;
    case 'comment':
    case 'reply':
      return prefs.comments;
    case 'follow':
      return prefs.follows;
    case 'message':
      return prefs.messages;
    case 'mention':
      return prefs.mentions;
    case 'share':
      return prefs.shares;
    case 'birthday':
      return prefs.birthdays;
    case 'memory':
      return prefs.memories;
    default:
      return true;
  }
}

/** Group similar notifications (same type + post within a bucket). */
export function groupNotifications(items: Notification[]): Notification[] {
  const groups = new Map<string, Notification>();
  for (const n of items) {
    const key =
      n.groupKey ||
      (n.postId ? `${n.type}:${n.postId}` : n.type === 'follow' ? `follow:${n.actorId}` : n.id);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        ...n,
        groupCount: 1,
        groupActors: n.actor ? [n.actor] : [],
      });
      continue;
    }
    const actors = [...(existing.groupActors ?? [])];
    if (n.actor && !actors.some((a) => a.id === n.actor!.id)) {
      actors.push(n.actor);
    }
    groups.set(key, {
      ...existing,
      groupCount: (existing.groupCount ?? 1) + 1,
      groupActors: actors.slice(0, 5),
      isRead: existing.isRead && n.isRead,
      createdAt: existing.createdAt > n.createdAt ? existing.createdAt : n.createdAt,
    });
  }
  return [...groups.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createNotificationsService(supabase: SupabaseClient) {
  return {
    async getPrefs(userId: string): Promise<NotificationPrefs> {
      const { data: ensured, error: ensureError } = await supabase.rpc('ensure_notification_prefs', {
        p_user_id: userId,
      });
      if (!ensureError && ensured) {
        const row = Array.isArray(ensured) ? ensured[0] : ensured;
        if (row) return mapPrefs(row as Record<string, unknown>);
      }

      const { data, error } = await supabase
        .from('notification_prefs')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        if (/notification_prefs|relation|ensure_notification_prefs/i.test(error.message ?? '')) {
          return defaultPrefs(userId);
        }
        throw new Error(toUserError(error));
      }
      if (!data) {
        const { data: inserted } = await supabase
          .from('notification_prefs')
          .upsert({ user_id: userId }, { onConflict: 'user_id' })
          .select('*')
          .maybeSingle();
        if (inserted) return mapPrefs(inserted as Record<string, unknown>);
        return defaultPrefs(userId);
      }
      return mapPrefs(data as Record<string, unknown>);
    },

    async updatePrefs(
      userId: string,
      patch: Partial<Omit<NotificationPrefs, 'userId' | 'updatedAt'>>,
    ): Promise<NotificationPrefs> {
      const row: Record<string, unknown> = { user_id: userId };
      if (patch.likes !== undefined) row.likes = patch.likes;
      if (patch.comments !== undefined) row.comments = patch.comments;
      if (patch.follows !== undefined) row.follows = patch.follows;
      if (patch.messages !== undefined) row.messages = patch.messages;
      if (patch.mentions !== undefined) row.mentions = patch.mentions;
      if (patch.shares !== undefined) row.shares = patch.shares;
      if (patch.birthdays !== undefined) row.birthdays = patch.birthdays;
      if (patch.memories !== undefined) row.memories = patch.memories;
      if (patch.pushEnabled !== undefined) row.push_enabled = patch.pushEnabled;

      const { data, error } = await supabase
        .from('notification_prefs')
        .upsert(row, { onConflict: 'user_id' })
        .select('*')
        .single();
      if (error) throw new Error(toUserError(error));
      return mapPrefs(data as Record<string, unknown>);
    },

    async registerPushToken(
      userId: string,
      token: string,
      platform: 'expo' | 'web' | 'android' | 'ios' = 'expo',
    ): Promise<void> {
      const trimmed = token.trim();
      if (!trimmed) throw new Error('Push token is required.');
      const { error } = await supabase.from('push_tokens').upsert(
        { user_id: userId, token: trimmed, platform },
        { onConflict: 'user_id,token' },
      );
      if (error) {
        if (/push_tokens|relation/i.test(error.message ?? '')) {
          throw new Error('Push tokens require migration 014.');
        }
        throw new Error(toUserError(error));
      }
    },

    async removePushToken(userId: string, token: string): Promise<void> {
      const { error } = await supabase
        .from('push_tokens')
        .delete()
        .eq('user_id', userId)
        .eq('token', token);
      if (error && !/push_tokens|relation/i.test(error.message ?? '')) {
        throw new Error(toUserError(error));
      }
    },

    async list(
      userId: string,
      params: PageParams & { grouped?: boolean } = {},
    ): Promise<Notification[]> {
      const limit = Math.min(params.limit ?? 30, 80);
      const prefs = await this.getPrefs(userId);

      let query = supabase
        .from('notifications')
        .select(NOTIFICATION_SELECT)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }

      let { data, error } = await query;
      if (error && /group_key/i.test(error.message ?? '')) {
        const fallback = await supabase
          .from('notifications')
          .select(NOTIFICATION_SELECT_FALLBACK)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);
        data = fallback.data as typeof data;
        error = fallback.error;
      }
      if (error) throw new Error(toUserError(error));

      let notifications = (data ?? []).map((row) => mapNotification(row as Record<string, unknown>));
      notifications = notifications.filter((n) => prefAllows(prefs, n.type));

      const { data: restrictRows } = await supabase
        .from('user_restricts')
        .select('target_id')
        .eq('owner_id', userId);
      if (restrictRows && restrictRows.length > 0) {
        const restricted = new Set(
          restrictRows.map((r) => String((r as { target_id: string }).target_id)),
        );
        notifications = notifications.filter(
          (n) => !n.actorId || !restricted.has(n.actorId),
        );
      }

      if (params.grouped !== false) {
        return groupNotifications(notifications);
      }
      return notifications;
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

    /** Soft birthday nudge notifications for friends/follows with DOB today (idempotent-ish client call). */
    async notifyBirthdays(viewerId: string, birthdays: Profile[]): Promise<number> {
      const prefs = await this.getPrefs(viewerId);
      if (!prefs.birthdays || birthdays.length === 0) return 0;
      let created = 0;
      const today = new Date().toISOString().slice(0, 10);
      for (const person of birthdays) {
        if (person.id === viewerId) continue;
        const groupKey = `birthday:${person.id}:${today}`;
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', viewerId)
          .eq('group_key', groupKey)
          .maybeSingle();
        if (existing) continue;
        const { error } = await supabase.from('notifications').insert({
          user_id: viewerId,
          actor_id: person.id,
          type: 'birthday',
          body: `It's ${person.displayName || person.username}'s birthday`,
          group_key: groupKey,
        });
        if (!error) created += 1;
      }
      return created;
    },

    async notifyMemories(userId: string, memoryPostIds: string[]): Promise<number> {
      const prefs = await this.getPrefs(userId);
      if (!prefs.memories || memoryPostIds.length === 0) return 0;
      const today = new Date().toISOString().slice(0, 10);
      const groupKey = `memory:${today}`;
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('group_key', groupKey)
        .maybeSingle();
      if (existing) return 0;
      const { error } = await supabase.from('notifications').insert({
        user_id: userId,
        actor_id: userId,
        type: 'memory',
        post_id: memoryPostIds[0],
        body: `You have ${memoryPostIds.length} memory${memoryPostIds.length === 1 ? '' : 'ies'} from this day`,
        group_key: groupKey,
      });
      return error ? 0 : 1;
    },
  };
}

export type NotificationsService = ReturnType<typeof createNotificationsService>;
