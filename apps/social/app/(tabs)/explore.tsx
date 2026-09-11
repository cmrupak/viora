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
import {
  getErrorMessage,
  type Hashtag,
  type PlaceHit,
  type Post,
  type Profile,
} from '@viora/core';
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
  const [places, setPlaces] = useState<PlaceHit[]>([]);
  const [trendingTags, setTrendingTags] = useState<Hashtag[]>([]);
  const [explore, setExplore] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 350);
    return () => clearTimeout(t);
  }, [query]);

  const loadExplore = useCallback(async () => {
    if (!api || !user) return;
    setLoading(true);
    try {
      const [feed, tags, bdays, mems] = await Promise.all([
        api.discovery.listExplore({ currentUserId: user.id, limit: 20 }),
        api.discovery.listTrendingHashtags(10),
        api.discovery.listBirthdaysToday(8),
        api.discovery.listMemories(user.id, 4),
      ]);
      setExplore(feed);
      setTrendingTags(tags);
      if (bdays.length) void api.notifications.notifyBirthdays(user.id, bdays);
      if (mems.length) {
        void api.notifications.notifyMemories(
          user.id,
          mems.map((m) => m.id),
        );
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, user]);

  useEffect(() => {
    void loadExplore();
  }, [loadExplore]);

  useEffect(() => {
    if (!api || debounced.length < 2) {
      setFound([]);
      setPlaces([]);
      return;
    }
    let active = true;
    void (async () => {
      setSearching(true);
      setError('');
      try {
        const [people, placeHits] = await Promise.all([
          api.profiles.search(debounced, 12),
          api.discovery.searchPlaces(debounced, 8),
        ]);
        if (active) {
          setFound(people);
          setPlaces(placeHits);
        }
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

  const mediaPosts = useMemo(
    () => explore.filter((p) => (p.media?.length ?? 0) > 0),
    [explore],
  );

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: palette.bg }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
      data={explore}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <View>
            <Text className="text-xs font-bold uppercase text-primary">Discover</Text>
            <Text className="mt-1 text-2xl font-bold text-ink">Explore</Text>
          </View>

          <View className="flex-row items-center gap-2 rounded-2xl border border-border bg-surface px-3">
            <Search size={16} color={palette.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="People, places, #tags"
              placeholderTextColor={palette.muted}
              className="flex-1 py-3 text-sm text-ink"
            />
          </View>

          {error ? <Text className="text-sm font-semibold text-danger">{error}</Text> : null}

          {trendingTags.length > 0 ? (
            <View className="flex-row flex-wrap gap-2">
              {trendingTags.map((t) => (
                <Pressable
                  key={t.id}
                  onPress={() => router.push(`/hashtag/${t.tag}`)}
                  className="rounded-full border border-border bg-surface px-3 py-1"
                >
                  <Text className="text-xs font-semibold text-ink">
                    #{t.tag} · {t.postCount}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {debounced.length >= 2 ? (
            <View className="gap-2 rounded-2xl border border-border bg-surface p-3">
              <Text className="text-sm font-semibold text-ink">
                People {searching ? '…' : ''}
              </Text>
              {found.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => router.push(`/user/${p.username}`)}
                  className="py-1"
                >
                  <Text className="text-sm font-semibold text-ink">{p.displayName}</Text>
                  <Text className="text-xs text-muted">@{p.username}</Text>
                </Pressable>
              ))}
              {places.map((place) => (
                <Pressable
                  key={place.locationName}
                  onPress={() =>
                    router.push(`/place/${encodeURIComponent(place.locationName)}`)
                  }
                  className="py-1"
                >
                  <Text className="text-sm font-semibold text-ink">{place.locationName}</Text>
                  <Text className="text-xs text-muted">{place.postCount} posts</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          {loading ? <ActivityIndicator color={palette.primary} /> : null}

          {mediaPosts.length > 0 ? (
            <View>
              <Text className="mb-2 text-lg font-bold text-ink">For you</Text>
              <View className="flex-row flex-wrap gap-2">
                {mediaPosts.slice(0, 6).map((post) => {
                  const media = post.media![0]!;
                  return (
                    <Pressable
                      key={post.id}
                      onPress={() => router.push(`/post/${post.id}`)}
                      className="h-28 w-[31%] overflow-hidden rounded-xl bg-surface-2"
                    >
                      {media.mediaType === 'image' ? (
                        <Text className="p-2 text-[10px] text-muted">Photo</Text>
                      ) : (
                        <Text className="p-2 text-[10px] text-muted">Video</Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <Text className="text-lg font-bold text-ink">Trending</Text>
        </View>
      }
      renderItem={({ item }) => (
        <PostCard
          post={item}
          onUpdated={(next) =>
            setExplore((prev) => prev.map((p) => (p.id === next.id ? next : p)))
          }
          onDeleted={(id) => setExplore((prev) => prev.filter((p) => p.id !== id))}
          showError={(msg) => setError(msg)}
        />
      )}
    />
  );
}
