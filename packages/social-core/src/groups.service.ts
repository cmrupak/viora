import type { SupabaseClient } from '@supabase/supabase-js';
import { toUserError } from './errors';
import { PROFILE_SELECT, mapProfileRow } from './profile.mapper';
import { mapPostRow, POST_SELECT, type CreatePostInput } from './posts.service';
import type {
  BroadcastChannel,
  BroadcastMessage,
  Group,
  GroupJoinAnswer,
  GroupJoinQuestion,
  GroupMember,
  GroupMemberRole,
  GroupMemberStatus,
  GroupPostApprovalStatus,
  GroupVisibility,
  PageParams,
  Post,
  Profile,
} from './types';

export type CreateGroupInput = {
  name: string;
  ownerId: string;
  description?: string | null;
  coverUrl?: string | null;
  isPrivate?: boolean;
  visibility?: GroupVisibility;
  requiresPostApproval?: boolean;
};

export type CreateGroupPostInput = CreatePostInput & {
  groupId: string;
};

export type JoinGroupInput = {
  groupId: string;
  userId: string;
  answers?: Array<{ questionId: string; answer: string }>;
};

const GROUP_SELECT = `
  id, name, description, cover_url, owner_id, is_private, visibility, requires_post_approval,
  created_at, updated_at,
  owner:profiles!groups_owner_id_fkey(${PROFILE_SELECT})
`;

const GROUP_SELECT_FALLBACK = `
  id, name, description, cover_url, owner_id, is_private, created_at, updated_at,
  owner:profiles!groups_owner_id_fkey(${PROFILE_SELECT})
`;

const GROUP_MEMBER_SELECT = `
  id, group_id, user_id, role, status, created_at, updated_at,
  profile:profiles!group_members_user_id_fkey(${PROFILE_SELECT})
`;

const GROUP_MEMBER_SELECT_FALLBACK = `
  id, group_id, user_id, role, created_at, updated_at,
  profile:profiles!group_members_user_id_fkey(${PROFILE_SELECT})
`;

function mapAuthor(row: unknown): Profile | null {
  if (!row || typeof row !== 'object') return null;
  return mapProfileRow(row as Record<string, unknown>);
}

function mapVisibility(row: Record<string, unknown>): GroupVisibility {
  const raw = String(row.visibility ?? '');
  if (raw === 'private' || raw === 'hidden' || raw === 'public') return raw;
  return row.is_private ? 'private' : 'public';
}

function mapGroupRow(row: Record<string, unknown>): Group {
  const visibility = mapVisibility(row);
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    description: row.description == null ? null : String(row.description),
    coverUrl: row.cover_url == null ? null : String(row.cover_url),
    ownerId: String(row.owner_id),
    isPrivate: visibility !== 'public',
    visibility,
    requiresPostApproval: Boolean(row.requires_post_approval),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    owner: mapAuthor(row.owner ?? row.profiles),
  };
}

function mapGroupMemberRow(row: Record<string, unknown>): GroupMember {
  const roleRaw = String(row.role ?? 'member');
  const role: GroupMemberRole =
    roleRaw === 'owner' || roleRaw === 'admin' ? roleRaw : 'member';
  const statusRaw = String(row.status ?? 'active');
  const status: GroupMemberStatus =
    statusRaw === 'pending' || statusRaw === 'banned' ? statusRaw : 'active';

  return {
    id: String(row.id),
    groupId: String(row.group_id),
    userId: String(row.user_id),
    role,
    status,
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    profile: mapAuthor(row.profile ?? row.profiles),
  };
}

function mapQuestion(row: Record<string, unknown>): GroupJoinQuestion {
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    prompt: String(row.prompt ?? ''),
    sortOrder: Number(row.sort_order ?? 0),
    required: Boolean(row.required ?? true),
    createdAt: String(row.created_at ?? ''),
  };
}

function mapAnswer(row: Record<string, unknown>): GroupJoinAnswer {
  return {
    id: String(row.id),
    questionId: String(row.question_id),
    userId: String(row.user_id),
    answer: String(row.answer ?? ''),
    createdAt: String(row.created_at ?? ''),
  };
}

