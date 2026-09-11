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

export type CommentSort = 'oldest' | 'newest' | 'top';

const COMMENT_SELECT = `
  id, post_id, author_id, parent_id, body, like_count, pinned_at, deleted_at, created_at, updated_at,
  author:profiles!comments_author_id_fkey(${PROFILE_SELECT})
`;

const COMMENT_SELECT_FALLBACK = `
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
    pinnedAt: row.pinned_at == null ? null : String(row.pinned_at),
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

function matchesKeyword(body: string, keyword: string): boolean {
  return body.toLowerCase().includes(keyword.trim().toLowerCase());
}

export function createCommentsService(supabase: SupabaseClient) {
  async function createComment(input: CreateCommentInput): Promise<Comment> {
    const body = input.body.trim();
    if (!body) throw new Error('Comment cannot be empty.');

    const { data: post, error: postError } = await supabase
      .from('posts')
      .select('id, author_id, comments_disabled')
      .eq('id', input.postId)
      .is('deleted_at', null)
      .maybeSingle();
    if (postError) throw new Error(toUserError(postError));
    if (!post) throw new Error('Post not found.');

    if (Boolean((post as { comments_disabled?: boolean }).comments_disabled)) {
      throw new Error('Comments are turned off for this post.');
    }

    const authorId = String((post as { author_id: string }).author_id);
    const { data: filters } = await supabase
      .from('comment_keyword_filters')
      .select('keyword')
      .eq('owner_id', authorId);
    for (const row of filters ?? []) {
      const keyword = String((row as { keyword: string }).keyword ?? '');
      if (keyword && matchesKeyword(body, keyword)) {
        throw new Error('This comment was blocked by the author\'s keyword filter.');
      }
    }

    if (input.parentId) {
      const { data: parent } = await supabase
        .from('comments')
        .select('id, post_id, parent_id')
        .eq('id', input.parentId)
        .is('deleted_at', null)
        .maybeSingle();
      if (!parent || String((parent as { post_id: string }).post_id) !== input.postId) {
        throw new Error('Parent comment not found.');
      }
      if ((parent as { parent_id: string | null }).parent_id) {
        throw new Error('Replies can only be one level deep.');
      }
    }

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

    if (error && /pinned_at|comments_disabled/i.test(error.message ?? '')) {
      const fallback = await supabase
        .from('comments')
        .insert({
          post_id: input.postId,
          author_id: input.authorId,
          parent_id: input.parentId ?? null,
          body,
        })
        .select(COMMENT_SELECT_FALLBACK)
        .single();
      if (fallback.error) throw new Error(toUserError(fallback.error));
      return mapCommentRow(fallback.data as Record<string, unknown>);
    }

    if (error) throw new Error(toUserError(error));
    return mapCommentRow(data as Record<string, unknown>);
  }

  return {
    async list(
      postId: string,
      params: PageParams & {
        currentUserId?: string | null;
        sort?: CommentSort;
      } = {},
    ): Promise<Comment[]> {
      const limit = Math.min(params.limit ?? 50, 100);
      const sort = params.sort ?? 'oldest';
      let query = supabase
        .from('comments')
        .select(COMMENT_SELECT)
        .eq('post_id', postId)
        .is('deleted_at', null)
        .is('parent_id', null)
        .order('pinned_at', { ascending: false, nullsFirst: false })
        .limit(limit);

      if (sort === 'newest') {
        query = query.order('created_at', { ascending: false });
      } else if (sort === 'top') {
        query = query.order('like_count', { ascending: false }).order('created_at', { ascending: true });
      } else {
        query = query.order('created_at', { ascending: true });
      }

      if (params.cursor) {
        query = query.gt('created_at', params.cursor);
      }

      let { data, error } = await query;
      if (error && /pinned_at/i.test(error.message ?? '')) {
        const fallback = await supabase
          .from('comments')
          .select(COMMENT_SELECT_FALLBACK)
          .eq('post_id', postId)
          .is('deleted_at', null)
          .is('parent_id', null)
          .order('created_at', { ascending: sort !== 'newest' })
          .limit(limit);
        data = fallback.data as typeof data;
        error = fallback.error;
      }
      if (error) throw new Error(toUserError(error));

      let roots = (data ?? []).map((row) => mapCommentRow(row as Record<string, unknown>));
      if (roots.length === 0) return [];

      const rootIds = roots.map((c) => c.id);
      let replyData: unknown[] | null = null;
      let replyError: { message?: string } | null = null;
      {
        const primary = await supabase
          .from('comments')
          .select(COMMENT_SELECT)
          .in('parent_id', rootIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: true });
        replyData = primary.data as unknown[] | null;
        replyError = primary.error;
        if (replyError && /pinned_at/i.test(replyError.message ?? '')) {
          const fallback = await supabase
            .from('comments')
            .select(COMMENT_SELECT_FALLBACK)
            .in('parent_id', rootIds)
            .is('deleted_at', null)
            .order('created_at', { ascending: true });
          replyData = fallback.data as unknown[] | null;
          replyError = fallback.error;
        }
      }
      if (replyError) throw new Error(toUserError(replyError));

      let replies = (replyData ?? []).map((row) =>
        mapCommentRow(row as Record<string, unknown>),
      );

      // Keyword filters from post author
      const { data: postRow } = await supabase
        .from('posts')
        .select('author_id')
        .eq('id', postId)
        .maybeSingle();
      const postAuthorId = postRow ? String((postRow as { author_id: string }).author_id) : null;
      if (postAuthorId) {
        const { data: filters } = await supabase
          .from('comment_keyword_filters')
          .select('keyword')
          .eq('owner_id', postAuthorId);
        const keywords = (filters ?? [])
          .map((r) => String((r as { keyword: string }).keyword ?? '').trim())
          .filter(Boolean);
        if (keywords.length > 0) {
          const visible = (c: Comment) =>
            c.authorId === postAuthorId ||
            c.authorId === params.currentUserId ||
            !keywords.some((k) => matchesKeyword(c.body, k));
          roots = roots.filter(visible);
          replies = replies.filter(visible);
        }
      }

      if (params.currentUserId) {
        const { data: restrictRows } = await supabase
          .from('user_restricts')
          .select('target_id')
          .eq('owner_id', params.currentUserId);
        const restricted = new Set(
          (restrictRows ?? []).map((r) => String((r as { target_id: string }).target_id)),
        );
        if (restricted.size > 0) {
          const visible = (c: Comment) =>
            !restricted.has(c.authorId) || c.authorId === params.currentUserId;
          roots = roots.filter(visible);
          replies = replies.filter(visible);
        }
      }

      const all = await attachCommentLikes(supabase, [...roots, ...replies], params.currentUserId);
      const byId = new Map(all.map((c) => [c.id, { ...c, replies: [] as Comment[] }]));

      for (const comment of all) {
        if (comment.parentId && byId.has(comment.parentId)) {
          byId.get(comment.parentId)!.replies!.push(byId.get(comment.id)!);
        }
      }

      return roots.map((r) => byId.get(r.id)!).filter(Boolean);
    },

    create: createComment,

    async createReply(input: CreateCommentInput & { parentId: string }): Promise<Comment> {
      return createComment({ ...input, parentId: input.parentId });
    },

    async update(commentId: string, authorId: string, body: string): Promise<Comment> {
      const next = body.trim();
      if (!next) throw new Error('Comment cannot be empty.');
      const { data, error } = await supabase
        .from('comments')
        .update({ body: next })
        .eq('id', commentId)
        .eq('author_id', authorId)
        .is('deleted_at', null)
        .select(COMMENT_SELECT)
        .single();
      if (error) throw new Error(toUserError(error));
      return mapCommentRow(data as Record<string, unknown>);
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

    async pin(commentId: string, postAuthorId: string, pinned: boolean): Promise<Comment> {
      const { data: comment, error: findError } = await supabase
        .from('comments')
        .select('id, post_id')
        .eq('id', commentId)
        .is('deleted_at', null)
        .maybeSingle();
      if (findError) throw new Error(toUserError(findError));
      if (!comment) throw new Error('Comment not found.');

      const { data: post, error: postError } = await supabase
        .from('posts')
        .select('id')
        .eq('id', (comment as { post_id: string }).post_id)
        .eq('author_id', postAuthorId)
        .maybeSingle();
      if (postError) throw new Error(toUserError(postError));
      if (!post) throw new Error('Only the post author can pin comments.');

      const { data, error } = await supabase
        .from('comments')
        .update({ pinned_at: pinned ? new Date().toISOString() : null })
        .eq('id', commentId)
        .select(COMMENT_SELECT)
        .single();
      if (error) throw new Error(toUserError(error));
      return mapCommentRow(data as Record<string, unknown>);
    },

    async listKeywordFilters(ownerId: string): Promise<Array<{ id: string; keyword: string }>> {
      const { data, error } = await supabase
        .from('comment_keyword_filters')
        .select('id, keyword')
        .eq('owner_id', ownerId)
        .order('created_at', { ascending: true });
      if (error) {
        if (/comment_keyword_filters/i.test(error.message ?? '')) return [];
        throw new Error(toUserError(error));
      }
      return (data ?? []).map((r) => ({
        id: String((r as { id: string }).id),
        keyword: String((r as { keyword: string }).keyword),
      }));
    },

    async addKeywordFilter(ownerId: string, keyword: string): Promise<{ id: string; keyword: string }> {
      const value = keyword.trim().toLowerCase();
      if (!value) throw new Error('Keyword cannot be empty.');
      const { data, error } = await supabase
        .from('comment_keyword_filters')
        .upsert({ owner_id: ownerId, keyword: value }, { onConflict: 'owner_id,keyword' })
        .select('id, keyword')
        .single();
      if (error) throw new Error(toUserError(error));
      return {
        id: String((data as { id: string }).id),
        keyword: String((data as { keyword: string }).keyword),
      };
    },

    async removeKeywordFilter(filterId: string, ownerId: string): Promise<void> {
      const { error } = await supabase
        .from('comment_keyword_filters')
        .delete()
        .eq('id', filterId)
        .eq('owner_id', ownerId);
      if (error) throw new Error(toUserError(error));
    },
  };
}

export type CommentsService = ReturnType<typeof createCommentsService>;
