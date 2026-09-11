import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { getErrorMessage, type Post, type Story } from '@viora/core';
import { useAuth } from '@/auth/AuthProvider';
import { PostCard } from '@/components/PostCard';
import { useColorScheme } from '@/components/useColorScheme';
import { colors } from '@/design/tokens';

export default function FeedScreen() {
  const { api, user, profile } = useAuth();
  const router = useRouter();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const palette = colors[scheme];
  const [posts, setPosts] = useState<Post[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!api || !user) return;
    setError('');
    try {
      const [feed, storyList] = await Promise.all([
        api.posts.listFeed({ currentUserId: user.id, limit: 20 }),
        api.stories.listActiveStories({ currentUserId: user.id, limit: 40 }),
      ]);
      setPosts(feed);
      setStories(storyList);
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

  async function openStory(story: Story) {
    setActiveStory(story);
    if (api && user && !story.viewedByCurrentUser) {
      try {
        await api.stories.markViewed(story.id, user.id);
        setStories((prev) =>
          prev.map((s) => (s.id === story.id ? { ...s, viewedByCurrentUser: true } : s)),
        );
      } catch {
        /* non-blocking */
      }
    }
  }

  function patchPost(next: Post) {
    setPosts((prev) => prev.map((p) => (p.id === next.id ? next : p)));
  }

  const name = profile?.displayName?.split(' ')[0] || 'there';
  const media = activeStory?.media?.[0];

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
      <View>
        <Text className="text-xs font-bold uppercase text-primary">Home</Text>
        <Text className="mt-1 text-2xl font-bold text-ink">Feed</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
        <Pressable
          onPress={() => router.push('/stories/create')}
          className="w-16 items-center"
        >
          <View className="h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-primary bg-primarySoft">
            <Text className="text-lg font-bold text-primary">+</Text>
          </View>
          <Text className="mt-1 w-full text-center text-[10px] font-semibold text-ink" numberOfLines={1}>
            Your story
          </Text>
        </Pressable>
        <Pressable onPress={() => router.push('/highlights')} className="w-16 items-center">
          <View className="h-14 w-14 items-center justify-center rounded-full border border-border bg-surface">
            <Text className="text-base font-bold text-muted">★</Text>
          </View>
          <Text className="mt-1 w-full text-center text-[10px] font-semibold text-ink" numberOfLines={1}>
            Highlights
          </Text>
        </Pressable>
        {stories.map((story) => {
          const author = story.author;
          const label = author?.displayName?.split(' ')[0] || author?.username || 'Story';
          return (
            <Pressable
              key={story.id}
              onPress={() => void openStory(story)}
              className="w-16 items-center"
            >
              <View
                className={`rounded-full p-0.5 ${
                  story.viewedByCurrentUser ? 'bg-border' : 'bg-primary'
                }`}
              >
                {author?.avatarUrl ? (
                  <Image
                    source={{ uri: author.avatarUrl }}
                    className="h-13 w-13 rounded-full border-2 border-surface"
                    style={{ width: 52, height: 52, borderRadius: 26 }}
                  />
                ) : (
                  <View
                    className="items-center justify-center rounded-full bg-primarySoft"
                    style={{ width: 52, height: 52 }}
                  >
                    <Text className="font-bold text-primary">
                      {(label || '?').charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </View>
              <Text className="mt-1 w-full text-center text-[10px] font-semibold text-ink" numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        onPress={() => router.push('/create')}
        className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface p-4"
      >
        <View className="h-10 w-10 items-center justify-center rounded-full bg-primarySoft">
          <Text className="font-bold text-primary">{name.charAt(0).toUpperCase()}</Text>
        </View>
        <Text className="text-sm text-muted">What&apos;s on your mind, {name}?</Text>
      </Pressable>

      {error ? (
        <Text className="text-sm font-semibold text-danger">{error}</Text>
      ) : null}

      {loading && posts.length === 0 ? (
        <ActivityIndicator color={palette.primary} style={{ marginTop: 24 }} />
      ) : null}

      {!loading && posts.length === 0 ? (
        <View className="rounded-2xl border border-border bg-surface p-8">
          <Text className="text-center font-semibold text-ink">No posts yet</Text>
          <Text className="mt-1 text-center text-sm text-muted">
            Be the first to share something.
          </Text>
        </View>
      ) : null}

      {posts.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          onUpdated={patchPost}
          onDeleted={(id) => setPosts((prev) => prev.filter((p) => p.id !== id))}
          showError={(msg) => setError(msg)}
        />
      ))}

      <Modal visible={Boolean(activeStory)} transparent animationType="fade">
        <View
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', padding: 16 }}
        >
          <Pressable onPress={() => setActiveStory(null)} className="mb-3 self-end">
            <Text className="font-bold text-white">Close</Text>
          </Pressable>
          <Text className="mb-2 text-center text-base font-bold text-white">
            {activeStory?.author?.displayName || activeStory?.author?.username || 'Story'}
          </Text>
          {activeStory?.audience === 'close_friends' ? (
            <Text className="mb-2 text-center text-xs font-semibold text-emerald-300">
              Close friends
            </Text>
          ) : null}
          {media?.mediaType === 'image' || (media && media.mediaType !== 'video') ? (
            <Image
              source={{ uri: media.url }}
              style={{ width: '100%', height: 360, borderRadius: 16 }}
              resizeMode="contain"
            />
          ) : media ? (
            <Text className="text-center text-white">Video story — open on web to play.</Text>
          ) : (
            <Text className="text-center text-white">No media</Text>
          )}
          {(media?.stickers ?? []).map((s) => (
            <Text key={s.id} className="mt-2 text-center text-xs text-white/80">
              {s.type}:{' '}
              {String(
                s.payload.question ||
                  s.payload.text ||
                  s.payload.title ||
                  s.payload.name ||
                  s.payload.username ||
                  '',
              )}
            </Text>
          ))}
          {user && activeStory && activeStory.authorId !== user.id ? (
            <View className="mt-4 flex-row gap-2">
              <TextInput
                value={replyBody}
                onChangeText={setReplyBody}
                placeholder="Reply via DM…"
                placeholderTextColor="#aaa"
                className="flex-1 rounded-full bg-white/15 px-4 py-2 text-white"
              />
              <Pressable
                onPress={() => {
                  void (async () => {
                    if (!api || !user || !activeStory || !replyBody.trim()) return;
                    try {
                      const { conversationId } = await api.stories.replyViaDm(
                        activeStory.id,
                        user.id,
                        replyBody.trim(),
                      );
                      setActiveStory(null);
                      setReplyBody('');
                      router.push(`/messages/${conversationId}`);
                    } catch (err) {
                      setError(getErrorMessage(err));
                    }
                  })();
                }}
                className="items-center justify-center rounded-full bg-primary px-4"
              >
                <Text className="font-bold text-white">Send</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
    </ScrollView>
  );
}
