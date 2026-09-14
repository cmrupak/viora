import type {
  AuthLoginInput,
  AuthRegisterInput,
  AuthResult,
} from '../../auth.service';
import type { CreateCommentInput, CommentSort } from '../../comments.service';
import type { CreateEventInput } from '../../events.service';
import type { FollowToggleResult } from '../../follows.service';
import type {
  CreateGroupInput,
  CreateGroupPostInput,
  JoinGroupInput,
} from '../../groups.service';
import type { SendMessageInput } from '../../messages.service';
import type {
  CreatePostInput,
  ListPostsParams,
  UpdatePostInput,
} from '../../posts.service';
import type {
  AvatarUploadInput,
  CoverUploadInput,
  ProfileUpdateInput,
} from '../../profiles.service';
import type { CreateReelCommentInput, CreateReelInput, ReelMediaUploadInput } from '../../reels.service';
import type { CreateReportInput } from '../../reports.service';
import type { MfaEnrollResult, MfaFactorSummary } from '../../security.service';
import type { CreateShareInput } from '../../shares.service';
import type {
  AddHighlightItemInput,
  CreateHighlightInput,
  CreateStoryInput,
  StoryMediaUploadInput,
} from '../../stories.service';
import type {
  AccountDeletionRequest,
  ActivityLogEntry,
  AudienceList,
  BlockedUser,
  BroadcastChannel,
  BroadcastMessage,
  CloseFriend,
  Comment,
  Conversation,
  DataExportRequest,
  Event,
  EventInvite,
  EventInviteStatus,
  EventMember,
  EventRsvpStatus,
  FeedFavorite,
  FriendRequest,
  FollowRequest,
  Group,
  GroupJoinAnswer,
  GroupJoinQuestion,
  GroupMember,
  GroupMemberRole,
  GroupMemberStatus,
  GroupPostApprovalStatus,
  Hashtag,
  LoginEvent,
  Message,
  MessageReactionType,
  MuteScope,
  Notification,
  NotificationPrefs,
  PageParams,
  PlaceHit,
  Post,
  PostReaction,
  PostShare,
  PostTag,
  Profile,
  ReactionType,
  Reel,
  ReelComment,
  RelationshipStatus,
  Report,
  SavedCollection,
  SessionUser,
  Story,
  StoryHighlight,
  StoryHighlightItem,
  StoryStickerResponse,
  StoryView,
  ToggleResult,
  UserMute,
  UserPresence,
  UserRestrict,
  UserSettings,
  UserSettingsPatch,
  UserSnooze,
} from '../../types';
import type { VioraHttpClient } from '../client';
import { createRealtimeFacade } from '../realtime';
import type { SessionStore, StoredAuthSession } from '../session-store';

function pageQuery(params: PageParams = {}): Record<string, string | number | boolean | null | undefined> {
  return {
    limit: params.limit,
    cursor: params.cursor ?? undefined,
  };
}

function toUploadBlob(
  body: Blob | ArrayBuffer | ArrayBufferView,
  contentType?: string,
): Blob {
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    if (contentType && !body.type) return body.slice(0, body.size, contentType);
    return body;
  }
  if (body instanceof ArrayBuffer) {
    return new Blob([body], contentType ? { type: contentType } : undefined);
  }
  const view = body as ArrayBufferView;
  const sliced = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  return new Blob([sliced], contentType ? { type: contentType } : undefined);
}

async function uploadMediaFile(
  http: VioraHttpClient,
  session: SessionStore,
  opts: {
    bucket: string;
    file: Blob | ArrayBuffer | ArrayBufferView | FormData;
    filename?: string;
    contentType?: string;
  },
): Promise<{ url: string } & Record<string, unknown>> {
  const token = await session.getAccessToken();
  let form: FormData;
  if (opts.file instanceof FormData) {
    form = opts.file;
    if (!form.has('bucket')) form.append('bucket', opts.bucket);
  } else {
    form = new FormData();
    form.append('bucket', opts.bucket);
    const ext =
      opts.filename?.split('.').pop() ||
      opts.contentType?.split('/')[1]?.split(';')[0] ||
      'bin';
    const filename = opts.filename ?? `upload.${ext}`;
    const blob = toUploadBlob(opts.file, opts.contentType);
    form.append('file', blob, filename);
  }

  const res = await fetch(`${http.baseUrl}/api/v1/media/upload`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: form,
  });
  const text = await res.text();
  let payload: Record<string, unknown> | null = null;
  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>;
    } catch {
      payload = null;
    }
  }
  if (!res.ok) {
    const err =
      (payload?.error as string | undefined) ||
      (payload?.message as string | undefined) ||
      `Upload failed (${res.status})`;
    throw new Error(err);
  }
  const media = (payload?.media ?? payload) as { url?: string } & Record<string, unknown>;
  if (!media?.url) throw new Error('Upload succeeded but no media URL was returned.');
  return media as { url: string } & Record<string, unknown>;
}

function mapKeywordFilters(raw: unknown): Array<{ id: string; keyword: string }> {
  const list = Array.isArray(raw) ? raw : [];
  return list.map((item) => {
    if (typeof item === 'string') return { id: item, keyword: item };
    const row = (item ?? {}) as { id?: string; keyword?: string };
    const keyword = String(row.keyword ?? row.id ?? '');
    return { id: String(row.id ?? keyword), keyword };
  });
}

function profileId(p: Profile | null | undefined): string | null {
  return p?.id ? String(p.id) : null;
}

function isNotFound(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /not found/i.test(message);
}

async function getNullable<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

function toStoredSession(raw: {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  expires_at?: number;
  token_type?: string;
  user: SessionUser;
}): StoredAuthSession {
  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    expires_in: Number(raw.expires_in ?? 3600),
    expires_at: raw.expires_at,
    token_type: 'bearer',
    user: raw.user,
  };
}

function toAuthResult(stored: StoredAuthSession | null, extra?: { needsEmailVerification?: boolean }): AuthResult {
  return {
    user: stored?.user ?? null,
    // PHP session shape matches the fields callers need; cast for AuthResult compatibility.
    session: (stored as AuthResult['session']) ?? null,
    needsEmailVerification: extra?.needsEmailVerification,
  };
}

type AuthBundle = {
  user: SessionUser;
  session: {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    token_type?: string;
    user: SessionUser;
  };
  profile?: Profile | null;
  needsEmailVerification?: boolean;
};

