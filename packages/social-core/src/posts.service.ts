import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type { PageParams, Post, PostMedia, Profile } from './types';

export type CreatePostInput = {
  authorId: string;
  body: string;
  media?: Array<{
    url: string;
    mediaType: 'image' | 'video';
    sortOrder?: number;
    width?: number | null;
    height?: number | null;
  }>;
};

export type ListPostsParams = PageParams & {
  currentUserId?: string | null;
  authorId?: string;
};

function mapMediaRow(row: Record<string, unknown>): PostMedia {
  return {
    id: String(row.id),
    postId: String(row.post_id),
    url: String(row.url),
    mediaType: row.media_type === 'video' ? 'video' : 'image',
    sortOrder: Number(row.sort_order ?? 0),
    width: row.width == null ? null : Number(row.width),
    height: row.height == null ? null : Number(row.height),
    createdAt: String(row.created_at ?? ''),
  };
}

function mapAuthor(row: unknown): Profile | null {
  if (!row || typeof row !== 'object') return null;
  return mapProfileRow(row as Record<string, unknown>);
}

export function mapPostRow(
  row: Record<string, unknown>,
  opts?: { liked?: boolean; saved?: boolean },
): Post {
  const mediaRaw = row.media ?? row.post_media;
  const media = Array.isArray(mediaRaw)
    ? (mediaRaw as Record<string, unknown>[]).map(mapMediaRow).sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  return {
    id: String(row.id),
    authorId: String(row.author_id),
    body: String(row.body ?? ''),
    likeCount: Number(row.like_count ?? 0),
    commentCount: Number(row.comment_count ?? 0),
    shareCount: Number(row.share_count ?? 0),
    saveCount: Number(row.save_count ?? 0),
    likedByCurrentUser: Boolean(opts?.liked),
    savedByCurrentUser: Boolean(opts?.saved),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    author: mapAuthor(row.author ?? row.profiles),
    media,
  };
}

const POST_SELECT = `
  id, author_id, body, like_count, comment_count, share_count, save_count,
  deleted_at, created_at, updated_at,
  author:profiles!posts_author_id_fkey(${PROFILE_SELECT}),
  media:post_media(id, post_id, url, media_type, sort_order, width, height, created_at)
`;

async function attachViewerFlags(
  supabase: SupabaseClient,
  posts: Post[],
  currentUserId?: string | null,
): Promise<Post[]> {
  if (!currentUserId || posts.length === 0) return posts;

  const ids = posts.map((p) => p.id);
  const [{ data: likes }, { data: saves }] = await Promise.all([
    supabase.from('post_likes').select('post_id').eq('user_id', currentUserId).in('post_id', ids),
    supabase.from('saved_posts').select('post_id').eq('user_id', currentUserId).in('post_id', ids),
  ]);

  const liked = new Set((likes ?? []).map((r) => String((r as { post_id: string }).post_id)));
  const saved = new Set((saves ?? []).map((r) => String((r as { post_id: string }).post_id)));

  return posts.map((p) => ({
    ...p,
    likedByCurrentUser: liked.has(p.id),
    savedByCurrentUser: saved.has(p.id),
  }));
}

export function createPostsService(supabase: SupabaseClient) {
  return {
    async create(input: CreatePostInput): Promise<Post> {
      const body = input.body.trim();
      if (!body && !(input.media && input.media.length > 0)) {
        throw new Error('Write something or add media to post.');
      }

      const { data, error } = await supabase
        .from('posts')
        .insert({
          author_id: input.authorId,
          body,
        })
        .select(POST_SELECT)
        .single();

      if (error) throw new Error(toUserError(error));

      const post = mapPostRow(data as Record<string, unknown>);

      if (input.media && input.media.length > 0) {
        const rows = input.media.map((m, i) => ({
          post_id: post.id,
          url: m.url,
          media_type: m.mediaType,
          sort_order: m.sortOrder ?? i,
          width: m.width ?? null,
          height: m.height ?? null,
        }));
        const { data: mediaData, error: mediaError } = await supabase
          .from('post_media')
          .insert(rows)
          .select('id, post_id, url, media_type, sort_order, width, height, created_at');
        if (mediaError) throw new Error(toUserError(mediaError));
        post.media = (mediaData ?? []).map((r) => mapMediaRow(r as Record<string, unknown>));
      }

      return post;
    },

    async listFeed(params: ListPostsParams = {}): Promise<Post[]> {
      const limit = Math.min(params.limit ?? 20, 50);
      const thinThreshold = Math.min(3, limit);

      const fetchGlobal = async (): Promise<Post[]> => {
        let query = supabase
          .from('posts')
          .select(POST_SELECT)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (params.cursor) {
          query = query.lt('created_at', params.cursor);
        }

        const { data, error } = await query;
        if (error) throw new Error(toUserError(error));
        return (data ?? []).map((row) => mapPostRow(row as Record<string, unknown>));
      };

      if (params.currentUserId) {
        const { data: followRows, error: followError } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', params.currentUserId);

        if (followError) throw new Error(toUserError(followError));

        const followingIds = (followRows ?? []).map((r) =>
          String((r as { following_id: string }).following_id),
        );

        if (followingIds.length > 0) {
          const authorIds = [...new Set([...followingIds, params.currentUserId])];
          let followingQuery = supabase
            .from('posts')
            .select(POST_SELECT)
            .is('deleted_at', null)
            .in('author_id', authorIds)
            .order('created_at', { ascending: false })
            .limit(limit);

          if (params.cursor) {
            followingQuery = followingQuery.lt('created_at', params.cursor);
          }

          const { data, error } = await followingQuery;
          if (error) throw new Error(toUserError(error));

          const followingPosts = (data ?? []).map((row) =>
            mapPostRow(row as Record<string, unknown>),
          );

          // Prefer following feed when it has enough items, or when paginating an established feed.
          if (
            followingPosts.length >= thinThreshold ||
            (params.cursor && followingPosts.length > 0)
          ) {
            return attachViewerFlags(supabase, followingPosts, params.currentUserId);
          }

          // Cursor page exhausted — do not mix with global mid-pagination.
          if (params.cursor) {
            return attachViewerFlags(supabase, followingPosts, params.currentUserId);
          }
          // First page thin / empty following → fall through to global chrono feed.
        }
      }

      const posts = await fetchGlobal();
      return attachViewerFlags(supabase, posts, params.currentUserId);
    },

    async listByUser(params: ListPostsParams & { authorId: string }): Promise<Post[]> {
      const limit = Math.min(params.limit ?? 20, 50);
      let query = supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('author_id', params.authorId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }

      const { data, error } = await query;
      if (error) throw new Error(toUserError(error));

      const posts = (data ?? []).map((row) => mapPostRow(row as Record<string, unknown>));
      return attachViewerFlags(supabase, posts, params.currentUserId);
    },

    async getById(postId: string, currentUserId?: string | null): Promise<Post | null> {
      const { data, error } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('id', postId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) throw new Error(toUserError(error));
      if (!data) return null;

      const [post] = await attachViewerFlags(
        supabase,
        [mapPostRow(data as Record<string, unknown>)],
        currentUserId,
      );
      return post ?? null;
    },

    async softDelete(postId: string, authorId: string): Promise<void> {
      const { error } = await supabase
        .from('posts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', postId)
        .eq('author_id', authorId)
        .is('deleted_at', null);

      if (error) throw new Error(toUserError(error));
    },
  };
}

export type PostsService = ReturnType<typeof createPostsService>;
