/** Shared domain types for Viora web + mobile. */

export type SessionUser = {
  id: string;
  email: string;
};

export type Profile = {
  id: string;
  username: string;
  displayName: string;
  bio: string | null;
  avatarUrl: string | null;
  coverUrl?: string | null;
  website?: string | null;
  location?: string | null;
  dateOfBirth?: string | null;
  isPrivate?: boolean;
  followerCount: number;
  followingCount: number;
  isDeactivated: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type MediaType = 'image' | 'video';

export type PostMedia = {
  id: string;
  postId: string;
  url: string;
  mediaType: MediaType;
  sortOrder: number;
  width: number | null;
  height: number | null;
  createdAt: string;
};

export type Post = {
  id: string;
  authorId: string;
  body: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
  likedByCurrentUser: boolean;
  savedByCurrentUser: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  status?: 'pending' | 'ready' | 'failed';
  author?: Profile | null;
  media?: PostMedia[];
};

export type Follow = {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string;
  follower?: Profile | null;
  following?: Profile | null;
};

export type PostLike = {
  id: string;
  postId: string;
  userId: string;
  createdAt: string;
};

export type ReactionType = 'love' | 'haha' | 'wow' | 'sad' | 'angry';

export type PostReaction = {
  id: string;
  postId: string;
  userId: string;
  reaction: ReactionType;
  createdAt: string;
  updatedAt?: string;
  user?: Profile | null;
};

export type Comment = {
  id: string;
  postId: string;
  authorId: string;
  parentId: string | null;
  body: string;
  likeCount: number;
  likedByCurrentUser: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  status?: 'pending' | 'ready' | 'failed';
  author?: Profile | null;
  replies?: Comment[];
};

export type CommentLike = {
  id: string;
  commentId: string;
  userId: string;
  createdAt: string;
};

export type SavedPost = {
  id: string;
  userId: string;
  postId: string;
  createdAt: string;
  post?: Post | null;
};

export type PostShare = {
  id: string;
  postId: string;
  userId: string;
  createdAt: string;
};

export type FriendRequestStatus = 'pending' | 'accepted' | 'rejected';

export type FriendRequest = {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: FriendRequestStatus;
  createdAt: string;
  updatedAt?: string;
  fromUser?: Profile | null;
  toUser?: Profile | null;
};

export type Friendship = {
  id: string;
  userA: string;
  userB: string;
  createdAt: string;
  updatedAt?: string;
};

export type StoryMedia = {
  id: string;
  storyId: string;
  url: string;
  mediaType: MediaType;
  sortOrder: number;
  createdAt: string;
  updatedAt?: string;
};

export type Story = {
  id: string;
  authorId: string;
  expiresAt: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  author?: Profile | null;
  media?: StoryMedia[];
  viewedByCurrentUser?: boolean;
};

export type StoryView = {
  id: string;
  storyId: string;
  viewerId: string;
  createdAt: string;
};

export type ReelMedia = {
  id: string;
  reelId: string;
  url: string;
  mediaType: MediaType;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt?: string;
};

export type Reel = {
  id: string;
  authorId: string;
  caption: string;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  likedByCurrentUser: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  author?: Profile | null;
  media?: ReelMedia[];
};

export type ReelComment = {
  id: string;
  reelId: string;
  authorId: string;
  parentId: string | null;
  body: string;
  likeCount: number;
  deletedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  author?: Profile | null;
};

export type GroupMemberRole = 'owner' | 'admin' | 'member';

export type Group = {
  id: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  ownerId: string;
  isPrivate: boolean;
  createdAt: string;
  updatedAt?: string;
  owner?: Profile | null;
  memberCount?: number;
};

export type GroupMember = {
  id: string;
  groupId: string;
  userId: string;
  role: GroupMemberRole;
  createdAt: string;
  updatedAt?: string;
  profile?: Profile | null;
};

export type EventRsvpStatus = 'going' | 'interested' | 'declined';

export type Event = {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  hostId: string;
  createdAt: string;
  updatedAt?: string;
  host?: Profile | null;
};

export type EventMember = {
  id: string;
  eventId: string;
  userId: string;
  status: EventRsvpStatus;
  createdAt: string;
  updatedAt?: string;
  profile?: Profile | null;
};

export type MessageAttachment = {
  id: string;
  messageId: string;
  url: string;
  mediaType: 'image' | 'video' | 'audio' | 'file';
  fileName: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type NotificationType =
  | 'like'
  | 'comment'
  | 'reply'
  | 'follow'
  | 'mention'
  | 'share'
  | 'message'
  | 'system';

export type Notification = {
  id: string;
  userId: string;
  actorId: string | null;
  type: NotificationType;
  postId: string | null;
  commentId: string | null;
  conversationId: string | null;
  body: string | null;
  isRead: boolean;
  createdAt: string;
  actor?: Profile | null;
};

export type Conversation = {
  id: string;
  isGroup: boolean;
  title: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt?: string;
  members?: ConversationMember[];
  lastMessage?: Message | null;
};

export type ConversationMember = {
  id: string;
  conversationId: string;
  userId: string;
  lastReadAt: string | null;
  createdAt: string;
  profile?: Profile | null;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  status?: 'pending' | 'ready' | 'failed';
  sender?: Profile | null;
  attachments?: MessageAttachment[];
};

export type BlockedUser = {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: string;
  blocked?: Profile | null;
};

export type ReportTargetType = 'user' | 'post' | 'comment' | 'message';
export type ReportStatus = 'open' | 'reviewed' | 'dismissed';

export type Report = {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: string;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
};

export type PageParams = {
  limit?: number;
  cursor?: string | null;
};

export type ToggleResult = {
  active: boolean;
};