export function createPhpVioraApi(http: VioraHttpClient, session: SessionStore) {
  const realtime = createRealtimeFacade({ mode: 'php', http });

  async function persistAuth(bundle: AuthBundle): Promise<AuthResult> {
    const stored = toStoredSession({
      ...bundle.session,
      user: bundle.session.user ?? bundle.user,
    });
    await session.set(stored);
    return toAuthResult(stored, { needsEmailVerification: bundle.needsEmailVerification });
  }

  async function relationshipOf(otherId: string): Promise<RelationshipStatus> {
    const data = await http.get<{ relationship: RelationshipStatus }>(
      `/api/v1/users/${encodeURIComponent(otherId)}/relationship`,
    );
    return data.relationship;
  }

  const auth = {
    async getSession(): Promise<AuthResult> {
      const stored = await session.get();
      return toAuthResult(stored);
    },

    onAuthStateChange(callback: (result: AuthResult) => void) {
      return session.subscribe((stored) => {
        callback(toAuthResult(stored));
      });
    },

    async getAccessToken(): Promise<string | null> {
      return session.getAccessToken();
    },

    async register(input: AuthRegisterInput): Promise<AuthResult> {
      const data = await http.request<AuthBundle>('POST', '/api/v1/auth/register', {
        body: input,
        auth: false,
      });
      return persistAuth(data);
    },

    async login(input: AuthLoginInput): Promise<AuthResult> {
      const data = await http.request<AuthBundle>('POST', '/api/v1/auth/login', {
        body: input,
        auth: false,
      });
      return persistAuth(data);
    },

    async logout(): Promise<void> {
      const current = await session.get();
      try {
        await http.post('/api/v1/auth/logout', {
          refresh_token: current?.refresh_token ?? null,
        });
      } finally {
        await session.set(null);
      }
    },

    async requestPasswordReset(email: string, _options?: { redirectTo?: string }): Promise<void> {
      const value = email.trim().toLowerCase();
      if (!value) throw new Error('Enter your email address.');
      await http.request('POST', '/api/v1/auth/password/otp', {
        body: { action: 'send', email: value },
        auth: false,
      });
    },

    async updatePassword(_password: string): Promise<void> {
      throw new Error(
        'Logged-in password change is not available on the PHP backend. Use OTP password reset (requestPasswordReset + /api/v1/auth/password/otp action=reset).',
      );
    },

    async getProfile(userId: string): Promise<Profile | null> {
      return getNullable(async () => {
        const data = await http.get<{ profile: Profile }>(
          `/api/v1/users/id/${encodeURIComponent(userId)}`,
        );
        return data.profile;
      });
    },

    async ensureProfile(userId: string): Promise<Profile | null> {
      const existing = await this.getProfile(userId);
      if (existing) return existing;
      await new Promise((resolve) => setTimeout(resolve, 400));
      return this.getProfile(userId);
    },
  };

  const profiles = {
    async getById(userId: string): Promise<Profile | null> {
      return auth.getProfile(userId);
    },

    async getByUsername(username: string): Promise<Profile | null> {
      return getNullable(async () => {
        const data = await http.get<{ profile: Profile }>(
          `/api/v1/users/${encodeURIComponent(username)}`,
        );
        return data.profile;
      });
    },

    async search(query: string, limit = 20): Promise<Profile[]> {
      const data = await http.get<{ profiles: Profile[] }>('/api/v1/users/search', {
        q: query,
        limit,
      });
      return data.profiles ?? [];
    },

    async updateProfile(_userId: string, input: ProfileUpdateInput): Promise<Profile> {
      const data = await http.patch<{ profile: Profile }>('/api/v1/profile', input);
      return data.profile;
    },

    async uploadAvatar(input: AvatarUploadInput): Promise<string> {
      const media = await uploadMediaFile(http, session, {
        bucket: 'avatars',
        file: input.body,
        contentType: input.contentType,
        filename: input.extension ? `avatar.${input.extension}` : undefined,
      });
      return media.url;
    },

    async uploadCover(input: CoverUploadInput): Promise<string> {
      const media = await uploadMediaFile(http, session, {
        bucket: 'covers',
        file: input.body,
        contentType: input.contentType,
        filename: input.extension ? `cover.${input.extension}` : undefined,
      });
      return media.url;
    },
  };

  const posts = {
    async getById(postId: string, _currentUserId?: string | null): Promise<Post | null> {
      return getNullable(async () => {
        const data = await http.get<{ post: Post }>(`/api/v1/posts/${encodeURIComponent(postId)}`);
        return data.post;
      });
    },

    async create(input: CreatePostInput): Promise<Post> {
      const data = await http.post<{ post: Post }>('/api/v1/posts', input);
      return data.post;
    },

    async update(input: UpdatePostInput): Promise<Post> {
      const { postId, authorId: _authorId, ...patch } = input;
      const data = await http.patch<{ post: Post }>(
        `/api/v1/posts/${encodeURIComponent(postId)}`,
        patch,
      );
      return data.post;
    },

    async listFeed(params: ListPostsParams = {}): Promise<Post[]> {
      const data = await http.get<{ posts: Post[] }>('/api/v1/feed', pageQuery(params));
      return data.posts ?? [];
    },

    async listWatchFeed(params: ListPostsParams = {}): Promise<Post[]> {
      const data = await http.get<{ posts: Post[] }>('/api/v1/watch', pageQuery(params));
      return data.posts ?? [];
    },

    async listByUser(params: ListPostsParams & { authorId: string }): Promise<Post[]> {
      const data = await http.get<{ posts: Post[] }>(
        `/api/v1/users/${encodeURIComponent(params.authorId)}/posts`,
        {
          ...pageQuery(params),
          includeNonLive: params.includeNonLive ?? false,
        },
      );
      return data.posts ?? [];
    },

    async listDrafts(_authorId: string): Promise<Post[]> {
      const data = await http.get<{ posts: Post[] }>('/api/v1/posts/drafts');
      return data.posts ?? [];
    },

    async softDelete(postId: string, _authorId: string): Promise<void> {
      await http.del(`/api/v1/posts/${encodeURIComponent(postId)}`);
    },

    async setCommentsDisabled(
      postId: string,
      _authorId: string,
      disabled: boolean,
    ): Promise<Post> {
      const data = await http.post<{ post: Post }>(
        `/api/v1/posts/${encodeURIComponent(postId)}/comments-disabled`,
        { disabled },
      );
      return data.post;
    },

    async hidePost(postId: string, _userId: string): Promise<void> {
      await http.post(`/api/v1/posts/${encodeURIComponent(postId)}/hide`);
    },

    async unhidePost(postId: string, _userId: string): Promise<void> {
      await http.del(`/api/v1/posts/${encodeURIComponent(postId)}/hide`);
    },

    async pin(postId: string, _authorId: string, pinned: boolean): Promise<Post> {
      const data = await http.post<{ post: Post }>(
        `/api/v1/posts/${encodeURIComponent(postId)}/pin`,
        { pinned },
      );
      return data.post;
    },

    async archive(postId: string, _authorId: string, archived: boolean): Promise<Post> {
      const data = await http.post<{ post: Post }>(
        `/api/v1/posts/${encodeURIComponent(postId)}/archive`,
        { archived },
      );
      return data.post;
    },

    async recordView(postId: string, _viewerId: string): Promise<void> {
      try {
        await http.post(`/api/v1/posts/${encodeURIComponent(postId)}/view`, {});
      } catch {
        /* soft-fail insights — same as Supabase path */
      }
    },

    async listPendingTags(_userId: string): Promise<PostTag[]> {
      const data = await http.get<{ tags: PostTag[] }>('/api/v1/post-tags/pending');
      return data.tags ?? [];
    },

    async respondToTag(
      tagId: string,
      _userId: string,
      status: 'approved' | 'rejected',
    ): Promise<PostTag> {
      const data = await http.post<{ tag: PostTag }>(
        `/api/v1/post-tags/${encodeURIComponent(tagId)}/respond`,
        { status },
      );
      return data.tag;
    },

    async listRevisions(
      postId: string,
      _authorId: string,
    ): Promise<Array<{ id: string; body: string; createdAt: string }>> {
      const data = await http.get<{ revisions: Array<{ id: string; body: string; createdAt: string }> }>(
        `/api/v1/posts/${encodeURIComponent(postId)}/revisions`,
      );
      return data.revisions ?? [];
    },
  };

  const likes = {
    async toggleLike(postId: string, _userId: string): Promise<ToggleResult> {
      return http.post<ToggleResult>(`/api/v1/posts/${encodeURIComponent(postId)}/like`);
    },

    async toggleCommentLike(commentId: string, _userId: string): Promise<ToggleResult> {
      return http.post<ToggleResult>(`/api/v1/comments/${encodeURIComponent(commentId)}/like`);
    },
  };

  const comments = {
    async list(
      postId: string,
      params: PageParams & { currentUserId?: string | null; sort?: CommentSort } = {},
    ): Promise<Comment[]> {
      const data = await http.get<{ comments: Comment[] }>(
        `/api/v1/posts/${encodeURIComponent(postId)}/comments`,
        {
          ...pageQuery(params),
          sort: params.sort ?? 'oldest',
        },
      );
      return data.comments ?? [];
    },

    async create(input: CreateCommentInput): Promise<Comment> {
      const data = await http.post<{ comment: Comment }>(
        `/api/v1/posts/${encodeURIComponent(input.postId)}/comments`,
        { body: input.body, parentId: input.parentId ?? null },
      );
      return data.comment;
    },

    async createReply(input: CreateCommentInput & { parentId: string }): Promise<Comment> {
      return this.create(input);
    },

    async update(commentId: string, _authorId: string, body: string): Promise<Comment> {
      const data = await http.patch<{ comment: Comment }>(
        `/api/v1/comments/${encodeURIComponent(commentId)}`,
        { body },
      );
      return data.comment;
    },

    async softDelete(commentId: string, _authorId: string): Promise<void> {
      await http.del(`/api/v1/comments/${encodeURIComponent(commentId)}`);
    },

    async pin(commentId: string, _postAuthorId: string, pinned: boolean): Promise<Comment> {
      const data = await http.post<{ comment: Comment }>(
        `/api/v1/comments/${encodeURIComponent(commentId)}/pin`,
        { pinned },
      );
      return data.comment;
    },

    async listKeywordFilters(_ownerId: string): Promise<Array<{ id: string; keyword: string }>> {
      const data = await http.get<{ keywords?: unknown; filters?: unknown }>('/api/v1/comment-filters');
      return mapKeywordFilters(data.keywords ?? data.filters);
    },

    async addKeywordFilter(
      _ownerId: string,
      keyword: string,
    ): Promise<{ id: string; keyword: string }> {
      const data = await http.post<{ keywords?: unknown; filters?: unknown; keyword?: { id: string; keyword: string } }>(
        '/api/v1/comment-filters',
        { keyword },
      );
      if (data.keyword) return data.keyword;
      const list = mapKeywordFilters(data.keywords ?? data.filters);
      const normalized = keyword.trim().toLowerCase();
      return list.find((k) => k.keyword.toLowerCase() === normalized) ?? { id: normalized, keyword: normalized };
    },

    async removeKeywordFilter(filterId: string, _ownerId: string): Promise<void> {
      await http.request('DELETE', '/api/v1/comment-filters', { body: { keyword: filterId } });
    },
  };

  const saves = {
    async toggleSave(
      postId: string,
      _userId: string,
      collectionId?: string | null,
    ): Promise<ToggleResult> {
      return http.post<ToggleResult>(`/api/v1/posts/${encodeURIComponent(postId)}/save`, {
        collectionId: collectionId ?? null,
      });
    },

    async moveToCollection(
      postId: string,
      _userId: string,
      collectionId: string | null,
    ): Promise<void> {
      await http.post('/api/v1/saved/move', { postId, collectionId });
    },

    async listSaved(
      _userId: string,
      params: PageParams & { collectionId?: string | null } = {},
    ): Promise<Array<{ id: string; createdAt: string; collectionId?: string | null; post: Post }>> {
      const data = await http.get<{ posts: Post[] }>('/api/v1/saved', {
        ...pageQuery(params),
        collectionId: params.collectionId ?? undefined,
      });
      return (data.posts ?? []).map((post) => ({
        id: post.id,
        createdAt: post.createdAt ?? '',
        collectionId: params.collectionId ?? null,
        post,
      }));
    },

    async listCollections(_ownerId: string): Promise<SavedCollection[]> {
      const data = await http.get<{ collections: SavedCollection[] }>('/api/v1/saved/collections');
      return data.collections ?? [];
    },

    async createCollection(_ownerId: string, name: string): Promise<SavedCollection> {
      const data = await http.post<{ collection: SavedCollection }>('/api/v1/saved/collections', {
        name,
      });
      return data.collection;
    },

    async renameCollection(
      collectionId: string,
      _ownerId: string,
      name: string,
    ): Promise<SavedCollection> {
      const data = await http.patch<{ collection: SavedCollection }>(
        `/api/v1/saved/collections/${encodeURIComponent(collectionId)}`,
        { name },
      );
      return data.collection;
    },

    async deleteCollection(collectionId: string, _ownerId: string): Promise<void> {
      await http.del(`/api/v1/saved/collections/${encodeURIComponent(collectionId)}`);
    },
  };

  const follows = {
    async toggleFollow(_followerId: string, followingId: string): Promise<FollowToggleResult> {
      return http.post<FollowToggleResult>(
        `/api/v1/users/${encodeURIComponent(followingId)}/follow`,
      );
    },

    async isFollowing(_followerId: string, followingId: string): Promise<boolean> {
      const rel = await relationshipOf(followingId);
      return Boolean(rel.following);
    },

    async removeFollower(_userId: string, followerId: string): Promise<void> {
      const current = await session.get();
      const userId = current?.user?.id;
      if (!userId) throw new Error('Not authenticated.');
      await http.del(
        `/api/v1/users/${encodeURIComponent(userId)}/followers/${encodeURIComponent(followerId)}`,
      );
    },

    async listFollowRequests(
      _userId: string,
      params: PageParams & { direction?: 'incoming' | 'outgoing' } = {},
    ): Promise<FollowRequest[]> {
      const data = await http.get<{ requests: FollowRequest[] }>('/api/v1/follow-requests', {
        ...pageQuery(params),
        direction: params.direction ?? 'incoming',
      });
      return data.requests ?? [];
    },

    async acceptFollowRequest(requestId: string, _userId: string): Promise<FollowRequest> {
      const data = await http.post<{ request: FollowRequest }>(
        `/api/v1/follow-requests/${encodeURIComponent(requestId)}/accept`,
      );
      return data.request;
    },

    async rejectFollowRequest(requestId: string, _userId: string): Promise<FollowRequest> {
      const data = await http.post<{ request: FollowRequest }>(
        `/api/v1/follow-requests/${encodeURIComponent(requestId)}/reject`,
      );
      return data.request;
    },

    async cancelFollowRequest(requestId: string, _userId: string): Promise<void> {
      await http.del(`/api/v1/follow-requests/${encodeURIComponent(requestId)}`);
    },

    async listFollowers(userId: string, params: PageParams = {}): Promise<Profile[]> {
      const data = await http.get<{ profiles: Profile[] }>(
        `/api/v1/users/${encodeURIComponent(userId)}/followers`,
        pageQuery(params),
      );
      return data.profiles ?? [];
    },

    async listFollowing(userId: string, params: PageParams = {}): Promise<Profile[]> {
      const data = await http.get<{ profiles: Profile[] }>(
        `/api/v1/users/${encodeURIComponent(userId)}/following`,
        pageQuery(params),
      );
      return data.profiles ?? [];
    },

    async listSuggestions(_userId: string, limit = 8): Promise<Profile[]> {
      const data = await http.get<{ profiles: Profile[] }>('/api/v1/users/suggestions', { limit });
      return data.profiles ?? [];
    },
  };

  const shares = {
    async createShare(postId: string, _userId: string): Promise<PostShare> {
      const data = await http.post<{ share: PostShare }>(
        `/api/v1/posts/${encodeURIComponent(postId)}/share`,
        { target: 'external' },
      );
      return data.share;
    },

    async share(
      input: CreateShareInput,
    ): Promise<{ share: PostShare; repost?: Post | null }> {
      const data = await http.post<{ share: PostShare; repost?: Post | null }>(
        `/api/v1/posts/${encodeURIComponent(input.postId)}/share`,
        {
          target: input.target ?? 'external',
          conversationId: input.conversationId ?? null,
          quoteBody: input.quoteBody ?? null,
          recipientUserId: input.recipientUserId ?? null,
          postUrl: input.postUrl ?? null,
        },
      );
      return { share: data.share, repost: data.repost ?? null };
    },
  };

  const notifications = {
    async getPrefs(_userId: string): Promise<NotificationPrefs> {
      const data = await http.get<{ prefs: NotificationPrefs }>('/api/v1/notification-prefs');
      return data.prefs;
    },

    async updatePrefs(
      _userId: string,
      patch: Partial<Omit<NotificationPrefs, 'userId' | 'updatedAt'>>,
    ): Promise<NotificationPrefs> {
      const data = await http.patch<{ prefs: NotificationPrefs }>(
        '/api/v1/notification-prefs',
        patch,
      );
      return data.prefs;
    },

    async registerPushToken(
      _userId: string,
      token: string,
      platform: 'expo' | 'web' | 'android' | 'ios' = 'expo',
    ): Promise<void> {
      await http.post('/api/v1/push-tokens', { token, platform });
    },

    async removePushToken(_userId: string, token: string): Promise<void> {
      await http.del('/api/v1/push-tokens', { token });
    },

    async list(
      _userId: string,
      params: PageParams & { grouped?: boolean } = {},
    ): Promise<Notification[]> {
      const data = await http.get<{ notifications: Notification[] }>('/api/v1/notifications', {
        ...pageQuery(params),
        grouped: params.grouped ?? true,
      });
      return data.notifications ?? [];
    },

    async markRead(notificationId: string, _userId: string): Promise<void> {
      await http.post(`/api/v1/notifications/${encodeURIComponent(notificationId)}/read`);
    },

    async markAllRead(_userId: string): Promise<void> {
      await http.post('/api/v1/notifications/read-all');
    },

    async unreadCount(_userId: string): Promise<number> {
      const data = await http.get<{ count: number }>('/api/v1/notifications/unread-count');
      return Number(data.count ?? 0);
    },

    async notifyBirthdays(_viewerId: string, _birthdays: Profile[]): Promise<number> {
      return 0;
    },

    async notifyMemories(_userId: string, _memoryPostIds: string[]): Promise<number> {
      return 0;
    },
  };

  const messages = {
    async listConversations(
      _userId: string,
      opts: { requestsOnly?: boolean } = {},
    ): Promise<Conversation[]> {
      const data = await http.get<{ conversations: Conversation[] }>('/api/v1/conversations', {
        requestsOnly: opts.requestsOnly ?? false,
      });
      return data.conversations ?? [];
    },

    async listMessageRequests(_userId: string): Promise<Conversation[]> {
      const data = await http.get<{ conversations: Conversation[] }>(
        '/api/v1/conversations/requests',
      );
      return data.conversations ?? [];
    },

    async acceptRequest(conversationId: string, _userId: string): Promise<Conversation> {
      const data = await http.post<{ conversation: Conversation }>(
        `/api/v1/conversations/${encodeURIComponent(conversationId)}/accept`,
      );
      return data.conversation;
    },

    async declineRequest(conversationId: string, _userId: string): Promise<void> {
      await http.post(`/api/v1/conversations/${encodeURIComponent(conversationId)}/decline`);
    },

    async getOrCreateDM(_currentUserId: string, otherUserId: string): Promise<Conversation> {
      const data = await http.post<{ conversation: Conversation }>('/api/v1/conversations/dm', {
        userId: otherUserId,
      });
      return data.conversation;
    },

    async createGroup(
      _creatorId: string,
      title: string,
      memberIds: string[],
    ): Promise<Conversation> {
      const data = await http.post<{ conversation: Conversation }>('/api/v1/conversations/groups', {
        title,
        memberIds,
      });
      return data.conversation;
    },

    async listMessages(
      conversationId: string,
      params: PageParams & { currentUserId?: string | null } = {},
    ): Promise<Message[]> {
      const data = await http.get<{ messages: Message[] }>(
        `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`,
        pageQuery(params),
      );
      return data.messages ?? [];
    },

    async send(conversationId: string, senderId: string, body: string): Promise<Message> {
      return this.sendMessage({ conversationId, senderId, body });
    },

    async sendMessage(input: SendMessageInput): Promise<Message> {
      const data = await http.post<{ message: Message }>(
        `/api/v1/conversations/${encodeURIComponent(input.conversationId)}/messages`,
        {
          body: input.body,
          replyToId: input.replyToId,
          storyId: input.storyId,
          expiresInMinutes: input.expiresInMinutes,
          attachments: input.attachments,
        },
      );
      return data.message;
    },

    async markRead(conversationId: string, _userId: string): Promise<void> {
      await http.post(`/api/v1/conversations/${encodeURIComponent(conversationId)}/read`);
    },

    async setMemberPrefs(
      conversationId: string,
      _userId: string,
      prefs: { muted?: boolean; pinned?: boolean; nickname?: string | null },
    ): Promise<void> {
      await http.patch(`/api/v1/conversations/${encodeURIComponent(conversationId)}/prefs`, prefs);
    },

    async setReaction(
      messageId: string,
      _userId: string,
      reaction: MessageReactionType | null,
    ): Promise<void> {
      await http.post(`/api/v1/messages/${encodeURIComponent(messageId)}/reactions`, { reaction });
    },

    async softDeleteMessage(messageId: string, _senderId: string): Promise<void> {
      await http.del(`/api/v1/messages/${encodeURIComponent(messageId)}`);
    },

    async searchMessages(
      _userId: string,
      query: string,
      limit = 30,
    ): Promise<Array<{ message: Message; conversationId: string }>> {
      const data = await http.get<{
        results: Array<{ message: Message; conversationId: string }>;
      }>('/api/v1/messages/search', { q: query, limit });
      return data.results ?? [];
    },

    async heartbeat(_userId: string, online = true): Promise<void> {
      await http.post('/api/v1/presence/heartbeat', { online });
    },

    async getPresence(userIds: string[]): Promise<UserPresence[]> {
      const data = await http.post<{ presence: UserPresence[] }>('/api/v1/presence', { userIds });
      return data.presence ?? [];
    },

    async otherParticipant(
      conversation: Conversation,
      currentUserId: string,
    ): Promise<Profile | null> {
      if (conversation.isGroup) return null;
      const other = conversation.members?.find((m) => m.userId !== currentUserId);
      return other?.profile ?? null;
    },

    typingChannelName(conversationId: string): string {
      return realtime.typingChannelName(conversationId);
    },
  };

  const blocks = {
    async toggleBlock(_blockerId: string, blockedId: string): Promise<ToggleResult> {
      const rel = await relationshipOf(blockedId);
      if (rel.blocked) {
        await http.del(`/api/v1/users/${encodeURIComponent(blockedId)}/block`);
        return { active: false };
      }
      await http.post(`/api/v1/users/${encodeURIComponent(blockedId)}/block`);
      return { active: true };
    },

    async listBlocked(blockerId: string): Promise<BlockedUser[]> {
      const data = await http.get<{
        users?: BlockedUser[];
        profiles?: Profile[];
        blocked?: BlockedUser[];
      }>('/api/v1/blocks');
      if (Array.isArray(data.users) && data.users.length) return data.users;
      if (Array.isArray(data.blocked) && data.blocked.length) return data.blocked;
      return (data.profiles ?? []).map((profile) => ({
        id: profile.id,
        blockerId,
        blockedId: profile.id,
        createdAt: profile.createdAt ?? '',
        blocked: profile,
      }));
    },

    async isBlocked(_blockerId: string, blockedId: string): Promise<boolean> {
      const rel = await relationshipOf(blockedId);
      return Boolean(rel.blocked);
    },

    async isBlockedEither(_userA: string, userB: string): Promise<boolean> {
      const rel = await relationshipOf(userB);
      return Boolean(rel.blocked || rel.blockedBy);
    },

    async listExcludedUserIds(userId: string): Promise<string[]> {
      const blocked = await this.listBlocked(userId);
      return blocked
        .map((row) => row.blockedId || profileId(row.blocked) || row.id)
        .filter((id): id is string => Boolean(id));
    },
  };

  const reports = {
    async create(input: CreateReportInput): Promise<Report> {
      const data = await http.post<{ report: Report }>('/api/v1/reports', {
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        details: input.details ?? null,
      });
      return data.report;
    },
  };

  const settings = {
    async getSettings(_userId: string): Promise<UserSettings> {
      const data = await http.get<{ settings: UserSettings }>('/api/v1/settings');
      return data.settings;
    },

    async updateSettings(_userId: string, patch: UserSettingsPatch): Promise<UserSettings> {
      const data = await http.patch<{ settings: UserSettings }>('/api/v1/settings', patch);
      return data.settings;
    },

    async logActivity(
      _userId: string,
      _action: string,
      _metadata: Record<string, unknown> = {},
    ): Promise<void> {
      /* soft no-op — PHP has no activity write endpoint */
    },

    async listActivity(_userId: string, limit = 40): Promise<ActivityLogEntry[]> {
      const data = await http.get<{ activity: ActivityLogEntry[] }>('/api/v1/settings/activity', {
        limit,
      });
      return data.activity ?? [];
    },

    async recordLoginEvent(
      _userId: string,
      input: { userAgent?: string; deviceLabel?: string; ipHint?: string } = {},
    ): Promise<LoginEvent | null> {
      const data = await http.post<{ event: LoginEvent | null }>(
        '/api/v1/settings/login-events',
        input,
      );
      return data.event ?? null;
    },

    async listLoginEvents(_userId: string, limit = 30): Promise<LoginEvent[]> {
      const data = await http.get<{ events: LoginEvent[] }>('/api/v1/settings/login-events', {
        limit,
      });
      return data.events ?? [];
    },

    async requestDataExport(_userId: string): Promise<DataExportRequest> {
      const data = await http.post<{ request: DataExportRequest }>('/api/v1/settings/exports');
      return data.request;
    },

    async listDataExports(_userId: string, limit = 10): Promise<DataExportRequest[]> {
      const data = await http.get<{ requests: DataExportRequest[] }>('/api/v1/settings/exports', {
        limit,
      });
      return data.requests ?? [];
    },

    async getExportDownloadUrl(path: string): Promise<string | null> {
      if (!path) return null;
      if (/^https?:\/\//i.test(path)) return path;
      if (path.includes('/api/v1/settings/exports/download')) {
        return path.startsWith('http') ? path : `${http.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
      }
      // Treat as requestId (or bare download path → still usable as requestId query).
      const requestId = path.includes('/') ? path.split('/').pop()!.replace(/\.json$/i, '') : path;
      return `${http.baseUrl}/api/v1/settings/exports/download?requestId=${encodeURIComponent(requestId)}`;
    },

    async requestHardDelete(_userId: string): Promise<AccountDeletionRequest> {
      const data = await http.post<{ request: AccountDeletionRequest }>(
        '/api/v1/settings/deletion-requests',
      );
      return data.request;
    },

    async listDeletionRequests(_userId: string, limit = 5): Promise<AccountDeletionRequest[]> {
      const data = await http.get<{ requests: AccountDeletionRequest[] }>(
        '/api/v1/settings/deletion-requests',
        { limit },
      );
      return data.requests ?? [];
    },

    async deactivateAccount(_userId: string): Promise<Profile> {
      const data = await http.post<{ profile: Profile }>('/api/v1/settings/deactivate');
      return data.profile;
    },

    async reactivateAccount(_userId: string): Promise<Profile> {
      const data = await http.post<{ profile: Profile }>('/api/v1/settings/reactivate');
      return data.profile;
    },
  };

  const security = {
    async listMfaFactors(): Promise<MfaFactorSummary[]> {
      const data = await http.get<{ factors: MfaFactorSummary[] }>('/api/v1/security/mfa/factors');
      return data.factors ?? [];
    },

    async enrollTotp(friendlyName = 'Viora Authenticator'): Promise<MfaEnrollResult> {
      const data = await http.post<{ factor: MfaEnrollResult }>('/api/v1/security/mfa/enroll', {
        friendlyName,
      });
      return data.factor;
    },

    async challengeAndVerify(factorId: string, code: string): Promise<void> {
      await http.post('/api/v1/security/mfa/verify', { factorId, code: code.trim() });
    },

    async unenrollFactor(_factorId: string): Promise<void> {
      await http.post('/api/v1/security/mfa/unenroll');
    },

    async getAuthenticatorAssuranceLevel(): Promise<{
      currentLevel: string | null;
      nextLevel: string | null;
    }> {
      const data = await http.get<{
        currentLevel: string | null;
        nextLevel: string | null;
      }>('/api/v1/security/mfa/aal');
      return {
        currentLevel: data.currentLevel ?? null,
        nextLevel: data.nextLevel ?? null,
      };
    },
  };

  const stories = {
    async createStory(input: CreateStoryInput): Promise<Story> {
      const data = await http.post<{ story: Story }>('/api/v1/stories', input);
      return data.story;
    },

    async listActiveStories(
      params: PageParams & { currentUserId?: string | null } = {},
    ): Promise<Story[]> {
      const data = await http.get<{ stories: Story[] }>('/api/v1/stories', pageQuery(params));
      return data.stories ?? [];
    },

    async getStory(storyId: string, _currentUserId?: string | null): Promise<Story | null> {
      return getNullable(async () => {
        const data = await http.get<{ story: Story }>(
          `/api/v1/stories/${encodeURIComponent(storyId)}`,
        );
        return data.story;
      });
    },

    async markViewed(storyId: string, _viewerId: string): Promise<void> {
      await http.post(`/api/v1/stories/${encodeURIComponent(storyId)}/view`);
    },

    async listViewers(storyId: string, _authorId: string): Promise<StoryView[]> {
      const data = await http.get<{ viewers: StoryView[] }>(
        `/api/v1/stories/${encodeURIComponent(storyId)}/viewers`,
      );
      return data.viewers ?? [];
    },

    async replyViaDm(
      storyId: string,
      fromUserId: string,
      body: string,
    ): Promise<{ conversationId: string; message: Message }> {
      const story = await this.getStory(storyId, fromUserId);
      const authorId = story?.authorId ?? story?.author?.id;
      if (!authorId) throw new Error('Story not found.');
      const conversation = await messages.getOrCreateDM(fromUserId, authorId);
      const message = await messages.sendMessage({
        conversationId: conversation.id,
        senderId: fromUserId,
        body,
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
      const data = await http.post<{ response: StoryStickerResponse }>(
        '/api/v1/stories/stickers/respond',
        input,
      );
      return data.response;
    },

    async deleteStory(storyId: string, _authorId: string): Promise<void> {
      await http.del(`/api/v1/stories/${encodeURIComponent(storyId)}`);
    },

    async createHighlight(input: CreateHighlightInput): Promise<StoryHighlight> {
      const data = await http.post<{ highlight: StoryHighlight }>('/api/v1/highlights', input);
      return data.highlight;
    },

    async listHighlights(ownerId: string): Promise<StoryHighlight[]> {
      const data = await http.get<{ highlights: StoryHighlight[] }>(
        `/api/v1/users/${encodeURIComponent(ownerId)}/highlights`,
      );
      return data.highlights ?? [];
    },

    async addHighlightItem(input: AddHighlightItemInput): Promise<StoryHighlightItem> {
      if (!input.sourceStoryId) {
        throw new Error('sourceStoryId is required to add a highlight item on the PHP backend.');
      }
      return this.addStoryToHighlight(input.highlightId, input.sourceStoryId, input.ownerId);
    },

    async addStoryToHighlight(
      highlightId: string,
      storyId: string,
      _ownerId: string,
    ): Promise<StoryHighlightItem> {
      const data = await http.post<{ item: StoryHighlightItem }>(
        `/api/v1/highlights/${encodeURIComponent(highlightId)}/items`,
        { storyId },
      );
      return data.item;
    },

    async deleteHighlight(highlightId: string, _ownerId: string): Promise<void> {
      await http.del(`/api/v1/highlights/${encodeURIComponent(highlightId)}`);
    },

    async uploadMedia(input: StoryMediaUploadInput): Promise<string> {
      const media = await uploadMediaFile(http, session, {
        bucket: 'stories',
        file: input.body,
        contentType: input.contentType,
        filename: input.extension ? `story.${input.extension}` : undefined,
      });
      return media.url;
    },
  };

  const reels = {
    async create(input: CreateReelInput): Promise<Reel> {
      const data = await http.post<{ reel: Reel }>('/api/v1/reels', input);
      return data.reel;
    },

    async listFeed(
      params: PageParams & { currentUserId?: string | null } = {},
    ): Promise<Reel[]> {
      const data = await http.get<{ reels: Reel[] }>('/api/v1/reels', pageQuery(params));
      return data.reels ?? [];
    },

    async getById(reelId: string, _currentUserId?: string | null): Promise<Reel | null> {
      return getNullable(async () => {
        const data = await http.get<{ reel: Reel }>(`/api/v1/reels/${encodeURIComponent(reelId)}`);
        return data.reel;
      });
    },

    async toggleLike(reelId: string, _userId: string): Promise<ToggleResult> {
      return http.post<ToggleResult>(`/api/v1/reels/${encodeURIComponent(reelId)}/like`);
    },

    async toggleSave(reelId: string, _userId: string): Promise<ToggleResult> {
      return http.post<ToggleResult>(`/api/v1/reels/${encodeURIComponent(reelId)}/save`);
    },

    async listComments(reelId: string, params: PageParams = {}): Promise<ReelComment[]> {
      const data = await http.get<{ comments: ReelComment[] }>(
        `/api/v1/reels/${encodeURIComponent(reelId)}/comments`,
        pageQuery(params),
      );
      return data.comments ?? [];
    },

    async createComment(input: CreateReelCommentInput): Promise<ReelComment> {
      const data = await http.post<{ comment: ReelComment }>(
        `/api/v1/reels/${encodeURIComponent(input.reelId)}/comments`,
        { body: input.body, parentId: input.parentId ?? null },
      );
      return data.comment;
    },

    async incrementView(reelId: string): Promise<void> {
      await http.post(`/api/v1/reels/${encodeURIComponent(reelId)}/view`);
    },

    async uploadMedia(input: ReelMediaUploadInput): Promise<string> {
      const media = await uploadMediaFile(http, session, {
        bucket: 'reels',
        file: input.body,
        contentType: input.contentType,
        filename: input.extension ? `reel.${input.extension}` : undefined,
      });
      return media.url;
    },
  };

  const groups = {
    async create(input: CreateGroupInput): Promise<Group> {
      const data = await http.post<{ group: Group }>('/api/v1/groups', input);
      return data.group;
    },

    async update(
      groupId: string,
      _ownerOrAdminId: string,
      patch: Partial<{
        name: string;
        description: string | null;
        coverUrl: string | null;
        visibility: Group['visibility'];
        requiresPostApproval: boolean;
      }>,
    ): Promise<Group> {
      const data = await http.patch<{ group: Group }>(
        `/api/v1/groups/${encodeURIComponent(groupId)}`,
        patch,
      );
      return data.group;
    },

    async list(params: PageParams & { currentUserId?: string | null } = {}): Promise<Group[]> {
      const data = await http.get<{ groups: Group[] }>('/api/v1/groups', pageQuery(params));
      return data.groups ?? [];
    },

    async getById(groupId: string, _currentUserId?: string | null): Promise<Group | null> {
      return getNullable(async () => {
        const data = await http.get<{ group: Group }>(
          `/api/v1/groups/${encodeURIComponent(groupId)}`,
        );
        return data.group;
      });
    },

    async join(groupId: string, _userId: string): Promise<GroupMember> {
      const data = await http.post<{ member: GroupMember }>(
        `/api/v1/groups/${encodeURIComponent(groupId)}/join`,
      );
      return data.member;
    },

    async requestJoin(input: JoinGroupInput): Promise<GroupMember> {
      const data = await http.post<{ member: GroupMember }>(
        `/api/v1/groups/${encodeURIComponent(input.groupId)}/join`,
        { answers: input.answers ?? [] },
      );
      return data.member;
    },

    async approveMember(groupId: string, userId: string): Promise<GroupMember> {
      const data = await http.post<{ member: GroupMember }>(
        `/api/v1/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}/approve`,
      );
      return data.member;
    },

    async rejectMember(groupId: string, userId: string): Promise<void> {
      await http.post(
        `/api/v1/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}/reject`,
      );
    },

    async setMemberRole(
      groupId: string,
      userId: string,
      role: Exclude<GroupMemberRole, 'owner'>,
    ): Promise<GroupMember> {
      const data = await http.post<{ member: GroupMember }>(
        `/api/v1/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(userId)}/role`,
        { role },
      );
      return data.member;
    },

    async leave(groupId: string, _userId: string): Promise<void> {
      await http.post(`/api/v1/groups/${encodeURIComponent(groupId)}/leave`);
    },

    async listMembers(
      groupId: string,
      params: PageParams & { status?: GroupMemberStatus } = {},
    ): Promise<GroupMember[]> {
      const data = await http.get<{ members: GroupMember[] }>(
        `/api/v1/groups/${encodeURIComponent(groupId)}/members`,
        {
          ...pageQuery(params),
          status: params.status,
        },
      );
      return data.members ?? [];
    },

    async listJoinQuestions(groupId: string): Promise<GroupJoinQuestion[]> {
      const data = await http.get<{ questions: GroupJoinQuestion[] }>(
        `/api/v1/groups/${encodeURIComponent(groupId)}/join-questions`,
      );
      return data.questions ?? [];
    },

    async addJoinQuestion(
      groupId: string,
      prompt: string,
      opts?: { required?: boolean; sortOrder?: number },
    ): Promise<GroupJoinQuestion> {
      const data = await http.post<{ question: GroupJoinQuestion }>(
        `/api/v1/groups/${encodeURIComponent(groupId)}/join-questions`,
        { prompt, required: opts?.required, sortOrder: opts?.sortOrder },
      );
      return data.question;
    },

    async deleteJoinQuestion(_questionId: string): Promise<void> {
      /* Route requires groupId; method only receives questionId — soft no-op */
    },

    async listJoinAnswersForApplicant(
      _groupId: string,
      _userId: string,
    ): Promise<GroupJoinAnswer[]> {
      return [];
    },

    async listGroupPosts(
      groupId: string,
      params: PageParams & {
        currentUserId?: string | null;
        approvalStatus?: GroupPostApprovalStatus;
      } = {},
    ): Promise<Post[]> {
      const data = await http.get<{ posts: Post[] }>(
        `/api/v1/groups/${encodeURIComponent(groupId)}/posts`,
        {
          ...pageQuery(params),
          approvalStatus: params.approvalStatus ?? 'approved',
        },
      );
      return data.posts ?? [];
    },

    async createGroupPost(input: CreateGroupPostInput): Promise<Post> {
      const { groupId, ...body } = input;
      const data = await http.post<{ post: Post }>(
        `/api/v1/groups/${encodeURIComponent(groupId)}/posts`,
        body,
      );
      return data.post;
    },

    async setGroupPostApproval(
      groupId: string,
      postId: string,
      approvalStatus: GroupPostApprovalStatus,
    ): Promise<void> {
      await http.post(
        `/api/v1/groups/${encodeURIComponent(groupId)}/posts/${encodeURIComponent(postId)}/approval`,
        { status: approvalStatus },
      );
    },

    async createBroadcastChannel(
      groupId: string,
      _createdBy: string,
      name: string,
      description?: string,
    ): Promise<BroadcastChannel> {
      const data = await http.post<{ channel: BroadcastChannel }>(
        `/api/v1/groups/${encodeURIComponent(groupId)}/channels`,
        { name, description },
      );
      return data.channel;
    },

    async listBroadcastChannels(groupId: string): Promise<BroadcastChannel[]> {
      const data = await http.get<{ channels: BroadcastChannel[] }>(
        `/api/v1/groups/${encodeURIComponent(groupId)}/channels`,
      );
      return data.channels ?? [];
    },

    async postBroadcast(
      channelId: string,
      _authorId: string,
      body: string,
    ): Promise<BroadcastMessage> {
      const data = await http.post<{ message: BroadcastMessage }>(
        `/api/v1/channels/${encodeURIComponent(channelId)}/messages`,
        { body },
      );
      return data.message;
    },

    async listBroadcastMessages(
      channelId: string,
      params: PageParams = {},
    ): Promise<BroadcastMessage[]> {
      const data = await http.get<{ messages: BroadcastMessage[] }>(
        `/api/v1/channels/${encodeURIComponent(channelId)}/messages`,
        pageQuery(params),
      );
      return data.messages ?? [];
    },
  };

  const events = {
    async create(input: CreateEventInput): Promise<Event> {
      const data = await http.post<{ event: Event }>('/api/v1/events', input);
      return data.event;
    },

    async list(params: PageParams & { groupId?: string | null } = {}): Promise<Event[]> {
      const data = await http.get<{ events: Event[] }>('/api/v1/events', {
        ...pageQuery(params),
        groupId: params.groupId ?? undefined,
      });
      return data.events ?? [];
    },

    async getById(eventId: string): Promise<Event | null> {
      return getNullable(async () => {
        const data = await http.get<{ event: Event }>(
          `/api/v1/events/${encodeURIComponent(eventId)}`,
        );
        return data.event;
      });
    },

    async join(
      eventId: string,
      _userId: string,
      status: EventRsvpStatus = 'interested',
    ): Promise<EventMember> {
      const data = await http.post<{ member: EventMember }>(
        `/api/v1/events/${encodeURIComponent(eventId)}/rsvp`,
        { status },
      );
      return data.member;
    },

    async leave(eventId: string, _userId: string): Promise<void> {
      await http.del(`/api/v1/events/${encodeURIComponent(eventId)}/rsvp`);
    },

    async delete(eventId: string, _hostId: string): Promise<void> {
      await http.del(`/api/v1/events/${encodeURIComponent(eventId)}`);
    },

    async listMembers(eventId: string, params: PageParams = {}): Promise<EventMember[]> {
      const data = await http.get<{ members: EventMember[] }>(
        `/api/v1/events/${encodeURIComponent(eventId)}/members`,
        pageQuery(params),
      );
      return data.members ?? [];
    },

    async invite(eventId: string, _invitedBy: string, inviteeId: string): Promise<EventInvite> {
      const data = await http.post<{ invite: EventInvite }>(
        `/api/v1/events/${encodeURIComponent(eventId)}/invites`,
        { inviteeId },
      );
      return data.invite;
    },

    async listMyInvites(_userId: string): Promise<EventInvite[]> {
      const data = await http.get<{ invites: EventInvite[] }>('/api/v1/event-invites');
      return data.invites ?? [];
    },

    async respondToInvite(
      inviteId: string,
      _userId: string,
      status: Exclude<EventInviteStatus, 'pending'>,
    ): Promise<EventInvite> {
      const data = await http.post<{ invite: EventInvite }>(
        `/api/v1/event-invites/${encodeURIComponent(inviteId)}/respond`,
        { status },
      );
      return data.invite;
    },
  };

  const friends = {
    async sendRequest(_fromUserId: string, toUserId: string): Promise<FriendRequest> {
      const data = await http.post<{ request: FriendRequest }>(
        `/api/v1/users/${encodeURIComponent(toUserId)}/friend-request`,
      );
      return data.request;
    },

    async cancelRequest(requestId: string, _userId: string): Promise<void> {
      await http.del(`/api/v1/friend-requests/${encodeURIComponent(requestId)}`);
    },

    async acceptRequest(requestId: string, _userId: string): Promise<FriendRequest> {
      const data = await http.post<{ request: FriendRequest }>(
        `/api/v1/friend-requests/${encodeURIComponent(requestId)}/accept`,
      );
      return data.request;
    },

    async rejectRequest(requestId: string, _userId: string): Promise<FriendRequest> {
      const data = await http.post<{ request: FriendRequest }>(
        `/api/v1/friend-requests/${encodeURIComponent(requestId)}/reject`,
      );
      return data.request;
    },

    async listRequests(
      _userId: string,
      params: PageParams & { direction?: 'incoming' | 'outgoing' | 'all' } = {},
    ): Promise<FriendRequest[]> {
      const data = await http.get<{ requests: FriendRequest[] }>('/api/v1/friend-requests', {
        ...pageQuery(params),
        direction: params.direction ?? 'incoming',
      });
      return data.requests ?? [];
    },

    async listFriends(userId: string, params: PageParams = {}): Promise<Profile[]> {
      const data = await http.get<{ profiles: Profile[] }>(
        `/api/v1/users/${encodeURIComponent(userId)}/friends`,
        pageQuery(params),
      );
      return data.profiles ?? [];
    },

    async removeFriend(_userId: string, friendId: string): Promise<void> {
      await http.del(`/api/v1/users/${encodeURIComponent(friendId)}/friend`);
    },

    async areFriends(_userId: string, otherId: string): Promise<boolean> {
      const rel = await relationshipOf(otherId);
      return Boolean(rel.friends);
    },

    async countMutualFriends(_userId: string, otherId: string): Promise<number> {
      const rel = await relationshipOf(otherId);
      return Number(rel.mutualFriendsCount ?? 0);
    },

    async listMutualFriends(
      _userId: string,
      otherId: string,
      params: PageParams = {},
    ): Promise<Profile[]> {
      const data = await http.get<{ profiles: Profile[] }>(
        `/api/v1/users/${encodeURIComponent(otherId)}/mutual-friends`,
        pageQuery(params),
      );
      return data.profiles ?? [];
    },

    async getRelationshipStatus(
      _viewerId: string,
      otherId: string,
    ): Promise<RelationshipStatus> {
      return relationshipOf(otherId);
    },
  };

  const reactions = {
    async setReaction(
      postId: string,
      _userId: string,
      reaction: ReactionType | null,
    ): Promise<PostReaction | null> {
      const data = await http.post<{ reaction: PostReaction | null }>(
        `/api/v1/posts/${encodeURIComponent(postId)}/reactions`,
        { reaction },
      );
      return data.reaction ?? null;
    },

    async getForPost(
      postId: string,
      _currentUserId?: string | null,
    ): Promise<{
      reactions: PostReaction[];
      counts: Record<ReactionType, number>;
      currentUserReaction: ReactionType | null;
    }> {
      const data = await http.get<{
        reactions?: PostReaction[];
        counts?: Record<ReactionType, number>;
        currentUserReaction?: ReactionType | null;
      }>(`/api/v1/posts/${encodeURIComponent(postId)}/reactions`);
      return {
        reactions: data.reactions ?? [],
        counts: data.counts ?? { love: 0, haha: 0, wow: 0, sad: 0, angry: 0 },
        currentUserReaction: data.currentUserReaction ?? null,
      };
    },
  };

  const relationships = {
    async setMute(
      _ownerId: string,
      targetId: string,
      scope: MuteScope | null,
    ): Promise<ToggleResult & { scope?: MuteScope }> {
      if (scope == null) {
        return http.del<ToggleResult & { scope?: MuteScope }>(
          `/api/v1/users/${encodeURIComponent(targetId)}/mute`,
        );
      }
      return http.post<ToggleResult & { scope?: MuteScope }>(
        `/api/v1/users/${encodeURIComponent(targetId)}/mute`,
        { scope },
      );
    },

    async listMutes(ownerId: string, _params: PageParams = {}): Promise<UserMute[]> {
      const data = await http.get<{
        mutes?: Array<{
          id?: string;
          ownerId?: string;
          targetId?: string;
          scope?: MuteScope;
          createdAt?: string;
          updatedAt?: string;
          profile?: Profile | null;
          target?: Profile | null;
        }>;
      }>('/api/v1/mutes');
      return (data.mutes ?? []).map((row, index) => {
        const target = row.target ?? row.profile ?? null;
        const targetId = row.targetId ?? profileId(target) ?? '';
        return {
          id: row.id ?? `${ownerId}:${targetId}:${index}`,
          ownerId: row.ownerId ?? ownerId,
          targetId,
          scope: (row.scope ?? 'all') as MuteScope,
          createdAt: row.createdAt ?? '',
          updatedAt: row.updatedAt,
          target,
        };
      });
    },

    async toggleRestrict(_ownerId: string, targetId: string): Promise<ToggleResult> {
      return http.post<ToggleResult>(`/api/v1/users/${encodeURIComponent(targetId)}/restrict`);
    },

    async listRestricts(ownerId: string, _params: PageParams = {}): Promise<UserRestrict[]> {
      const data = await http.get<{
        restricts?: UserRestrict[];
        profiles?: Profile[];
      }>('/api/v1/restricts');
      if (Array.isArray(data.restricts) && data.restricts.length) return data.restricts;
      return (data.profiles ?? []).map((profile, index) => ({
        id: `${ownerId}:${profile.id}:${index}`,
        ownerId,
        targetId: profile.id,
        createdAt: profile.createdAt ?? '',
        target: profile,
      }));
    },

    async listRestrictedTargetIds(ownerId: string): Promise<string[]> {
      const rows = await this.listRestricts(ownerId);
      return rows.map((r) => r.targetId).filter(Boolean);
    },

    async snooze(_ownerId: string, targetId: string, days = 30): Promise<UserSnooze> {
      const data = await http.post<{ snooze: UserSnooze }>(
        `/api/v1/users/${encodeURIComponent(targetId)}/snooze`,
        { days },
      );
      return data.snooze;
    },

    async unsnooze(_ownerId: string, targetId: string): Promise<void> {
      await http.del(`/api/v1/users/${encodeURIComponent(targetId)}/snooze`);
    },

    async listSnoozes(ownerId: string, _params: PageParams = {}): Promise<UserSnooze[]> {
      const data = await http.get<{
        snoozes?: Array<{
          id?: string;
          ownerId?: string;
          targetId?: string;
          expiresAt?: string;
          createdAt?: string;
          updatedAt?: string;
          profile?: Profile | null;
          target?: Profile | null;
        }>;
      }>('/api/v1/snoozes');
      return (data.snoozes ?? []).map((row, index) => {
        const target = row.target ?? row.profile ?? null;
        const targetId = row.targetId ?? profileId(target) ?? '';
        return {
          id: row.id ?? `${ownerId}:${targetId}:${index}`,
          ownerId: row.ownerId ?? ownerId,
          targetId,
          expiresAt: row.expiresAt ?? '',
          createdAt: row.createdAt ?? '',
          updatedAt: row.updatedAt,
          target,
        };
      });
    },

    async toggleCloseFriend(_ownerId: string, friendId: string): Promise<ToggleResult> {
      return http.post<ToggleResult>(`/api/v1/users/${encodeURIComponent(friendId)}/close-friend`);
    },

    async listCloseFriends(ownerId: string, _params: PageParams = {}): Promise<CloseFriend[]> {
      const data = await http.get<{
        closeFriends?: CloseFriend[];
        profiles?: Profile[];
      }>('/api/v1/close-friends');
      if (Array.isArray(data.closeFriends) && data.closeFriends.length) return data.closeFriends;
      return (data.profiles ?? []).map((profile, index) => ({
        id: `${ownerId}:${profile.id}:${index}`,
        ownerId,
        friendId: profile.id,
        createdAt: profile.createdAt ?? '',
        friend: profile,
      }));
    },

    async toggleFavorite(_ownerId: string, targetId: string): Promise<ToggleResult> {
      return http.post<ToggleResult>(`/api/v1/users/${encodeURIComponent(targetId)}/favorite`);
    },

    async listFavorites(ownerId: string, _params: PageParams = {}): Promise<FeedFavorite[]> {
      const data = await http.get<{
        favorites?: FeedFavorite[];
        profiles?: Profile[];
      }>('/api/v1/favorites');
      if (Array.isArray(data.favorites) && data.favorites.length) return data.favorites;
      return (data.profiles ?? []).map((profile, index) => ({
        id: `${ownerId}:${profile.id}:${index}`,
        ownerId,
        targetId: profile.id,
        createdAt: profile.createdAt ?? '',
        target: profile,
      }));
    },

    async listFavoriteIds(ownerId: string): Promise<string[]> {
      const rows = await this.listFavorites(ownerId);
      return rows.map((r) => r.targetId).filter(Boolean);
    },

    async listFeedHiddenAuthorIds(_viewerId: string): Promise<string[]> {
      return [];
    },

    async listStoryHiddenAuthorIds(_viewerId: string): Promise<string[]> {
      return [];
    },
  };

  const audiences = {
    async createList(_ownerId: string, name: string): Promise<AudienceList> {
      const data = await http.post<{ list: AudienceList }>('/api/v1/audiences', { name });
      return data.list;
    },

    async renameList(listId: string, _ownerId: string, name: string): Promise<AudienceList> {
      const data = await http.patch<{ list: AudienceList }>(
        `/api/v1/audiences/${encodeURIComponent(listId)}`,
        { name },
      );
      return data.list;
    },

    async deleteList(listId: string, _ownerId: string): Promise<void> {
      await http.del(`/api/v1/audiences/${encodeURIComponent(listId)}`);
    },

    async listLists(_ownerId: string, _params: PageParams = {}): Promise<AudienceList[]> {
      const data = await http.get<{ lists: AudienceList[] }>('/api/v1/audiences');
      return data.lists ?? [];
    },

    async listMembers(listId: string, _params: PageParams = {}): Promise<Profile[]> {
      const data = await http.get<{ members?: Profile[]; profiles?: Profile[] }>(
        `/api/v1/audiences/${encodeURIComponent(listId)}/members`,
      );
      return data.members ?? data.profiles ?? [];
    },

    async addMember(listId: string, _ownerId: string, memberId: string): Promise<void> {
      await http.post(`/api/v1/audiences/${encodeURIComponent(listId)}/members`, { memberId });
    },

    async removeMember(listId: string, _ownerId: string, memberId: string): Promise<void> {
      await http.del(
        `/api/v1/audiences/${encodeURIComponent(listId)}/members/${encodeURIComponent(memberId)}`,
      );
    },
  };

  const discovery = {
    async listTrendingHashtags(limit = 20): Promise<Hashtag[]> {
      const data = await http.get<{ hashtags: Hashtag[] }>('/api/v1/hashtags/trending', { limit });
      return data.hashtags ?? [];
    },

    async getHashtag(tag: string): Promise<Hashtag | null> {
      return getNullable(async () => {
        const data = await http.get<{ hashtag: Hashtag }>(
          `/api/v1/hashtags/${encodeURIComponent(tag)}`,
        );
        return data.hashtag;
      });
    },

    async listPostsByHashtag(
      tag: string,
      params: PageParams & { currentUserId?: string | null } = {},
    ): Promise<Post[]> {
      const data = await http.get<{ posts: Post[] }>(
        `/api/v1/hashtags/${encodeURIComponent(tag)}/posts`,
        pageQuery(params),
      );
      return data.posts ?? [];
    },

    async listExplore(
      params: PageParams & { currentUserId?: string | null } = {},
    ): Promise<Post[]> {
      const data = await http.get<{ posts: Post[] }>('/api/v1/explore', pageQuery(params));
      return data.posts ?? [];
    },

    async searchPlaces(query: string, limit = 20): Promise<PlaceHit[]> {
      const data = await http.get<{ places: PlaceHit[] }>('/api/v1/places/search', {
        q: query,
        limit,
      });
      return data.places ?? [];
    },

    async listPostsByPlace(locationName: string, params: PageParams = {}): Promise<Post[]> {
      const data = await http.get<{ posts: Post[] }>(
        `/api/v1/places/${encodeURIComponent(locationName)}/posts`,
        pageQuery(params),
      );
      return data.posts ?? [];
    },

    async listBirthdaysToday(limit = 30): Promise<Profile[]> {
      const data = await http.get<{ profiles: Profile[] }>('/api/v1/birthdays/today', { limit });
      return data.profiles ?? [];
    },

    async listMemories(_userId: string, limit = 20): Promise<Post[]> {
      const data = await http.get<{ posts: Post[] }>('/api/v1/memories', { limit });
      return data.posts ?? [];
    },
  };

  const media = {
    async upload(input: {
      bucket: string;
      file: Blob | ArrayBuffer | ArrayBufferView | FormData;
      filename?: string;
      contentType?: string;
    }): Promise<{ url: string } & Record<string, unknown>> {
      return uploadMediaFile(http, session, {
        bucket: input.bucket,
        file: input.file,
        filename: input.filename,
        contentType: input.contentType,
      });
    },
  };

  return {
    auth,
    profiles,
    posts,
    likes,
    comments,
    saves,
    follows,
    shares,
    notifications,
    messages,
    blocks,
    reports,
    settings,
    security,
    stories,
    reels,
    groups,
    events,
    friends,
    reactions,
    relationships,
    audiences,
    discovery,
    media,
    client: null as any,
    realtime,
  };
}

export type PhpVioraApi = ReturnType<typeof createPhpVioraApi>;
