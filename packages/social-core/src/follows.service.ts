import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type { PageParams, Profile, ToggleResult } from './types';

export function createFollowsService(supabase: SupabaseClient) {
  return {
    async toggleFollow(followerId: string, followingId: string): Promise<ToggleResult> {
      if (followerId === followingId) {
        throw new Error('You cannot follow yourself.');
      }

      const { data: existing, error: findError } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .maybeSingle();

      if (findError) throw new Error(toUserError(findError));

      if (existing) {
        const { error } = await supabase.from('follows').delete().eq('id', existing.id);
        if (error) throw new Error(toUserError(error));
        return { active: false };
      }

      const { error } = await supabase.from('follows').insert({
        follower_id: followerId,
        following_id: followingId,
      });
      if (error) throw new Error(toUserError(error));
      return { active: true };
    },

    async isFollowing(followerId: string, followingId: string): Promise<boolean> {
      const { data, error } = await supabase
        .from('follows')
        .select('id')
        .eq('follower_id', followerId)
        .eq('following_id', followingId)
        .maybeSingle();
      if (error) throw new Error(toUserError(error));
      return Boolean(data);
    },

    async listFollowers(
      userId: string,
      params: PageParams = {},
    ): Promise<Profile[]> {
      const limit = Math.min(params.limit ?? 30, 50);
      let query = supabase
        .from('follows')
        .select(`created_at, follower:profiles!follows_follower_id_fkey(${PROFILE_SELECT})`)
        .eq('following_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }

      const { data, error } = await query;
      if (error) throw new Error(toUserError(error));

      return (data ?? [])
        .map((row) => {
          const r = row as unknown as { follower: Record<string, unknown> | null };
          return mapProfileRow(r.follower);
        })
        .filter((p): p is Profile => p != null);
    },

    async listFollowing(
      userId: string,
      params: PageParams = {},
    ): Promise<Profile[]> {
      const limit = Math.min(params.limit ?? 30, 50);
      let query = supabase
        .from('follows')
        .select(`created_at, following:profiles!follows_following_id_fkey(${PROFILE_SELECT})`)
        .eq('follower_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }

      const { data, error } = await query;
      if (error) throw new Error(toUserError(error));

      return (data ?? [])
        .map((row) => {
          const r = row as unknown as { following: Record<string, unknown> | null };
          return mapProfileRow(r.following);
        })
        .filter((p): p is Profile => p != null);
    },
  };
}

export type FollowsService = ReturnType<typeof createFollowsService>;
