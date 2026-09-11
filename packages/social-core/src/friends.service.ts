import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type { FriendRequest, FriendRequestStatus, PageParams, Profile } from './types';

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
          throw new Error('A friend request already exists between these users.');
        }
        throw new Error(toUserError(error));
      }

      return mapFriendRequestRow(data as Record<string, unknown>);
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
    },
  };
}

export type FriendsService = ReturnType<typeof createFriendsService>;
