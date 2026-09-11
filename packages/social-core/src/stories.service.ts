import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type { MediaType, PageParams, Profile, Story, StoryMedia } from './types';

export type CreateStoryInput = {
  authorId: string;
  media: Array<{
    url: string;
    mediaType: MediaType;
    sortOrder?: number;
  }>;
  /** ISO timestamp; defaults to DB (now + 24h) when omitted */
  expiresAt?: string;
};

export type StoryMediaUploadInput = {
  userId: string;
  body: Blob | ArrayBuffer | ArrayBufferView | FormData;
  contentType: string;
  extension?: string;
};

const STORY_SELECT = `
  id, author_id, expires_at, deleted_at, created_at, updated_at,
  author:profiles!stories_author_id_fkey(${PROFILE_SELECT}),
  media:story_media(id, story_id, url, media_type, sort_order, created_at, updated_at)
`;

function mapAuthor(row: unknown): Profile | null {
  if (!row || typeof row !== 'object') return null;
  return mapProfileRow(row as Record<string, unknown>);
}

function mapStoryMediaRow(row: Record<string, unknown>): StoryMedia {
  return {
    id: String(row.id),
    storyId: String(row.story_id),
    url: String(row.url),
    mediaType: row.media_type === 'video' ? 'video' : 'image',
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
  };
}

export function mapStoryRow(
  row: Record<string, unknown>,
  opts?: { viewed?: boolean },
): Story {
  const mediaRaw = row.media ?? row.story_media;
  const media = Array.isArray(mediaRaw)
    ? (mediaRaw as Record<string, unknown>[]).map(mapStoryMediaRow).sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  return {
    id: String(row.id),
    authorId: String(row.author_id),
    expiresAt: String(row.expires_at ?? ''),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    author: mapAuthor(row.author ?? row.profiles),
    media,
    viewedByCurrentUser: Boolean(opts?.viewed),
  };
}

async function attachViewFlags(
  supabase: SupabaseClient,
  stories: Story[],
  currentUserId?: string | null,
): Promise<Story[]> {
  if (!currentUserId || stories.length === 0) return stories;
  const ids = stories.map((s) => s.id);
  const { data } = await supabase
    .from('story_views')
    .select('story_id')
    .eq('viewer_id', currentUserId)
    .in('story_id', ids);
  const viewed = new Set((data ?? []).map((r) => String((r as { story_id: string }).story_id)));
  return stories.map((s) => ({ ...s, viewedByCurrentUser: viewed.has(s.id) }));
}

export function createStoriesService(supabase: SupabaseClient) {
  return {
    async createStory(input: CreateStoryInput): Promise<Story> {
      if (!input.media || input.media.length === 0) {
        throw new Error('Add at least one media item to create a story.');
      }

      const insertRow: Record<string, unknown> = { author_id: input.authorId };
      if (input.expiresAt) insertRow.expires_at = input.expiresAt;

      const { data, error } = await supabase
        .from('stories')
        .insert(insertRow)
        .select(STORY_SELECT)
        .single();

      if (error) throw new Error(toUserError(error));

      const story = mapStoryRow(data as Record<string, unknown>);

      const mediaRows = input.media.map((m, i) => ({
        story_id: story.id,
        url: m.url,
        media_type: m.mediaType,
        sort_order: m.sortOrder ?? i,
      }));

      const { data: mediaData, error: mediaError } = await supabase
        .from('story_media')
        .insert(mediaRows)
        .select('id, story_id, url, media_type, sort_order, created_at, updated_at');

      if (mediaError) throw new Error(toUserError(mediaError));
      story.media = (mediaData ?? []).map((r) => mapStoryMediaRow(r as Record<string, unknown>));
      return story;
    },

    async listActiveStories(
      params: PageParams & { currentUserId?: string | null } = {},
    ): Promise<Story[]> {
      const limit = Math.min(params.limit ?? 50, 100);
      const now = new Date().toISOString();

      let query = supabase
        .from('stories')
        .select(STORY_SELECT)
        .is('deleted_at', null)
        .gt('expires_at', now)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }

      const { data, error } = await query;
      if (error) throw new Error(toUserError(error));

      const stories = (data ?? []).map((row) => mapStoryRow(row as Record<string, unknown>));
      return attachViewFlags(supabase, stories, params.currentUserId);
    },

    async getStory(storyId: string, currentUserId?: string | null): Promise<Story | null> {
      const { data, error } = await supabase
        .from('stories')
        .select(STORY_SELECT)
        .eq('id', storyId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) throw new Error(toUserError(error));
      if (!data) return null;

      const [story] = await attachViewFlags(
        supabase,
        [mapStoryRow(data as Record<string, unknown>)],
        currentUserId,
      );
      return story ?? null;
    },

    async markViewed(storyId: string, viewerId: string): Promise<void> {
      const { error } = await supabase.from('story_views').upsert(
        { story_id: storyId, viewer_id: viewerId },
        { onConflict: 'story_id,viewer_id', ignoreDuplicates: true },
      );
      if (error) throw new Error(toUserError(error));
    },

    async deleteStory(storyId: string, authorId: string): Promise<void> {
      const { error } = await supabase
        .from('stories')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', storyId)
        .eq('author_id', authorId)
        .is('deleted_at', null);

      if (error) throw new Error(toUserError(error));
    },

    async uploadMedia(input: StoryMediaUploadInput): Promise<string> {
      const ext = (input.extension || 'jpg').replace(/^\./, '');
      const path = `${input.userId}/story-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('stories')
        .upload(path, input.body as Blob, {
          contentType: input.contentType,
          upsert: false,
        });
      if (uploadError) throw new Error(toUserError(uploadError));

      const { data } = supabase.storage.from('stories').getPublicUrl(path);
      return data.publicUrl;
    },
  };
}

export type StoriesService = ReturnType<typeof createStoriesService>;
