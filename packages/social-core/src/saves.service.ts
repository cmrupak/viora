import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { mapPostRow } from './posts.service';
import { PROFILE_SELECT } from './profile.mapper';
import type { PageParams, Post, SavedCollection, ToggleResult } from './types';

const SAVED_POST_SELECT = `
  id, user_id, post_id, collection_id, created_at,
  post:posts!saved_posts_post_id_fkey(
    id, author_id, body, visibility, like_count, comment_count, share_count, save_count,
    deleted_at, created_at, updated_at,
    author:profiles!posts_author_id_fkey(${PROFILE_SELECT}),
    media:post_media(id, post_id, url, media_type, sort_order, width, height, created_at)
  )
`;

const SAVED_POST_SELECT_FALLBACK = `
  id, user_id, post_id, created_at,
  post:posts!saved_posts_post_id_fkey(
    id, author_id, body, like_count, comment_count, share_count, save_count,
    deleted_at, created_at, updated_at,
    author:profiles!posts_author_id_fkey(${PROFILE_SELECT}),
    media:post_media(id, post_id, url, media_type, sort_order, width, height, created_at)
  )
`;

function mapCollection(row: Record<string, unknown>): SavedCollection {
  return {
    id: String(row.id),
    ownerId: String(row.owner_id),
    name: String(row.name ?? ''),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    itemCount: row.item_count == null ? undefined : Number(row.item_count),
  };
}

export function createSavesService(supabase: SupabaseClient) {
  return {
    async toggleSave(
      postId: string,
      userId: string,
      collectionId?: string | null,
    ): Promise<ToggleResult> {
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

      const payload: Record<string, unknown> = {
        post_id: postId,
        user_id: userId,
      };
      if (collectionId) payload.collection_id = collectionId;

      const { error } = await supabase.from('saved_posts').insert(payload);
      if (error && /collection_id/i.test(error.message ?? '') && collectionId) {
        const retry = await supabase.from('saved_posts').insert({
          post_id: postId,
          user_id: userId,
        });
        if (retry.error) throw new Error(toUserError(retry.error));
        return { active: true };
      }
      if (error) throw new Error(toUserError(error));
      return { active: true };
    },

    async moveToCollection(
      postId: string,
      userId: string,
      collectionId: string | null,
    ): Promise<void> {
      const { error } = await supabase
        .from('saved_posts')
        .update({ collection_id: collectionId })
        .eq('post_id', postId)
        .eq('user_id', userId);
      if (error) throw new Error(toUserError(error));
    },

    async listSaved(
      userId: string,
      params: PageParams & { collectionId?: string | null } = {},
    ): Promise<Array<{ id: string; createdAt: string; collectionId?: string | null; post: Post }>> {
      const limit = Math.min(params.limit ?? 20, 50);
      let query = supabase
        .from('saved_posts')
        .select(SAVED_POST_SELECT)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (params.collectionId === null) {
        query = query.is('collection_id', null);
      } else if (params.collectionId) {
        query = query.eq('collection_id', params.collectionId);
      }

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }

      let { data, error } = await query;
      if (error && /collection_id/i.test(error.message ?? '')) {
        const fallback = await supabase
          .from('saved_posts')
          .select(SAVED_POST_SELECT_FALLBACK)
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(limit);
        data = fallback.data as typeof data;
        error = fallback.error;
      }
      if (error) throw new Error(toUserError(error));

      const results: Array<{
        id: string;
        createdAt: string;
        collectionId: string | null;
        post: Post;
      }> = [];
      for (const row of data ?? []) {
        const r = row as Record<string, unknown>;
        const postRaw = r.post as Record<string, unknown> | null;
        if (!postRaw || postRaw.deleted_at) continue;
        results.push({
          id: String(r.id),
          createdAt: String(r.created_at ?? ''),
          collectionId: r.collection_id == null ? null : String(r.collection_id),
          post: {
            ...mapPostRow(postRaw, { saved: true }),
            savedByCurrentUser: true,
          },
        });
      }
      return results;
    },

    async listCollections(ownerId: string): Promise<SavedCollection[]> {
      const { data, error } = await supabase
        .from('saved_collections')
        .select('id, owner_id, name, created_at, updated_at')
        .eq('owner_id', ownerId)
        .order('name', { ascending: true });
      if (error) {
        if (/saved_collections/i.test(error.message ?? '')) return [];
        throw new Error(toUserError(error));
      }

      const collections = (data ?? []).map((r) => mapCollection(r as Record<string, unknown>));
      if (collections.length === 0) return collections;

      const { data: counts } = await supabase
        .from('saved_posts')
        .select('collection_id')
        .eq('user_id', ownerId)
        .not('collection_id', 'is', null);
      const tally = new Map<string, number>();
      for (const row of counts ?? []) {
        const id = String((row as { collection_id: string }).collection_id);
        tally.set(id, (tally.get(id) ?? 0) + 1);
      }
      return collections.map((c) => ({ ...c, itemCount: tally.get(c.id) ?? 0 }));
    },

    async createCollection(ownerId: string, name: string): Promise<SavedCollection> {
      const value = name.trim();
      if (!value) throw new Error('Collection name cannot be empty.');
      const { data, error } = await supabase
        .from('saved_collections')
        .insert({ owner_id: ownerId, name: value })
        .select('id, owner_id, name, created_at, updated_at')
        .single();
      if (error) throw new Error(toUserError(error));
      return { ...mapCollection(data as Record<string, unknown>), itemCount: 0 };
    },

    async renameCollection(
      collectionId: string,
      ownerId: string,
      name: string,
    ): Promise<SavedCollection> {
      const value = name.trim();
      if (!value) throw new Error('Collection name cannot be empty.');
      const { data, error } = await supabase
        .from('saved_collections')
        .update({ name: value })
        .eq('id', collectionId)
        .eq('owner_id', ownerId)
        .select('id, owner_id, name, created_at, updated_at')
        .single();
      if (error) throw new Error(toUserError(error));
      return mapCollection(data as Record<string, unknown>);
    },

    async deleteCollection(collectionId: string, ownerId: string): Promise<void> {
      const { error } = await supabase
        .from('saved_collections')
        .delete()
        .eq('id', collectionId)
        .eq('owner_id', ownerId);
      if (error) throw new Error(toUserError(error));
    },
  };
}

export type SavesService = ReturnType<typeof createSavesService>;
