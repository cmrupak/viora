import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import type { PostShare } from './types';

export function createSharesService(supabase: SupabaseClient) {
  return {
    async createShare(postId: string, userId: string): Promise<PostShare> {
      const { data, error } = await supabase
        .from('post_shares')
        .insert({
          post_id: postId,
          user_id: userId,
        })
        .select('id, post_id, user_id, created_at')
        .single();

      if (error) throw new Error(toUserError(error));

      const row = data as Record<string, unknown>;
      return {
        id: String(row.id),
        postId: String(row.post_id),
        userId: String(row.user_id),
        createdAt: String(row.created_at ?? ''),
      };
    },
  };
}

export type SharesService = ReturnType<typeof createSharesService>;
