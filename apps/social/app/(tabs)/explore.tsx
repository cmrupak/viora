import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Search } from 'lucide-react-native';
import { getErrorMessage, type Post, type Profile } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { PostCard } from '@/components/PostCard';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/design/tokens';

export default function ExploreScreen() {
  const { api, user } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [found, setFound] = useState<Profile[]>([]);
  const [recent, setRecent] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const loadRecent = useCallback(async () => {
    if (!api || !user) return;
    setLoading(true);
    try {
      const feed = await api.posts.listFeed({ currentUserId: user.id, limit: 20 });
      setRecent(feed);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, user]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  useEffect(() => {
    if (!api || debounced.length < 2) {
      setFound([]);
      return;
    }
    let active = true;
    void (async () => {
      setSearching(true);
      setError('');
      try {
        const results = await api.profiles.search(debounced, 12);
        if (active) setFound(results);
      } catch {
        try {
          const one = await api.profiles.getByUsername(debounced);
          if (active) setFound(one ? [one] : []);
        } catch (err) {
          if (active) setError(getErrorMessage(err));
        }
      } finally {
        if (active) setSearching(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [api, debounced]);

  const filteredPosts = useMemo(() => {
    if (!debounced) return recent;
    const q = debounced.toLowerCase();
    return recent.filter((p) => p.body.toLowerCase().includes(q));
  }, [recent, debounced]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <FlatList
        data={filteredPosts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <View>
              <Text className="text-xs font-bold uppercase text-primary">Discover</Text>
              <Text className="mt-1 text-2xl font-bold text-ink">Explore</Text>
            </View>

            <View className="flex-row items-center gap-2 rounded-xl border border-border bg-surface px-3">
              <Search size={16} color={palette.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search people or posts"
                placeholderTextColor={palette.muted}
                className="flex-1 py-3 text-sm text-ink"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {error ? <Text className="text-sm font-semibold text-danger">{error}</Text> : null}

            {debounced.length >= 2 ? (
              <View className="rounded-2xl border border-border bg-surface p-3">
                <Text className="mb-2 text-sm font-semibold text-ink">
                  People {searching ? '…' : ''}
                </Text>
                {found.length === 0 && !searching ? (
                  <Text className="text-sm text-muted">No users matched “{debounced}”.</Text>
                ) : null}
                {found.map((p) => (
                  <Pressable
                    key={p.id}
                    onPress={() =>
                      router.push({ pathname: '/user/[username]', params: { username: p.username } })
                    }
                    className="flex-row items-center gap-3 rounded-xl py-2"
                  >
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-primarySoft">
                      <Text className="font-bold text-primary">
                        {(p.displayName || p.username).charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <Text className="text-sm font-semibold text-ink">{p.displayName}</Text>
                      <Text className="text-xs text-muted">@{p.username}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}

            <Text className="text-lg font-bold text-ink">
              {debounced ? 'Matching posts' : 'Recent posts'}
            </Text>

            {loading ? <ActivityIndicator color={palette.primary} /> : null}
            {!loading && filteredPosts.length === 0 ? (
              <Text className="text-sm text-muted">
                {debounced ? `No posts matched “${debounced}”.` : 'No posts yet.'}
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onUpdated={(next) =>
              setRecent((prev) => prev.map((p) => (p.id === next.id ? next : p)))
            }
            onDeleted={(id) => setRecent((prev) => prev.filter((p) => p.id !== id))}
            showError={(msg) => setError(msg)}
          />
        )}
      />
    </View>
  );
}
