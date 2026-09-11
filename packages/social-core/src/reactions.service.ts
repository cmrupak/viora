import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type { PostReaction, ReactionType } from './types';

const REACTION_TYPES: ReactionType[] = ['love', 'haha', 'wow', 'sad', 'angry'];

const REACTION_SELECT = `
  id, post_id, user_id, reaction, created_at, updated_at,
  user:profiles!post_reactions_user_id_fkey(${PROFILE_SELECT})
`;

function mapReactionRow(row: Record<string, unknown>): PostReaction {
  const reactionRaw = String(row.reaction ?? 'love');
  const reaction: ReactionType = REACTION_TYPES.includes(reactionRaw as ReactionType)
    ? (reactionRaw as ReactionType)
    : 'love';

  return {
    id: String(row.id),
    postId: String(row.post_id),
    userId: String(row.user_id),
    reaction,
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    user:
      row.user && typeof row.user === 'object'
        ? mapProfileRow(row.user as Record<string, unknown>)
        : null,
  };
}

export function createReactionsService(supabase: SupabaseClient) {
  return {
    /**
     * Upsert a reaction for the user on a post, or clear it when `reaction` is null.
     */
    async setReaction(
      postId: string,
      userId: string,
      reaction: ReactionType | null,
    ): Promise<PostReaction | null> {
      if (reaction === null) {
        const { error } = await supabase
          .from('post_reactions')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', userId);
        if (error) throw new Error(toUserError(error));
        return null;
      }

      if (!REACTION_TYPES.includes(reaction)) {
        throw new Error('Invalid reaction type.');
      }

      const { data, error } = await supabase
        .from('post_reactions')
        .upsert(
          {
            post_id: postId,
            user_id: userId,
            reaction,
          },
          { onConflict: 'post_id,user_id' },
        )
        .select(REACTION_SELECT)
        .single();

      if (error) throw new Error(toUserError(error));
      return mapReactionRow(data as Record<string, unknown>);
    },

    async getForPost(postId: string, currentUserId?: string | null): Promise<{
      reactions: PostReaction[];
      counts: Record<ReactionType, number>;
      currentUserReaction: ReactionType | null;
    }> {
      const { data, error } = await supabase
        .from('post_reactions')
        .select(REACTION_SELECT)
        .eq('post_id', postId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(toUserError(error));

      const reactions = (data ?? []).map((row) => mapReactionRow(row as Record<string, unknown>));
      const counts: Record<ReactionType, number> = {
        love: 0,
        haha: 0,
        wow: 0,
        sad: 0,
        angry: 0,
      };
      for (const r of reactions) {
        counts[r.reaction] += 1;
      }

      const currentUserReaction =
        currentUserId != null
          ? (reactions.find((r) => r.userId === currentUserId)?.reaction ?? null)
          : null;

      return { reactions, counts, currentUserReaction };
    },
  };
}

export type ReactionsService = ReturnType<typeof createReactionsService>;
