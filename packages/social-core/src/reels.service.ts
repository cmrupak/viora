import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type {
  MediaType,
  PageParams,
  Profile,
  Reel,
  ReelComment,
  ReelMedia,
  ToggleResult,
} from './types';

export type CreateReelInput = {
  authorId: string;
  caption?: string;
  media: Array<{
    url: string;
    mediaType?: MediaType;
    thumbnailUrl?: string | null;
    durationSeconds?: number | null;
    sortOrder?: number;
  }>;
};

export type CreateReelCommentInput = {
  reelId: string;
  authorId: string;
  body: string;
  parentId?: string | null;
};

export type ReelMediaUploadInput = {
  userId: string;
  body: Blob | ArrayBuffer | ArrayBufferView | FormData;
  contentType: string;
  extension?: string;
};

const REEL_SELECT = `
  id, author_id, caption, like_count, comment_count, view_count,
  deleted_at, created_at, updated_at,
  author:profiles!reels_author_id_fkey(${PROFILE_SELECT}),
  media:reel_media(id, reel_id, url, media_type, thumbnail_url, duration_seconds, sort_order, created_at, updated_at)
`;

const REEL_COMMENT_SELECT = `
  id, reel_id, author_id, parent_id, body, like_count, deleted_at, created_at, updated_at,
  author:profiles!reel_comments_author_id_fkey(${PROFILE_SELECT})
`;

function mapAuthor(row: unknown): Profile | null {
  if (!row || typeof row !== 'object') return null;
  return mapProfileRow(row as Record<string, unknown>);
}

function mapReelMediaRow(row: Record<string, unknown>): ReelMedia {
  return {
    id: String(row.id),
    reelId: String(row.reel_id),
    url: String(row.url),
    mediaType: row.media_type === 'image' ? 'image' : 'video',
    thumbnailUrl: row.thumbnail_url == null ? null : String(row.thumbnail_url),
    durationSeconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
  };
}

export function mapReelRow(
  row: Record<string, unknown>,
  opts?: { liked?: boolean },
): Reel {
  const mediaRaw = row.media ?? row.reel_media;
  const media = Array.isArray(mediaRaw)
    ? (mediaRaw as Record<string, unknown>[]).map(mapReelMediaRow).sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  return {
    id: String(row.id),
    authorId: String(row.author_id),
    caption: String(row.caption ?? ''),
    likeCount: Number(row.like_count ?? 0),
    commentCount: Number(row.comment_count ?? 0),
    viewCount: Number(row.view_count ?? 0),
    likedByCurrentUser: Boolean(opts?.liked),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    author: mapAuthor(row.author ?? row.profiles),
    media,
  };
}

export function mapReelCommentRow(row: Record<string, unknown>): ReelComment {
  return {
    id: String(row.id),
    reelId: String(row.reel_id),
    authorId: String(row.author_id),
    parentId: row.parent_id == null ? null : String(row.parent_id),
    body: String(row.body ?? ''),
    likeCount: Number(row.like_count ?? 0),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    author: mapAuthor(row.author ?? row.profiles),
  };
}

async function attachReelLikes(
  supabase: SupabaseClient,
  reels: Reel[],
  currentUserId?: string | null,
): Promise<Reel[]> {
  if (!currentUserId || reels.length === 0) return reels;
  const ids = reels.map((r) => r.id);
  const { data } = await supabase
    .from('reel_likes')
    .select('reel_id')
    .eq('user_id', currentUserId)
    .in('reel_id', ids);
  const liked = new Set((data ?? []).map((r) => String((r as { reel_id: string }).reel_id)));
  return reels.map((r) => ({ ...r, likedByCurrentUser: liked.has(r.id) }));
}

