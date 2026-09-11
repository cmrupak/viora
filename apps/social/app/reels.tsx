import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  Text,
  View,
  type ViewToken,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { getErrorMessage, optimisticMutation, type Reel } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/design/tokens';

const { height: windowHeight } = Dimensions.get('window');
const ITEM_HEIGHT = Math.max(520, windowHeight * 0.72);

export default function ReelsScreen() {
  const { api, user } = useAuth();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const viewed = useRef(new Set<string>());

  const load = useCallback(async () => {
    if (!api || !user) return;
    setError('');
    try {
      const feed = await api.reels.listFeed({ currentUserId: user.id, limit: 20 });
      setReels(feed);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [api, user]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  async function onLike(reel: Reel) {
    if (!api || !user) return;
    const previous = reel;
    const nextLiked = !reel.likedByCurrentUser;
    const optimistic: Reel = {
      ...reel,
      likedByCurrentUser: nextLiked,
      likeCount: Math.max(0, reel.likeCount + (nextLiked ? 1 : -1)),
    };
    setReels((prev) => prev.map((r) => (r.id === reel.id ? optimistic : r)));
    try {
      await optimisticMutation({
        apply: () => undefined,
        mutation: async () => {
          const result = await api.reels.toggleLike(reel.id, user.id);
          setReels((prev) =>
            prev.map((r) =>
              r.id === reel.id
                ? {
                    ...r,
                    likedByCurrentUser: result.active,
                    likeCount: Math.max(
                      0,
                      previous.likeCount +
                        (result.active === previous.likedByCurrentUser
                          ? 0
                          : result.active
                            ? 1
                            : -1),
                    ),
                  }
                : r,
            ),
          );
        },
        rollback: () => setReels((prev) => prev.map((r) => (r.id === reel.id ? previous : r))),
        onError: (err) => setError(getErrorMessage(err)),
      });
    } catch {
      /* rolled back */
    }
  }

  async function markViewed(reelId: string) {
    if (!api || viewed.current.has(reelId)) return;
    viewed.current.add(reelId);
    try {
      await api.reels.incrementView(reelId);
      setReels((prev) =>
        prev.map((r) => (r.id === reelId ? { ...r, viewCount: r.viewCount + 1 } : r)),
      );
    } catch {
      viewed.current.delete(reelId);
    }
  }

  const markViewedRef = useRef(markViewed);
  markViewedRef.current = markViewed;

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0]?.item as Reel | undefined;
    if (first?.id) void markViewedRef.current(first.id);
  }).current;

  if (loading && reels.length === 0) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bg }}>
        <ActivityIndicator color={palette.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      {error ? (
        <Text className="px-4 pt-3 text-sm font-semibold text-danger">{error}</Text>
      ) : null}

      {!loading && reels.length === 0 ? (
        <View className="m-4 rounded-2xl border border-border bg-surface p-8">
          <Text className="text-center font-semibold text-ink">No reels yet</Text>
          <Text className="mt-1 text-center text-sm text-muted">
            Short videos will show up here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={reels}
          keyExtractor={(item) => item.id}
          pagingEnabled
          decelerationRate="fast"
          snapToInterval={ITEM_HEIGHT}
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 70 }}
          getItemLayout={(_, index) => ({
            length: ITEM_HEIGHT,
            offset: ITEM_HEIGHT * index,
            index,
          })}
          renderItem={({ item }) => {
            const media = item.media?.[0];
            const author = item.author;
            const poster = media?.thumbnailUrl || (media?.mediaType === 'image' ? media.url : null);
            return (
              <View style={{ height: ITEM_HEIGHT }} className="px-4 py-2">
                <View className="flex-1 overflow-hidden rounded-2xl border border-border bg-ink">
                  <View className="flex-1 items-center justify-center bg-black">
                    {poster ? (
                      <Image
                        source={{ uri: poster }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="contain"
                      />
                    ) : (
                      <Text className="px-6 text-center text-sm text-white/70">
                        {media ? 'Video reel — open on web to play' : 'No media'}
                      </Text>
                    )}
                  </View>
                  <View className="absolute right-3 bottom-24">
                    <Pressable
                      onPress={() => void onLike(item)}
                      className="items-center rounded-full bg-black/50 px-3 py-3"
                    >
                      <Heart
                        size={26}
                        color={item.likedByCurrentUser ? palette.primary : '#fff'}
                        fill={item.likedByCurrentUser ? palette.primary : 'transparent'}
                      />
                      <Text className="mt-1 text-xs font-bold text-white">{item.likeCount}</Text>
                    </Pressable>
                  </View>
                  <View className="absolute right-0 bottom-0 left-0 bg-black/55 p-4">
                    <Text className="text-sm font-bold text-white">
                      {author?.displayName || author?.username || 'User'}
                    </Text>
                    {item.caption ? (
                      <Text className="mt-1 text-xs text-white/80" numberOfLines={3}>
                        {item.caption}
                      </Text>
                    ) : null}
                    <Text className="mt-1 text-xs text-white/60">{item.viewCount} views</Text>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}
