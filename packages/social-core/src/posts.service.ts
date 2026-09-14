import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type {
  PageParams,
  Post,
  PostMedia,
  PostPublishStatus,
  PostTag,
  PostTagStatus,
  PostVisibility,
  Profile,
} from './types';

export type CreatePostInput = {
  authorId: string;
  body: string;
  visibility?: PostVisibility;
  audienceListIds?: string[];
  publishStatus?: PostPublishStatus;
  scheduledAt?: string | null;
  locationName?: string | null;
  feeling?: string | null;
  taggedUserIds?: string[];
  isSensitive?: boolean;
  media?: Array<{
    url: string;
    mediaType: 'image' | 'video';
    sortOrder?: number;
    width?: number | null;
    height?: number | null;
    altText?: string | null;
    durationSeconds?: number | null;
  }>;
};

export type UpdatePostInput = {
  postId: string;
  authorId: string;
  body?: string;
  visibility?: PostVisibility;
  audienceListIds?: string[];
  locationName?: string | null;
  feeling?: string | null;
  publishStatus?: PostPublishStatus;
  scheduledAt?: string | null;
  taggedUserIds?: string[];
};

export type ListPostsParams = PageParams & {
  currentUserId?: string | null;
  authorId?: string;
  /** Include drafts/scheduled/archived for the author (own profile). */
  includeNonLive?: boolean;
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
    altText: row.alt_text == null ? null : String(row.alt_text),
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    createdAt: String(row.created_at ?? ''),
  };
}

function mapAuthor(row: unknown): Profile | null {
  if (!row || typeof row !== 'object') return null;
  return mapProfileRow(row as Record<string, unknown>);
}

function mapTagRow(row: Record<string, unknown>): PostTag {
  const statusRaw = String(row.status ?? 'pending');
  const status: PostTagStatus =
    statusRaw === 'approved' || statusRaw === 'rejected' ? statusRaw : 'pending';
  return {
    id: String(row.id),
    postId: String(row.post_id),
    taggedUserId: String(row.tagged_user_id),
    taggedBy: String(row.tagged_by),
    status,
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    taggedUser: mapAuthor(row.tagged_user ?? row.profiles),
  };
}

function mapPublishStatus(raw: unknown): PostPublishStatus {
  const value = String(raw ?? 'published');
  if (value === 'draft' || value === 'scheduled') return value;
  return 'published';
}

export function mapPostRow(
  row: Record<string, unknown>,
  opts?: { liked?: boolean; saved?: boolean },
): Post {
  const mediaRaw = row.media ?? row.post_media;
  const media = Array.isArray(mediaRaw)
    ? (mediaRaw as Record<string, unknown>[]).map(mapMediaRow).sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  const tagsRaw = row.tags ?? row.post_tags;
  const tags = Array.isArray(tagsRaw)
    ? (tagsRaw as Record<string, unknown>[]).map(mapTagRow)
    : [];

  const repostRaw = row.repost_of;
  const repostOf =
    repostRaw && typeof repostRaw === 'object' && !Array.isArray(repostRaw)
      ? mapPostRow(repostRaw as Record<string, unknown>)
      : Array.isArray(repostRaw) && repostRaw[0]
        ? mapPostRow(repostRaw[0] as Record<string, unknown>)
        : null;

  const visRaw = String(row.visibility ?? 'public');
  const visibility: PostVisibility =
    visRaw === 'followers' ||
    visRaw === 'friends' ||
    visRaw === 'only_me' ||
    visRaw === 'custom'
      ? visRaw
      : 'public';

  return {
    id: String(row.id),
    authorId: String(row.author_id),
    body: String(row.body ?? ''),
    visibility,
    publishStatus: mapPublishStatus(row.publish_status),
    scheduledAt: row.scheduled_at == null ? null : String(row.scheduled_at),
    locationName: row.location_name == null ? null : String(row.location_name),
    feeling: row.feeling == null ? null : String(row.feeling),
    pinnedAt: row.pinned_at == null ? null : String(row.pinned_at),
    archivedAt: row.archived_at == null ? null : String(row.archived_at),
    editedAt: row.edited_at == null ? null : String(row.edited_at),
    viewCount: Number(row.view_count ?? 0),
    commentsDisabled: Boolean(row.comments_disabled),
    isSensitive: Boolean(row.is_sensitive),
    repostOfId: row.repost_of_id == null ? null : String(row.repost_of_id),
    repostCount: Number(row.repost_count ?? 0),
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
    tags,
    repostOf,
  };
}

