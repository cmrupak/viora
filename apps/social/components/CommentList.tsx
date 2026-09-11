import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  colorsFor,
  getErrorMessage,
  optimisticMutation,
  type Comment,
} from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
import { useState } from 'react';

type Props = {
  postId: string;
  comments: Comment[];
  onChange: (comments: Comment[]) => void;
};

export function CommentList({ postId, comments, onChange }: Props) {
  const { api, user, profile } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!api || !user || !profile) return;
    const body = draft.trim();
    if (!body) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: Comment = {
      id: tempId,
      postId,
      authorId: user.id,
      parentId: null,
      body,
      likeCount: 0,
      likedByCurrentUser: false,
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

    try {
      await optimisticMutation({
        apply: () => onChange([...previous, optimistic]),
        mutation: async () => {
          const created = await api.comments.create({
            postId,
            authorId: user.id,
            body,
          });
          onChange([...previous, { ...created, replies: [] }]);
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

  return (
    <View style={styles.wrap}>
      <Text style={[styles.heading, { color: colors.ink }]}>Comments</Text>
      {comments.length === 0 ? (
        <Text style={[styles.empty, { color: colors.muted }]}>No comments yet.</Text>
      ) : (
        comments.map((comment) => (
          <View
            key={comment.id}
            style={[styles.item, { borderColor: colors.line, backgroundColor: colors.surface }]}
          >
            <Text style={[styles.author, { color: colors.ink }]}>
              {comment.author?.displayName || comment.author?.username || 'User'}
            </Text>
            <Text style={[styles.body, { color: colors.ink }]}>{comment.body}</Text>
            {comment.status === 'pending' ? (
              <Text style={[styles.pending, { color: colors.muted }]}>Sending…</Text>
            ) : null}
            {(comment.replies ?? []).map((reply) => (
              <View key={reply.id} style={styles.reply}>
                <Text style={[styles.author, { color: colors.ink }]}>
                  {reply.author?.displayName || reply.author?.username || 'User'}
                </Text>
                <Text style={[styles.body, { color: colors.ink }]}>{reply.body}</Text>
              </View>
            ))}
          </View>
        ))
      )}

      <View style={[styles.composer, { borderColor: colors.line, backgroundColor: colors.surface }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Write a comment…"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.ink }]}
          multiline
        />
        <Pressable
          style={[styles.send, { backgroundColor: colors.brand, opacity: sending ? 0.7 : 1 }]}
          disabled={sending}
          onPress={() => void send()}
        >
          <Text style={styles.sendText}>{sending ? '…' : 'Post'}</Text>
        </Pressable>
      </View>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10, marginTop: 8 },
  heading: { fontSize: 18, fontWeight: '800' },
  empty: { fontSize: 14 },
  item: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  author: { fontWeight: '800', fontSize: 13 },
  body: { fontSize: 15, lineHeight: 21 },
  pending: { fontSize: 12 },
  reply: { marginTop: 8, marginLeft: 12, gap: 2 },
  composer: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: { flex: 1, minHeight: 40, maxHeight: 120, fontSize: 15 },
  send: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  sendText: { color: '#fff', fontWeight: '800' },
  error: { fontSize: 13 },
});
