import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { colorsFor, getErrorMessage, type Comment, type Post } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { CommentList } from '@/components/CommentList';
import { PostCard } from '@/components/PostCard';
import { useColorScheme } from '@/components/useColorScheme';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { api, user } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = colorsFor(scheme);
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!api || !id) return;
    setLoading(true);
    setError('');
    try {
      const [nextPost, nextComments] = await Promise.all([
        api.posts.getById(id, user?.id),
        api.comments.list(id, { currentUserId: user?.id }),
      ]);
      setPost(nextPost);
      setComments(nextComments);
      if (!nextPost) setError('Post not found.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, id, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (loading && !post) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      {post ? (
        <PostCard
          post={post}
          onUpdated={setPost}
          onDeleted={() => router.replace('/(tabs)/feed')}
          showError={setError}
        />
      ) : null}
      {post ? (
        <CommentList
          postId={post.id}
          comments={comments}
          commentsDisabled={post.commentsDisabled}
          isPostOwner={Boolean(user && user.id === post.authorId)}
          onToggleCommentsDisabled={() => {
            if (!api || !user || !post) return;
            void (async () => {
              try {
                const next = await api.posts.setCommentsDisabled(
                  post.id,
                  user.id,
                  !post.commentsDisabled,
                );
                setPost(next);
              } catch (err) {
                setError(getErrorMessage(err));
              }
            })();
          }}
          onChange={(next) => {
            setComments(next);
          }}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
