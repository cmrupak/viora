import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getErrorMessage, type Hashtag, type Post } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { PostCard } from '@/components/PostCard';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/design/tokens';

export default function HashtagScreen() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const { api, user } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];
  const [hashtag, setHashtag] = useState<Hashtag | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!api || !tag) return;
    setError('');
    try {
      const [h, list] = await Promise.all([
        api.discovery.getHashtag(tag),
        api.discovery.listPostsByHashtag(tag, { currentUserId: user?.id, limit: 30 }),
      ]);
      setHashtag(h);
      setPosts(list);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, tag, user?.id]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
    >
      <Text className="text-xs font-bold uppercase text-primary">Hashtag</Text>
      <Text className="text-2xl font-bold text-ink">#{tag}</Text>
      {hashtag ? <Text className="text-sm text-muted">{hashtag.postCount} posts</Text> : null}
      {error ? <Text className="text-sm font-semibold text-danger">{error}</Text> : null}
      {loading ? <ActivityIndicator color={palette.primary} /> : null}
      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          onUpdated={(next) => setPosts((prev) => prev.map((p) => (p.id === next.id ? next : p)))}
          onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
          showError={(msg) => setError(msg)}
        />
      ))}
    </ScrollView>
  );
}
