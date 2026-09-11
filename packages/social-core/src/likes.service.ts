import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import type { ToggleResult } from './types';

export function createLikesService(supabase: SupabaseClient) {
  return {
    async toggleLike(postId: string, userId: string): Promise<ToggleResult> {
      const { data: existing, error: findError } = await supabase
        .from('post_likes')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .maybeSingle();

      if (findError) throw new Error(toUserError(findError));

      if (existing) {
        const { error } = await supabase.from('post_likes').delete().eq('id', existing.id);
        if (error) throw new Error(toUserError(error));
        return { active: false };
      }

      const { error } = await supabase.from('post_likes').insert({
        post_id: postId,
        user_id: userId,
      });
      if (error) throw new Error(toUserError(error));
      return { active: true };
    },

    async toggleCommentLike(commentId: string, userId: string): Promise<ToggleResult> {
      const { data: existing, error: findError } = await supabase
        .from('comment_likes')
        .select('id')
        .eq('comment_id', commentId)
        .eq('user_id', userId)
        .maybeSingle();

      if (findError) throw new Error(toUserError(findError));

      if (existing) {
        const { error } = await supabase.from('comment_likes').delete().eq('id', existing.id);
        if (error) throw new Error(toUserError(error));
        return { active: false };
      }

      const { error } = await supabase.from('comment_likes').insert({
        comment_id: commentId,
        user_id: userId,
      });
      if (error) throw new Error(toUserError(error));
      return { active: true };
    },
  };
}

export type LikesService = ReturnType<typeof createLikesService>;
