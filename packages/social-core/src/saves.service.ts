import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { mapPostRow } from './posts.service';
import { PROFILE_SELECT } from './profile.mapper';
import type { PageParams, Post, ToggleResult } from './types';

const SAVED_POST_SELECT = `
  id, user_id, post_id, created_at,
  post:posts!saved_posts_post_id_fkey(
    id, author_id, body, like_count, comment_count, share_count, save_count,
    deleted_at, created_at, updated_at,
    author:profiles!posts_author_id_fkey(${PROFILE_SELECT}),
    media:post_media(id, post_id, url, media_type, sort_order, width, height, created_at)
  )
`;

export function createSavesService(supabase: SupabaseClient) {
  return {
    async toggleSave(postId: string, userId: string): Promise<ToggleResult> {
      const { data: existing, error: findError } = await supabase
        .from('saved_posts')
        .select('id')
        .eq('post_id', postId)
        .eq('user_id', userId)
        .maybeSingle();

      if (findError) throw new Error(toUserError(findError));

      if (existing) {
        const { error } = await supabase.from('saved_posts').delete().eq('id', existing.id);
        if (error) throw new Error(toUserError(error));
        return { active: false };
      }

      const { error } = await supabase.from('saved_posts').insert({
        post_id: postId,
        user_id: userId,
      });
      if (error) throw new Error(toUserError(error));
      return { active: true };
    },

    async listSaved(
      userId: string,
      params: PageParams = {},
    ): Promise<Array<{ id: string; createdAt: string; post: Post }>> {
      const limit = Math.min(params.limit ?? 20, 50);
      let query = supabase
        .from('saved_posts')
        .select(SAVED_POST_SELECT)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }

      const { data, error } = await query;
      if (error) throw new Error(toUserError(error));

      return (data ?? [])
        .map((row) => {
          const r = row as Record<string, unknown>;
          const postRaw = r.post as Record<string, unknown> | null;
          if (!postRaw || postRaw.deleted_at) return null;
          return {
            id: String(r.id),
            createdAt: String(r.created_at ?? ''),
            post: {
              ...mapPostRow(postRaw, { saved: true }),
              savedByCurrentUser: true,
            },
          };
        })
        .filter((x): x is { id: string; createdAt: string; post: Post } => x != null);
    },
  };
}

export type SavesService = ReturnType<typeof createSavesService>;