function mapBroadcastChannel(row: Record<string, unknown>): BroadcastChannel {
  return {
    id: String(row.id),
    groupId: String(row.group_id),
    name: String(row.name ?? ''),
    description: row.description == null ? null : String(row.description),
    createdBy: String(row.created_by),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
  };
}

function mapBroadcastMessage(row: Record<string, unknown>): BroadcastMessage {
  return {
    id: String(row.id),
    channelId: String(row.channel_id),
    authorId: String(row.author_id),
    body: String(row.body ?? ''),
    createdAt: String(row.created_at ?? ''),
    updatedAt: row.updated_at == null ? undefined : String(row.updated_at),
    author: mapAuthor(row.author ?? row.profiles),
  };
}

export function createGroupsService(supabase: SupabaseClient) {
  return {
    async create(input: CreateGroupInput): Promise<Group> {
      const name = input.name.trim();
      if (!name) throw new Error('Group name is required.');

      const visibility: GroupVisibility =
        input.visibility ?? (input.isPrivate ? 'private' : 'public');

      const insertRow: Record<string, unknown> = {
        name,
        owner_id: input.ownerId,
        description: input.description?.trim() || null,
        cover_url: input.coverUrl ?? null,
        visibility,
        is_private: visibility !== 'public',
        requires_post_approval: Boolean(input.requiresPostApproval),
      };

      let data: unknown = null;
      let error: { message?: string } | null = null;
      const first = await supabase.from('groups').insert(insertRow).select(GROUP_SELECT).single();
      data = first.data;
      error = first.error;

      if (error && /visibility|requires_post_approval/i.test(error.message ?? '')) {
        const fallback = await supabase
          .from('groups')
          .insert({
            name,
            owner_id: input.ownerId,
            description: input.description?.trim() || null,
            cover_url: input.coverUrl ?? null,
            is_private: visibility !== 'public',
          })
          .select(GROUP_SELECT_FALLBACK)
          .single();
        data = fallback.data;
        error = fallback.error;
      }

      if (error) throw new Error(toUserError(error));
      return mapGroupRow(data as Record<string, unknown>);
    },

    async update(
      groupId: string,
      ownerOrAdminId: string,
      patch: Partial<{
        name: string;
        description: string | null;
        coverUrl: string | null;
        visibility: GroupVisibility;
        requiresPostApproval: boolean;
      }>,
    ): Promise<Group> {
      const updateRow: Record<string, unknown> = {};
      if (patch.name != null) updateRow.name = patch.name.trim();
      if (patch.description !== undefined) updateRow.description = patch.description?.trim() || null;
      if (patch.coverUrl !== undefined) updateRow.cover_url = patch.coverUrl;
      if (patch.visibility) {
        updateRow.visibility = patch.visibility;
        updateRow.is_private = patch.visibility !== 'public';
      }
      if (patch.requiresPostApproval !== undefined) {
        updateRow.requires_post_approval = patch.requiresPostApproval;
      }

      const { data, error } = await supabase
        .from('groups')
        .update(updateRow)
        .eq('id', groupId)
        .select(GROUP_SELECT)
        .single();

      if (error) throw new Error(toUserError(error));
      void ownerOrAdminId;
      return mapGroupRow(data as Record<string, unknown>);
    },

    async list(params: PageParams & { currentUserId?: string | null } = {}): Promise<Group[]> {
      const limit = Math.min(params.limit ?? 20, 50);
      let query = supabase
        .from('groups')
        .select(GROUP_SELECT)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }

      let { data, error } = await query;
      if (error && /visibility|requires_post_approval/i.test(error.message ?? '')) {
        const fallback = await supabase
          .from('groups')
          .select(GROUP_SELECT_FALLBACK)
          .order('created_at', { ascending: false })
          .limit(limit);
        data = fallback.data as typeof data;
        error = fallback.error;
      }
      if (error) throw new Error(toUserError(error));

      let groups = (data ?? []).map((row) => mapGroupRow(row as Record<string, unknown>));

      if (params.currentUserId) {
        const ids = groups.map((g) => g.id);
        let members: GroupMember[] = [];
        const memRes = await supabase
          .from('group_members')
          .select(GROUP_MEMBER_SELECT)
          .eq('user_id', params.currentUserId)
          .in('group_id', ids);
        if (!memRes.error) {
          members = (memRes.data ?? []).map((r) => mapGroupMemberRow(r as Record<string, unknown>));
        } else {
          const fb = await supabase
            .from('group_members')
            .select(GROUP_MEMBER_SELECT_FALLBACK)
            .eq('user_id', params.currentUserId)
            .in('group_id', ids);
          members = (fb.data ?? []).map((r) => mapGroupMemberRow(r as Record<string, unknown>));
        }
        const byGroup = new Map(members.map((m) => [m.groupId, m]));
        groups = groups.map((g) => ({ ...g, myMembership: byGroup.get(g.id) ?? null }));
      }

      return groups;
    },

    async getById(groupId: string, currentUserId?: string | null): Promise<Group | null> {
      let { data, error } = await supabase
        .from('groups')
        .select(GROUP_SELECT)
        .eq('id', groupId)
        .maybeSingle();

      if (error && /visibility|requires_post_approval/i.test(error.message ?? '')) {
        const fallback = await supabase
          .from('groups')
          .select(GROUP_SELECT_FALLBACK)
          .eq('id', groupId)
          .maybeSingle();
        data = fallback.data as typeof data;
        error = fallback.error;
      }
      if (error) throw new Error(toUserError(error));
      if (!data) return null;

      const group = mapGroupRow(data as Record<string, unknown>);
      if (currentUserId) {
        const members = await this.listMembers(groupId, { limit: 200 });
        group.myMembership = members.find((m) => m.userId === currentUserId) ?? null;
        group.memberCount = members.filter((m) => (m.status ?? 'active') === 'active').length;
      }
      return group;
    },

    async join(groupId: string, userId: string): Promise<GroupMember> {
      return this.requestJoin({ groupId, userId });
    },

    async requestJoin(input: JoinGroupInput): Promise<GroupMember> {
      const group = await this.getById(input.groupId);
      if (!group) throw new Error('Group not found.');
      if (group.visibility === 'hidden') {
        throw new Error('This group is invite-only.');
      }

      const status: GroupMemberStatus =
        group.visibility === 'private' || group.isPrivate ? 'pending' : 'active';

      if (input.answers && input.answers.length > 0) {
        const rows = input.answers.map((a) => ({
          question_id: a.questionId,
          user_id: input.userId,
          answer: a.answer.trim(),
        }));
        const { error: ansError } = await supabase.from('group_join_answers').upsert(rows, {
          onConflict: 'question_id,user_id',
        });
        if (ansError && !/group_join_answers|relation/i.test(ansError.message ?? '')) {
          throw new Error(toUserError(ansError));
        }
      }

      const insertRow: Record<string, unknown> = {
        group_id: input.groupId,
        user_id: input.userId,
        role: 'member',
        status,
      };

      let { data, error } = await supabase
        .from('group_members')
        .upsert(insertRow, { onConflict: 'group_id,user_id' })
        .select(GROUP_MEMBER_SELECT)
        .single();

      if (error && /status/i.test(error.message ?? '')) {
        const fallback = await supabase
          .from('group_members')
          .upsert(
            { group_id: input.groupId, user_id: input.userId, role: 'member' },
            { onConflict: 'group_id,user_id' },
          )
          .select(GROUP_MEMBER_SELECT_FALLBACK)
          .single();
        data = fallback.data as typeof data;
        error = fallback.error;
      }
      if (error) throw new Error(toUserError(error));
      return mapGroupMemberRow(data as Record<string, unknown>);
    },

    async approveMember(groupId: string, userId: string): Promise<GroupMember> {
      const { data, error } = await supabase
        .from('group_members')
        .update({ status: 'active' })
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .select(GROUP_MEMBER_SELECT)
        .single();
      if (error) throw new Error(toUserError(error));
      return mapGroupMemberRow(data as Record<string, unknown>);
    },

    async rejectMember(groupId: string, userId: string): Promise<void> {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('group_id', groupId)
        .eq('user_id', userId);
      if (error) throw new Error(toUserError(error));
    },

    async setMemberRole(
      groupId: string,
      userId: string,
      role: Exclude<GroupMemberRole, 'owner'>,
    ): Promise<GroupMember> {
      const { data, error } = await supabase
        .from('group_members')
        .update({ role })
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .neq('role', 'owner')
        .select(GROUP_MEMBER_SELECT)
        .single();
      if (error) {
        if (/status/i.test(error.message ?? '')) {
          const fallback = await supabase
            .from('group_members')
            .update({ role })
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .neq('role', 'owner')
            .select(GROUP_MEMBER_SELECT_FALLBACK)
            .single();
          if (fallback.error) throw new Error(toUserError(fallback.error));
          return mapGroupMemberRow(fallback.data as Record<string, unknown>);
        }
        throw new Error(toUserError(error));
      }
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

    async listMembers(
      groupId: string,
      params: PageParams & { status?: GroupMemberStatus } = {},
    ): Promise<GroupMember[]> {
      const limit = Math.min(params.limit ?? 50, 100);
      let query = supabase
        .from('group_members')
        .select(GROUP_MEMBER_SELECT)
        .eq('group_id', groupId)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (params.status) {
        query = query.eq('status', params.status);
      }
      if (params.cursor) {
        query = query.gt('created_at', params.cursor);
      }

      let { data, error } = await query;
      if (error && /status/i.test(error.message ?? '')) {
        const fallback = await supabase
          .from('group_members')
          .select(GROUP_MEMBER_SELECT_FALLBACK)
          .eq('group_id', groupId)
          .order('created_at', { ascending: true })
          .limit(limit);
        data = fallback.data as typeof data;
        error = fallback.error;
      }
      if (error) throw new Error(toUserError(error));
      return (data ?? []).map((row) => mapGroupMemberRow(row as Record<string, unknown>));
    },

    async listJoinQuestions(groupId: string): Promise<GroupJoinQuestion[]> {
      const { data, error } = await supabase
        .from('group_join_questions')
        .select('id, group_id, prompt, sort_order, required, created_at')
        .eq('group_id', groupId)
        .order('sort_order', { ascending: true });
      if (error) {
        if (/group_join_questions|relation/i.test(error.message ?? '')) return [];
        throw new Error(toUserError(error));
      }
      return (data ?? []).map((row) => mapQuestion(row as Record<string, unknown>));
    },

    async addJoinQuestion(
      groupId: string,
      prompt: string,
      opts?: { required?: boolean; sortOrder?: number },
    ): Promise<GroupJoinQuestion> {
      const text = prompt.trim();
      if (!text) throw new Error('Question prompt is required.');
      const { data, error } = await supabase
        .from('group_join_questions')
        .insert({
          group_id: groupId,
          prompt: text,
          required: opts?.required ?? true,
          sort_order: opts?.sortOrder ?? 0,
        })
        .select('id, group_id, prompt, sort_order, required, created_at')
        .single();
      if (error) throw new Error(toUserError(error));
      return mapQuestion(data as Record<string, unknown>);
    },

    async deleteJoinQuestion(questionId: string): Promise<void> {
      const { error } = await supabase.from('group_join_questions').delete().eq('id', questionId);
      if (error) throw new Error(toUserError(error));
    },

    async listJoinAnswersForApplicant(
      groupId: string,
      userId: string,
    ): Promise<GroupJoinAnswer[]> {
      const questions = await this.listJoinQuestions(groupId);
      if (questions.length === 0) return [];
      const { data, error } = await supabase
        .from('group_join_answers')
        .select('id, question_id, user_id, answer, created_at')
        .eq('user_id', userId)
        .in(
          'question_id',
          questions.map((q) => q.id),
        );
      if (error) {
        if (/group_join_answers|relation/i.test(error.message ?? '')) return [];
        throw new Error(toUserError(error));
      }
      return (data ?? []).map((row) => mapAnswer(row as Record<string, unknown>));
    },

    async listGroupPosts(
      groupId: string,
      params: PageParams & {
        currentUserId?: string | null;
        approvalStatus?: GroupPostApprovalStatus;
      } = {},
    ): Promise<Post[]> {
      const limit = Math.min(params.limit ?? 20, 50);
      let query = supabase
        .from('group_posts')
        .select(
          `
          created_at, approval_status,
          post:posts!group_posts_post_id_fkey(
            ${POST_SELECT}
          )
        `,
        )
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (params.approvalStatus) {
        query = query.eq('approval_status', params.approvalStatus);
      } else {
        query = query.eq('approval_status', 'approved');
      }

      if (params.cursor) {
        query = query.lt('created_at', params.cursor);
      }

      let { data, error } = await query;
      if (error && /approval_status/i.test(error.message ?? '')) {
        const fallback = await supabase
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
        data = fallback.data as typeof data;
        error = fallback.error;
      }
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

      const group = await this.getById(input.groupId);
      const approval: GroupPostApprovalStatus = group?.requiresPostApproval ? 'pending' : 'approved';

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

      const linkRow: Record<string, unknown> = {
        group_id: input.groupId,
        post_id: post.id,
        approval_status: approval,
      };
      let { error: linkError } = await supabase.from('group_posts').insert(linkRow);
      if (linkError && /approval_status/i.test(linkError.message ?? '')) {
        const retry = await supabase.from('group_posts').insert({
          group_id: input.groupId,
          post_id: post.id,
        });
        linkError = retry.error;
      }
      if (linkError) throw new Error(toUserError(linkError));

      return post;
    },

    async setGroupPostApproval(
      groupId: string,
      postId: string,
      approvalStatus: GroupPostApprovalStatus,
    ): Promise<void> {
      const { error } = await supabase
        .from('group_posts')
        .update({ approval_status: approvalStatus })
        .eq('group_id', groupId)
        .eq('post_id', postId);
      if (error) throw new Error(toUserError(error));
    },

    async createBroadcastChannel(
      groupId: string,
      createdBy: string,
      name: string,
      description?: string | null,
    ): Promise<BroadcastChannel> {
      const title = name.trim();
      if (!title) throw new Error('Channel name is required.');
      const { data, error } = await supabase
        .from('broadcast_channels')
        .insert({
          group_id: groupId,
          created_by: createdBy,
          name: title,
          description: description?.trim() || null,
        })
        .select('id, group_id, name, description, created_by, created_at, updated_at')
        .single();
      if (error) throw new Error(toUserError(error));
      return mapBroadcastChannel(data as Record<string, unknown>);
    },

    async listBroadcastChannels(groupId: string): Promise<BroadcastChannel[]> {
      const { data, error } = await supabase
        .from('broadcast_channels')
        .select('id, group_id, name, description, created_by, created_at, updated_at')
        .eq('group_id', groupId)
        .order('created_at', { ascending: true });
      if (error) {
        if (/broadcast_channels|relation/i.test(error.message ?? '')) return [];
        throw new Error(toUserError(error));
      }
      return (data ?? []).map((row) => mapBroadcastChannel(row as Record<string, unknown>));
    },

    async postBroadcast(
      channelId: string,
      authorId: string,
      body: string,
    ): Promise<BroadcastMessage> {
      const text = body.trim();
      if (!text) throw new Error('Message cannot be empty.');
      const { data, error } = await supabase
        .from('broadcast_messages')
        .insert({ channel_id: channelId, author_id: authorId, body: text })
        .select(
          `id, channel_id, author_id, body, created_at, updated_at,
           author:profiles!broadcast_messages_author_id_fkey(${PROFILE_SELECT})`,
        )
        .single();
      if (error) throw new Error(toUserError(error));
      return mapBroadcastMessage(data as Record<string, unknown>);
    },

    async listBroadcastMessages(channelId: string, params: PageParams = {}): Promise<BroadcastMessage[]> {
      const limit = Math.min(params.limit ?? 30, 100);
      let query = supabase
        .from('broadcast_messages')
        .select(
          `id, channel_id, author_id, body, created_at, updated_at,
           author:profiles!broadcast_messages_author_id_fkey(${PROFILE_SELECT})`,
        )
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (params.cursor) query = query.lt('created_at', params.cursor);
      const { data, error } = await query;
      if (error) {
        if (/broadcast_messages|relation/i.test(error.message ?? '')) return [];
        throw new Error(toUserError(error));
      }
      return (data ?? []).map((row) => mapBroadcastMessage(row as Record<string, unknown>));
    },
  };
}

export type GroupsService = ReturnType<typeof createGroupsService>;
