import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type {
  FriendRequest,
  FriendRequestStatus,
  PageParams,
  Profile,
  RelationshipStatus,
} from './types';

const FRIEND_REQUEST_SELECT = `
  id, from_user_id, to_user_id, status, created_at, updated_at,
  from_user:profiles!friend_requests_from_user_id_fkey(${PROFILE_SELECT}),
  to_user:profiles!friend_requests_to_user_id_fkey(${PROFILE_SELECT})
`;

function mapAuthor(row: unknown): Profile | null {
  if (!row || typeof row !== 'object') return null;
  return mapProfileRow(row as Record<string, unknown>);
}

function mapFriendRequestRow(row: Record<string, unknown>): FriendRequest {
  const statusRaw = String(row.status ?? 'pending');
  const status: FriendRequestStatus =
    statusRaw === 'accepted' || statusRaw === 'rejected' ? statusRaw : 'pending';

  return {
    id: String(row.id),
    fromUserId: String(row.from_user_id),
    toUserId: String(row.to_user_id),
    status,
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    fromUser: mapAuthor(row.from_user),
    toUser: mapAuthor(row.to_user),
  };
}

function orderedPair(userId: string, otherId: string): [string, string] {
  return userId < otherId ? [userId, otherId] : [otherId, userId];
}

export function createFriendsService(supabase: SupabaseClient) {
  return {
    async sendRequest(fromUserId: string, toUserId: string): Promise<FriendRequest> {
      if (fromUserId === toUserId) {
        throw new Error('You cannot send a friend request to yourself.');
      }

      const { data: blocked } = await supabase
        .from('blocked_users')
        .select('id')
        .or(
          `and(blocker_id.eq.${fromUserId},blocked_id.eq.${toUserId}),and(blocker_id.eq.${toUserId},blocked_id.eq.${fromUserId})`,
        )
        .maybeSingle();
      if (blocked) {
        throw new Error('You cannot send a friend request to this user.');
      }

      const { data: existingFriendship } = await supabase
        .from('friendships')
        .select('id')
        .or(
          `and(user_a.eq.${orderedPair(fromUserId, toUserId)[0]},user_b.eq.${orderedPair(fromUserId, toUserId)[1]})`,
        )
        .maybeSingle();
      if (existingFriendship) {
        throw new Error('You are already friends.');
      }

      const { data, error } = await supabase
        .from('friend_requests')
        .insert({
          from_user_id: fromUserId,
          to_user_id: toUserId,
          status: 'pending',
        })
        .select(FRIEND_REQUEST_SELECT)
        .single();

      if (error) {
        if (/duplicate|unique/i.test(error.message)) {
          // Re-open a previously rejected request from the same direction
          const { data: prior, error: priorError } = await supabase
            .from('friend_requests')
            .update({ status: 'pending' })
            .eq('from_user_id', fromUserId)
            .eq('to_user_id', toUserId)
            .neq('status', 'accepted')
            .select(FRIEND_REQUEST_SELECT)
            .maybeSingle();
          if (priorError) throw new Error(toUserError(priorError));
          if (prior) return mapFriendRequestRow(prior as Record<string, unknown>);
          throw new Error('A friend request already exists between these users.');
        }
        throw new Error(toUserError(error));
      }

      return mapFriendRequestRow(data as Record<string, unknown>);
    },

    async cancelRequest(requestId: string, userId: string): Promise<void> {
      const { error } = await supabase
        .from('friend_requests')
        .delete()
        .eq('id', requestId)
        .eq('from_user_id', userId)
        .eq('status', 'pending');
      if (error) throw new Error(toUserError(error));
    },

    async acceptRequest(requestId: string, userId: string): Promise<FriendRequest> {
      const { data, error } = await supabase
        .from('friend_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId)
        .eq('to_user_id', userId)
        .eq('status', 'pending')
        .select(FRIEND_REQUEST_SELECT)
        .single();

      if (error) throw new Error(toUserError(error));
      return mapFriendRequestRow(data as Record<string, unknown>);
    },

    async rejectRequest(requestId: string, userId: string): Promise<FriendRequest> {
      const { data, error } = await supabase
        .from('friend_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId)
        .eq('to_user_id', userId)
        .eq('status', 'pending')
        .select(FRIEND_REQUEST_SELECT)
        .single();

      if (error) throw new Error(toUserError(error));
      return mapFriendRequestRow(data as Record<string, unknown>);
    },

    async listRequests(
      userId: string,
      params: PageParams & { direction?: 'incoming' | 'outgoing' | 'all' } = {},
    ): Promise<FriendRequest[]> {
      const limit = Math.min(params.limit ?? 30, 50);
      const direction = params.direction ?? 'incoming';

      let query = supabase
        .from('friend_requests')
        .select(FRIEND_REQUEST_SELECT)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (direction === 'incoming') {
        query = query.eq('to_user_id', userId);
      } else if (direction === 'outgoing') {
        query = query.eq('from_user_id', userId);
      } else {
        query = query.or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
      }

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }

      const { data, error } = await query;
      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((row) => mapFriendRequestRow(row as Record<string, unknown>));
    },

    async listFriends(userId: string, params: PageParams = {}): Promise<Profile[]> {
      const limit = Math.min(params.limit ?? 30, 50);
      let query = supabase
        .from('friendships')
        .select(
          `
          id, user_a, user_b, created_at,
          user_a_profile:profiles!friendships_user_a_fkey(${PROFILE_SELECT}),
          user_b_profile:profiles!friendships_user_b_fkey(${PROFILE_SELECT})
        `,
        )
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }

      const { data, error } = await query;
      if (error) throw new Error(toUserError(error));

      return (data ?? [])
        .map((row) => {
          const r = row as unknown as {
            user_a: string;
            user_b: string;
            user_a_profile: Record<string, unknown> | null;
            user_b_profile: Record<string, unknown> | null;
          };
          const other = r.user_a === userId ? r.user_b_profile : r.user_a_profile;
          return mapProfileRow(other);
        })
        .filter((p): p is Profile => p != null);
    },

    async removeFriend(userId: string, friendId: string): Promise<void> {
      const [userA, userB] = orderedPair(userId, friendId);
      const { error } = await supabase
        .from('friendships')
        .delete()
        .eq('user_a', userA)
        .eq('user_b', userB);

      if (error) throw new Error(toUserError(error));

      // Clear accepted/pending request rows so a fresh request can be sent later
      await supabase
        .from('friend_requests')
        .delete()
        .or(
          `and(from_user_id.eq.${userId},to_user_id.eq.${friendId}),and(from_user_id.eq.${friendId},to_user_id.eq.${userId})`,
        );
    },

    async areFriends(userId: string, otherId: string): Promise<boolean> {
      const [userA, userB] = orderedPair(userId, otherId);
      const { data, error } = await supabase
        .from('friendships')
        .select('id')
        .eq('user_a', userA)
        .eq('user_b', userB)
        .maybeSingle();
      if (error) throw new Error(toUserError(error));
      return Boolean(data);
    },

    async countMutualFriends(userId: string, otherId: string): Promise<number> {
      if (userId === otherId) return 0;
      const { data, error } = await supabase.rpc('count_mutual_friends', {
        viewer_id: userId,
        other_id: otherId,
      });
      if (error) throw new Error(toUserError(error));
      return Number(data ?? 0);
    },

    async listMutualFriends(
      userId: string,
      otherId: string,
      params: PageParams = {},
    ): Promise<Profile[]> {
      const limit = Math.min(params.limit ?? 20, 50);
      if (userId === otherId) return [];

      const { data: ids, error } = await supabase.rpc('list_mutual_friend_ids', {
        viewer_id: userId,
        other_id: otherId,
        lim: limit,
      });
      if (error) throw new Error(toUserError(error));

      const friendIds = ((ids ?? []) as Array<{ friend_id: string }>).map((row) =>
        String(row.friend_id),
      );
      if (friendIds.length === 0) return [];

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .in('id', friendIds)
        .eq('is_deactivated', false);
      if (profileError) throw new Error(toUserError(profileError));

      const byId = new Map(
        (data ?? [])
          .map((row) => mapProfileRow(row as Record<string, unknown>))
          .filter((p): p is Profile => p != null)
          .map((p) => [p.id, p] as const),
      );
      return friendIds
        .map((id: string) => byId.get(id))
        .filter((p): p is Profile => p != null);
    },

    async getRelationshipStatus(
      viewerId: string,
      otherId: string,
    ): Promise<RelationshipStatus> {
      const empty: RelationshipStatus = {
        following: false,
        followedBy: false,
        friends: false,
        outgoingFriendRequest: false,
        incomingFriendRequest: false,
        incomingFriendRequestId: null,
        outgoingFriendRequestId: null,
        blocked: false,
        blockedBy: false,
        mutualFriendsCount: 0,
        muteScope: null,
        restricted: false,
        snoozed: false,
        snoozeExpiresAt: null,
        closeFriend: false,
        favorited: false,
        outgoingFollowRequest: false,
        incomingFollowRequest: false,
        incomingFollowRequestId: null,
        outgoingFollowRequestId: null,
      };

      if (viewerId === otherId) return empty;

      const [userA, userB] = orderedPair(viewerId, otherId);
      const now = new Date().toISOString();

      const [
        { data: followOut },
        { data: followIn },
        { data: friendship },
        { data: requests },
        { data: blockOut },
        { data: blockIn },
        mutualFriendsCount,
        { data: muteRow },
        { data: restrictRow },
        { data: snoozeRow },
        { data: closeRow },
        { data: favRow },
        { data: followReqs },
      ] = await Promise.all([
        supabase
          .from('follows')
          .select('id')
          .eq('follower_id', viewerId)
          .eq('following_id', otherId)
          .maybeSingle(),
        supabase
          .from('follows')
          .select('id')
          .eq('follower_id', otherId)
          .eq('following_id', viewerId)
          .maybeSingle(),
        supabase
          .from('friendships')
          .select('id')
          .eq('user_a', userA)
          .eq('user_b', userB)
          .maybeSingle(),
        supabase
          .from('friend_requests')
          .select('id, from_user_id, to_user_id, status')
          .eq('status', 'pending')
          .or(
            `and(from_user_id.eq.${viewerId},to_user_id.eq.${otherId}),and(from_user_id.eq.${otherId},to_user_id.eq.${viewerId})`,
          ),
        supabase
          .from('blocked_users')
          .select('id')
          .eq('blocker_id', viewerId)
          .eq('blocked_id', otherId)
          .maybeSingle(),
        supabase
          .from('blocked_users')
          .select('id')
          .eq('blocker_id', otherId)
          .eq('blocked_id', viewerId)
          .maybeSingle(),
        this.countMutualFriends(viewerId, otherId),
        supabase
          .from('user_mutes')
          .select('scope')
          .eq('owner_id', viewerId)
          .eq('target_id', otherId)
          .maybeSingle(),
        supabase
          .from('user_restricts')
          .select('id')
          .eq('owner_id', viewerId)
          .eq('target_id', otherId)
          .maybeSingle(),
        supabase
          .from('user_snoozes')
          .select('expires_at')
          .eq('owner_id', viewerId)
          .eq('target_id', otherId)
          .gt('expires_at', now)
          .maybeSingle(),
        supabase
          .from('close_friends')
          .select('id')
          .eq('owner_id', viewerId)
          .eq('friend_id', otherId)
          .maybeSingle(),
        supabase
          .from('feed_favorites')
          .select('id')
          .eq('owner_id', viewerId)
          .eq('target_id', otherId)
          .maybeSingle(),
        supabase
          .from('follow_requests')
          .select('id, from_user_id, to_user_id, status')
          .eq('status', 'pending')
          .or(
            `and(from_user_id.eq.${viewerId},to_user_id.eq.${otherId}),and(from_user_id.eq.${otherId},to_user_id.eq.${viewerId})`,
          ),
      ]);

      const pending = (requests ?? []) as Array<{
        id: string;
        from_user_id: string;
        to_user_id: string;
      }>;
      const outgoing = pending.find(
        (r) => r.from_user_id === viewerId && r.to_user_id === otherId,
      );
      const incoming = pending.find(
        (r) => r.from_user_id === otherId && r.to_user_id === viewerId,
      );

      const followPending = (followReqs ?? []) as Array<{
        id: string;
        from_user_id: string;
        to_user_id: string;
      }>;
      const outgoingFollow = followPending.find(
        (r) => r.from_user_id === viewerId && r.to_user_id === otherId,
      );
      const incomingFollow = followPending.find(
        (r) => r.from_user_id === otherId && r.to_user_id === viewerId,
      );

      const muteScopeRaw = muteRow
        ? String((muteRow as { scope: string }).scope)
        : null;
      const muteScope =
        muteScopeRaw === 'posts' || muteScopeRaw === 'stories' || muteScopeRaw === 'all'
          ? muteScopeRaw
          : null;

      return {
        following: Boolean(followOut),
        followedBy: Boolean(followIn),
        friends: Boolean(friendship),
        outgoingFriendRequest: Boolean(outgoing),
        incomingFriendRequest: Boolean(incoming),
        outgoingFriendRequestId: outgoing ? String(outgoing.id) : null,
        incomingFriendRequestId: incoming ? String(incoming.id) : null,
        blocked: Boolean(blockOut),
        blockedBy: Boolean(blockIn),
        mutualFriendsCount,
        muteScope,
        restricted: Boolean(restrictRow),
        snoozed: Boolean(snoozeRow),
        snoozeExpiresAt: snoozeRow
          ? String((snoozeRow as { expires_at: string }).expires_at)
          : null,
        closeFriend: Boolean(closeRow),
        favorited: Boolean(favRow),
        outgoingFollowRequest: Boolean(outgoingFollow),
        incomingFollowRequest: Boolean(incomingFollow),
        outgoingFollowRequestId: outgoingFollow ? String(outgoingFollow.id) : null,
        incomingFollowRequestId: incomingFollow ? String(incomingFollow.id) : null,
      };
    },
  };
}

export type FriendsService = ReturnType<typeof createFriendsService>;
