import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type {
  FollowRequest,
  FollowRequestStatus,
  PageParams,
  Profile,
  ToggleResult,
} from './types';

const FOLLOW_REQUEST_SELECT = `
  id, from_user_id, to_user_id, status, created_at, updated_at,
  from_user:profiles!follow_requests_from_user_id_fkey(${PROFILE_SELECT}),
  to_user:profiles!follow_requests_to_user_id_fkey(${PROFILE_SELECT})
`;

function mapFollowRequest(row: Record<string, unknown>): FollowRequest {
  const statusRaw = String(row.status ?? 'pending');
  const status: FollowRequestStatus =
    statusRaw === 'accepted' || statusRaw === 'rejected' ? statusRaw : 'pending';
  return {
    id: String(row.id),
    fromUserId: String(row.from_user_id),
    toUserId: String(row.to_user_id),
    status,
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    fromUser: mapProfileRow((row.from_user as Record<string, unknown>) ?? null),
    toUser: mapProfileRow((row.to_user as Record<string, unknown>) ?? null),
  };
}

export type FollowToggleResult = ToggleResult & {
  pendingRequest?: boolean;
};

export function createFollowsService(supabase: SupabaseClient) {
  return {
    /**
     * Public accounts: immediate follow/unfollow.
     * Private accounts: creates/cancels a follow_request instead of following.
     */
    async toggleFollow(followerId: string, followingId: string): Promise<FollowToggleResult> {
      if (followerId === followingId) {
        throw new Error('You cannot follow yourself.');
      }

      const { data: blocked } = await supabase
        .from('blocked_users')
        .select('id')
        .or(
          `and(blocker_id.eq.${followerId},blocked_id.eq.${followingId}),and(blocker_id.eq.${followingId},blocked_id.eq.${followerId})`,
        )
        .maybeSingle();
      if (blocked) {
        throw new Error('You cannot follow this user.');
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
        await supabase
          .from('follow_requests')
          .delete()
          .eq('from_user_id', followerId)
          .eq('to_user_id', followingId);
        return { active: false };
      }

      const { data: target, error: targetError } = await supabase
        .from('profiles')
        .select('is_private')
        .eq('id', followingId)
        .maybeSingle();
      if (targetError) throw new Error(toUserError(targetError));

      const isPrivate = Boolean((target as { is_private?: boolean } | null)?.is_private);

      if (isPrivate) {
        const { data: pending } = await supabase
          .from('follow_requests')
          .select('id, status')
          .eq('from_user_id', followerId)
          .eq('to_user_id', followingId)
          .maybeSingle();

        if (pending && String((pending as { status: string }).status) === 'pending') {
          const { error } = await supabase
            .from('follow_requests')
            .delete()
            .eq('id', (pending as { id: string }).id);
          if (error) throw new Error(toUserError(error));
          return { active: false, pendingRequest: false };
        }

        const { error } = await supabase.from('follow_requests').upsert(
          {
            from_user_id: followerId,
            to_user_id: followingId,
            status: 'pending',
          },
          { onConflict: 'from_user_id,to_user_id' },
        );
        if (error) throw new Error(toUserError(error));
        return { active: false, pendingRequest: true };
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

    async removeFollower(userId: string, followerId: string): Promise<void> {
      if (userId === followerId) {
        throw new Error('Invalid follower.');
      }
      const { error } = await supabase
        .from('follows')
        .delete()
        .eq('follower_id', followerId)
        .eq('following_id', userId);
      if (error) throw new Error(toUserError(error));
    },

    async listFollowRequests(
      userId: string,
      params: PageParams & { direction?: 'incoming' | 'outgoing' } = {},
    ): Promise<FollowRequest[]> {
      const limit = Math.min(params.limit ?? 30, 50);
      const direction = params.direction ?? 'incoming';
      let query = supabase
        .from('follow_requests')
        .select(FOLLOW_REQUEST_SELECT)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (direction === 'incoming') query = query.eq('to_user_id', userId);
      else query = query.eq('from_user_id', userId);

      if (params.cursor) query = query.lt('created_at', params.cursor);

      const { data, error } = await query;
      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((row) => mapFollowRequest(row as Record<string, unknown>));
    },

    async acceptFollowRequest(requestId: string, userId: string): Promise<FollowRequest> {
      const { data, error } = await supabase
        .from('follow_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId)
        .eq('to_user_id', userId)
        .eq('status', 'pending')
        .select(FOLLOW_REQUEST_SELECT)
        .single();
      if (error) throw new Error(toUserError(error));
      return mapFollowRequest(data as Record<string, unknown>);
    },

    async rejectFollowRequest(requestId: string, userId: string): Promise<FollowRequest> {
      const { data, error } = await supabase
        .from('follow_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId)
        .eq('to_user_id', userId)
        .eq('status', 'pending')
        .select(FOLLOW_REQUEST_SELECT)
        .single();
      if (error) throw new Error(toUserError(error));
      return mapFollowRequest(data as Record<string, unknown>);
    },

    async cancelFollowRequest(requestId: string, userId: string): Promise<void> {
      const { error } = await supabase
        .from('follow_requests')
        .delete()
        .eq('id', requestId)
        .eq('from_user_id', userId)
        .eq('status', 'pending');
      if (error) throw new Error(toUserError(error));
    },

    async listFollowers(userId: string, params: PageParams = {}): Promise<Profile[]> {
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

    async listFollowing(userId: string, params: PageParams = {}): Promise<Profile[]> {
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

    async listSuggestions(userId: string, limit = 8): Promise<Profile[]> {
      const safeLimit = Math.min(Math.max(limit, 1), 20);

      const [{ data: followingRows }, { data: friendRows }, { data: blockRows }] =
        await Promise.all([
          supabase.from('follows').select('following_id').eq('follower_id', userId),
          supabase
            .from('friendships')
            .select('user_a, user_b')
            .or(`user_a.eq.${userId},user_b.eq.${userId}`),
          supabase
            .from('blocked_users')
            .select('blocker_id, blocked_id')
            .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`),
        ]);

      const alreadyFollowing = new Set(
        (followingRows ?? []).map((r) => String((r as { following_id: string }).following_id)),
      );
      alreadyFollowing.add(userId);

      const blocked = new Set<string>();
      for (const row of blockRows ?? []) {
        const r = row as { blocker_id: string; blocked_id: string };
        blocked.add(r.blocker_id === userId ? r.blocked_id : r.blocker_id);
      }

      const seedIds = new Set<string>();
      for (const id of alreadyFollowing) {
        if (id !== userId) seedIds.add(id);
      }
      for (const row of friendRows ?? []) {
        const r = row as { user_a: string; user_b: string };
        seedIds.add(r.user_a === userId ? r.user_b : r.user_a);
      }

      const seeds = [...seedIds].slice(0, 30);
      if (seeds.length === 0) {
        const { data, error } = await supabase
          .from('profiles')
          .select(PROFILE_SELECT)
          .eq('is_deactivated', false)
          .neq('id', userId)
          .order('created_at', { ascending: false })
          .limit(safeLimit * 2);
        if (error) throw new Error(toUserError(error));
        return (data ?? [])
          .map((row) => mapProfileRow(row as Record<string, unknown>))
          .filter((p): p is Profile => p != null && !blocked.has(p.id) && !alreadyFollowing.has(p.id))
          .slice(0, safeLimit);
      }

      const [{ data: hopFollows }, { data: hopFriends }] = await Promise.all([
        supabase
          .from('follows')
          .select('following_id, follower_id')
          .in('follower_id', seeds)
          .limit(200),
        supabase
          .from('friendships')
          .select('user_a, user_b')
          .or(seeds.map((id) => `user_a.eq.${id},user_b.eq.${id}`).join(',')),
      ]);

      const scores = new Map<string, number>();
      const bump = (id: string, weight: number) => {
        if (!id || alreadyFollowing.has(id) || blocked.has(id)) return;
        scores.set(id, (scores.get(id) ?? 0) + weight);
      };

      for (const row of hopFollows ?? []) {
        const r = row as { following_id: string };
        bump(String(r.following_id), 1);
      }
      for (const row of hopFriends ?? []) {
        const r = row as { user_a: string; user_b: string };
        for (const seed of seeds) {
          if (r.user_a === seed) bump(r.user_b, 2);
          if (r.user_b === seed) bump(r.user_a, 2);
        }
      }

      const rankedIds = [...scores.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => id)
        .slice(0, safeLimit);

      if (rankedIds.length === 0) return [];

      const { data, error } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .in('id', rankedIds)
        .eq('is_deactivated', false);
      if (error) throw new Error(toUserError(error));

      const byId = new Map(
        (data ?? [])
          .map((row) => mapProfileRow(row as Record<string, unknown>))
          .filter((p): p is Profile => p != null)
          .map((p) => [p.id, p]),
      );

      return rankedIds.map((id) => byId.get(id)).filter((p): p is Profile => p != null);
    },
  };
}

export type FollowsService = ReturnType<typeof createFollowsService>;
