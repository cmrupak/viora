import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Bookmark } from 'lucide-react-native';
import { getErrorMessage, type Post } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { PostCard } from '@/components/PostCard';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/design/tokens';

export default function SavedScreen() {
  const { api, user } = useAuth();
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
      const saved = await api.saves.listSaved(user.id);
      setPosts(saved.map((s) => s.post).filter(Boolean));
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
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
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
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <View>
              <Text className="text-xs font-bold uppercase text-primary">Collections</Text>
              <Text className="mt-1 text-2xl font-bold text-ink">Saved</Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Bookmark size={16} color={palette.muted} />
              <Text className="text-sm text-muted">Posts you bookmarked</Text>
            </View>
            {error ? <Text className="text-sm font-semibold text-danger">{error}</Text> : null}
            {loading && posts.length === 0 ? (
              <ActivityIndicator color={palette.primary} />
            ) : null}
            {!loading && posts.length === 0 ? (
              <View className="rounded-2xl border border-border bg-surface p-8">
                <Text className="text-center text-sm text-muted">
                  Saved posts will show up here.
                </Text>
              </View>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onUpdated={(next) =>
              setPosts((prev) => prev.map((p) => (p.id === next.id ? next : p)))
            }
            onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
            showError={(msg) => setError(msg)}
          />
        )}
      />
    </View>
  );
}
