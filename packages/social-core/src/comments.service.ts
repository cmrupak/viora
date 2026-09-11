import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type { Comment, PageParams, Profile } from './types';

export type CreateCommentInput = {
  postId: string;
  authorId: string;
  body: string;
  parentId?: string | null;
};

const COMMENT_SELECT = `
  id, post_id, author_id, parent_id, body, like_count, deleted_at, created_at, updated_at,
  author:profiles!comments_author_id_fkey(${PROFILE_SELECT})
`;

function mapAuthor(row: unknown): Profile | null {
  if (!row || typeof row !== 'object') return null;
  return mapProfileRow(row as Record<string, unknown>);
}

export function mapCommentRow(
  row: Record<string, unknown>,
  opts?: { liked?: boolean },
): Comment {
  return {
    id: String(row.id),
    postId: String(row.post_id),
    authorId: String(row.author_id),
    parentId: row.parent_id == null ? null : String(row.parent_id),
    body: String(row.body ?? ''),
    likeCount: Number(row.like_count ?? 0),
    likedByCurrentUser: Boolean(opts?.liked),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    author: mapAuthor(row.author ?? row.profiles),
  };
}

async function attachCommentLikes(
  supabase: SupabaseClient,
  comments: Comment[],
  currentUserId?: string | null,
): Promise<Comment[]> {
  if (!currentUserId || comments.length === 0) return comments;
  const ids = comments.map((c) => c.id);
  const { data } = await supabase
    .from('comment_likes')
    .select('comment_id')
    .eq('user_id', currentUserId)
    .in('comment_id', ids);
  const liked = new Set((data ?? []).map((r) => String((r as { comment_id: string }).comment_id)));
  return comments.map((c) => ({ ...c, likedByCurrentUser: liked.has(c.id) }));
}

export function createCommentsService(supabase: SupabaseClient) {
  return {
    async list(
      postId: string,
      params: PageParams & { currentUserId?: string | null } = {},
    ): Promise<Comment[]> {
      const limit = Math.min(params.limit ?? 50, 100);
      let query = supabase
        .from('comments')
        .select(COMMENT_SELECT)
        .eq('post_id', postId)
        .is('deleted_at', null)
        .is('parent_id', null)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (params.cursor) {
        query = query.gt('created_at', params.cursor);
      }

      const { data, error } = await query;
      if (error) throw new Error(toUserError(error));

      const roots = (data ?? []).map((row) => mapCommentRow(row as Record<string, unknown>));
      if (roots.length === 0) return [];

      const rootIds = roots.map((c) => c.id);
      const { data: replyData, error: replyError } = await supabase
        .from('comments')
        .select(COMMENT_SELECT)
        .in('parent_id', rootIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });

      if (replyError) throw new Error(toUserError(replyError));

      const replies = (replyData ?? []).map((row) => mapCommentRow(row as Record<string, unknown>));
      const all = await attachCommentLikes(supabase, [...roots, ...replies], params.currentUserId);
      const byId = new Map(all.map((c) => [c.id, { ...c, replies: [] as Comment[] }]));

      for (const comment of all) {
        if (comment.parentId && byId.has(comment.parentId)) {
          byId.get(comment.parentId)!.replies!.push(byId.get(comment.id)!);
        }
      }

      return roots.map((r) => byId.get(r.id)!);
    },

    async create(input: CreateCommentInput): Promise<Comment> {
      const body = input.body.trim();
      if (!body) throw new Error('Comment cannot be empty.');

      const { data, error } = await supabase
        .from('comments')
        .insert({
          post_id: input.postId,
          author_id: input.authorId,
          parent_id: input.parentId ?? null,
          body,
        })
        .select(COMMENT_SELECT)
        .single();

      if (error) throw new Error(toUserError(error));
      return mapCommentRow(data as Record<string, unknown>);
    },

    async createReply(input: CreateCommentInput & { parentId: string }): Promise<Comment> {
      return this.create({ ...input, parentId: input.parentId });
    },

    async softDelete(commentId: string, authorId: string): Promise<void> {
      const { error } = await supabase
        .from('comments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', commentId)
        .eq('author_id', authorId)
        .is('deleted_at', null);

      if (error) throw new Error(toUserError(error));
    },
  };
}

export type CommentsService = ReturnType<typeof createCommentsService>;
