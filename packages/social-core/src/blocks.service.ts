import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type { BlockedUser, ToggleResult } from './types';

export function createBlocksService(supabase: SupabaseClient) {
  return {
    async toggleBlock(blockerId: string, blockedId: string): Promise<ToggleResult> {
      if (blockerId === blockedId) {
        throw new Error('You cannot block yourself.');
      }

      const { data: existing, error: findError } = await supabase
        .from('blocked_users')
        .select('id')
        .eq('blocker_id', blockerId)
        .eq('blocked_id', blockedId)
        .maybeSingle();

      if (findError) throw new Error(toUserError(findError));

      if (existing) {
        const { error } = await supabase.from('blocked_users').delete().eq('id', existing.id);
        if (error) throw new Error(toUserError(error));
        return { active: false };
      }

      const { error } = await supabase.from('blocked_users').insert({
        blocker_id: blockerId,
        blocked_id: blockedId,
      });
      if (error) throw new Error(toUserError(error));
      return { active: true };
    },

    async listBlocked(blockerId: string): Promise<BlockedUser[]> {
      const { data, error } = await supabase
        .from('blocked_users')
        .select(
          `
          id, blocker_id, blocked_id, created_at,
          blocked:profiles!blocked_users_blocked_id_fkey(${PROFILE_SELECT})
        `,
        )
        .eq('blocker_id', blockerId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(toUserError(error));

      return (data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r.id),
          blockerId: String(r.blocker_id),
          blockedId: String(r.blocked_id),
          createdAt: String(r.created_at ?? ''),
          blocked: mapProfileRow((r.blocked as Record<string, unknown>) ?? null),
        };
      });
    },

    async isBlocked(blockerId: string, blockedId: string): Promise<boolean> {
      const { data, error } = await supabase
        .from('blocked_users')
        .select('id')
        .eq('blocker_id', blockerId)
        .eq('blocked_id', blockedId)
        .maybeSingle();
      if (error) throw new Error(toUserError(error));
      return Boolean(data);
    },

    /** True if either user has blocked the other. */
    async isBlockedEither(userA: string, userB: string): Promise<boolean> {
      const { data, error } = await supabase
        .from('blocked_users')
        .select('id')
        .or(
          `and(blocker_id.eq.${userA},blocked_id.eq.${userB}),and(blocker_id.eq.${userB},blocked_id.eq.${userA})`,
        )
        .maybeSingle();
      if (error) throw new Error(toUserError(error));
      return Boolean(data);
    },

    /** User ids to hide from feeds / suggestions for `userId`. */
    async listExcludedUserIds(userId: string): Promise<string[]> {
      const { data, error } = await supabase
        .from('blocked_users')
        .select('blocker_id, blocked_id')
        .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`);
      if (error) throw new Error(toUserError(error));

      const ids = new Set<string>();
      for (const row of data ?? []) {
        const r = row as { blocker_id: string; blocked_id: string };
        ids.add(r.blocker_id === userId ? r.blocked_id : r.blocker_id);
      }
      return [...ids];
    },
  };
}

export type BlocksService = ReturnType<typeof createBlocksService>;
