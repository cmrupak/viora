import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import type {
  MediaType,
  Message,
  PageParams,
  Profile,
  Story,
  StoryAudience,
  StoryHighlight,
  StoryHighlightItem,
  StoryMedia,
  StorySticker,
  StoryStickerResponse,
  StoryView,
} from './types';
import { createMessagesService } from './messages.service';

export type CreateStoryInput = {
  authorId: string;
  audience?: StoryAudience;
  media: Array<{
    url: string;
    mediaType: MediaType;
    sortOrder?: number;
    stickers?: StorySticker[];
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

export type CreateHighlightInput = {
  ownerId: string;
  title: string;
  coverUrl?: string | null;
  sortOrder?: number;
};

export type AddHighlightItemInput = {
  highlightId: string;
  ownerId: string;
  sourceStoryId?: string | null;
  url: string;
  mediaType: MediaType;
  stickers?: StorySticker[];
  sortOrder?: number;
};

const STORY_SELECT = `
  id, author_id, audience, expires_at, deleted_at, created_at, updated_at,
  author:profiles!stories_author_id_fkey(${PROFILE_SELECT}),
  media:story_media(id, story_id, url, media_type, sort_order, stickers, created_at, updated_at)
`;

const STORY_SELECT_FALLBACK = `
  id, author_id, expires_at, deleted_at, created_at, updated_at,
  author:profiles!stories_author_id_fkey(${PROFILE_SELECT}),
  media:story_media(id, story_id, url, media_type, sort_order, created_at, updated_at)
`;

const HIGHLIGHT_SELECT = `
  id, owner_id, title, cover_url, sort_order, created_at, updated_at,
  items:story_highlight_items(id, highlight_id, source_story_id, url, media_type, stickers, sort_order, created_at)
`;

function mapAuthor(row: unknown): Profile | null {
  if (!row || typeof row !== 'object') return null;
  return mapProfileRow(row as Record<string, unknown>);
}

function mapStickers(raw: unknown): StorySticker[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s) => s && typeof s === 'object')
    .map((s) => {
      const row = s as Record<string, unknown>;
      const type = String(row.type ?? 'mention');
      const validType =
        type === 'poll' ||
        type === 'question' ||
        type === 'quiz' ||
        type === 'countdown' ||
        type === 'music' ||
        type === 'location' ||
        type === 'mention'
          ? type
          : 'mention';
      return {
        id: String(row.id ?? cryptoRandomId()),
        type: validType,
        x: Number(row.x ?? 0.5),
        y: Number(row.y ?? 0.5),
        scale: row.scale == null ? undefined : Number(row.scale),
        rotation: row.rotation == null ? undefined : Number(row.rotation),
        payload:
          row.payload && typeof row.payload === 'object'
            ? (row.payload as Record<string, unknown>)
            : {},
      };
    });
}