export function createReelsService(supabase: SupabaseClient) {
  return {
    async create(input: CreateReelInput): Promise<Reel> {
      if (!input.media || input.media.length === 0) {
        throw new Error('Add video media to create a reel.');
      }

      const { data, error } = await supabase
        .from('reels')
        .insert({
          author_id: input.authorId,
          caption: (input.caption ?? '').trim(),
        })
        .select(REEL_SELECT)
        .single();

      if (error) throw new Error(toUserError(error));

      const reel = mapReelRow(data as Record<string, unknown>);

      const mediaRows = input.media.map((m, i) => ({
        reel_id: reel.id,
        url: m.url,
        media_type: m.mediaType ?? 'video',
        thumbnail_url: m.thumbnailUrl ?? null,
        duration_seconds: m.durationSeconds ?? null,
        sort_order: m.sortOrder ?? i,
      }));

      const { data: mediaData, error: mediaError } = await supabase
        .from('reel_media')
        .insert(mediaRows)
        .select(
          'id, reel_id, url, media_type, thumbnail_url, duration_seconds, sort_order, created_at, updated_at',
        );

      if (mediaError) throw new Error(toUserError(mediaError));
      reel.media = (mediaData ?? []).map((r) => mapReelMediaRow(r as Record<string, unknown>));
      return reel;
    },

    async listFeed(
      params: PageParams & { currentUserId?: string | null } = {},
    ): Promise<Reel[]> {
      const limit = Math.min(params.limit ?? 20, 50);
      let query = supabase
        .from('reels')
        .select(REEL_SELECT)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }

      const { data, error } = await query;
      if (error) throw new Error(toUserError(error));

      const reels = (data ?? []).map((row) => mapReelRow(row as Record<string, unknown>));
      return attachReelLikes(supabase, reels, params.currentUserId);
    },

    async getById(reelId: string, currentUserId?: string | null): Promise<Reel | null> {
      const { data, error } = await supabase
        .from('reels')
        .select(REEL_SELECT)
        .eq('id', reelId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) throw new Error(toUserError(error));
      if (!data) return null;

      const [reel] = await attachReelLikes(
        supabase,
        [mapReelRow(data as Record<string, unknown>)],
        currentUserId,
      );
      return reel ?? null;
    },

    async toggleLike(reelId: string, userId: string): Promise<ToggleResult> {
      const { data: existing, error: findError } = await supabase
        .from('reel_likes')
        .select('id')
        .eq('reel_id', reelId)
        .eq('user_id', userId)
        .maybeSingle();

      if (findError) throw new Error(toUserError(findError));

      if (existing) {
        const { error } = await supabase.from('reel_likes').delete().eq('id', existing.id);
        if (error) throw new Error(toUserError(error));
        return { active: false };
      }

      const { error } = await supabase.from('reel_likes').insert({
        reel_id: reelId,
        user_id: userId,
      });
      if (error) throw new Error(toUserError(error));
      return { active: true };
    },

    async listComments(reelId: string, params: PageParams = {}): Promise<ReelComment[]> {
      const limit = Math.min(params.limit ?? 50, 100);
      let query = supabase
        .from('reel_comments')
        .select(REEL_COMMENT_SELECT)
        .eq('reel_id', reelId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (params.cursor) {
        query = query.gt('created_at', params.cursor);
      }

      const { data, error } = await query;
      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((row) => mapReelCommentRow(row as Record<string, unknown>));
    },

    async createComment(input: CreateReelCommentInput): Promise<ReelComment> {
      const body = input.body.trim();
      if (!body) throw new Error('Comment cannot be empty.');

      const { data, error } = await supabase
        .from('reel_comments')
        .insert({
          reel_id: input.reelId,
          author_id: input.authorId,
          parent_id: input.parentId ?? null,
          body,
        })
        .select(REEL_COMMENT_SELECT)
        .single();

      if (error) throw new Error(toUserError(error));
      return mapReelCommentRow(data as Record<string, unknown>);
    },

    async incrementView(reelId: string): Promise<void> {
      const { data, error: fetchError } = await supabase
        .from('reels')
        .select('view_count')
        .eq('id', reelId)
        .is('deleted_at', null)
        .maybeSingle();

      if (fetchError) throw new Error(toUserError(fetchError));
      if (!data) return;

      const next = Number((data as { view_count: number }).view_count ?? 0) + 1;
      const { error } = await supabase.from('reels').update({ view_count: next }).eq('id', reelId);
      if (error) throw new Error(toUserError(error));
    },

    async uploadMedia(input: ReelMediaUploadInput): Promise<string> {
      const ext = (input.extension || 'mp4').replace(/^\./, '');
      const path = `${input.userId}/reel-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('reels')
        .upload(path, input.body as Blob, {
          contentType: input.contentType,
          upsert: false,
        });
      if (uploadError) throw new Error(toUserError(uploadError));

      const { data } = supabase.storage.from('reels').getPublicUrl(path);
      return data.publicUrl;
    },
  };
}

export type ReelsService = ReturnType<typeof createReelsService>;
