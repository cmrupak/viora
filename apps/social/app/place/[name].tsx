import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { getErrorMessage, type Post } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { PostCard } from '@/components/PostCard';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/design/tokens';

export default function PlaceScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const locationName = name ? decodeURIComponent(name) : '';
  const { api } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!api || !locationName) return;
    setError('');
    try {
      const list = await api.discovery.listPostsByPlace(locationName, { limit: 30 });
      setPosts(list);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, locationName]);

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
      <Text className="text-xs font-bold uppercase text-primary">Place</Text>
      <Text className="text-2xl font-bold text-ink">{locationName}</Text>
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
