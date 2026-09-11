import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  colorsFor,
  getErrorMessage,
  optimisticMutation,
  type Comment,
  type CommentSort,
} from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
import { useState } from 'react';

type Props = {
  postId: string;
  comments: Comment[];
  onChange: (comments: Comment[]) => void;
  commentsDisabled?: boolean;
  isPostOwner?: boolean;
  onToggleCommentsDisabled?: () => void;
};

export function CommentList({
  postId,
  comments,
  onChange,
  commentsDisabled,
  isPostOwner,
  onToggleCommentsDisabled,
}: Props) {
  const { api, user, profile } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sort, setSort] = useState<CommentSort>('oldest');

  async function reload(nextSort = sort) {
    if (!api || !user) return;
    const list = await api.comments.list(postId, {
      currentUserId: user.id,
      sort: nextSort,
    });
    onChange(list);
  }

  async function send() {
    if (!api || !user || !profile || commentsDisabled) return;
    const body = draft.trim();
    if (!body) return;

    const parentId = replyTo?.id ?? null;
    const tempId = `temp-${Date.now()}`;
    const optimistic: Comment = {
      id: tempId,
      postId,
      authorId: user.id,
      parentId,
      body,
      likeCount: 0,
      likedByCurrentUser: false,
      pinnedAt: null,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      status: 'pending',
      author: profile,
      replies: [],
    };

    const previous = comments;
    setSending(true);
    setError('');
    setDraft('');
    setReplyTo(null);

    try {
      await optimisticMutation({
        apply: () => {
          if (parentId) {
            onChange(
              previous.map((c) =>
                c.id === parentId
                  ? { ...c, replies: [...(c.replies ?? []), optimistic] }
                  : c,
              ),
            );
          } else {
            onChange([...previous, optimistic]);
          }
        },
        mutation: async () => {
          await api.comments.create({
            postId,
            authorId: user.id,
            body,
            parentId,
          });
          await reload();
        },
        rollback: () => {
          onChange(previous);
          setDraft(body);
        },
        onError: (err) => setError(getErrorMessage(err)),
      });
    } catch {
      /* rolled back */
    } finally {
      setSending(false);
    }
  }

  async function likeComment(comment: Comment) {
    if (!api || !user) return;
    const previous = comments;
    const flip = (c: Comment): Comment =>
      c.id === comment.id
        ? {
            ...c,
            likedByCurrentUser: !c.likedByCurrentUser,
            likeCount: c.likedByCurrentUser ? Math.max(0, c.likeCount - 1) : c.likeCount + 1,
          }
        : { ...c, replies: (c.replies ?? []).map(flip) };
    onChange(comments.map(flip));
    try {
      await api.likes.toggleCommentLike(comment.id, user.id);
    } catch (err) {
      onChange(previous);
      setError(getErrorMessage(err));
    }
  }

  async function deleteComment(comment: Comment) {
    if (!api || !user || comment.authorId !== user.id) return;
    const previous = comments;
    onChange(
      comments
        .filter((c) => c.id !== comment.id)
        .map((c) => ({
          ...c,
          replies: (c.replies ?? []).filter((r) => r.id !== comment.id),
        })),
    );
    try {
      await api.comments.softDelete(comment.id, user.id);
    } catch (err) {
      onChange(previous);
      setError(getErrorMessage(err));
    }
  }

  async function pinComment(comment: Comment) {
    if (!api || !user || !isPostOwner) return;
    try {
      await api.comments.pin(comment.id, user.id, !comment.pinnedAt);
      await reload();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  function renderItem(comment: Comment, isReply = false) {
    const isOwner = Boolean(user && comment.authorId === user.id);
    return (
      <View
        key={comment.id}
        style={[
          styles.item,
          {
            borderColor: colors.line,
            backgroundColor: colors.surface,
            marginLeft: isReply ? 12 : 0,
          },
        ]}
      >
        <Text style={[styles.author, { color: colors.ink }]}>
          {comment.author?.displayName || comment.author?.username || 'User'}
          {comment.pinnedAt ? ' · Pinned' : ''}
        </Text>
        <Text style={[styles.body, { color: colors.ink }]}>{comment.body}</Text>
        <View style={styles.actions}>
          <Pressable onPress={() => void likeComment(comment)}>
            <Text style={{ color: colors.muted, fontWeight: '700', fontSize: 12 }}>
              {comment.likedByCurrentUser ? 'Liked' : 'Like'} · {comment.likeCount}
            </Text>
          </Pressable>
          {!isReply && !commentsDisabled ? (
            <Pressable onPress={() => setReplyTo(comment)}>
              <Text style={{ color: colors.muted, fontWeight: '700', fontSize: 12 }}>Reply</Text>
            </Pressable>
          ) : null}
          {isOwner ? (
            <Pressable onPress={() => void deleteComment(comment)}>
              <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 12 }}>Delete</Text>
            </Pressable>
          ) : null}
          {isPostOwner && !isReply ? (
            <Pressable onPress={() => void pinComment(comment)}>
              <Text style={{ color: colors.muted, fontWeight: '700', fontSize: 12 }}>
                {comment.pinnedAt ? 'Unpin' : 'Pin'}
              </Text>
            </Pressable>
          ) : null}
        </View>
        {(comment.replies ?? []).map((reply) => renderItem(reply, true))}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={[styles.heading, { color: colors.ink }]}>Comments</Text>
        {isPostOwner && onToggleCommentsDisabled ? (
          <Pressable onPress={onToggleCommentsDisabled}>
            <Text style={{ color: colors.brand, fontWeight: '700', fontSize: 12 }}>
              {commentsDisabled ? 'Enable' : 'Disable'}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.sortRow}>
        {(['oldest', 'newest', 'top'] as CommentSort[]).map((s) => (
          <Pressable
            key={s}
            onPress={() => {
              setSort(s);
              void reload(s).catch((err) => setError(getErrorMessage(err)));
            }}
            style={[
              styles.chip,
              {
                borderColor: colors.line,
                backgroundColor: sort === s ? colors.brandSoft : colors.surface,
              },
            ]}
          >
            <Text style={{ color: colors.ink, fontSize: 11, fontWeight: '700' }}>
              {s === 'oldest' ? 'Oldest' : s === 'newest' ? 'Newest' : 'Top'}
            </Text>
          </Pressable>
        ))}
      </View>

      {comments.length === 0 ? (
        <Text style={[styles.empty, { color: colors.muted }]}>
          {commentsDisabled ? 'Comments are turned off.' : 'No comments yet.'}
        </Text>
      ) : (
        comments.map((comment) => renderItem(comment))
      )}

      {commentsDisabled ? null : (
        <View style={[styles.composer, { borderColor: colors.line, backgroundColor: colors.surface }]}>
          {replyTo ? (
            <Text style={{ color: colors.muted, fontSize: 12, width: '100%' }}>
              Replying to {replyTo.author?.displayName || replyTo.author?.username}{' '}
              <Text style={{ color: colors.brand, fontWeight: '700' }} onPress={() => setReplyTo(null)}>
                Cancel
              </Text>
            </Text>
          ) : null}
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={replyTo ? 'Write a reply…' : 'Write a comment…'}
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.ink }]}
            multiline
          />
          <Pressable
            style={[styles.send, { backgroundColor: colors.brand, opacity: sending ? 0.7 : 1 }]}
            disabled={sending}
            onPress={() => void send()}
          >
            <Text style={styles.sendText}>{sending ? '…' : replyTo ? 'Reply' : 'Post'}</Text>
          </Pressable>
        </View>
      )}
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { fontSize: 18, fontWeight: '800' },
  sortRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  empty: { fontSize: 14 },
  item: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  author: { fontWeight: '800', fontSize: 13 },
  body: { fontSize: 15, lineHeight: 21 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  composer: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: { flex: 1, minHeight: 40, maxHeight: 120, fontSize: 15, minWidth: '60%' },
  send: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  sendText: { color: '#fff', fontWeight: '800' },
  error: { fontSize: 13 },
});