export const POST_SELECT = `
  id, author_id, body, visibility, publish_status, scheduled_at, location_name, feeling,
  pinned_at, archived_at, edited_at, view_count, comments_disabled, is_sensitive, repost_of_id, repost_count,
  like_count, comment_count, share_count, save_count,
  deleted_at, created_at, updated_at,
  author:profiles!posts_author_id_fkey(${PROFILE_SELECT}),
  media:post_media(id, post_id, url, media_type, sort_order, width, height, alt_text, duration_seconds, created_at),
  tags:post_tags(
    id, post_id, tagged_user_id, tagged_by, status, created_at, updated_at,
    tagged_user:profiles!post_tags_tagged_user_id_fkey(${PROFILE_SELECT})
  ),
  repost_of:posts!repost_of_id(
    id, author_id, body, visibility, like_count, comment_count, share_count, save_count,
    deleted_at, created_at, updated_at,
    author:profiles!posts_author_id_fkey(${PROFILE_SELECT}),
    media:post_media(id, post_id, url, media_type, sort_order, width, height, alt_text, duration_seconds, created_at)
  )
`;

/** Narrower select if migration 009/010 not fully applied — callers use POST_SELECT. */
const POST_SELECT_FALLBACK = `
  id, author_id, body, visibility, like_count, comment_count, share_count, save_count,
  deleted_at, created_at, updated_at,
  author:profiles!posts_author_id_fkey(${PROFILE_SELECT}),
  media:post_media(id, post_id, url, media_type, sort_order, width, height, created_at)
`;

function needsPostSelectFallback(message?: string | null): boolean {
  return /publish_status|post_tags|alt_text|is_sensitive|duration_seconds|archived_at|repost_of|relationship|schema cache/i.test(
    message ?? '',
  );
}
function isLivePost(post: Post, now = Date.now()): boolean {
  if (post.deletedAt || post.archivedAt) return false;
  const status = post.publishStatus ?? 'published';
  if (status === 'published') return true;
  if (status === 'scheduled' && post.scheduledAt) {
    return new Date(post.scheduledAt).getTime() <= now;
  }
  return false;
}

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

async function excludedAuthorIds(
  supabase: SupabaseClient,
  currentUserId?: string | null,
): Promise<string[]> {
  if (!currentUserId) return [];
  const { data, error } = await supabase.rpc('feed_hidden_author_ids', {
    viewer_id: currentUserId,
  });
  if (error) {
    const { data: blocks, error: blockError } = await supabase
      .from('blocked_users')
      .select('blocker_id, blocked_id')
      .or(`blocker_id.eq.${currentUserId},blocked_id.eq.${currentUserId}`);
    if (blockError) throw new Error(toUserError(blockError));
    const ids = new Set<string>();
    for (const row of blocks ?? []) {
      const r = row as { blocker_id: string; blocked_id: string };
      ids.add(r.blocker_id === currentUserId ? r.blocked_id : r.blocker_id);
    }
    return [...ids];
  }
  return ((data ?? []) as Array<{ author_id: string }>).map((r) => String(r.author_id));
}

async function favoriteAuthorIds(
  supabase: SupabaseClient,
  currentUserId?: string | null,
): Promise<Set<string>> {
  if (!currentUserId) return new Set();
  const { data, error } = await supabase
    .from('feed_favorites')
    .select('target_id')
    .eq('owner_id', currentUserId);
  if (error) return new Set();
  return new Set((data ?? []).map((r) => String((r as { target_id: string }).target_id)));
}

async function hiddenPostIds(
  supabase: SupabaseClient,
  currentUserId?: string | null,
): Promise<Set<string>> {
  if (!currentUserId) return new Set();
  const { data, error } = await supabase
    .from('hidden_posts')
    .select('post_id')
    .eq('user_id', currentUserId);
  if (error) return new Set();
  return new Set((data ?? []).map((r) => String((r as { post_id: string }).post_id)));
}

