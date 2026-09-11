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
  gender?: string | null;
  isPrivate?: boolean;
  tagReviewEnabled?: boolean;
  followerCount: number;
  followingCount: number;
  isDeactivated: boolean;
  createdAt: string;
  updatedAt?: string;
};

export type MediaType = 'image' | 'video';

export type PostVisibility = 'public' | 'followers' | 'friends' | 'only_me' | 'custom';

export type PostPublishStatus = 'draft' | 'published' | 'scheduled';

export type PostTagStatus = 'pending' | 'approved' | 'rejected';

export type PostMedia = {
  id: string;
  postId: string;
  url: string;
  mediaType: MediaType;
  sortOrder: number;
  width: number | null;
  height: number | null;
  altText?: string | null;
  durationSeconds?: number | null;
  createdAt: string;
};

export type PostTag = {
  id: string;
  postId: string;
  taggedUserId: string;
  taggedBy: string;
  status: PostTagStatus;
  createdAt: string;
  updatedAt?: string;
  taggedUser?: Profile | null;
};

export type Post = {
  id: string;
  authorId: string;
  body: string;
  visibility?: PostVisibility;
  publishStatus?: PostPublishStatus;
  scheduledAt?: string | null;
  locationName?: string | null;
  feeling?: string | null;
  pinnedAt?: string | null;
  archivedAt?: string | null;
  editedAt?: string | null;
  viewCount?: number;
  commentsDisabled?: boolean;
  isSensitive?: boolean;
  repostOfId?: string | null;
  repostCount?: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  saveCount: number;
  likedByCurrentUser: boolean;
  savedByCurrentUser: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  /** Optimistic UI only — not the DB publish_status */
  status?: 'pending' | 'ready' | 'failed';
  author?: Profile | null;
  media?: PostMedia[];
  tags?: PostTag[];
  /** Nested original when this post is a repost/quote */
  repostOf?: Post | null;
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
  pinnedAt?: string | null;
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

export type SavedCollection = {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
  itemCount?: number;
};

export type SavedPost = {
  id: string;
  userId: string;
  postId: string;
  collectionId?: string | null;
  createdAt: string;
  post?: Post | null;
};

export type ShareTarget = 'link' | 'feed' | 'dm' | 'external';

export type PostShare = {
  id: string;
  postId: string;
  userId: string;
  target?: ShareTarget;
  conversationId?: string | null;
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

export type StoryAudience = 'public' | 'close_friends';

export type StoryStickerType =
  | 'poll'
  | 'question'
  | 'quiz'
  | 'countdown'
  | 'music'
  | 'location'
  | 'mention';

export type StorySticker = {
  id: string;
  type: StoryStickerType;
  x: number;
  y: number;
  scale?: number;
  rotation?: number;
  payload: Record<string, unknown>;
};

export type StoryMedia = {
  id: string;
  storyId: string;
  url: string;
  mediaType: MediaType;
  sortOrder: number;
  stickers?: StorySticker[];
  createdAt: string;
  updatedAt?: string;
};

export type Story = {
  id: string;
  authorId: string;
  audience?: StoryAudience;
  expiresAt: string;
  deletedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  author?: Profile | null;
  media?: StoryMedia[];
  viewedByCurrentUser?: boolean;
  viewCount?: number;
};

export type StoryView = {
  id: string;
  storyId: string;
  viewerId: string;
  createdAt: string;
  viewer?: Profile | null;
};

export type StoryHighlight = {
  id: string;
  ownerId: string;
  title: string;
  coverUrl: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt?: string;
  items?: StoryHighlightItem[];
  itemCount?: number;
};

export type StoryHighlightItem = {
  id: string;
  highlightId: string;
  sourceStoryId: string | null;
  url: string;
  mediaType: MediaType;
  stickers?: StorySticker[];
  sortOrder: number;
  createdAt: string;
};

export type StoryStickerResponse = {
  id: string;
  storyMediaId: string;
  stickerId: string;
  userId: string;
  response: Record<string, unknown>;
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
  audioTitle?: string | null;
  audioArtist?: string | null;
  audioUrl?: string | null;
  commentsDisabled?: boolean;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  likedByCurrentUser: boolean;
  savedByCurrentUser?: boolean;
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
export type GroupVisibility = 'public' | 'private' | 'hidden';
export type GroupMemberStatus = 'active' | 'pending' | 'banned';
export type GroupPostApprovalStatus = 'approved' | 'pending' | 'rejected';

export type Group = {
  id: string;
  name: string;
  description: string | null;
  coverUrl: string | null;
  ownerId: string;
  isPrivate: boolean;
  visibility?: GroupVisibility;
  requiresPostApproval?: boolean;
  createdAt: string;
  updatedAt?: string;
  owner?: Profile | null;
  memberCount?: number;
  myMembership?: GroupMember | null;
};

export type GroupMember = {
  id: string;
  groupId: string;
  userId: string;
  role: GroupMemberRole;
  status?: GroupMemberStatus;
  createdAt: string;
  updatedAt?: string;
  profile?: Profile | null;
};

export type GroupJoinQuestion = {
  id: string;
  groupId: string;
  prompt: string;
  sortOrder: number;
  required: boolean;
  createdAt: string;
};

export type GroupJoinAnswer = {
  id: string;
  questionId: string;
  userId: string;
  answer: string;
  createdAt: string;
};

export type BroadcastChannel = {
  id: string;
  groupId: string;
  name: string;
  description: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
};

export type BroadcastMessage = {
  id: string;
  channelId: string;
  authorId: string;
  body: string;
  createdAt: string;
  updatedAt?: string;
  author?: Profile | null;
};

export type EventRsvpStatus = 'going' | 'interested' | 'declined';
export type EventInviteStatus = 'pending' | 'accepted' | 'declined';

export type Event = {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  location: string | null;
  startsAt: string;
  endsAt: string | null;
  hostId: string;
  groupId?: string | null;
  isOnline?: boolean;
  meetingUrl?: string | null;
  recurrenceRule?: string | null;
  discussionPostId?: string | null;
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

export type EventInvite = {
  id: string;
  eventId: string;
  inviteeId: string;
  invitedBy: string;
  status: EventInviteStatus;
  createdAt: string;
  updatedAt?: string;
  invitee?: Profile | null;
  event?: Event | null;
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
  | 'system'
  | 'birthday'
  | 'memory';

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
  groupKey?: string | null;
  createdAt: string;
  actor?: Profile | null;
  /** Client-side grouping helpers */
  groupCount?: number;
  groupActors?: Profile[];
};

export type NotificationPrefs = {
  userId: string;
  likes: boolean;
  comments: boolean;
  follows: boolean;
  messages: boolean;
  mentions: boolean;
  shares: boolean;
  birthdays: boolean;
  memories: boolean;
  pushEnabled: boolean;
  updatedAt?: string;
};

export type Hashtag = {
  id: string;
  tag: string;
  postCount: number;
  createdAt: string;
};

export type PlaceHit = {
  locationName: string;
  postCount: number;
};

export type MessageReactionType = 'love' | 'haha' | 'wow' | 'sad' | 'angry' | 'like';

export type MessageReaction = {
  id: string;
  messageId: string;
  userId: string;
  reaction: MessageReactionType;
  createdAt: string;
};

export type Conversation = {
  id: string;
  isGroup: boolean;
  title: string | null;
  isRequest?: boolean;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt?: string;
  members?: ConversationMember[];
  lastMessage?: Message | null;
  /** Viewer membership prefs */
  muted?: boolean;
  pinnedAt?: string | null;
  nickname?: string | null;
  unreadCount?: number;
};

export type ConversationMember = {
  id: string;
  conversationId: string;
  userId: string;
  lastReadAt: string | null;
  muted?: boolean;
  pinnedAt?: string | null;
  nickname?: string | null;
  createdAt: string;
  profile?: Profile | null;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  replyToId?: string | null;
  storyId?: string | null;
  expiresAt?: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt?: string;
  status?: 'pending' | 'ready' | 'failed';
  sender?: Profile | null;
  attachments?: MessageAttachment[];
  replyTo?: Message | null;
  reactions?: MessageReaction[];
  myReaction?: MessageReactionType | null;
};

export type UserPresence = {
  userId: string;
  lastSeenAt: string;
  isOnline: boolean;
};

export type BlockedUser = {
  id: string;
  blockerId: string;
  blockedId: string;
  createdAt: string;
  blocked?: Profile | null;
};

export type MuteScope = 'posts' | 'stories' | 'all';

/** Viewer ↔ other user graph snapshot for profile / people cards. */
export type RelationshipStatus = {
  following: boolean;
  followedBy: boolean;
  friends: boolean;
  outgoingFriendRequest: boolean;
  incomingFriendRequest: boolean;
  incomingFriendRequestId: string | null;
  outgoingFriendRequestId: string | null;
  blocked: boolean;
  blockedBy: boolean;
  mutualFriendsCount: number;
  muteScope: MuteScope | null;
  restricted: boolean;
  snoozed: boolean;
  snoozeExpiresAt: string | null;
  closeFriend: boolean;
  favorited: boolean;
  outgoingFollowRequest: boolean;
  incomingFollowRequest: boolean;
  incomingFollowRequestId: string | null;
  outgoingFollowRequestId: string | null;
};

export type FollowRequestStatus = 'pending' | 'accepted' | 'rejected';

export type FollowRequest = {
  id: string;
  fromUserId: string;
  toUserId: string;
  status: FollowRequestStatus;
  createdAt: string;
  updatedAt?: string;
  fromUser?: Profile | null;
  toUser?: Profile | null;
};

export type AudienceList = {
  id: string;
  ownerId: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
  memberCount?: number;
};

export type UserMute = {
  id: string;
  ownerId: string;
  targetId: string;
  scope: MuteScope;
  createdAt: string;
  updatedAt?: string;
  target?: Profile | null;
};

export type UserRestrict = {
  id: string;
  ownerId: string;
  targetId: string;
  createdAt: string;
  updatedAt?: string;
  target?: Profile | null;
};

export type UserSnooze = {
  id: string;
  ownerId: string;
  targetId: string;
  expiresAt: string;
  createdAt: string;
  updatedAt?: string;
  target?: Profile | null;
};

export type CloseFriend = {
  id: string;
  ownerId: string;
  friendId: string;
  createdAt: string;
  updatedAt?: string;
  friend?: Profile | null;
};

export type FeedFavorite = {
  id: string;
  ownerId: string;
  targetId: string;
  createdAt: string;
  updatedAt?: string;
  target?: Profile | null;
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

export type AppLanguageCode = 'en' | 'es' | 'fr' | 'de' | 'hi' | 'pt';
export type ThemePreference = 'system' | 'light' | 'dark';

export type UserSettings = {
  userId: string;
  language: AppLanguageCode;
  hideSensitive: boolean;
  loginAlerts: boolean;
  reduceMotion: boolean;
  themePreference: ThemePreference;
  updatedAt?: string;
};

export type UserSettingsPatch = Partial<
  Pick<
    UserSettings,
    'language' | 'hideSensitive' | 'loginAlerts' | 'reduceMotion' | 'themePreference'
  >
>;

export type LoginEvent = {
  id: string;
  userId: string;
  ipHint: string | null;
  userAgent: string | null;
  deviceLabel: string | null;
  createdAt: string;
};

export type ActivityLogEntry = {
  id: string;
  userId: string;
  action: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type DataExportRequest = {
  id: string;
  userId: string;
  status: 'pending' | 'processing' | 'ready' | 'failed';
  downloadPath: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type AccountDeletionRequest = {
  id: string;
  userId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type PageParams = {
  limit?: number;
  cursor?: string | null;
};

export type ToggleResult = {
  active: boolean;
};