function cryptoRandomId(): string {
  return `stk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function mapStoryMediaRow(row: Record<string, unknown>): StoryMedia {
  return {
    id: String(row.id),
    storyId: String(row.story_id),
    url: String(row.url),
    mediaType: row.media_type === 'video' ? 'video' : 'image',
    sortOrder: Number(row.sort_order ?? 0),
    stickers: mapStickers(row.stickers),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
  };
}

export function mapStoryRow(
  row: Record<string, unknown>,
  opts?: { viewed?: boolean; viewCount?: number },
): Story {
  const mediaRaw = row.media ?? row.story_media;
  const media = Array.isArray(mediaRaw)
    ? (mediaRaw as Record<string, unknown>[]).map(mapStoryMediaRow).sort((a, b) => a.sortOrder - b.sortOrder)
    : [];

  const audienceRaw = String(row.audience ?? 'public');
  const audience: StoryAudience =
    audienceRaw === 'close_friends' ? 'close_friends' : 'public';

  return {
    id: String(row.id),
    authorId: String(row.author_id),
    audience,
    expiresAt: String(row.expires_at ?? ''),
    deletedAt: row.deleted_at == null ? null : String(row.deleted_at),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    author: mapAuthor(row.author ?? row.profiles),
    media,
    viewedByCurrentUser: Boolean(opts?.viewed),
    viewCount: opts?.viewCount,
  };
}

function mapHighlightItem(row: Record<string, unknown>): StoryHighlightItem {
  return {
    id: String(row.id),
    highlightId: String(row.highlight_id),
    sourceStoryId: row.source_story_id == null ? null : String(row.source_story_id),
    url: String(row.url),
    mediaType: row.media_type === 'video' ? 'video' : 'image',
    stickers: mapStickers(row.stickers),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at ?? ''),
  };
}

function mapHighlight(row: Record<string, unknown>): StoryHighlight {
  const itemsRaw = row.items ?? row.story_highlight_items;
  const items = Array.isArray(itemsRaw)
    ? (itemsRaw as Record<string, unknown>[]).map(mapHighlightItem).sort((a, b) => a.sortOrder - b.sortOrder)
    : [];
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    title: String(row.title ?? ''),
    coverUrl: row.cover_url == null ? null : String(row.cover_url),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    items,
    itemCount: items.length,
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

async function selectStories(
  _supabase: SupabaseClient,
  queryBuilder: (
    select: string,
  ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>,
): Promise<{ data: unknown; error: { message?: string } | null }> {
  let result = await queryBuilder(STORY_SELECT);
  if (result.error && /audience|stickers/i.test(result.error.message ?? '')) {
    result = await queryBuilder(STORY_SELECT_FALLBACK);
  }
  return result;
}

export function createStoriesService(supabase: SupabaseClient) {
  return {
    async createStory(input: CreateStoryInput): Promise<Story> {
      if (!input.media || input.media.length === 0) {
        throw new Error('Add at least one media item to create a story.');
      }

      const insertRow: Record<string, unknown> = {
        author_id: input.authorId,
        audience: input.audience ?? 'public',
      };
      if (input.expiresAt) insertRow.expires_at = input.expiresAt;

      let data: unknown = null;
      let error: { message?: string } | null = null;
      const first = await supabase
        .from('stories')
        .insert(insertRow)
        .select(STORY_SELECT)
        .single();
      data = first.data;
      error = first.error;

      if (error && /audience/i.test(error.message ?? '')) {
        delete insertRow.audience;
        const retry = await supabase
          .from('stories')
          .insert(insertRow)
          .select(STORY_SELECT_FALLBACK)
          .single();
        data = retry.data;
        error = retry.error;
      }

      if (error) throw new Error(toUserError(error));

      const story = mapStoryRow(data as Record<string, unknown>);

      const mediaRows = input.media.map((m, i) => ({
        story_id: story.id,
        url: m.url,
        media_type: m.mediaType,
        sort_order: m.sortOrder ?? i,
        stickers: m.stickers ?? [],
      }));

      let mediaResult = await supabase
        .from('story_media')
        .insert(mediaRows)
        .select('id, story_id, url, media_type, sort_order, stickers, created_at, updated_at');

      if (mediaResult.error && /stickers/i.test(mediaResult.error.message ?? '')) {
        mediaResult = await supabase
          .from('story_media')
          .insert(mediaRows.map(({ stickers: _s, ...rest }) => rest))
          .select('id, story_id, url, media_type, sort_order, created_at, updated_at');
      }

      if (mediaResult.error) throw new Error(toUserError(mediaResult.error));
      story.media = (mediaResult.data ?? []).map((r) =>
        mapStoryMediaRow(r as Record<string, unknown>),
      );
      return story;
    },

    async listActiveStories(
      params: PageParams & { currentUserId?: string | null } = {},
    ): Promise<Story[]> {
      const limit = Math.min(params.limit ?? 50, 100);
      const now = new Date().toISOString();

      let hidden: string[] = [];
      if (params.currentUserId) {
        const { data, error: hideError } = await supabase.rpc('story_hidden_author_ids', {
          viewer_id: params.currentUserId,
        });
        if (!hideError) {
          hidden = ((data ?? []) as Array<{ author_id: string }>).map((r) => String(r.author_id));
        } else {
          const { data: blocks } = await supabase
            .from('blocked_users')
            .select('blocker_id, blocked_id')
            .or(
              `blocker_id.eq.${params.currentUserId},blocked_id.eq.${params.currentUserId}`,
            );
          const ids = new Set<string>();
          for (const row of blocks ?? []) {
            const r = row as { blocker_id: string; blocked_id: string };
            ids.add(
              r.blocker_id === params.currentUserId ? r.blocked_id : r.blocker_id,
            );
          }
          hidden = [...ids];
        }
      }

      const { data, error } = await selectStories(supabase, async (select) => {
        let query = supabase
          .from('stories')
          .select(select)
          .is('deleted_at', null)
          .gt('expires_at', now)
          .order('created_at', { ascending: false })
          .limit(limit);

        if (params.cursor) {
          query = query.lt('created_at', params.cursor);
        }
        if (hidden.length > 0) {
          query = query.not('author_id', 'in', `(${hidden.join(',')})`);
        }
        return query;
      });

      if (error) throw new Error(toUserError(error));

      const rows = Array.isArray(data) ? data : [];
      const stories = rows.map((row) => mapStoryRow(row as Record<string, unknown>));
      return attachViewFlags(supabase, stories, params.currentUserId);
    },

    async getStory(storyId: string, currentUserId?: string | null): Promise<Story | null> {
      const { data, error } = await selectStories(supabase, async (select) =>
        supabase.from('stories').select(select).eq('id', storyId).is('deleted_at', null).maybeSingle(),
      );

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

    async listViewers(storyId: string, authorId: string): Promise<StoryView[]> {
      const { data: story, error: storyError } = await supabase
        .from('stories')
        .select('id, author_id')
        .eq('id', storyId)
        .maybeSingle();
      if (storyError) throw new Error(toUserError(storyError));
      if (!story || String((story as { author_id: string }).author_id) !== authorId) {
        throw new Error('Only the story author can see viewers.');
      }

      const { data, error } = await supabase
        .from('story_views')
        .select(
          `id, story_id, viewer_id, created_at,
           viewer:profiles!story_views_viewer_id_fkey(${PROFILE_SELECT})`,
        )
        .eq('story_id', storyId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((row) => {
        const r = row as Record<string, unknown>;
        return {
          id: String(r.id),
          storyId: String(r.story_id),
          viewerId: String(r.viewer_id),
          createdAt: String(r.created_at ?? ''),
          viewer: mapAuthor(r.viewer),
        };
      });
    },

    async replyViaDm(
      storyId: string,
      fromUserId: string,
      body: string,
    ): Promise<{ conversationId: string; message: Message }> {
      const text = body.trim();
      if (!text) throw new Error('Write a reply.');

      const story = await this.getStory(storyId, fromUserId);
      if (!story) throw new Error('Story not found.');
      if (story.authorId === fromUserId) {
        throw new Error('You cannot reply to your own story.');
      }

      const messages = createMessagesService(supabase);
      const conversation = await messages.getOrCreateDM(fromUserId, story.authorId);
      const message = await messages.sendMessage({
        conversationId: conversation.id,
        senderId: fromUserId,
        body: text,
        storyId,
      });
      return { conversationId: conversation.id, message };
    },

    async respondToSticker(input: {
      storyMediaId: string;
      stickerId: string;
      userId: string;
      response: Record<string, unknown>;
    }): Promise<StoryStickerResponse> {
      const { data, error } = await supabase
        .from('story_sticker_responses')
        .upsert(
          {
            story_media_id: input.storyMediaId,
            sticker_id: input.stickerId,
            user_id: input.userId,
            response: input.response,
          },
          { onConflict: 'story_media_id,sticker_id,user_id' },
        )
        .select('id, story_media_id, sticker_id, user_id, response, created_at')
        .single();

      if (error) throw new Error(toUserError(error));
      const row = data as Record<string, unknown>;
      return {
        id: String(row.id),
        storyMediaId: String(row.story_media_id),
        stickerId: String(row.sticker_id),
        userId: String(row.user_id),
        response:
          row.response && typeof row.response === 'object'
            ? (row.response as Record<string, unknown>)
            : {},
        createdAt: String(row.created_at ?? ''),
      };
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

    async createHighlight(input: CreateHighlightInput): Promise<StoryHighlight> {
      const title = input.title.trim();
      if (!title) throw new Error('Highlight title is required.');

      const { data, error } = await supabase
        .from('story_highlights')
        .insert({
          owner_id: input.ownerId,
          title,
          cover_url: input.coverUrl ?? null,
          sort_order: input.sortOrder ?? 0,
        })
        .select(HIGHLIGHT_SELECT)
        .single();

      if (error) throw new Error(toUserError(error));
      return mapHighlight(data as Record<string, unknown>);
    },

    async listHighlights(ownerId: string): Promise<StoryHighlight[]> {
      const { data, error } = await supabase
        .from('story_highlights')
        .select(HIGHLIGHT_SELECT)
        .eq('owner_id', ownerId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((row) => mapHighlight(row as Record<string, unknown>));
    },

    async addHighlightItem(input: AddHighlightItemInput): Promise<StoryHighlightItem> {
      const { data: highlight, error: hError } = await supabase
        .from('story_highlights')
        .select('id, owner_id')
        .eq('id', input.highlightId)
        .maybeSingle();
      if (hError) throw new Error(toUserError(hError));
      if (!highlight || String((highlight as { owner_id: string }).owner_id) !== input.ownerId) {
        throw new Error('Highlight not found.');
      }

      const { data, error } = await supabase
        .from('story_highlight_items')
        .insert({
          highlight_id: input.highlightId,
          source_story_id: input.sourceStoryId ?? null,
          url: input.url,
          media_type: input.mediaType,
          stickers: input.stickers ?? [],
          sort_order: input.sortOrder ?? 0,
        })
        .select('id, highlight_id, source_story_id, url, media_type, stickers, sort_order, created_at')
        .single();

      if (error) throw new Error(toUserError(error));
      return mapHighlightItem(data as Record<string, unknown>);
    },

    async addStoryToHighlight(
      highlightId: string,
      storyId: string,
      ownerId: string,
    ): Promise<StoryHighlightItem> {
      const story = await this.getStory(storyId, ownerId);
      if (!story || story.authorId !== ownerId) {
        throw new Error('You can only highlight your own stories.');
      }
      const media = story.media?.[0];
      if (!media) throw new Error('Story has no media.');

      const item = await this.addHighlightItem({
        highlightId,
        ownerId,
        sourceStoryId: storyId,
        url: media.url,
        mediaType: media.mediaType,
        stickers: media.stickers,
      });

      const { data: highlight } = await supabase
        .from('story_highlights')
        .select('cover_url')
        .eq('id', highlightId)
        .maybeSingle();
      if (highlight && !(highlight as { cover_url: string | null }).cover_url) {
        await supabase
          .from('story_highlights')
          .update({ cover_url: media.url })
          .eq('id', highlightId)
          .eq('owner_id', ownerId);
      }

      return item;
    },

    async deleteHighlight(highlightId: string, ownerId: string): Promise<void> {
      const { error } = await supabase
        .from('story_highlights')
        .delete()
        .eq('id', highlightId)
        .eq('owner_id', ownerId);
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
