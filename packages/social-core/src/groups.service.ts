import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import { mapPostRow, type CreatePostInput } from './posts.service';
import type { Group, GroupMember, GroupMemberRole, PageParams, Post, Profile } from './types';

export type CreateGroupInput = {
  name: string;
  ownerId: string;
  description?: string | null;
  coverUrl?: string | null;
  isPrivate?: boolean;
};

export type CreateGroupPostInput = CreatePostInput & {
  groupId: string;
};

const GROUP_SELECT = `
  id, name, description, cover_url, owner_id, is_private, created_at, updated_at,
  owner:profiles!groups_owner_id_fkey(${PROFILE_SELECT})
`;

const GROUP_MEMBER_SELECT = `
  id, group_id, user_id, role, created_at, updated_at,
  profile:profiles!group_members_user_id_fkey(${PROFILE_SELECT})
`;

const POST_SELECT = `
  id, author_id, body, like_count, comment_count, share_count, save_count,
  deleted_at, created_at, updated_at,
  author:profiles!posts_author_id_fkey(${PROFILE_SELECT}),
  media:post_media(id, post_id, url, media_type, sort_order, width, height, created_at)
`;

function mapAuthor(row: unknown): Profile | null {
  if (!row || typeof row !== 'object') return null;
  return mapProfileRow(row as Record<string, unknown>);
}

function mapGroupRow(row: Record<string, unknown>): Group {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    description: row.description == null ? null : String(row.description),
    coverUrl: row.cover_url == null ? null : String(row.cover_url),
    ownerId: String(row.owner_id),
    isPrivate: Boolean(row.is_private ?? false),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    owner: mapAuthor(row.owner ?? row.profiles),
  };
}

function mapGroupMemberRow(row: Record<string, unknown>): GroupMember {
  const roleRaw = String(row.role ?? 'member');
  const role: GroupMemberRole =
    roleRaw === 'owner' || roleRaw === 'admin' ? roleRaw : 'member';

  return {
    id: String(row.id),
    groupId: String(row.group_id),
    userId: String(row.user_id),
    role,
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    profile: mapAuthor(row.profile ?? row.profiles),
  };
}

export function createGroupsService(supabase: SupabaseClient) {
  return {
    async create(input: CreateGroupInput): Promise<Group> {
      const name = input.name.trim();
      if (!name) throw new Error('Group name is required.');

      const { data, error } = await supabase
        .from('groups')
        .insert({
          name,
          owner_id: input.ownerId,
          description: input.description?.trim() || null,
          cover_url: input.coverUrl ?? null,
          is_private: Boolean(input.isPrivate),
        })
        .select(GROUP_SELECT)
        .single();

      if (error) throw new Error(toUserError(error));
      return mapGroupRow(data as Record<string, unknown>);
    },

    async list(params: PageParams = {}): Promise<Group[]> {
      const limit = Math.min(params.limit ?? 20, 50);
      let query = supabase
        .from('groups')
        .select(GROUP_SELECT)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }

      const { data, error } = await query;
      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((row) => mapGroupRow(row as Record<string, unknown>));
    },

    async getById(groupId: string): Promise<Group | null> {
      const { data, error } = await supabase
        .from('groups')
        .select(GROUP_SELECT)
        .eq('id', groupId)
        .maybeSingle();

      if (error) throw new Error(toUserError(error));
      if (!data) return null;
      return mapGroupRow(data as Record<string, unknown>);
    },

    async join(groupId: string, userId: string): Promise<GroupMember> {
      const { data, error } = await supabase
        .from('group_members')
        .insert({
          group_id: groupId,
          user_id: userId,
          role: 'member',
        })
        .select(GROUP_MEMBER_SELECT)
        .single();

      if (error) throw new Error(toUserError(error));
      return mapGroupMemberRow(data as Record<string, unknown>);
    },

    async leave(groupId: string, userId: string): Promise<void> {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);

      if (error) throw new Error(toUserError(error));
    },

    async listMembers(groupId: string, params: PageParams = {}): Promise<GroupMember[]> {
      const limit = Math.min(params.limit ?? 50, 100);
      let query = supabase
        .from('group_members')
        .select(GROUP_MEMBER_SELECT)
        .eq('group_id', groupId)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (params.cursor) {
        query = query.gt('created_at', params.cursor);
      }

      const { data, error } = await query;
      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((row) => mapGroupMemberRow(row as Record<string, unknown>));
    },

    async listGroupPosts(
      groupId: string,
      params: PageParams & { currentUserId?: string | null } = {},
    ): Promise<Post[]> {
      const limit = Math.min(params.limit ?? 20, 50);
      let query = supabase
        .from('group_posts')
        .select(
          `
          created_at,
          post:posts!group_posts_post_id_fkey(
            ${POST_SELECT}
          )
        `,
        )
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }

      const { data, error } = await query;
      if (error) throw new Error(toUserError(error));

      const posts = (data ?? [])
        .map((row) => {
          const r = row as unknown as { post: Record<string, unknown> | null };
          if (!r.post || r.post.deleted_at) return null;
          return mapPostRow(r.post);
        })
        .filter((p): p is Post => p != null);

      if (!params.currentUserId || posts.length === 0) return posts;

      const ids = posts.map((p) => p.id);
      const [{ data: likes }, { data: saves }] = await Promise.all([
        supabase.from('post_likes').select('post_id').eq('user_id', params.currentUserId).in('post_id', ids),
        supabase.from('saved_posts').select('post_id').eq('user_id', params.currentUserId).in('post_id', ids),
      ]);
      const liked = new Set((likes ?? []).map((r) => String((r as { post_id: string }).post_id)));
      const saved = new Set((saves ?? []).map((r) => String((r as { post_id: string }).post_id)));

      return posts.map((p) => ({
        ...p,
        likedByCurrentUser: liked.has(p.id),
        savedByCurrentUser: saved.has(p.id),
      }));
    },

    async createGroupPost(input: CreateGroupPostInput): Promise<Post> {
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
        post.media = (mediaData ?? []).map((r) => {
          const row = r as Record<string, unknown>;
          return {
            id: String(row.id),
            postId: String(row.post_id),
            url: String(row.url),
            mediaType: (row.media_type === 'video' ? 'video' : 'image') as 'image' | 'video',
            sortOrder: Number(row.sort_order ?? 0),
            width: row.width == null ? null : Number(row.width),
            height: row.height == null ? null : Number(row.height),
            createdAt: String(row.created_at ?? ''),
          };
        });
      }

      const { error: linkError } = await supabase.from('group_posts').insert({
        group_id: input.groupId,
        post_id: post.id,
      });
      if (linkError) throw new Error(toUserError(linkError));

      return post;
    },
  };
}

export type GroupsService = ReturnType<typeof createGroupsService>;
