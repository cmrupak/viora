import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { mapPostRow, POST_SELECT } from './posts.service';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type { Hashtag, PageParams, PlaceHit, Post, Profile } from './types';

const HASHTAG_SELECT = 'id, tag, post_count, created_at';

function mapHashtag(row: Record<string, unknown>): Hashtag {
  return {
    id: String(row.id),
    tag: String(row.tag ?? ''),
    postCount: Number(row.post_count ?? 0),
    createdAt: String(row.created_at ?? ''),
  };
}

export function createDiscoveryService(supabase: SupabaseClient) {
  return {
    async listTrendingHashtags(limit = 20): Promise<Hashtag[]> {
      const { data, error } = await supabase
        .from('hashtags')
        .select(HASHTAG_SELECT)
        .order('post_count', { ascending: false })
        .limit(Math.min(limit, 50));
      if (error) {
        if (/hashtags|relation/i.test(error.message ?? '')) return [];
        throw new Error(toUserError(error));
      }
      return (data ?? []).map((row) => mapHashtag(row as Record<string, unknown>));
    },

    async getHashtag(tag: string): Promise<Hashtag | null> {
      const normalized = tag.replace(/^#/, '').toLowerCase().trim();
      if (!normalized) return null;
      const { data, error } = await supabase
        .from('hashtags')
        .select(HASHTAG_SELECT)
        .eq('tag', normalized)
        .maybeSingle();
      if (error) {
        if (/hashtags|relation/i.test(error.message ?? '')) return null;
        throw new Error(toUserError(error));
      }
      if (!data) return null;
      return mapHashtag(data as Record<string, unknown>);
    },

    async listPostsByHashtag(
      tag: string,
      params: PageParams & { currentUserId?: string | null } = {},
    ): Promise<Post[]> {
      const normalized = tag.replace(/^#/, '').toLowerCase().trim();
      if (!normalized) return [];
      const hashtag = await this.getHashtag(normalized);
      if (!hashtag) return [];

      const limit = Math.min(params.limit ?? 20, 50);
      let query = supabase
        .from('post_hashtags')
        .select(
          `
          created_at,
          post:posts!post_hashtags_post_id_fkey(${POST_SELECT})
        `,
        )
        .eq('hashtag_id', hashtag.id)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }

      const { data, error } = await query;
      if (error) {
        if (/post_hashtags|relation/i.test(error.message ?? '')) return [];
        throw new Error(toUserError(error));
      }

      return (data ?? [])
        .map((row) => {
          const r = row as unknown as { post: Record<string, unknown> | null };
          if (!r.post || r.post.deleted_at) return null;
          return mapPostRow(r.post);
        })
        .filter((p): p is Post => p != null);
    },

    /** Simple Explore ranking: recent posts with engagement + media preference. */
    async listExplore(
      params: PageParams & { currentUserId?: string | null } = {},
    ): Promise<Post[]> {
      const limit = Math.min(params.limit ?? 24, 50);
      let query = supabase
        .from('posts')
        .select(POST_SELECT)
        .is('deleted_at', null)
        .is('archived_at', null)
        .order('like_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit * 2);

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }

      let { data, error } = await query;
      if (error && /publish_status|archived_at|post_tags|alt_text|duration/i.test(error.message ?? '')) {
        const fallback = await supabase
          .from('posts')
          .select(
            `id, author_id, body, like_count, comment_count, share_count, save_count,
             deleted_at, created_at, updated_at,
             author:profiles!posts_author_id_fkey(${PROFILE_SELECT}),
             media:post_media(id, post_id, url, media_type, sort_order, width, height, created_at)`,
          )
          .is('deleted_at', null)
          .order('like_count', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(limit * 2);
        data = fallback.data as typeof data;
        error = fallback.error;
      }
      if (error) throw new Error(toUserError(error));

      const posts = (data ?? [])
        .map((row) => mapPostRow(row as Record<string, unknown>))
        .filter((p) => {
          const status = p.publishStatus ?? 'published';
          return status === 'published' && !p.archivedAt;
        })
        .sort((a, b) => {
          const score = (p: Post) =>
            p.likeCount * 3 +
            p.commentCount * 2 +
            p.shareCount +
            (p.media && p.media.length > 0 ? 5 : 0);
          return score(b) - score(a);
        })
        .slice(0, limit);

      return posts;
    },

    async searchPlaces(query: string, limit = 20): Promise<PlaceHit[]> {
      const q = query.trim();
      if (q.length < 2) return [];
      const { data, error } = await supabase
        .from('posts')
        .select('location_name')
        .ilike('location_name', `%${q}%`)
        .is('deleted_at', null)
        .not('location_name', 'is', null)
        .limit(200);
      if (error) {
        if (/location_name/i.test(error.message ?? '')) return [];
        throw new Error(toUserError(error));
      }
      const counts = new Map<string, number>();
      for (const row of data ?? []) {
        const name = String((row as { location_name: string | null }).location_name ?? '').trim();
        if (!name) continue;
        counts.set(name, (counts.get(name) ?? 0) + 1);
      }
      return [...counts.entries()]
        .map(([locationName, postCount]) => ({ locationName, postCount }))
        .sort((a, b) => b.postCount - a.postCount)
        .slice(0, Math.min(limit, 50));
    },

    async listPostsByPlace(
      locationName: string,
      params: PageParams = {},
    ): Promise<Post[]> {
      const limit = Math.min(params.limit ?? 20, 50);
      let query = supabase
        .from('posts')
        .select(POST_SELECT)
        .ilike('location_name', locationName)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (params.cursor) query = query.lt('created_at', params.cursor);
      const { data, error } = await query;
      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((row) => mapPostRow(row as Record<string, unknown>));
    },

    async listBirthdaysToday(limit = 30): Promise<Profile[]> {
      const { data, error } = await supabase.rpc('list_birthdays_today', {
        p_limit: limit,
      });
      if (error) {
        if (/list_birthdays_today|function/i.test(error.message ?? '')) return [];
        throw new Error(toUserError(error));
      }
      const rows = (data ?? []) as Record<string, unknown>[];
      return rows
        .map((row) => mapProfileRow(row))
        .filter((p): p is Profile => p != null);
    },

    async listMemories(userId: string, limit = 20): Promise<Post[]> {
      const { data, error } = await supabase.rpc('list_memories', {
        p_user_id: userId,
        p_limit: limit,
      });
      if (error) {
        if (/list_memories|function/i.test(error.message ?? '')) return [];
        throw new Error(toUserError(error));
      }
      const raw = (data ?? []) as Array<{ id: string } & Record<string, unknown>>;
      const ids = raw.map((r) => String(r.id));
      if (ids.length === 0) return [];
      const { data: full, error: fullError } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .in('id', ids);
      if (fullError) {
        return raw.map((row) => mapPostRow(row));
      }
      const mapped = ((full ?? []) as Record<string, unknown>[]).map((row) => mapPostRow(row));
      const order = new Map<string, number>(ids.map((id, i) => [id, i]));
      return mapped.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    },
  };
}

export type DiscoveryService = ReturnType<typeof createDiscoveryService>;
