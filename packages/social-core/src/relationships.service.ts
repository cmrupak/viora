import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type {
  CloseFriend,
  FeedFavorite,
  MuteScope,
  PageParams,
  ToggleResult,
  UserMute,
  UserRestrict,
  UserSnooze,
} from './types';

function mapMute(row: Record<string, unknown>): UserMute {
  const scopeRaw = String(row.scope ?? 'all');
  const scope: MuteScope =
    scopeRaw === 'posts' || scopeRaw === 'stories' ? scopeRaw : 'all';
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    targetId: String(row.target_id),
    scope,
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    target: mapProfileRow((row.target as Record<string, unknown>) ?? null),
  };
}

function mapRestrict(row: Record<string, unknown>): UserRestrict {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    targetId: String(row.target_id),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    target: mapProfileRow((row.target as Record<string, unknown>) ?? null),
  };
}

function mapSnooze(row: Record<string, unknown>): UserSnooze {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    targetId: String(row.target_id),
    expiresAt: String(row.expires_at ?? ''),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    target: mapProfileRow((row.target as Record<string, unknown>) ?? null),
  };
}

function mapCloseFriend(row: Record<string, unknown>): CloseFriend {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    friendId: String(row.friend_id),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    friend: mapProfileRow((row.friend as Record<string, unknown>) ?? null),
  };
}

function mapFavorite(row: Record<string, unknown>): FeedFavorite {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    targetId: String(row.target_id),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    target: mapProfileRow((row.target as Record<string, unknown>) ?? null),
  };
}

