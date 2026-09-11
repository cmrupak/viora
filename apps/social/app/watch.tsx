import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getErrorMessage, type Post } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { PostCard } from '@/components/PostCard';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/design/tokens';

export default function WatchScreen() {
  const { api, user } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!api || !user) return;
    setError('');
    try {
      const feed = await api.posts.listWatchFeed({ currentUserId: user.id, limit: 20 });
      setPosts(feed);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [api, user]);

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
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
          tintColor={palette.primary}
        />
      }
    >
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-xs font-bold uppercase text-primary">Watch</Text>
          <Text className="mt-1 text-2xl font-bold text-ink">Long-form</Text>
        </View>
        <Pressable onPress={() => router.push('/reels')} className="rounded-full border border-border px-3 py-2">
          <Text className="text-xs font-bold text-ink">Reels</Text>
        </Pressable>
      </View>

      {error ? <Text className="text-sm font-semibold text-danger">{error}</Text> : null}
      {loading ? <ActivityIndicator color={palette.primary} /> : null}

      {!loading && posts.length === 0 ? (
        <View className="rounded-2xl border border-border bg-surface p-8">
          <Text className="text-center font-semibold text-ink">No videos yet</Text>
          <Text className="mt-1 text-center text-sm text-muted">
            Video posts appear here.
          </Text>
        </View>
      ) : null}

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