async function insertTags(
  supabase: SupabaseClient,
  postId: string,
  authorId: string,
  taggedUserIds: string[] | undefined,
): Promise<PostTag[]> {
  if (!taggedUserIds || taggedUserIds.length === 0) return [];
  const unique = [...new Set(taggedUserIds.filter((id) => id && id !== authorId))];
  if (unique.length === 0) return [];
  const rows = unique.map((taggedUserId) => ({
    post_id: postId,
    tagged_user_id: taggedUserId,
    tagged_by: authorId,
  }));
  const { data, error } = await supabase
    .from('post_tags')
    .upsert(rows, { onConflict: 'post_id,tagged_user_id' })
    .select(
      `id, post_id, tagged_user_id, tagged_by, status, created_at, updated_at,
       tagged_user:profiles!post_tags_tagged_user_id_fkey(${PROFILE_SELECT})`,
    );
  if (error) throw new Error(toUserError(error));
  return (data ?? []).map((r) => mapTagRow(r as Record<string, unknown>));
}

function resolvePublishStatus(input: {
  publishStatus?: PostPublishStatus;
  scheduledAt?: string | null;
}): { publishStatus: PostPublishStatus; scheduledAt: string | null } {
  let publishStatus: PostPublishStatus = input.publishStatus ?? 'published';
  let scheduledAt = input.scheduledAt ?? null;
  if (publishStatus === 'scheduled') {
    if (!scheduledAt) {
      throw new Error('Pick a date and time to schedule this post.');
    }
    if (new Date(scheduledAt).getTime() <= Date.now()) {
      publishStatus = 'published';
      scheduledAt = null;
    }
  } else if (publishStatus !== 'draft') {
    publishStatus = 'published';
    scheduledAt = null;
  }
  return { publishStatus, scheduledAt };
}