export function createRelationshipsService(supabase: SupabaseClient) {
  return {
    async setMute(
      ownerId: string,
      targetId: string,
      scope: MuteScope | null,
    ): Promise<ToggleResult & { scope?: MuteScope }> {
      if (ownerId === targetId) throw new Error('You cannot mute yourself.');

      if (scope == null) {
        const { error } = await supabase
          .from('user_mutes')
          .delete()
          .eq('owner_id', ownerId)
          .eq('target_id', targetId);
        if (error) throw new Error(toUserError(error));
        return { active: false };
      }

      const { error } = await supabase.from('user_mutes').upsert(
        { owner_id: ownerId, target_id: targetId, scope },
        { onConflict: 'owner_id,target_id' },
      );
      if (error) throw new Error(toUserError(error));
      return { active: true, scope };
    },

    async listMutes(ownerId: string, params: PageParams = {}): Promise<UserMute[]> {
      const limit = Math.min(params.limit ?? 50, 100);
      const { data, error } = await supabase
        .from('user_mutes')
        .select(
          `id, owner_id, target_id, scope, created_at, updated_at,
           target:profiles!user_mutes_target_id_fkey(${PROFILE_SELECT})`,
        )
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((row) => mapMute(row as Record<string, unknown>));
    },

    async toggleRestrict(ownerId: string, targetId: string): Promise<ToggleResult> {
      if (ownerId === targetId) throw new Error('You cannot restrict yourself.');

      const { data: existing, error: findError } = await supabase
        .from('user_restricts')
        .select('id')
        .eq('owner_id', ownerId)
        .eq('target_id', targetId)
        .maybeSingle();
      if (findError) throw new Error(toUserError(findError));

      if (existing) {
        const { error } = await supabase.from('user_restricts').delete().eq('id', existing.id);
        if (error) throw new Error(toUserError(error));
        return { active: false };
      }

      const { error } = await supabase.from('user_restricts').insert({
        owner_id: ownerId,
        target_id: targetId,
      });
      if (error) throw new Error(toUserError(error));
      return { active: true };
    },

    async listRestricts(ownerId: string, params: PageParams = {}): Promise<UserRestrict[]> {
      const limit = Math.min(params.limit ?? 50, 100);
      const { data, error } = await supabase
        .from('user_restricts')
        .select(
          `id, owner_id, target_id, created_at, updated_at,
           target:profiles!user_restricts_target_id_fkey(${PROFILE_SELECT})`,
        )
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((row) => mapRestrict(row as Record<string, unknown>));
    },

    async listRestrictedTargetIds(ownerId: string): Promise<string[]> {
      const { data, error } = await supabase
        .from('user_restricts')
        .select('target_id')
        .eq('owner_id', ownerId);
      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((r) => String((r as { target_id: string }).target_id));
    },

    async snooze(ownerId: string, targetId: string, days = 30): Promise<UserSnooze> {
      if (ownerId === targetId) throw new Error('You cannot snooze yourself.');
      const expiresAt = new Date(
        Date.now() + Math.max(1, days) * 24 * 60 * 60 * 1000,
      ).toISOString();
      const { data, error } = await supabase
        .from('user_snoozes')
        .upsert(
          { owner_id: ownerId, target_id: targetId, expires_at: expiresAt },
          { onConflict: 'owner_id,target_id' },
        )
        .select(
          `id, owner_id, target_id, expires_at, created_at, updated_at,
           target:profiles!user_snoozes_target_id_fkey(${PROFILE_SELECT})`,
        )
        .single();
      if (error) throw new Error(toUserError(error));
      return mapSnooze(data as Record<string, unknown>);
    },

    async unsnooze(ownerId: string, targetId: string): Promise<void> {
      const { error } = await supabase
        .from('user_snoozes')
        .delete()
        .eq('owner_id', ownerId)
        .eq('target_id', targetId);
      if (error) throw new Error(toUserError(error));
    },

    async listSnoozes(ownerId: string, params: PageParams = {}): Promise<UserSnooze[]> {
      const limit = Math.min(params.limit ?? 50, 100);
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('user_snoozes')
        .select(
          `id, owner_id, target_id, expires_at, created_at, updated_at,
           target:profiles!user_snoozes_target_id_fkey(${PROFILE_SELECT})`,
        )
        .eq('owner_id', ownerId)
        .gt('expires_at', now)
        .order('expires_at', { ascending: true })
        .limit(limit);
      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((row) => mapSnooze(row as Record<string, unknown>));
    },

    async toggleCloseFriend(ownerId: string, friendId: string): Promise<ToggleResult> {
      if (ownerId === friendId) throw new Error('Invalid close friend.');

      const { data: existing, error: findError } = await supabase
        .from('close_friends')
        .select('id')
        .eq('owner_id', ownerId)
        .eq('friend_id', friendId)
        .maybeSingle();
      if (findError) throw new Error(toUserError(findError));

      if (existing) {
        const { error } = await supabase.from('close_friends').delete().eq('id', existing.id);
        if (error) throw new Error(toUserError(error));
        return { active: false };
      }

      const { error } = await supabase.from('close_friends').insert({
        owner_id: ownerId,
        friend_id: friendId,
      });
      if (error) throw new Error(toUserError(error));
      return { active: true };
    },

    async listCloseFriends(ownerId: string, params: PageParams = {}): Promise<CloseFriend[]> {
      const limit = Math.min(params.limit ?? 50, 100);
      const { data, error } = await supabase
        .from('close_friends')
        .select(
          `id, owner_id, friend_id, created_at, updated_at,
           friend:profiles!close_friends_friend_id_fkey(${PROFILE_SELECT})`,
        )
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((row) => mapCloseFriend(row as Record<string, unknown>));
    },

    async toggleFavorite(ownerId: string, targetId: string): Promise<ToggleResult> {
      if (ownerId === targetId) throw new Error('You cannot favorite yourself.');

      const { data: existing, error: findError } = await supabase
        .from('feed_favorites')
        .select('id')
        .eq('owner_id', ownerId)
        .eq('target_id', targetId)
        .maybeSingle();
      if (findError) throw new Error(toUserError(findError));

      if (existing) {
        const { error } = await supabase.from('feed_favorites').delete().eq('id', existing.id);
        if (error) throw new Error(toUserError(error));
        return { active: false };
      }

      const { error } = await supabase.from('feed_favorites').insert({
        owner_id: ownerId,
        target_id: targetId,
      });
      if (error) throw new Error(toUserError(error));
      return { active: true };
    },

    async listFavorites(ownerId: string, params: PageParams = {}): Promise<FeedFavorite[]> {
      const limit = Math.min(params.limit ?? 50, 100);
      const { data, error } = await supabase
        .from('feed_favorites')
        .select(
          `id, owner_id, target_id, created_at, updated_at,
           target:profiles!feed_favorites_target_id_fkey(${PROFILE_SELECT})`,
        )
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((row) => mapFavorite(row as Record<string, unknown>));
    },

    async listFavoriteIds(ownerId: string): Promise<string[]> {
      const { data, error } = await supabase
        .from('feed_favorites')
        .select('target_id')
        .eq('owner_id', ownerId);
      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((r) => String((r as { target_id: string }).target_id));
    },

    async listFeedHiddenAuthorIds(viewerId: string): Promise<string[]> {
      const { data, error } = await supabase.rpc('feed_hidden_author_ids', {
        viewer_id: viewerId,
      });
      if (error) throw new Error(toUserError(error));
      return ((data ?? []) as Array<{ author_id: string }>).map((r) => String(r.author_id));
    },

    async listStoryHiddenAuthorIds(viewerId: string): Promise<string[]> {
      const { data, error } = await supabase.rpc('story_hidden_author_ids', {
        viewer_id: viewerId,
      });
      if (error) throw new Error(toUserError(error));
      return ((data ?? []) as Array<{ author_id: string }>).map((r) => String(r.author_id));
    },
  };
}

export type RelationshipsService = ReturnType<typeof createRelationshipsService>;
