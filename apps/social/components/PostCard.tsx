import { Alert, Image, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  colorsFor,
  getErrorMessage,
  optimisticMutation,
  type BrandColors,
  type Post,
  type ReactionType,
} from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
import { useEffect, useState } from 'react';

type Props = {
  post: Post;
  onUpdated?: (post: Post) => void;
  onDeleted?: (postId: string) => void;
  showError?: (message: string) => void;
};

const REACTION_EMOJI: Record<ReactionType, string> = {
  love: '❤️',
  haha: '😆',
  wow: '😮',
  sad: '😢',
  angry: '😡',
};

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function PostCard({ post, onUpdated, onDeleted, showError }: Props) {
  const { api, user } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const authorName = post.author?.displayName || post.author?.username || 'User';
  const username = post.author?.username;
  const mediaItems = post.media ?? [];
  const isOwner = Boolean(user && post.authorId === user.id);
  const [reaction, setReaction] = useState<ReactionType | null>(null);
  const [showReactions, setShowReactions] = useState(false);
  const [mediaIndex, setMediaIndex] = useState(0);
  const media = mediaItems[mediaIndex] ?? mediaItems[0];
  const approvedTags = (post.tags ?? []).filter((t) => t.status === 'approved');

  useEffect(() => {
    setMediaIndex(0);
  }, [post.id]);

  useEffect(() => {
    if (!api || !user || post.id.startsWith('pending-') || post.authorId === user.id) return;
    void api.posts.recordView(post.id, user.id);
  }, [api, user, post.id, post.authorId]);

  useEffect(() => {
    if (!api || !user || post.id.startsWith('pending-')) return;
    let active = true;
    void (async () => {
      try {
        const result = await api.reactions.getForPost(post.id, user.id);
        if (active) setReaction(result.currentUserReaction);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      active = false;
    };
  }, [api, user, post.id]);

  async function toggleLike() {
    if (!api || !user) return;
    const previous = post;
    const next: Post = {
      ...post,
      likedByCurrentUser: !post.likedByCurrentUser,
      likeCount: post.likedByCurrentUser ? Math.max(0, post.likeCount - 1) : post.likeCount + 1,
    };

    try {
      await optimisticMutation({
        apply: () => onUpdated?.(next),
        mutation: async () => {
          await api.likes.toggleLike(post.id, user.id);
        },
        rollback: () => onUpdated?.(previous),
        onError: (err) => showError?.(getErrorMessage(err)),
      });
    } catch {
      /* rolled back */
    }
  }

  async function toggleSave() {
    if (!api || !user) return;
    const previous = post;
    const next: Post = {
      ...post,
      savedByCurrentUser: !post.savedByCurrentUser,
      saveCount: post.savedByCurrentUser ? Math.max(0, post.saveCount - 1) : post.saveCount + 1,
    };

    try {
      await optimisticMutation({
        apply: () => onUpdated?.(next),
        mutation: async () => {
          await api.saves.toggleSave(post.id, user.id);
        },
        rollback: () => onUpdated?.(previous),
        onError: (err) => showError?.(getErrorMessage(err)),
      });
    } catch {
      /* rolled back */
    }
  }

  async function onReact(next: ReactionType) {
    if (!api || !user) return;
    const previous = reaction;
    const cleared = previous === next;
    setReaction(cleared ? null : next);
    setShowReactions(false);
    try {
      await api.reactions.setReaction(post.id, user.id, cleared ? null : next);
    } catch (err) {
      setReaction(previous);
      showError?.(getErrorMessage(err));
    }
  }

  async function onShare() {
    if (!api || !user) return;
    Alert.alert('Share', undefined, [
      {
        text: 'Repost to feed',
        onPress: () => {
          void (async () => {
            try {
              await api.shares.share({
                postId: post.id,
                userId: user.id,
                target: 'feed',
              });
              onUpdated?.({
                ...post,
                shareCount: post.shareCount + 1,
                repostCount: (post.repostCount ?? 0) + 1,
              });
            } catch (err) {
              showError?.(getErrorMessage(err));
            }
          })();
        },
      },
      {
        text: 'Share link…',
        onPress: () => {
          void (async () => {
            const previous = post;
            const next: Post = { ...post, shareCount: post.shareCount + 1 };
            try {
              await optimisticMutation({
                apply: () => onUpdated?.(next),
                mutation: async () => {
                  await api.shares.share({
                    postId: post.id,
                    userId: user.id,
                    target: 'external',
                  });
                  await Share.share({
                    message: post.body
                      ? `${post.body.slice(0, 120)}${post.body.length > 120 ? '…' : ''}\n\nviora://post/${post.id}`
                      : `Check out this post on Viora\nviora://post/${post.id}`,
                    title: 'Share on Viora',
                  });
                },
                rollback: () => onUpdated?.(previous),
                onError: (err) => showError?.(getErrorMessage(err)),
              });
            } catch {
              /* cancelled */
            }
          })();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  function onMore() {
    if (!api || !user) return;
    const buttons: Array<{
      text: string;
      style?: 'cancel' | 'destructive';
      onPress?: () => void;
    }> = [{ text: 'Cancel', style: 'cancel' }];

    if (!isOwner) {
      buttons.unshift({
        text: 'Hide post',
        onPress: () => {
          void (async () => {
            try {
              await api.posts.hidePost(post.id, user.id);
              onDeleted?.(post.id);
            } catch (err) {
              showError?.(getErrorMessage(err));
            }
          })();
        },
      });
    } else {
      buttons.unshift({
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await api.posts.softDelete(post.id, user.id);
              onDeleted?.(post.id);
            } catch (err) {
              showError?.(getErrorMessage(err));
            }
          })();
        },
      });
    }

    Alert.alert('Post options', undefined, buttons);
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => {
            if (username) router.push({ pathname: '/user/[username]', params: { username } });
          }}
          style={styles.header}
        >
          <Avatar colors={colors} url={post.author?.avatarUrl} name={authorName} />
          <View style={styles.headerText}>
            <Text style={[styles.name, { color: colors.ink }]}>{authorName}</Text>
            <Text style={[styles.meta, { color: colors.muted }]}>
              {username ? `@${username}` : ''} · {formatTime(post.createdAt)}
              {post.editedAt ? ' · Edited' : ''}
              {post.pinnedAt ? ' · Pinned' : ''}
            </Text>
          </View>
        </Pressable>
        <Pressable onPress={onMore} hitSlop={8}>
            <Text style={{ color: colors.muted, fontWeight: '700', fontSize: 12 }}>More</Text>
          </Pressable>
      </View>

      <Pressable onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })}>
        {post.body ? <Text style={[styles.body, { color: colors.ink }]}>{post.body}</Text> : null}
        {(post.feeling || post.locationName || approvedTags.length > 0) && (
          <Text style={[styles.meta, { color: colors.muted, marginBottom: 8 }]}>
            {[
              post.feeling ? `Feeling ${post.feeling}` : null,
              post.locationName ? `at ${post.locationName}` : null,
              approvedTags.length
                ? `with ${approvedTags
                    .map((t) => t.taggedUser?.displayName || t.taggedUser?.username || 'someone')
                    .join(', ')}`
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        )}
      </Pressable>
      {media ? (
        <View>
          <Pressable onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })}>
            <Image source={{ uri: media.url }} style={styles.media} resizeMode="cover" />
          </Pressable>
          {mediaItems.length > 1 ? (
            <View style={styles.carouselRow}>
              <Pressable
                onPress={() =>
                  setMediaIndex((i) => (i - 1 + mediaItems.length) % mediaItems.length)
                }
              >
                <Text style={{ color: colors.brand, fontWeight: '800' }}>Prev</Text>
              </Pressable>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {mediaIndex + 1}/{mediaItems.length}
              </Text>
              <Pressable onPress={() => setMediaIndex((i) => (i + 1) % mediaItems.length)}>
                <Text style={{ color: colors.brand, fontWeight: '800' }}>Next</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {showReactions ? (
        <View style={styles.reactionRow}>
          {(Object.keys(REACTION_EMOJI) as ReactionType[]).map((r) => (
            <Pressable
              key={r}
              onPress={() => void onReact(r)}
              style={[
                styles.reactionChip,
                {
                  backgroundColor: reaction === r ? colors.brandSoft : 'transparent',
                  borderColor: colors.line,
                },
              ]}
            >
              <Text style={{ fontSize: 18 }}>{REACTION_EMOJI[r]}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.actions}>
        <ActionButton
          colors={colors}
          label={`${post.likeCount}`}
          active={post.likedByCurrentUser}
          activeLabel="Liked"
          idleLabel="Like"
          onPress={() => void toggleLike()}
        />
        <Pressable
          onPress={() => setShowReactions((v) => !v)}
          style={[
            styles.action,
            {
              backgroundColor: reaction ? colors.brandSoft : 'transparent',
              borderColor: colors.line,
            },
          ]}
        >
          <Text style={{ fontSize: 16 }}>{reaction ? REACTION_EMOJI[reaction] : '😊'}</Text>
        </Pressable>
        <ActionButton
          colors={colors}
          label={`${post.commentCount}`}
          active={false}
          activeLabel="Comments"
          idleLabel="Comment"
          onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })}
        />
        <ActionButton
          colors={colors}
          label={`${post.shareCount}`}
          active={false}
          activeLabel="Shared"
          idleLabel="Share"
          onPress={() => void onShare()}
        />
        <ActionButton
          colors={colors}
          label={`${post.saveCount}`}
          active={post.savedByCurrentUser}
          activeLabel="Saved"
          idleLabel="Save"
          onPress={() => void toggleSave()}
        />
      </View>
    </View>
  );
}

function Avatar({
  colors,
  url,
  name,
}: {
  colors: BrandColors;
  url?: string | null;
  name: string;
}) {
  if (url) {
    return <Image source={{ uri: url }} style={styles.avatar} />;
  }
  return (
    <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.brandSoft }]}>
      <Text style={[styles.avatarLetter, { color: colors.brand }]}>
        {(name || '?').charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

function ActionButton({
  colors,
  label,
  active,
  activeLabel,
  idleLabel,
  onPress,
}: {
  colors: BrandColors;
  label: string;
  active: boolean;
  activeLabel: string;
  idleLabel: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.action,
        {
          backgroundColor: active ? colors.brandSoft : 'transparent',
          borderColor: colors.line,
        },
      ]}
    >
      <Text style={[styles.actionText, { color: active ? colors.brand : colors.ink }]}>
        {active ? activeLabel : idleLabel} · {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 10,
    marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerText: { flex: 1, gap: 2 },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontWeight: '800', fontSize: 16 },
  name: { fontWeight: '800', fontSize: 15 },
  meta: { fontSize: 12 },
  body: { fontSize: 16, lineHeight: 22 },
  media: { width: '100%', height: 220, borderRadius: 12, marginTop: 4 },
  carouselRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionText: { fontSize: 12, fontWeight: '700' },
  reactionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  reactionChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