export function createPostsService(supabase: SupabaseClient) {
  async function getById(postId: string, currentUserId?: string | null): Promise<Post | null> {
    let { data, error } = await supabase
      .from('posts')
      .select(POST_SELECT)
      .eq('id', postId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error && needsPostSelectFallback(error.message)) {
      const fallback = await supabase
        .from('posts')
        .select(POST_SELECT_FALLBACK)
        .eq('id', postId)
        .is('deleted_at', null)
        .maybeSingle();
      data = fallback.data as typeof data;
      error = fallback.error;
    }

    if (error) throw new Error(toUserError(error));
    if (!data) return null;

    const post = mapPostRow(data as Record<string, unknown>);
    if (currentUserId) {
      const excluded = await excludedAuthorIds(supabase, currentUserId);
      if (excluded.includes(post.authorId)) return null;
    }

    if (
      currentUserId !== post.authorId &&
      (!isLivePost(post) || post.visibility === 'only_me')
    ) {
      return null;
    }

    const [withFlags] = await attachViewerFlags(supabase, [post], currentUserId);
    return withFlags ?? null;
  }

  return {
    getById,
    async create(input: CreatePostInput): Promise<Post> {
      const body = input.body.trim();
      if (!body && !(input.media && input.media.length > 0)) {
        throw new Error('Write something or add media to post.');
      }

      let visibility: PostVisibility = input.visibility ?? 'public';
      if (!input.visibility) {
        const { data: author } = await supabase
          .from('profiles')
          .select('is_private')
          .eq('id', input.authorId)
          .maybeSingle();
        if (author && Boolean((author as { is_private: boolean }).is_private)) {
          visibility = 'followers';
        }
      }

      if (visibility === 'custom' && !(input.audienceListIds && input.audienceListIds.length > 0)) {
        throw new Error('Pick at least one audience list for a custom post.');
      }

      const { publishStatus, scheduledAt } = resolvePublishStatus(input);

      const insertPayload: Record<string, unknown> = {
        author_id: input.authorId,
        body,
        visibility,
        publish_status: publishStatus,
        scheduled_at: scheduledAt,
        location_name: input.locationName?.trim() || null,
        feeling: input.feeling?.trim() || null,
        is_sensitive: Boolean(input.isSensitive),
      };

      let { data, error } = await supabase
        .from('posts')
        .insert(insertPayload)
        .select(POST_SELECT)
        .single();

      if (error && /publish_status|location_name|feeling|scheduled_at|is_sensitive/i.test(error.message ?? '')) {
        const withoutSensitive = { ...insertPayload };
        delete withoutSensitive.is_sensitive;
        const retry = await supabase
          .from('posts')
          .insert(withoutSensitive)
          .select(POST_SELECT)
          .single();
        if (!retry.error) {
          data = retry.data as typeof data;
          error = retry.error;
        } else {
          const fallback = await supabase
            .from('posts')
            .insert({ author_id: input.authorId, body, visibility })
            .select(POST_SELECT_FALLBACK)
            .single();
          data = fallback.data as typeof data;
          error = fallback.error;
        }
      }

      if (error) throw new Error(toUserError(error));

      const post = mapPostRow(data as Record<string, unknown>);

      if (visibility === 'custom' && input.audienceListIds) {
        const rows = input.audienceListIds.map((listId) => ({
          post_id: post.id,
          list_id: listId,
        }));
        const { error: audError } = await supabase.from('post_audience').insert(rows);
        if (audError) throw new Error(toUserError(audError));
      }

      if (input.media && input.media.length > 0) {
        const rows = input.media.map((m, i) => ({
          post_id: post.id,
          url: m.url,
          media_type: m.mediaType,
          sort_order: m.sortOrder ?? i,
          width: m.width ?? null,
          height: m.height ?? null,
          alt_text: m.altText ?? null,
          duration_seconds: m.durationSeconds ?? null,
        }));
        let mediaResult = await supabase
          .from('post_media')
          .insert(rows)
          .select(
            'id, post_id, url, media_type, sort_order, width, height, alt_text, duration_seconds, created_at',
          );
        if (mediaResult.error && /duration_seconds/i.test(mediaResult.error.message ?? '')) {
          mediaResult = await supabase
            .from('post_media')
            .insert(rows.map(({ duration_seconds: _d, ...rest }) => rest))
            .select('id, post_id, url, media_type, sort_order, width, height, alt_text, created_at');
        }
        if (mediaResult.error && /alt_text/i.test(mediaResult.error.message ?? '')) {
          mediaResult = await supabase
            .from('post_media')
            .insert(
              rows.map(({ alt_text: _a, duration_seconds: _d, ...rest }) => rest),
            )
            .select('id, post_id, url, media_type, sort_order, width, height, created_at');
        }
        if (mediaResult.error) throw new Error(toUserError(mediaResult.error));
        post.media = (mediaResult.data ?? []).map((r) => mapMediaRow(r as Record<string, unknown>));
      }

      try {
        post.tags = await insertTags(supabase, post.id, input.authorId, input.taggedUserIds);
      } catch {
        post.tags = [];
      }

      return post;
    },

    async update(input: UpdatePostInput): Promise<Post> {
      const { data: existing, error: existingError } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('id', input.postId)
        .eq('author_id', input.authorId)
        .is('deleted_at', null)
        .maybeSingle();
      if (existingError) throw new Error(toUserError(existingError));
      if (!existing) throw new Error('Post not found.');

      const current = mapPostRow(existing as Record<string, unknown>);
      const patch: Record<string, unknown> = {};

      if (typeof input.body === 'string') {
        const nextBody = input.body.trim();
        if (nextBody !== current.body) {
          await supabase.from('post_revisions').insert({
            post_id: input.postId,
            body: current.body,
            edited_by: input.authorId,
          });
          patch.body = nextBody;
          patch.edited_at = new Date().toISOString();
        }
      }

      if (input.visibility) patch.visibility = input.visibility;
      if (input.locationName !== undefined) {
        patch.location_name = input.locationName?.trim() || null;
      }
      if (input.feeling !== undefined) {
        patch.feeling = input.feeling?.trim() || null;
      }

      if (input.publishStatus || input.scheduledAt !== undefined) {
        const resolved = resolvePublishStatus({
          publishStatus: input.publishStatus ?? current.publishStatus,
          scheduledAt:
            input.scheduledAt !== undefined ? input.scheduledAt : current.scheduledAt,
        });
        patch.publish_status = resolved.publishStatus;
        patch.scheduled_at = resolved.scheduledAt;
      }

      if (Object.keys(patch).length > 0) {
        const { error } = await supabase
          .from('posts')
          .update(patch)
          .eq('id', input.postId)
          .eq('author_id', input.authorId);
        if (error) throw new Error(toUserError(error));
      }

      if (input.visibility === 'custom' && input.audienceListIds) {
        await supabase.from('post_audience').delete().eq('post_id', input.postId);
        if (input.audienceListIds.length > 0) {
          const { error: audError } = await supabase.from('post_audience').insert(
            input.audienceListIds.map((listId) => ({
              post_id: input.postId,
              list_id: listId,
            })),
          );
          if (audError) throw new Error(toUserError(audError));
        }
      }

      if (input.taggedUserIds) {
        await supabase.from('post_tags').delete().eq('post_id', input.postId);
        await insertTags(supabase, input.postId, input.authorId, input.taggedUserIds);
      }

      const updated = await getById(input.postId, input.authorId);
      if (!updated) throw new Error('Post not found.');
      return updated;
    },

    async listFeed(params: ListPostsParams = {}): Promise<Post[]> {
      const limit = Math.min(params.limit ?? 20, 50);
      const thinThreshold = Math.min(3, limit);
      const excluded = await excludedAuthorIds(supabase, params.currentUserId);
      const hidden = await hiddenPostIds(supabase, params.currentUserId);

      const filterLive = (posts: Post[]) =>
        posts.filter(
          (p) =>
            (isLivePost(p) || p.authorId === params.currentUserId) && !hidden.has(p.id),
        );

      const fetchGlobal = async (): Promise<Post[]> => {
        let query = supabase
          .from('posts')
          .select(POST_SELECT)
          .is('deleted_at', null)
          .is('archived_at', null)
          .order('created_at', { ascending: false })
          .limit(limit * 2);

        if (params.cursor) {
          query = query.lt('created_at', params.cursor);
        }
        if (excluded.length > 0) {
          query = query.not('author_id', 'in', `(${excluded.join(',')})`);
        }

        let { data, error } = await query;
        if (error && needsPostSelectFallback(error.message)) {
          const fallback = await supabase
            .from('posts')
            .select(POST_SELECT_FALLBACK)
            .is('deleted_at', null)
            .order('created_at', { ascending: false })
            .limit(limit);
          data = fallback.data as typeof data;
          error = fallback.error;
          if (error) throw new Error(toUserError(error));
          return (data ?? []).map((row) => mapPostRow(row as Record<string, unknown>));
        }
        if (error) throw new Error(toUserError(error));
        return filterLive((data ?? []).map((row) => mapPostRow(row as Record<string, unknown>))).slice(
          0,
          limit,
        );
      };

      if (params.currentUserId) {
        const { data: followRows, error: followError } = await supabase
          .from('follows')
          .select('following_id')
          .eq('follower_id', params.currentUserId);

        if (followError) throw new Error(toUserError(followError));

        const followingIds = (followRows ?? [])
          .map((r) => String((r as { following_id: string }).following_id))
          .filter((id) => !excluded.includes(id));

        if (followingIds.length > 0) {
          const favorites = await favoriteAuthorIds(supabase, params.currentUserId);
          const authorIds = [...new Set([...followingIds, params.currentUserId])];
          let followingQuery = supabase
            .from('posts')
            .select(POST_SELECT)
            .is('deleted_at', null)
            .is('archived_at', null)
            .in('author_id', authorIds)
            .order('created_at', { ascending: false })
            .limit(Math.min(limit * 3, 80));

          if (params.cursor) {
            followingQuery = followingQuery.lt('created_at', params.cursor);
          }

          let { data, error } = await followingQuery;
          if (error && needsPostSelectFallback(error.message)) {
            const fallback = await supabase
              .from('posts')
              .select(POST_SELECT_FALLBACK)
              .is('deleted_at', null)
              .in('author_id', authorIds)
              .order('created_at', { ascending: false })
              .limit(limit);
            data = fallback.data as typeof data;
            error = fallback.error;
          }
          if (error) throw new Error(toUserError(error));

          let followingPosts = filterLive(
            (data ?? []).map((row) => mapPostRow(row as Record<string, unknown>)),
          );

          if (favorites.size > 0) {
            followingPosts = [
              ...followingPosts.filter((p) => favorites.has(p.authorId)),
              ...followingPosts.filter((p) => !favorites.has(p.authorId)),
            ].slice(0, limit);
          } else {
            followingPosts = followingPosts.slice(0, limit);
          }

          if (
            followingPosts.length >= thinThreshold ||
            (params.cursor && followingPosts.length > 0)
          ) {
            return attachViewerFlags(supabase, followingPosts, params.currentUserId);
          }

          if (params.cursor) {
            return attachViewerFlags(supabase, followingPosts, params.currentUserId);
          }
        }
      }

      const posts = await fetchGlobal();
      return attachViewerFlags(supabase, posts, params.currentUserId);
    },

    /** Long-form Watch feed: published posts that include video media. */
    async listWatchFeed(params: ListPostsParams = {}): Promise<Post[]> {
      const limit = Math.min(params.limit ?? 20, 50);
      const excluded = await excludedAuthorIds(supabase, params.currentUserId);
      const hidden = await hiddenPostIds(supabase, params.currentUserId);
      const minDuration = 0;

      let query = supabase
        .from('posts')
        .select(POST_SELECT)
        .is('deleted_at', null)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
        .limit(limit * 4);

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }
      if (excluded.length > 0) {
        query = query.not('author_id', 'in', `(${excluded.join(',')})`);
      }

      let { data, error } = await query;
      if (error && needsPostSelectFallback(error.message)) {
        const fallback = await supabase
          .from('posts')
          .select(POST_SELECT_FALLBACK)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(limit * 4);
        data = fallback.data as typeof data;
        error = fallback.error;
      }
      if (error) throw new Error(toUserError(error));

      let posts = (data ?? [])
        .map((row) => mapPostRow(row as Record<string, unknown>))
        .filter((p) => isLivePost(p) && !hidden.has(p.id))
        .filter((p) =>
          (p.media ?? []).some(
            (m) =>
              m.mediaType === 'video' &&
              (m.durationSeconds == null || m.durationSeconds >= minDuration),
          ),
        )
        .slice(0, limit);

      return attachViewerFlags(supabase, posts, params.currentUserId);
    },

    async listByUser(params: ListPostsParams & { authorId: string }): Promise<Post[]> {
      if (params.currentUserId) {
        const excluded = await excludedAuthorIds(supabase, params.currentUserId);
        if (excluded.includes(params.authorId)) {
          return [];
        }
      }

      const limit = Math.min(params.limit ?? 20, 50);
      const isOwn = Boolean(params.currentUserId && params.currentUserId === params.authorId);
      let query = supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('author_id', params.authorId)
        .is('deleted_at', null)
        .order('pinned_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(limit * 2);

      if (!isOwn || !params.includeNonLive) {
        query = query.is('archived_at', null);
      }

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }

      let { data, error } = await query;
      if (error && needsPostSelectFallback(error.message)) {
        const fallback = await supabase
          .from('posts')
          .select(POST_SELECT_FALLBACK)
          .eq('author_id', params.authorId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(limit);
        data = fallback.data as typeof data;
        error = fallback.error;
      }
      if (error) throw new Error(toUserError(error));

      let posts = (data ?? []).map((row) => mapPostRow(row as Record<string, unknown>));
      if (!isOwn) {
        posts = posts.filter((p) => isLivePost(p));
      } else if (!params.includeNonLive) {
        posts = posts.filter((p) => isLivePost(p) || p.publishStatus === 'scheduled');
      }
      posts = posts.slice(0, limit);
      return attachViewerFlags(supabase, posts, params.currentUserId);
    },

    async listDrafts(authorId: string): Promise<Post[]> {
      const { data, error } = await supabase
        .from('posts')
        .select(POST_SELECT)
        .eq('author_id', authorId)
        .eq('publish_status', 'draft')
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) {
        if (/publish_status/i.test(error.message ?? '')) return [];
        throw new Error(toUserError(error));
      }
      return (data ?? []).map((row) => mapPostRow(row as Record<string, unknown>));
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

    async setCommentsDisabled(
      postId: string,
      authorId: string,
      disabled: boolean,
    ): Promise<Post> {
      const { error } = await supabase
        .from('posts')
        .update({ comments_disabled: disabled })
        .eq('id', postId)
        .eq('author_id', authorId);
      if (error) throw new Error(toUserError(error));
      const post = await getById(postId, authorId);
      if (!post) throw new Error('Post not found.');
      return post;
    },

    async hidePost(postId: string, userId: string): Promise<void> {
      const { error } = await supabase.from('hidden_posts').upsert(
        { post_id: postId, user_id: userId },
        { onConflict: 'user_id,post_id' },
      );
      if (error) throw new Error(toUserError(error));
    },

    async unhidePost(postId: string, userId: string): Promise<void> {
      const { error } = await supabase
        .from('hidden_posts')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', userId);
      if (error) throw new Error(toUserError(error));
    },

    async pin(postId: string, authorId: string, pinned: boolean): Promise<Post> {
      const { error } = await supabase
        .from('posts')
        .update({ pinned_at: pinned ? new Date().toISOString() : null })
        .eq('id', postId)
        .eq('author_id', authorId);
      if (error) throw new Error(toUserError(error));
      const post = await getById(postId, authorId);
      if (!post) throw new Error('Post not found.');
      return post;
    },

    async archive(postId: string, authorId: string, archived: boolean): Promise<Post> {
      const { error } = await supabase
        .from('posts')
        .update({ archived_at: archived ? new Date().toISOString() : null })
        .eq('id', postId)
        .eq('author_id', authorId);
      if (error) throw new Error(toUserError(error));
      const post = await getById(postId, authorId);
      if (!post) throw new Error('Post not found.');
      return post;
    },

    async recordView(postId: string, viewerId: string): Promise<void> {
      const { error } = await supabase.from('post_views').upsert(
        { post_id: postId, viewer_id: viewerId },
        { onConflict: 'post_id,viewer_id', ignoreDuplicates: true },
      );
      if (error && !/post_views|duplicate/i.test(error.message ?? '')) {
        /* soft-fail insights */
      }
    },

    async listPendingTags(userId: string): Promise<PostTag[]> {
      const { data, error } = await supabase
        .from('post_tags')
        .select(
          `id, post_id, tagged_user_id, tagged_by, status, created_at, updated_at,
           tagged_user:profiles!post_tags_tagged_user_id_fkey(${PROFILE_SELECT})`,
        )
        .eq('tagged_user_id', userId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        if (/post_tags/i.test(error.message ?? '')) return [];
        throw new Error(toUserError(error));
      }
      return (data ?? []).map((r) => mapTagRow(r as Record<string, unknown>));
    },

    async respondToTag(
      tagId: string,
      userId: string,
      status: 'approved' | 'rejected',
    ): Promise<PostTag> {
      const { data, error } = await supabase
        .from('post_tags')
        .update({ status })
        .eq('id', tagId)
        .eq('tagged_user_id', userId)
        .select(
          `id, post_id, tagged_user_id, tagged_by, status, created_at, updated_at,
           tagged_user:profiles!post_tags_tagged_user_id_fkey(${PROFILE_SELECT})`,
        )
        .single();
      if (error) throw new Error(toUserError(error));
      return mapTagRow(data as Record<string, unknown>);
    },

    async listRevisions(postId: string, authorId: string): Promise<Array<{ id: string; body: string; createdAt: string }>> {
      const { data: post, error: postError } = await supabase
        .from('posts')
        .select('id')
        .eq('id', postId)
        .eq('author_id', authorId)
        .maybeSingle();
      if (postError) throw new Error(toUserError(postError));
      if (!post) throw new Error('Post not found.');

      const { data, error } = await supabase
        .from('post_revisions')
        .select('id, body, created_at')
        .eq('post_id', postId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) {
        if (/post_revisions/i.test(error.message ?? '')) return [];
        throw new Error(toUserError(error));
      }
      return (data ?? []).map((r) => ({
        id: String((r as { id: string }).id),
        body: String((r as { body: string }).body ?? ''),
        createdAt: String((r as { created_at: string }).created_at ?? ''),
      }));
    },
  };
}

export type PostsService = ReturnType<typeof createPostsService>;
